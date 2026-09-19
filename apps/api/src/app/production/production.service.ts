import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb, Prisma, type ProductionOrder, type StockReservation } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { BomService, ProductionOrderService, StockPieceService } from '@plexo/production';

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

    let totalConsumptionCost = new Prisma.Decimal(0);
    for (const reservation of reservations) {
      totalConsumptionCost = totalConsumptionCost.add(
        await this.consumeReservation(order, reservation),
      );
    }

    if (!order.bomId) {
      throw new BadRequestException('Esta orden no tiene una receta (BOM) para determinar lo producido');
    }
    const bom = await this.bomService.getById(order.bomId);
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

  private async consumeReservation(
    order: ProductionOrder,
    reservation: StockReservation,
  ): Promise<Prisma.Decimal> {
    const db = getTenantDb();
    const variant = await db.articleVariant.findUniqueOrThrow({
      where: { id: reservation.inputArticleVariantId },
      select: { article: { select: { measurementType: true, minUsableLength: true } } },
    });

    if (variant.article.measurementType !== 'LINEAL_1D') {
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

    // 1D: corta una o más StockPiece hasta cubrir el total reservado (una
    // sola pieza puede no alcanzar - se agota la más grande disponible y
    // se sigue con el resto en otra). Cada corte genera su propio
    // ProductionConsumption (costo heredado de ESA pieza puntual, no del
    // promedio de StockLedger).
    let remaining = reservation.quantityReserved;
    let consumedCost = new Prisma.Decimal(0);
    while (remaining.gt(0)) {
      const bestFit = await this.stockPieceService.findBestFitPiece({
        articleVariantId: reservation.inputArticleVariantId,
        warehouseId: reservation.warehouseId,
        minLength: remaining,
      });
      const piece =
        bestFit ??
        (await this.stockPieceService.findLargestPiece({
          articleVariantId: reservation.inputArticleVariantId,
          warehouseId: reservation.warehouseId,
        }));
      if (!piece) {
        throw new BadRequestException(
          'No hay suficientes piezas físicas en stock para completar esta reserva',
        );
      }
      const cutAmount = bestFit ? remaining : Prisma.Decimal.min(piece.currentLength, remaining);

      const { offcut } = await this.stockPieceService.cutPiece({
        pieceId: piece.id,
        lengthToCut: cutAmount,
        minUsableLength: variant.article.minUsableLength,
      });
      const cost = piece.unitCost.mul(cutAmount);
      consumedCost = consumedCost.add(cost);

      await this.orderService.recordConsumption({
        productionOrderId: order.id,
        reservationId: reservation.id,
        inputArticleVariantId: reservation.inputArticleVariantId,
        quantityConsumed: cutAmount,
        stockPieceId: piece.id,
        offcutPieceId: offcut?.id,
        wasteAmount: offcut && offcut.status === 'SCRAP' ? offcut.currentLength : undefined,
        cost,
      });

      remaining = remaining.sub(cutAmount);
    }

    // Espeja StockLedger.quantity para el artículo 1D (ver StockPiece en
    // el schema) - una sola vez por reserva, por el TOTAL cortado, en la
    // misma transacción que las piezas de arriba.
    await this.inventoryService.recordMovement({
      warehouseId: reservation.warehouseId,
      articleVariantId: reservation.inputArticleVariantId,
      type: 'PRODUCTION_OUT',
      quantity: reservation.quantityReserved.toNumber(),
      sourceType: 'ProductionOrder',
      sourceId: order.id,
      excludeReservationId: reservation.id,
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
