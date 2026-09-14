import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, Prisma, type BomLine } from '@plexo/database';
import { getReservedQuantity } from '@plexo/inventory';
import { BomService } from './bom.service.js';
import { StockPieceService } from './stock-piece.service.js';

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
      throw new NotFoundException('Article variant not found');
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

    const perLine: ProducibleLine[] = await Promise.all(
      bom.lines.map(async (line) => {
        const disponible = await this.getDisponible({
          articleVariantId: line.inputArticleVariantId,
          warehouseId,
        });
        const requerido = line.quantity.mul(
          new Prisma.Decimal(1).add(line.expectedWastePercent.div(100)),
        );
        const producible = requerido.gt(0)
          ? Prisma.Decimal.max(disponible, 0).div(requerido).floor()
          : new Prisma.Decimal(0);
        return { line, disponible, requerido, producible };
      }),
    );

    if (perLine.length === 0) {
      return { maxProducible: new Prisma.Decimal(0), bottleneck: null, perLine };
    }

    const bottleneckEntry = perLine.reduce((min, entry) =>
      entry.producible.lt(min.producible) ? entry : min,
    );

    return { maxProducible: bottleneckEntry.producible, bottleneck: bottleneckEntry.line, perLine };
  }
}
