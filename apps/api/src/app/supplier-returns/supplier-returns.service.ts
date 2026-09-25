import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb, Prisma } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { SupplierReturnService, type CreateSupplierReturnDto } from '@plexo/purchases';
import { StockPieceService } from '@plexo/production';

/**
 * Composes SupplierReturnService (libs/modules/purchases - creates the
 * devolución itself, validated against what that remito line actually
 * received) with InventoryService (moves stock out) and AccountingService
 * - same shape as GoodsReceiptsService composing GoodsReceiptService +
 * InventoryService + AccountingService, which itself mirrors SalesService.
 * SupplierReturnService can't call InventoryService/AccountingService
 * directly (this repo's rule: a lib module never imports another module's
 * Service), so this is the composition root.
 *
 * No unitCost passed to recordMovement - SUPPLIER_RETURN is an outbound
 * type, InventoryService stamps the ledger's current average cost on it
 * itself (same as SALE_OUT/PRODUCTION_OUT), never asked from the caller.
 * The reversal amount below uses PurchaseOrderLine.unitCost instead (the
 * accrual it's reversing was booked at that cost, not the ledger's current
 * average, which can have drifted since).
 *
 * Which account absorbs the reversal depends on whether the underlying
 * remito was already invoiced by the time this return is recorded (checked
 * here via PurchaseInvoiceReceipt, since neither SupplierReturnService nor
 * AccountingService has a notion of "already invoiced" on their own):
 *  - Not yet invoiced: the GRNI accrual for this receipt is still sitting
 *    there uncleared - reverse it directly (reverseSupplierReturnAccrual,
 *    Dr GRNI / Cr Mercaderías). PurchaseInvoiceService.create() already
 *    nets returns out of grniClearedAmount, so the invoice that eventually
 *    covers this receipt bills the right (lower) amount on its own.
 *  - Already invoiced: GRNI for this receipt was already cleared into
 *    Proveedores when that PurchaseInvoice was posted - crediting GRNI
 *    again would leave a debit balance nothing will ever clear. What's
 *    actually owed less now is Proveedores (reverseSupplierReturnAgainstPayable,
 *    Dr Proveedores / Cr Mercaderías), and that invoice's own balanceDue
 *    has to come down by the same amount so the subsidiary ledger (what
 *    Cuentas a Pagar shows as pending on that invoice) agrees with the
 *    control account.
 *
 * Atomicity for free, same reason as goods-receipts.service.ts: everything
 * runs through getTenantDb(), the same per-request transaction - if any
 * recordMovement()/accounting call throws, the whole transaction rolls
 * back, including the SupplierReturn just created above.
 *
 * Unidad de compra -> unidad de stock: SupplierReturnLine.quantity está en
 * la MISMA unidad que GoodsReceiptLine/PurchaseOrderLine.quantity ("3
 * barras", no "3000mm" - ver SupplierReturnService.create, que valida
 * contra receiptLine.quantity, esa unidad). GoodsReceiptsService.
 * createReceipt aplica esta misma conversión (factor = commercialLength/
 * purchaseSize) al RECIBIR - acá hay que deshacerla exactamente igual al
 * devolver, si no el ledger queda descontado de menos (encontrado en QA
 * 2026-09-21: recibir 1000 barras de 2000mm sube el ledger en 2.000.000,
 * pero devolver esas mismas 1000 "barras" sólo bajaba el ledger en 1000 si
 * no se convertía acá).
 */
@Injectable()
export class SupplierReturnsService {
  constructor(
    private readonly supplierReturnService: SupplierReturnService,
    private readonly inventoryService: InventoryService,
    private readonly accountingService: AccountingService,
    private readonly stockPieceService: StockPieceService,
  ) {}

