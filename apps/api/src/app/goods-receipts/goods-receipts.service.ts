import { Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { Prisma } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { StockPieceService } from '@plexo/production';
import { GoodsReceiptService, type CreateGoodsReceiptDto } from '@plexo/purchases';

/**
 * Composes GoodsReceiptService (libs/modules/purchases - creates the
 * remito itself, validated against the PurchaseOrder's pending quantity)
 * with InventoryService (moves stock), StockPieceService (crea las piezas
 * físicas 1D, ver docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 4.2) y
 * AccountingService (posts the GRNI accrual - Dr Mercaderías / Cr
 * Mercadería Recibida No Facturada, see
 * AccountingService.postGoodsReceiptAccrual) - same shape as SalesService
 * composing Invoicing+Inventory+Accounting. Ninguno de esos lib modules
 * puede llamarse entre sí (regla del repo: un lib module nunca inyecta el
 * Service de otro módulo), así que esta sigue siendo la composición raíz
 * para "un remito también mueve stock (y, si el artículo es 1D, crea sus
 * piezas físicas) y devenga un pasivo, al costo que ya fijó la orden".
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
    private readonly stockPieceService: StockPieceService,
    private readonly accountingService: AccountingService,
  ) {}

  async createReceipt(dto: CreateGoodsReceiptDto) {
    const receipt = await this.goodsReceiptService.create(dto);
    let accrualAmount = new Prisma.Decimal(0);
    for (const line of receipt.lines) {
      // Conversión de unidad de compra -> unidad de stock (ver
      // docs/OPLEX-Produccion-Plan-Tecnico-14-9.md, Fase 3/4.2):
      // PurchaseOrderLine.quantity/unitCost siguen significando "lo que se
      // le pide al proveedor" (ej. 3 bolsas, o 3 barras/rollos, a $X la
      // unidad) - la conversión a la unidad real de stock (gramos, o mm
      // totales para 1D) pasa a ocurrir sólo acá, al recibir.
      // commercialLength cumple para 1D exactamente el mismo rol que
      // purchaseSize para CONTINUO: "cuánto trae cada unidad pedida".
      // factor=1 para CONTINUO/1D sin ese campo configurado todavía, y
      // para cualquier otro measurementType - comportamiento actual intacto.
      const article = line.purchaseOrderLine.articleVariant.article;
      const factor =
        (article.measurementType === 'CONTINUOUS' && article.purchaseSize) ||
        (article.measurementType === 'LINEAL_1D' && article.commercialLength) ||
        new Prisma.Decimal(1);

      const stockUnitCost = line.purchaseOrderLine.unitCost.div(factor);

      await this.inventoryService.recordMovement({
        warehouseId: receipt.warehouseId,
        articleVariantId: line.purchaseOrderLine.articleVariantId,
        type: 'PURCHASE_IN',
        quantity: line.quantity.mul(factor).toNumber(),
        unitCost: stockUnitCost.toNumber(),
        purchaseOrderId: receipt.purchaseOrderId,
        goodsReceiptLineId: line.id,
      });

      // 1D: además del espejo de StockLedger de arriba, cada unidad
      // comercial pedida (ej. cada barra/rollo) nace como su propia
      // StockPiece rastreable - StockPieceService nunca escribe
      // StockLedger/StockMovement, por eso el recordMovement de arriba
      // sigue siendo necesario aparte (ver StockPieceService, no llama a
      // InventoryService él mismo).
      if (article.measurementType === 'LINEAL_1D' && article.commercialLength) {
        const pieceCount = Math.round(line.quantity.toNumber());
        for (let i = 0; i < pieceCount; i++) {
          await this.stockPieceService.createFullStockPiece({
            articleVariantId: line.purchaseOrderLine.articleVariantId,
            warehouseId: receipt.warehouseId,
            length: article.commercialLength,
            unitCost: stockUnitCost,
          });
        }
      }

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
