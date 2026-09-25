import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, Prisma, type BomLine } from '@plexo/database';
import { getReservedQuantity } from '@plexo/inventory';
import { BomService } from './bom.service.js';
import { buildCutList, groupUnplaced, maxUnitsByPieces, planCuts } from './cut-plan.js';
import { StockPieceService } from './stock-piece.service.js';

export interface UnfittableCut {
  inputArticleVariantId: string;
  cutLength: Prisma.Decimal;
  count: number;
}

export interface ProducibleLine {
  line: BomLine;
  disponible: Prisma.Decimal;
  requerido: Prisma.Decimal;
  producible: Prisma.Decimal;
}

export interface ProducibleResult {
  maxProducible: Prisma.Decimal;
  bottleneck: BomLine | null;
  perLine: ProducibleLine[];
}

/**
 * Lectura pura (ver docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 4.6) -
 * reusa el MISMO helper de "disponible" (`getReservedQuantity`, de
 * `@plexo/inventory`) que usa `InventoryService.recordMovement` para el
 * chequeo de reservas al vender, para que "cuánto hay reservado" nunca
 * pueda divergir entre ambos.
 */
@Injectable()
export class ProductionPlanningService {
  constructor(
    private readonly bomService: BomService,
    private readonly stockPieceService: StockPieceService,
  ) {}

  /**
   * "Disponible = físico - reservado" para un insumo en un depósito. 1D
   * lee `SUM(StockPiece.currentLength WHERE status=AVAILABLE)` como
   * físico (StockLedger.quantity es sólo su espejo, ver StockPieceService);
   * el resto lee StockLedger.quantity directo. Reservado se resta en
   * ambos casos, mismo agregado sobre `stock_reservations`.
   */
  async getDisponible(input: { articleVariantId: string; warehouseId: string }): Promise<Prisma.Decimal> {
    const db = getTenantDb();
    const variant = await db.articleVariant.findUnique({
      where: { id: input.articleVariantId },
      select: { article: { select: { measurementType: true } } },
    });
    if (!variant) {
      throw new NotFoundException('Variante de artículo no encontrada');
    }

    const reserved = await getReservedQuantity(db, input);

    if (variant.article.measurementType === 'LINEAL_1D') {
      const availableLength = await this.stockPieceService.getAvailableLength(input);
      return availableLength.sub(reserved);
    }

    const ledger = await db.stockLedger.findUnique({
      where: {
        warehouseId_articleVariantId: {
          warehouseId: input.warehouseId,
          articleVariantId: input.articleVariantId,
        },
      },
      select: { quantity: true },
    });
    return (ledger?.quantity ?? new Prisma.Decimal(0)).sub(reserved);
  }

  /**
   * Cuánto se puede producir hoy de `outputArticleVariantId` con lo
   * disponible en `warehouseId`, y qué insumo es el cuello de botella. La
   * receta activa (BomService) es la fuente de la lista de insumos -
   * `quantity` de cada línea ya representa el total requerido por unidad
   * producida sea cual sea el measurementType del insumo (unidades / gr-ml
   * / mm totales / área total - ver BomLine en el schema).
   */
  async computeProducible(outputArticleVariantId: string, warehouseId: string): Promise<ProducibleResult> {
    const bom = await this.bomService.getActiveBomOrThrow(outputArticleVariantId);
    const db = getTenantDb();

    // Por INSUMO, no por línea: un insumo usado en varias líneas de la
    // receta (el tubo rectangular de la Mesa de trabajo está en 4) tiene
    // que alcanzar para todas juntas. Antes cada línea se dividía contra
    // el disponible entero del insumo, como si fuera la única que lo usa,
    // y el máximo producible salía inflado.
    const requeridoLinea = (line: BomLine) =>
      line.quantity.mul(new Prisma.Decimal(1).add(line.expectedWastePercent.div(100)));
    const insumoIds = [...new Set(bom.lines.map((l) => l.inputArticleVariantId))];
    const byInsumo = new Map<string, { disponible: Prisma.Decimal; producible: Prisma.Decimal }>();
    for (const insumoId of insumoIds) {
      const disponible = await this.getDisponible({ articleVariantId: insumoId, warehouseId });
      const requeridoPorUnidad = bom.lines
        .filter((l) => l.inputArticleVariantId === insumoId)
        .reduce((sum, l) => sum.add(requeridoLinea(l)), new Prisma.Decimal(0));
      let producible = requeridoPorUnidad.gt(0)
        ? Prisma.Decimal.max(disponible, 0).div(requeridoPorUnidad).floor()
        : new Prisma.Decimal(0);

      // 1D: además de los mm totales, cada corte tiene que entrar entero
      // en una pieza (ver cut-plan.ts) - 1600 mm en recortes de 800 no
      // alcanzan para un corte de 1200.
      const variant = await db.articleVariant.findUnique({
        where: { id: insumoId },
        select: { article: { select: { measurementType: true } } },
      });
      if (variant?.article.measurementType === 'LINEAL_1D' && producible.gt(0)) {
        const pieces = await this.stockPieceService.listAvailablePieces({ articleVariantId: insumoId, warehouseId });
        producible = new Prisma.Decimal(maxUnitsByPieces(bom.lines, insumoId, pieces, producible.toNumber()));
      }
      byInsumo.set(insumoId, { disponible, producible });
    }

    const perLine: ProducibleLine[] = bom.lines.map((line) => {
      const insumo = byInsumo.get(line.inputArticleVariantId) as { disponible: Prisma.Decimal; producible: Prisma.Decimal };
      return { line, disponible: insumo.disponible, requerido: requeridoLinea(line), producible: insumo.producible };
    });

    if (perLine.length === 0) {
      return { maxProducible: new Prisma.Decimal(0), bottleneck: null, perLine };
    }

    const bottleneckEntry = perLine.reduce((min, entry) =>
      entry.producible.lt(min.producible) ? entry : min,
    );

    return { maxProducible: bottleneckEntry.producible, bottleneck: bottleneckEntry.line, perLine };
  }

  /** Cortes 1D de `units` unidades que no entran enteros en ninguna pieza
   * AVAILABLE del depósito - aunque los mm totales alcancen. Usado al
   * confirmar/reintentar una orden (la deja "esperando insumos" en vez de
   * que falle recién al completarla) y en su detalle, para decir qué
   * corte falta. Mide contra todas las piezas del depósito: las reservas
   * de otras órdenes son en mm, no de piezas puntuales. */
  async findUnfittableCuts(
    lines: BomLine[],
    units: Prisma.Decimal,
    warehouseId: string,
  ): Promise<UnfittableCut[]> {
    const db = getTenantDb();
    const result: UnfittableCut[] = [];
    for (const insumoId of [...new Set(lines.map((l) => l.inputArticleVariantId))]) {
      const variant = await db.articleVariant.findUnique({
        where: { id: insumoId },
        select: { article: { select: { measurementType: true } } },
      });
      if (variant?.article.measurementType !== 'LINEAL_1D') continue;
      const pieces = await this.stockPieceService.listAvailablePieces({ articleVariantId: insumoId, warehouseId });
      const { unplaced } = planCuts(buildCutList(lines, insumoId, units), pieces);
      for (const group of groupUnplaced(unplaced)) {
        result.push({ inputArticleVariantId: insumoId, cutLength: group.cutLength, count: group.count });
      }
    }
    return result;
  }
}