  async createReturn(dto: CreateSupplierReturnDto) {
    const supplierReturn = await this.supplierReturnService.create(dto);
    const db = getTenantDb();
    let reversalAmount = new Prisma.Decimal(0);
    for (const line of supplierReturn.lines) {
      const articleVariantId = line.goodsReceiptLine.purchaseOrderLine.articleVariantId;
      const variant = await db.articleVariant.findUniqueOrThrow({
        where: { id: articleVariantId },
        select: { article: { select: { measurementType: true, purchaseSize: true, commercialLength: true } } },
      });
      const article = variant.article;
      // El inverso exacto del factor que GoodsReceiptsService.createReceipt
      // aplicó AL RECIBIR este remito - sale del propio movimiento
      // PURCHASE_IN de esa línea (mm o gr que entraron / unidades de compra
      // recibidas), no del commercialLength/purchaseSize actual del
      // artículo: el largo comercial se puede corregir después del alta
      // (ver UpdateArticleDto), y usar el valor nuevo descontaría del
      // ledger una cantidad distinta a la que sumó la recepción. El
      // artículo actual queda sólo como fallback si no aparece ese
      // movimiento.
      const receiptMovement = await db.stockMovement.findFirst({
        where: { goodsReceiptLineId: line.goodsReceiptLineId, type: 'PURCHASE_IN' },
        select: { quantity: true },
      });
      const receivedQuantity = line.goodsReceiptLine.quantity;
      const factor =
        receiptMovement && receivedQuantity?.gt(0)
          ? receiptMovement.quantity.div(receivedQuantity)
          : (article.measurementType === 'CONTINUOUS' && article.purchaseSize) ||
            (article.measurementType === 'LINEAL_1D' && article.commercialLength) ||
            new Prisma.Decimal(1);

      await this.inventoryService.recordMovement({
        warehouseId: supplierReturn.goodsReceipt.warehouseId,
        articleVariantId,
        type: 'SUPPLIER_RETURN',
        quantity: line.quantity.mul(factor).toNumber(),
        goodsReceiptLineId: line.goodsReceiptLineId,
        sourceType: 'SUPPLIER_RETURN',
        sourceId: supplierReturn.id,
      });

      // 1D: además del espejo de StockLedger de arriba, cada barra/rollo
      // devuelto tiene que dejar de existir como StockPiece - si no,
      // "Piezas y recortes" sigue mostrándola disponible aunque ya volvió
      // al proveedor. Sólo se pueden devolver piezas TODAVÍA INTACTAS (ver
      // StockPieceService.returnFullPieces) - explota si ya se cortó
      // alguna, en vez de dejar el conteo descuadrado en silencio. factor=1
      // en 1D = se recibió antes de configurar el largo comercial, y en ese
      // caso la recepción no creó piezas - no hay nada que devolver acá.
      // `length` = el largo con el que nacieron las piezas de ESTE remito,
      // para no llevarse barras de otro largo si el comercial cambió.
      if (article.measurementType === 'LINEAL_1D' && !factor.equals(1)) {
        await this.stockPieceService.returnFullPieces({
          articleVariantId,
          warehouseId: supplierReturn.goodsReceipt.warehouseId,
          count: Math.round(line.quantity.toNumber()),
          length: factor,
        });
      }

      reversalAmount = reversalAmount.add(line.quantity.mul(line.goodsReceiptLine.purchaseOrderLine.unitCost));
    }

    const invoiceLink = await db.purchaseInvoiceReceipt.findFirst({
      where: { goodsReceiptId: supplierReturn.goodsReceiptId },
      select: { purchaseInvoiceId: true },
    });

    if (invoiceLink) {
      const invoice = await db.purchaseInvoice.findUniqueOrThrow({
        where: { id: invoiceLink.purchaseInvoiceId },
      });
      const balanceDue = invoice.balanceDue.sub(reversalAmount);
      if (balanceDue.lt(0)) {
        throw new BadRequestException(
          `La devolución ($${reversalAmount.toFixed(2)}) supera el saldo pendiente de la factura de compra vinculada ($${invoice.balanceDue.toFixed(2)})`,
        );
      }
      await db.purchaseInvoice.update({
        where: { id: invoice.id },
        data: { balanceDue, status: balanceDue.isZero() ? 'PAID' : 'PARTIALLY_PAID' },
      });
      await this.accountingService.reverseSupplierReturnAgainstPayable({
        supplierReturnId: supplierReturn.id,
        amount: reversalAmount,
      });
    } else {
      await this.accountingService.reverseSupplierReturnAccrual({
        supplierReturnId: supplierReturn.id,
        amount: reversalAmount,
      });
    }

    return supplierReturn;
  }
}
