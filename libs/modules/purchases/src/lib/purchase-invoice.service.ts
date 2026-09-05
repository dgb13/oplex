import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma } from '@plexo/database';
import type { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto.js';
import type { ListPurchaseInvoicesQueryDto } from './dto/list-purchase-invoices-query.dto.js';
import type { RecordSupplierPaymentDto } from './dto/record-supplier-payment.dto.js';
import { getReturnedQuantitiesByGoodsReceiptLine } from './supplier-return.service.js';

const INVOICE_DETAIL_INCLUDE = {
  taxLines: true,
  receiptLinks: {
    include: {
      goodsReceipt: { select: { id: true, supplierDocNumber: true, receivedAt: true } },
    },
  },
  payments: { orderBy: { paidAt: 'desc' }, include: { withholdings: true } },
  purchaseOrder: { select: { id: true, number: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PurchaseInvoiceInclude;

const LIST_INCLUDE = {
  taxLines: true,
  purchaseOrder: { select: { id: true, number: true } },
} satisfies Prisma.PurchaseInvoiceInclude;

/** What GoodsReceiptsService/apps-api's PurchaseInvoicesService needs to
 * post the accounting entry (see AccountingService.
 * postPurchaseInvoiceJournalEntry) - kept separate from the persisted
 * PurchaseInvoice row itself, same "never cache a derived amount"
 * criterion as PurchaseOrderService.attachReceivingInfo. */
export interface CreatedPurchaseInvoice {
  invoice: Prisma.PurchaseInvoiceGetPayload<{ include: typeof INVOICE_DETAIL_INCLUDE }>;
  grniClearedAmount: Prisma.Decimal;
  nonGrniAmount: Prisma.Decimal;
}

/**
 * Factura de Compra - always tied to a PurchaseOrder (that's where the
 * article-level cost detail lives, see PurchaseOrderLine.unitCost). This
 * service only creates the document and computes the GRNI split
 * (grniClearedAmount/nonGrniAmount) from purchases-domain data (which
 * GoodsReceipts it clears, net of any SupplierReturns already logged
 * against them) - it never calls AccountingService itself (this repo's
 * rule: a lib module never imports another module's Service). apps/api's
 * PurchaseInvoicesService is the composition root that takes these two
 * amounts and posts the actual journal entry, same shape as
 * GoodsReceiptsService composing GoodsReceiptService + InventoryService.
 */
@Injectable()
export class PurchaseInvoiceService {
  /** Un único listado para "Facturas" (sin query, como siempre) y "Galería
   * IA" (con filtros) - ver ListPurchaseInvoicesQueryDto. confidenceLevel
   * implica aiScannedOnly (una factura cargada a mano no tiene
   * aiScanConfidence que filtrar). */
  list(query: ListPurchaseInvoicesQueryDto = {}) {
    const where: Prisma.PurchaseInvoiceWhereInput = {};
    if (query.aiScannedOnly || query.confidenceLevel || query.edited !== undefined) {
      where.aiScanConfidence = { not: null };
    }
    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }
    if (query.dateFrom || query.dateTo) {
      where.supplierInvoiceDate = {
        gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
        lte: query.dateTo ? new Date(query.dateTo) : undefined,
      };
    }
    if (query.confidenceLevel === 'alta') {
      where.aiScanConfidence = { gte: 0.85 };
    } else if (query.confidenceLevel === 'media') {
      where.aiScanConfidence = { gte: 0.6, lt: 0.85 };
    } else if (query.confidenceLevel === 'baja') {
      where.aiScanConfidence = { lt: 0.6 };
    }
    if (query.edited !== undefined) {
      where.aiScanEdited = query.edited;
    }

    return getTenantDb().purchaseInvoice.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const invoice = await getTenantDb().purchaseInvoice.findUnique({
      where: { id },
      include: INVOICE_DETAIL_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }
    return invoice;
  }

  async create(dto: CreatePurchaseInvoiceDto): Promise<CreatedPurchaseInvoice> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const createdByUserId = requireUserId();

    const goodsReceiptIds = dto.goodsReceiptIds ?? [];

    // Dos modos: con OC (camino de siempre, GRNI real) o factura de compra
    // directa (sin OC - ver "Carga de comprobantes IA",
    // docs/plan-carga-comprobantes-ia.md). Nunca ambos ni ninguno.
    let supplierId: string;
    let supplierName: string;
    let supplierTaxId: string | null;
    let currencyId: string;
    let grniClearedAmount = new Prisma.Decimal(0);

    if (dto.purchaseOrderId) {
      const purchaseOrder = await db.purchaseOrder.findUnique({
        where: { id: dto.purchaseOrderId },
        include: {
          supplier: true,
          receipts: {
            include: {
              lines: { include: { purchaseOrderLine: { select: { id: true, unitCost: true } } } },
            },
          },
        },
      });
      if (!purchaseOrder) {
        throw new NotFoundException('Purchase order not found');
      }
      if (!purchaseOrder.supplier.active) {
        throw new BadRequestException('This supplier is inactive');
      }

      const selectedReceipts = purchaseOrder.receipts.filter((r) => goodsReceiptIds.includes(r.id));
      if (selectedReceipts.length !== goodsReceiptIds.length) {
        throw new BadRequestException('One or more goods receipts do not belong to this purchase order');
      }

      // No FOR UPDATE lock here (unlike GoodsReceiptService/
      // SupplierReturnService's quantity-accumulation races) - the @@unique
      // on purchase_invoice_receipts(tenantId, goodsReceiptId) is the real
      // backstop against a genuine concurrent double-invoice; this check is
      // only so the common case gets a legible 400 instead of a raw P2002.
      if (goodsReceiptIds.length > 0) {
        const alreadyInvoiced = await db.purchaseInvoiceReceipt.findMany({
          where: { goodsReceiptId: { in: goodsReceiptIds } },
          select: { goodsReceiptId: true },
        });
        if (alreadyInvoiced.length > 0) {
          throw new BadRequestException(
            `Goods receipt(s) already invoiced: ${alreadyInvoiced.map((r) => r.goodsReceiptId).join(', ')}`,
          );
        }
      }

      // Recomputed from the receipts' own lines net of returns, never
      // cached - same criterion as PurchaseOrderService.attachReceivingInfo.
      const allLineIds = selectedReceipts.flatMap((r) => r.lines.map((l) => l.id));
      const returnedByLine = await getReturnedQuantitiesByGoodsReceiptLine(allLineIds);

      for (const receipt of selectedReceipts) {
        for (const line of receipt.lines) {
          const returned = returnedByLine.get(line.id) ?? new Prisma.Decimal(0);
          const netQuantity = line.quantity.sub(returned);
          grniClearedAmount = grniClearedAmount.add(netQuantity.mul(line.purchaseOrderLine.unitCost));
        }
      }

      supplierId = purchaseOrder.supplierId;
      supplierName = purchaseOrder.supplier.name;
      supplierTaxId = purchaseOrder.supplier.taxId;
      currencyId = purchaseOrder.currencyId;
    } else {
      if (goodsReceiptIds.length > 0) {
        throw new BadRequestException('goodsReceiptIds requires a purchaseOrderId - there is no GRNI to clear otherwise');
      }
      if (!dto.supplierId || !dto.currencyId) {
        throw new BadRequestException('supplierId and currencyId are required when purchaseOrderId is not set');
      }
      const supplier = await db.company.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
      if (!supplier.active) {
        throw new BadRequestException('This supplier is inactive');
      }
      supplierId = supplier.id;
      supplierName = supplier.name;
      supplierTaxId = supplier.taxId;
      currencyId = dto.currencyId;
      // grniClearedAmount ya queda en 0 - todo el subtotal es nonGrniAmount.
    }

    const subtotal = new Prisma.Decimal(dto.subtotal);
    const nonGrniAmount = subtotal.sub(grniClearedAmount);
    if (nonGrniAmount.lt(0)) {
      throw new BadRequestException(
        `El subtotal facturado ($${subtotal.toFixed(2)}) es menor al monto acumulado por los remitos seleccionados ($${grniClearedAmount.toFixed(2)})`,
      );
    }

    const taxLines = dto.taxLines ?? [];
    const taxTotal = taxLines.reduce(
      (sum, line) => sum.add(new Prisma.Decimal(line.amount)),
      new Prisma.Decimal(0),
    );
    const total = subtotal.add(taxTotal);

    const invoice = await db.purchaseInvoice.create({
      data: {
        tenantId,
        purchaseOrderId: dto.purchaseOrderId,
        supplierId,
        supplierName,
        supplierTaxId,
        supplierInvoiceNumber: dto.supplierInvoiceNumber,
        documentLetter: dto.documentLetter,
        pointOfSale: dto.pointOfSale,
        number: dto.number,
        supplierInvoiceDate: new Date(dto.supplierInvoiceDate),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        currencyId,
        subtotal,
        taxTotal,
        total,
        balanceDue: total,
        notes: dto.notes,
        aiScanConfidence: dto.aiScanConfidence === undefined ? undefined : new Prisma.Decimal(dto.aiScanConfidence),
        aiScanEdited: dto.aiScanEdited,
        createdByUserId,
        taxLines: {
          createMany: {
            data: taxLines.map((line) => ({
              type: line.type,
              concept: line.concept,
              amount: line.amount,
              netAmount: line.netAmount,
              taxRate: line.taxRate,
              taxType: line.taxType,
            })),
          },
        },
        receiptLinks: {
          createMany: { data: goodsReceiptIds.map((goodsReceiptId) => ({ goodsReceiptId })) },
        },
      },
      include: INVOICE_DETAIL_INCLUDE,
    });

    return { invoice, grniClearedAmount, nonGrniAmount };
  }

  /** Creates the SupplierPayment row (plus any withholding lines) and
   * updates balanceDue/status - does NOT post the accounting entry itself
   * (see apps/api's PurchaseInvoicesService.recordPayment, which calls this
   * then AccountingService.postSupplierPaymentJournalEntry in the same
   * transaction). Mirrors InvoicingService.recordReceipt's balance/status
   * update, extended for withholdings: `amount` is still "cash/bank paid",
   * but what actually clears the invoice is amount + totalWithheld (the
   * withheld money doesn't reach the supplier, but it does extinguish the
   * debt - it's now owed to the tax authority on their behalf instead). */
  async recordPayment(invoiceId: string, dto: RecordSupplierPaymentDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const recordedByUserId = requireUserId();

    // Lock first, so two concurrent payments against the same invoice
    // serialize instead of both reading the same stale balanceDue below and
    // overpaying it - same recipe as GoodsReceiptService.create/
    // SupplierReturnService.create/InvoicingService.createCreditNote.
    await db.$queryRaw`SELECT id FROM purchase_invoices WHERE id = ${invoiceId} FOR UPDATE`;

    const invoice = await db.purchaseInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }
    const amount = new Prisma.Decimal(dto.amount);
    const withholdings = dto.withholdings ?? [];
    const totalWithheld = withholdings.reduce(
      (sum, w) => sum.add(new Prisma.Decimal(w.amount)),
      new Prisma.Decimal(0),
    );
    const appliedAmount = amount.add(totalWithheld);
    if (appliedAmount.gt(invoice.balanceDue)) {
      throw new BadRequestException('Payment amount exceeds the invoice balance due');
    }

    const payment = await db.supplierPayment.create({
      data: {
        tenantId,
        purchaseInvoiceId: invoiceId,
        amount,
        method: dto.method,
        financialAccountId: dto.financialAccountId,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        recordedByUserId,
        withholdings: {
          createMany: {
            data: withholdings.map((w) => ({
              regimeId: w.regimeId,
              taxType: w.taxType,
              jurisdiction: w.jurisdiction,
              concept: w.concept,
              amount: w.amount,
              certificateNumber: w.certificateNumber,
            })),
          },
        },
      },
      include: { withholdings: true },
    });

    const balanceDue = invoice.balanceDue.sub(appliedAmount);
    await db.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { balanceDue, status: balanceDue.isZero() ? 'PAID' : 'PARTIALLY_PAID' },
    });

    return payment;
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
