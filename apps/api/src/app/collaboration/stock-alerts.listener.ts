import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { getTenantDb, notify, Prisma, userIdsWithRoles } from '@plexo/database';

export interface StockDecreasedEvent {
  tenantId: string;
  warehouseId: string;
  articleVariantId: string;
  previousQuantity: string;
  newQuantity: string;
}

// Quienes compran o manejan stock - ver "Qué me avisa Oplex".
const STOCK_ALERT_ROLES = ['OWNER', 'ADMIN', 'PURCHASES', 'INVENTORY'] as const;
const QTY = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

/**
 * "Tornillo 6×40 quedó bajo el mínimo". InventoryService lo dispara con
 * emitAsync dentro de la transacción del movimiento (por eso esto puede
 * consultar la base). Avisa sólo al CRUZAR el mínimo (antes >= mínimo,
 * ahora < mínimo), no en cada venta mientras siga abajo.
 */
@Injectable()
export class StockAlertsListener {
  @OnEvent('stock.decreased')
  async onStockDecreased(event: StockDecreasedEvent): Promise<void> {
    const db = getTenantDb();
    const minimum = await db.minimumStock.findUnique({
      where: { warehouseId_articleVariantId: { warehouseId: event.warehouseId, articleVariantId: event.articleVariantId } },
      select: { minimumQuantity: true },
    });
    if (!minimum) {
      return;
    }
    const before = new Prisma.Decimal(event.previousQuantity);
    const after = new Prisma.Decimal(event.newQuantity);
    if (!(before.gte(minimum.minimumQuantity) && after.lt(minimum.minimumQuantity))) {
      return;
    }

    const [variant, warehouse] = await Promise.all([
      db.articleVariant.findUnique({ where: { id: event.articleVariantId }, select: { article: { select: { name: true } } } }),
      db.warehouse.findUnique({ where: { id: event.warehouseId }, select: { name: true } }),
    ]);
    await notify({
      recipientUserIds: await userIdsWithRoles([...STOCK_ALERT_ROLES]),
      category: 'STOCK',
      type: 'stock.below_minimum',
      preference: 'stock.below_minimum',
      message: `**${variant?.article.name ?? 'Un artículo'}** quedó bajo el mínimo en ${warehouse?.name ?? 'el depósito'}: ${QTY.format(after.toNumber())} (mínimo ${QTY.format(minimum.minimumQuantity.toNumber())})`,
      link: '/inventory',
    });
  }
}
