import { Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { Prisma } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { GoodsReceiptService, type CreateGoodsReceiptDto } from '@plexo/purchases';

/**
 * Composes GoodsReceiptService (libs/modules/purchases - creates the
 * remito itself, validated against the PurchaseOrder's pending quantity)
 * with InventoryService (moves stock) and AccountingService (posts the
 * GRNI accrual - Dr Mercaderías / Cr Mercadería Recibida No Facturada, see
 * AccountingService.postGoodsReceiptAccrual) - same shape as SalesService
 * composing Invoicing+Inventory+Accounting. GoodsReceiptService can't call
 * InventoryService/AccountingService itself (this repo's rule: a lib
 * module never imports another module's Service), so this is the
 * composition root for "a receipt also moves stock and accrues a
 * liability, at the cost the order already fixed".
 *
 * Atomicity for free, same reason as sales.service.ts: everything runs
 * through getTenantDb(), the same per-request transaction opened by
 * TenantContextInterceptor - if any recordMovement()/accounting call
 * throws, the whole transaction rolls back, including the GoodsReceipt
 * just created above.
 */
@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly goodsReceiptService: GoodsReceiptService,
    private readonly inventoryService: InventoryService,
    private readonly accountingService: AccountingService,
  ) {}

  async createReceipt(dto: CreateGoodsReceiptDto) {
    const receipt = await this.goodsReceiptService.create(dto);
    let accrualAmount = new Prisma.Decimal(0);
    for (const line of receipt.lines) {
      // Conversión de unidad de compra -> unidad de stock (ver
      // docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 3): PurchaseOrderLine.
      // quantity/unitCost siguen significando "lo que se le pide al
      // proveedor" (ej. 3 bolsas a $X la bolsa) - la conversión a la unidad
      // real de stock (ej. gramos) pasa a ocurrir sólo acá, al recibir.
      // factor=1 para CONTINUO sin purchaseSize configurado todavía, y para
      // cualquier otro measurementType - comportamiento actual intacto.
      const article = line.purchaseOrderLine.articleVariant.article;
      const factor =
        article.measurementType === 'CONTINUOUS' && article.purchaseSize
          ? article.purchaseSize
          : new Prisma.Decimal(1);

      await this.inventoryService.recordMovement({
        warehouseId: receipt.warehouseId,
        articleVariantId: line.purchaseOrderLine.articleVariantId,
        type: 'PURCHASE_IN',
        quantity: line.quantity.mul(factor).toNumber(),
        unitCost: line.purchaseOrderLine.unitCost.div(factor).toNumber(),
        purchaseOrderId: receipt.purchaseOrderId,
        goodsReceiptLineId: line.id,
      });
      // El accrual (GRNI) sigue siendo "cantidad pedida × costo por unidad
      // de compra" tal cual - la conversión de arriba es puramente de
      // unidad de stock, no cambia cuánto se le debe al proveedor.
      accrualAmount = accrualAmount.add(line.quantity.mul(line.purchaseOrderLine.unitCost));
    }
    await this.accountingService.postGoodsReceiptAccrual({
      goodsReceiptId: receipt.id,
      amount: accrualAmount,
      // The remito's own date, not "now" - same reasoning as
      // PurchaseInvoicesService.createInvoice's supplierInvoiceDate.
      date: receipt.receivedAt,
    });
    return receipt;
  }
}
