import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb, Prisma, type ProductionOrder, type StockReservation } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import {
  BomService,
  buildCutList,
  planCuts,
  ProductionOrderService,
  StockPieceService,
  type BomDetail,
} from '@plexo/production';

/**
 * Composición del "completar orden" (ver
 * docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 4.5 y Fase 5): decide
 * CUÁNTO se consume de cada insumo reservado (cortando `StockPiece` para
 * 1D, o directo para el resto), llama a `InventoryService.recordMovement`
 * y posta el asiento de traspaso de "Mercaderías"
 * (`AccountingService.postProductionJournalEntry`) - `ProductionOrderService`/
 * `StockPieceService` (ambos de `@plexo/production`) no pueden llamar a
 * `InventoryService`/`AccountingService` ellos mismos, regla del repo de
 * que un lib module nunca inyecta el Service de otro módulo - por eso esta
 * orquestación vive acá, mismo rol que GoodsReceiptsService componiendo
 * Purchases+Inventory+Accounting.
 *
 * Atomicidad gratis, mismo motivo que goods-receipts.service.ts: todo pasa
 * por getTenantDb(), la transacción del request - si algo tira, se
 * deshace todo, reservas y asiento incluidos.
 */
@Injectable()
export class ProductionService {
  constructor(
    private readonly orderService: ProductionOrderService,
    private readonly stockPieceService: StockPieceService,
    private readonly bomService: BomService,
    private readonly inventoryService: InventoryService,
    private readonly accountingService: AccountingService,
  ) {}

  async completeOrder(orderId: string): Promise<ProductionOrder> {
    const order = await this.orderService.assertCompletable(orderId);
    const reservations = await this.orderService.getActiveReservations(orderId);
    if (reservations.length === 0) {
      throw new BadRequestException('Esta orden no tiene ninguna reserva activa para consumir');
    }
    if (!order.bomId) {
      throw new BadRequestException('Esta orden no tiene una receta (BOM) para determinar lo producido');
    }
    const bom = await this.bomService.getById(order.bomId);

    // Agrupadas por insumo: un 1D se consume de una sola vez con todos sus
    // cortes (de todas las líneas de la receta que lo usan), porque el plan
    // de corte tiene que ver todos los cortes juntos para aprovechar bien
    // las barras - el resto sigue siendo una salida por reserva.
    const reservationsByInsumo = new Map<string, StockReservation[]>();
    for (const reservation of reservations) {
      const group = reservationsByInsumo.get(reservation.inputArticleVariantId) ?? [];
      group.push(reservation);
      reservationsByInsumo.set(reservation.inputArticleVariantId, group);
    }

    const db = getTenantDb();
    let totalConsumptionCost = new Prisma.Decimal(0);
    for (const [inputArticleVariantId, insumoReservations] of reservationsByInsumo) {
      const variant = await db.articleVariant.findUniqueOrThrow({
        where: { id: inputArticleVariantId },
        select: { article: { select: { name: true, measurementType: true, minUsableLength: true } } },
      });
      if (variant.article.measurementType === 'LINEAL_1D') {
        totalConsumptionCost = totalConsumptionCost.add(
          await this.consumeLinealInsumo(order, bom, insumoReservations, variant.article),
        );
        continue;
      }
      for (const reservation of insumoReservations) {
        totalConsumptionCost = totalConsumptionCost.add(await this.consumeReservation(order, reservation));
      }
    }

    // Todas las reservas de una misma orden comparten depósito - confirm()
    // toma un único warehouseId por orden (ver ConfirmProductionOrderDto),
    // aplicado igual a cada línea de la receta.
    const warehouseId = reservations[0].warehouseId;

    let remainingCost = totalConsumptionCost;
    let totalOutputsCost = new Prisma.Decimal(0);
    for (const byproduct of bom.byproducts) {
      const quantityProduced = byproduct.quantity.mul(order.quantity);
      const cost = totalConsumptionCost.mul(byproduct.costSharePercent ?? 0).div(100);
      remainingCost = remainingCost.sub(cost);
      totalOutputsCost = totalOutputsCost.add(cost);
      await this.recordOutputMovement(order, {
        articleVariantId: byproduct.outputArticleVariantId,
        isPrimary: false,
        quantityProduced,
        cost,
        warehouseId,
      });
    }

    // El principal se queda con lo que sobra del costo total después de
    // repartir subproductos - evita que redondeos independientes por línea
    // hagan que la suma de outputs no cierre contra totalConsumptionCost.
    await this.recordOutputMovement(order, {
      articleVariantId: order.outputArticleVariantId,
      isPrimary: true,
      quantityProduced: order.quantity,
      cost: remainingCost,
      warehouseId,
    });
    totalOutputsCost = totalOutputsCost.add(remainingCost);

    const finishedOrder = await this.orderService.finishOrder(order.id);
    await this.accountingService.postProductionJournalEntry({
      productionOrderId: finishedOrder.id,
      inputsCost: totalConsumptionCost,
      outputsCost: totalOutputsCost,
      date: finishedOrder.finishedAt ?? undefined,
    });
    return finishedOrder;
  }

