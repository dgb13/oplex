import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService, type PriceIndexEntry, type PriceIndexSource } from '@plexo/database';
import { PRICE_INDEX_SOURCE, type PriceIndexSourcePort } from './price-index-source.port.js';

const BASE_INDEX_VALUE = new Prisma.Decimal(100);

function formatPeriod(period: Date): string {
  return `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addMonthUTC(period: Date): Date {
  return new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));
}

export interface SyncResult {
  synced: number;
  skippedManual: number;
}

/**
 * Tabla global (price_index_entries, sin tenantId/RLS - ver schema.prisma)
 * - por eso PrismaService directo, nunca getTenantDb(). indexValue es un
 * nivel encadenado calculado, nunca se escribe directo desde afuera de este
 * servicio (ver recomputeChainFrom) - así corregir un mes viejo a mano
 * arrastra el efecto correcto a los siguientes sin intervención manual.
 */
@Injectable()
export class PriceIndexService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRICE_INDEX_SOURCE) private readonly priceIndexSource: PriceIndexSourcePort,
  ) {}

  list(from?: Date, to?: Date): Promise<PriceIndexEntry[]> {
    return this.prisma.priceIndexEntry.findMany({
      where: {
        ...(from || to ? { period: { gte: from, lte: to } } : {}),
      },
      orderBy: { period: 'asc' },
    });
  }

  async upsertPeriod(
    period: Date,
    variationPct: number,
    source: PriceIndexSource,
    updatedByUserId?: string,
  ): Promise<PriceIndexEntry> {
    await this.prisma.priceIndexEntry.upsert({
      where: { period },
      create: { period, monthlyVariationPct: variationPct, indexValue: 0, source, updatedByUserId },
      update: { monthlyVariationPct: variationPct, source, updatedByUserId },
    });
    await this.recomputeChainFrom(period);
    return this.prisma.priceIndexEntry.findUniqueOrThrow({ where: { period } });
  }

  /** Coeficiente de reexpresión de `fromPeriod` a `toPeriod` (índice de
   * cierre / índice de origen). Nunca interpola a ciegas - si falta algún
   * mes en el medio de la serie, error claro nombrando cuál. */
  async getCoefficient(fromPeriod: Date, toPeriod: Date): Promise<Prisma.Decimal> {
    const resolve = await this.getCoefficientResolver(fromPeriod, toPeriod);
    return resolve(fromPeriod);
  }

  /** Valida la serie [rangeFrom, rangeTo] una sola vez (un viaje a la base)
   * y devuelve una función para reexpresar cualquier mes dentro de ese
   * rango a `rangeTo` - usado por InflationAdjustmentService para no
   * repetir la misma consulta por cada cuenta/mes de un preview. */
  async getCoefficientResolver(rangeFrom: Date, rangeTo: Date): Promise<(fromPeriod: Date) => Prisma.Decimal> {
    const entries = await this.prisma.priceIndexEntry.findMany({
      where: { period: { gte: rangeFrom, lte: rangeTo } },
      orderBy: { period: 'asc' },
    });

    let cursor = rangeFrom;
    const byPeriod = new Map<number, PriceIndexEntry>();
    for (const entry of entries) {
      if (entry.period.getTime() !== cursor.getTime()) {
        throw new BadRequestException(
          `Falta cargar el índice de ${formatPeriod(cursor)} - hay un hueco en la serie entre ${formatPeriod(rangeFrom)} y ${formatPeriod(rangeTo)}`,
        );
      }
      byPeriod.set(cursor.getTime(), entry);
      cursor = addMonthUTC(cursor);
    }
    const toEntry = byPeriod.get(rangeTo.getTime());
    if (!toEntry) {
      throw new NotFoundException(`Falta cargar el índice de ${formatPeriod(rangeTo)}`);
    }

    return (fromPeriod: Date): Prisma.Decimal => {
      const fromEntry = byPeriod.get(fromPeriod.getTime());
      if (!fromEntry) {
        throw new NotFoundException(`Falta cargar el índice de ${formatPeriod(fromPeriod)}`);
      }
      return toEntry.indexValue.div(fromEntry.indexValue);
    };
  }

  /** "Sincronizar ahora" - nunca pisa un período que el usuario ya haya
   * corregido a mano (source=MANUAL siempre gana sobre el sync). Escribe
   * cada período con un upsert crudo (sin recompute individual - a
   * diferencia de upsertPeriod(), que sí lo hace porque es la vía de
   * edición de un único período a mano) y recalcula la cadena UNA sola vez
   * al final, desde el período más antiguo tocado - encadenar de a uno por
   * período (como haría llamar a upsertPeriod() en un loop) es O(n²) en el
   * tamaño de la serie, indistinguible de colgado con un backfill grande. */
  async syncFromSource(): Promise<SyncResult> {
    const variations = await this.priceIndexSource.getMonthlyVariations();
    const existing = await this.prisma.priceIndexEntry.findMany({
      where: { period: { in: variations.map((v) => v.period) } },
      select: { period: true, source: true },
    });
    const manualPeriods = new Set(
      existing.filter((e) => e.source === 'MANUAL').map((e) => e.period.getTime()),
    );

    let synced = 0;
    let skippedManual = 0;
    let earliestTouched: Date | undefined;
    for (const variation of variations) {
      if (manualPeriods.has(variation.period.getTime())) {
        skippedManual += 1;
        continue;
      }
      await this.prisma.priceIndexEntry.upsert({
        where: { period: variation.period },
        create: {
          period: variation.period,
          monthlyVariationPct: variation.variationPct,
          indexValue: 0,
          source: 'API_ARGENTINADATOS',
        },
        update: { monthlyVariationPct: variation.variationPct, source: 'API_ARGENTINADATOS' },
      });
      synced += 1;
      if (!earliestTouched || variation.period < earliestTouched) {
        earliestTouched = variation.period;
      }
    }
    if (earliestTouched) {
      await this.recomputeChainFrom(earliestTouched);
    }
    return { synced, skippedManual };
  }

  /** Recalcula indexValue de `fromPeriod` en adelante, en orden
   * cronológico - los períodos anteriores no se tocan, ya están
   * correctos. Base 100 en el primer período que exista en toda la serie. */
  private async recomputeChainFrom(fromPeriod: Date): Promise<void> {
    const all = await this.prisma.priceIndexEntry.findMany({ orderBy: { period: 'asc' } });

    let prevIndexValue = BASE_INDEX_VALUE;
    for (const entry of all) {
      if (entry.period < fromPeriod) {
        prevIndexValue = entry.indexValue;
        continue;
      }
      const newIndexValue = prevIndexValue.mul(
        new Prisma.Decimal(1).add(entry.monthlyVariationPct.div(100)),
      );
      if (!newIndexValue.eq(entry.indexValue)) {
        await this.prisma.priceIndexEntry.update({
          where: { period: entry.period },
          data: { indexValue: newIndexValue },
        });
      }
      prevIndexValue = newIndexValue;
    }
  }
}
