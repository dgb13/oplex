import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma } from '@plexo/database';
import type { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto.js';
import { getReturnedQuantitiesByGoodsReceiptLine } from './supplier-return.service.js';

const RECEIPT_DETAIL_INCLUDE = {
  lines: {
    include: {
      purchaseOrderLine: {
        select: {
          id: true,
          articleVariantId: true,
          unitCost: true,
          // measurementType/purchaseSize/commercialLength del artículo, no
          // de la variante - GoodsReceiptsService (apps/api) los usa para
          // convertir "bolsas"/"barras pedidas" a la unidad de stock real
          // antes de mover inventario (ver Fase 3/4.2 del plan de
          // Producción - commercialLength es el equivalente de
          // purchaseSize para 1D: cuántos mm trae CADA barra/rollo
          // pedido). Sin esto tendría que volver a consultar cada Article
          // por separado (N+1).
          articleVariant: {
            select: {
              article: {
                select: { measurementType: true, purchaseSize: true, commercialLength: true, minUsableLength: true },
              },
            },
          },
        },
      },
    },
  },
  receivedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.GoodsReceiptInclude;

/** Sum of what's already been received per PurchaseOrderLine, NET of
 * anything sent back via SupplierReturn - same shape as InvoicingService.
 * createCreditNote's `alreadyCreditedByLine` (invoicing.service.ts), just
 * for remitos instead of partial credit notes. Exported so
 * PurchaseOrderService can reuse it for display (receivedQuantity/
 * pendingQuantity per line) without duplicating the aggregate query.
 *
 * A return is recorded against a specific GoodsReceiptLine (see
 * SupplierReturnService), one level below PurchaseOrderLine - can't do
 * this as a single groupBy like before, need each receipt line's own id to
 * net its returns against it before rolling up to the PO line. */
export async function getReceivedQuantitiesByLine(
  purchaseOrderLineIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  if (purchaseOrderLineIds.length === 0) {
    return new Map();
  }
  const receiptLines = await getTenantDb().goodsReceiptLine.findMany({
    where: { purchaseOrderLineId: { in: purchaseOrderLineIds } },
    select: { id: true, purchaseOrderLineId: true, quantity: true },
  });
  const returnedByReceiptLine = await getReturnedQuantitiesByGoodsReceiptLine(receiptLines.map((l) => l.id));

  const netByPurchaseOrderLine = new Map<string, Prisma.Decimal>();
  for (const receiptLine of receiptLines) {
    const returned = returnedByReceiptLine.get(receiptLine.id) ?? new Prisma.Decimal(0);
    const net = receiptLine.quantity.sub(returned);
    const prior = netByPurchaseOrderLine.get(receiptLine.purchaseOrderLineId) ?? new Prisma.Decimal(0);
    netByPurchaseOrderLine.set(receiptLine.purchaseOrderLineId, prior.add(net));
  }
  return netByPurchaseOrderLine;
}

/**
 * Recepción de mercadería (remito) against an already-SENT PurchaseOrder -
 * quantity-only, no price (the cost already lives on PurchaseOrderLine.
 * unitCost, read back by GoodsReceiptsService in apps/api to drive the
 * actual PURCHASE_IN stock movements - this service never touches
 * Inventory itself, see the module-boundary rule this repo already
 * follows for InvoicingService.createCreditNote/SalesService.voidSale).
 *
 * Supports partial deliveries: multiple receipts can be logged against the
 * same order, each capped at what's still pending for that line. Never
 * lets the accumulated received quantity exceed what was ordered - a
 * concurrent double-submission is guarded by locking the targeted
 * PurchaseOrderLine rows first, same recipe as createCreditNote.
 */
@Injectable()
export class GoodsReceiptService {
  async create(dto: CreateGoodsReceiptDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const receivedByUserId = requireUserId();

    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId },
      include: { lines: true },
    });
    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }
    if (purchaseOrder.status !== 'SENT') {
      throw new BadRequestException('Only a SENT purchase order can receive goods');
    }

    const warehouse = await db.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    // Lock first, in requested order, so two concurrent receipts against
    // the same line serialize instead of racing past the check below -
    // same recipe as InvoicingService.createCreditNote.
    for (const line of dto.lines) {
      await db.$queryRaw`SELECT id FROM purchase_order_lines WHERE id = ${line.purchaseOrderLineId} FOR UPDATE`;
    }

    const poLinesById = new Map(purchaseOrder.lines.map((l) => [l.id, l]));
    const alreadyReceivedByLine = await getReceivedQuantitiesByLine(dto.lines.map((l) => l.purchaseOrderLineId));
    // Mutable running total, seeded from the DB snapshot above - updated as
    // each requested line is accepted below, so two lines in THIS SAME
    // request against the same purchaseOrderLineId are checked
    // cumulatively instead of both reading the same stale snapshot (which
    // let a single request receive more than what was ordered, no
    // concurrency needed - the FOR UPDATE lock above only serializes
    // against OTHER requests, not duplicate entries within this one).
    const runningReceived = new Map(alreadyReceivedByLine);

    const linesToCreate: { purchaseOrderLineId: string; quantity: Prisma.Decimal }[] = [];
    for (const requested of dto.lines) {
      const poLine = poLinesById.get(requested.purchaseOrderLineId);
      if (!poLine) {
        throw new BadRequestException(
          `Purchase order line ${requested.purchaseOrderLineId} does not belong to this order`,
        );
      }
      const quantity = new Prisma.Decimal(requested.quantity);
      const priorlyReceived = runningReceived.get(poLine.id) ?? new Prisma.Decimal(0);
      const totalReceived = priorlyReceived.add(quantity);
      if (totalReceived.gt(poLine.quantity)) {
        throw new BadRequestException(
          `Cannot receive ${quantity.toString()} of line ${poLine.id}: only ${poLine.quantity.sub(priorlyReceived).toString()} left to receive`,
        );
      }
      runningReceived.set(poLine.id, totalReceived);
      linesToCreate.push({ purchaseOrderLineId: poLine.id, quantity });
    }

    return db.goodsReceipt.create({
      data: {
        tenantId,
        purchaseOrderId: dto.purchaseOrderId,
        warehouseId: dto.warehouseId,
        supplierDocNumber: dto.supplierDocNumber,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
        notes: dto.notes,
        receivedByUserId,
        lines: { createMany: { data: linesToCreate.map((l) => ({ tenantId, ...l })) } },
      },
      include: RECEIPT_DETAIL_INCLUDE,
    });
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