  /** Insumos que no son 1D: una salida de stock por reserva, al costo
   * promedio del ledger. */
  private async consumeReservation(
    order: ProductionOrder,
    reservation: StockReservation,
  ): Promise<Prisma.Decimal> {
    const movement = await this.inventoryService.recordMovement({
      warehouseId: reservation.warehouseId,
      articleVariantId: reservation.inputArticleVariantId,
      type: 'PRODUCTION_OUT',
      quantity: reservation.quantityReserved.toNumber(),
      sourceType: 'ProductionOrder',
      sourceId: order.id,
      excludeReservationId: reservation.id,
    });
    const cost = (movement.unitCost ?? new Prisma.Decimal(0)).mul(reservation.quantityReserved);
    await this.orderService.recordConsumption({
      productionOrderId: order.id,
      reservationId: reservation.id,
      inputArticleVariantId: reservation.inputArticleVariantId,
      quantityConsumed: reservation.quantityReserved,
      cost,
    });
    return cost;
  }

  /**
   * 1D (barras/perfiles/caños): cada corte de la receta sale ENTERO de una
   * sola pieza - nunca se arma un corte empalmando dos pedazos. Antes el
   * total reservado de cada línea (ej. 2 cortes de 1200 = 2400mm) se
   * cortaba como un único tramo, y si ninguna pieza alcanzaba se agotaba
   * la más larga y se seguía con otra: con barras de 2000 eso daba una
   * barra entera + 400mm de otra, cuando en el taller se usan 2 barras
   * (1200 de cada una) y quedan 2 recortes de 800.
   *
   * 1) Plan en memoria: todos los cortes del insumo (de todas las líneas
   *    de la receta que lo usan), de mayor a menor, cada uno a la pieza
   *    más chica donde entra (best-fit) - el sobrante de una pieza ya
   *    usada en el plan sigue disponible para los cortes siguientes,
   *    aunque después quede por debajo del largo mínimo útil.
   * 2) Recién después se corta de verdad: un cutPiece por pieza usada,
   *    por la suma de sus cortes, así el recorte final se clasifica
   *    AVAILABLE/SCRAP una sola vez, con lo que realmente sobró.
   *
   * StockLedger baja por lo que salió del stock utilizable (cortes + la
   * merma real que quedó por debajo de minUsableLength), no por el % de
   * merma estimado de la receta - así el ledger sigue igual a la suma de
   * las piezas AVAILABLE. El costo es el de cada pieza puntual (heredado
   * por mm), merma incluida.
   */
  private async consumeLinealInsumo(
    order: ProductionOrder,
    bom: BomDetail,
    reservations: StockReservation[],
    article: { name: string; minUsableLength: Prisma.Decimal | null },
  ): Promise<Prisma.Decimal> {
    const { inputArticleVariantId, warehouseId } = reservations[0];

    // Mismo plan que usan "cuántas se pueden producir" y confirmar la orden
    // (cut-plan.ts, @plexo/production) - los tres tienen que coincidir.
    const pieces = await this.stockPieceService.listAvailablePieces({ articleVariantId: inputArticleVariantId, warehouseId });
    const { slots: plan, unplaced } = planCuts(buildCutList(bom.lines, inputArticleVariantId, order.quantity), pieces);
    if (unplaced.length > 0) {
      throw new BadRequestException(
        `No hay una pieza de ${article.name} de al menos ${unplaced[0].toString()} mm para uno de los cortes de esta orden - ` +
          'cada corte tiene que salir entero de una sola pieza',
      );
    }

    let consumedCost = new Prisma.Decimal(0);
    let removedFromStock = new Prisma.Decimal(0);
    for (const slot of plan.filter((s) => s.cuts.length > 0)) {
      const totalCut = slot.cuts.reduce((sum, c) => sum.add(c), new Prisma.Decimal(0));
      const { offcut } = await this.stockPieceService.cutPiece({
        pieceId: slot.piece.id,
        lengthToCut: totalCut,
        minUsableLength: article.minUsableLength,
      });
      const scrap = offcut && offcut.status === 'SCRAP' ? offcut.currentLength : new Prisma.Decimal(0);
      removedFromStock = removedFromStock.add(totalCut).add(scrap);

      // Un ProductionConsumption por corte (trazabilidad "2 cortes de 1200
      // de esta barra"); el recorte/merma que dejó la pieza va en el último.
      for (const [index, cut] of slot.cuts.entries()) {
        const isLast = index === slot.cuts.length - 1;
        const waste = isLast ? scrap : new Prisma.Decimal(0);
        const cost = slot.piece.unitCost.mul(cut.add(waste));
        consumedCost = consumedCost.add(cost);
        await this.orderService.recordConsumption({
          productionOrderId: order.id,
          reservationId: reservations[0].id,
          inputArticleVariantId,
          quantityConsumed: cut,
          stockPieceId: slot.piece.id,
          offcutPieceId: isLast ? offcut?.id : undefined,
          wasteAmount: isLast && waste.gt(0) ? waste : undefined,
          cost,
        });
      }
    }

    // Todas las reservas del insumo cerradas ANTES de la salida de stock:
    // si alguna siguiera ACTIVE, recordMovement la restaría del disponible
    // y podría rechazar la salida por la propia reserva de esta orden.
    await this.orderService.markReservationsConsumed(reservations.map((r) => r.id));
    await this.inventoryService.recordMovement({
      warehouseId,
      articleVariantId: inputArticleVariantId,
      type: 'PRODUCTION_OUT',
      quantity: removedFromStock.toNumber(),
      sourceType: 'ProductionOrder',
      sourceId: order.id,
    });

    return consumedCost;
  }

  private async recordOutputMovement(
    order: ProductionOrder,
    input: {
      articleVariantId: string;
      isPrimary: boolean;
      quantityProduced: Prisma.Decimal;
      cost: Prisma.Decimal;
      warehouseId: string;
    },
  ): Promise<void> {
    const unitCost = input.quantityProduced.gt(0)
      ? input.cost.div(input.quantityProduced)
      : new Prisma.Decimal(0);
    await this.inventoryService.recordMovement({
      warehouseId: input.warehouseId,
      articleVariantId: input.articleVariantId,
      type: 'PRODUCTION_IN',
      quantity: input.quantityProduced.toNumber(),
      unitCost: unitCost.toNumber(),
      sourceType: 'ProductionOrder',
      sourceId: order.id,
    });
    await this.orderService.recordOutput({
      productionOrderId: order.id,
      articleVariantId: input.articleVariantId,
      isPrimary: input.isPrimary,
      quantityProduced: input.quantityProduced,
      cost: input.cost,
    });
  }
}
