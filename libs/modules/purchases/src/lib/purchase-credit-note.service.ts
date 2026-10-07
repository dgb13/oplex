import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getOwnTaxCondition, getTenantDb, getTenantId, getUserId, isVatRecoverable, Prisma } from '@plexo/database';
import type { CreatePurchaseCreditNoteDto } from './dto/create-purchase-credit-note.dto.js';

const CREDIT_NOTE_DETAIL_INCLUDE = {
  taxLines: true,
} satisfies Prisma.PurchaseCreditNoteInclude;

/**
 * Nota de Crédito de Compra - always tied to an existing PurchaseInvoice
 * (see CreatePurchaseCreditNoteDto for why there's no currencyId field: it's
 * always the credited invoice's own currency). Header-level, same shape as
 * PurchaseInvoiceService.create() but simpler - no GRNI split to compute,
 * since this document doesn't clear any receipt on its own (see
 * PurchaseCreditNote.supplierReturnId for the traceability-only link to a
 * physical devolución, which is unrelated to GRNI accrual/clearing). Never
 * calls AccountingService itself (this repo's rule: a lib module never
 * imports another module's Service) - apps/api's PurchaseCreditNotesService
 * is the composition root that posts the actual journal entry, same shape
 * as PurchaseInvoicesService.
 */
@Injectable()
export class PurchaseCreditNoteService {
  async create(dto: CreatePurchaseCreditNoteDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const createdByUserId = requireUserId();

    // Lock first, so two concurrent credit notes against the same invoice
    // serialize instead of both reading the same stale balanceDue/prior-
    // credit-notes snapshot below and jointly overcrediting it - same
    // recipe as PurchaseInvoiceService.recordPayment.
    await db.$queryRaw`SELECT id FROM purchase_invoices WHERE id = ${dto.purchaseInvoiceId} FOR UPDATE`;

    const invoice = await db.purchaseInvoice.findUnique({ where: { id: dto.purchaseInvoiceId } });
    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('Cannot credit a cancelled purchase invoice');
    }

    // RLS already scopes this findUnique to the current tenant - a
    // cross-tenant id simply resolves to null, same as goodsReceiptIds
    // validation in PurchaseInvoiceService.create.
    if (dto.supplierReturnId) {
      const supplierReturn = await db.supplierReturn.findUnique({ where: { id: dto.supplierReturnId } });
      if (!supplierReturn) {
        throw new BadRequestException('Supplier return not found');
      }
    }

    const taxLines = dto.taxLines ?? [];
    const subtotal = new Prisma.Decimal(dto.subtotal);
    const taxTotal = taxLines.reduce(
      (sum, line) => sum.add(new Prisma.Decimal(line.amount)),
      new Prisma.Decimal(0),
    );
    const total = subtotal.add(taxTotal);

    // Strict cap: this credit note's total plus every ISSUED credit note
    // already logged against this invoice can never exceed the invoice's
    // own total - measured against `total`, not `balanceDue`, deliberately
    // independent of whatever's already been paid (a credit note corrects
    // what was billed, not what's still owed - same distinction
    // InvoicingService.createCreditNote draws on the sales side, except
    // that one measures against balanceDue; this one is a stricter,
    // payment-independent cap by design).
    const priorIssued = await db.purchaseCreditNote.aggregate({
      where: { purchaseInvoiceId: invoice.id, status: 'ISSUED' },
      _sum: { total: true },
    });
    const priorTotal = priorIssued._sum.total ?? new Prisma.Decimal(0);
    if (priorTotal.add(total).gt(invoice.total)) {
      throw new BadRequestException(
        `Credit note total ($${total.toFixed(2)}) plus previously issued credit notes ($${priorTotal.toFixed(2)}) would exceed the invoice total ($${invoice.total.toFixed(2)})`,
      );
    }

    const creditNote = await db.purchaseCreditNote.create({
      data: {
        tenantId,
        purchaseInvoiceId: invoice.id,
        supplierId: invoice.supplierId,
        // Snapshot from the invoice being credited, not re-queried from
        // Company - same reasoning as PurchaseInvoice's own
        // supplierName/supplierTaxId snapshot.
        supplierName: invoice.supplierName,
        supplierTaxId: invoice.supplierTaxId,
        supplierCreditNoteNumber: dto.supplierCreditNoteNumber,
        documentLetter: dto.documentLetter,
        pointOfSale: dto.pointOfSale,
        number: dto.number,
        supplierCreditNoteDate: new Date(dto.supplierCreditNoteDate),
        reason: dto.reason,
        currencyId: invoice.currencyId,
        subtotal,
        taxTotal,
        total,
        supplierReturnId: dto.supplierReturnId,
        notes: dto.notes,
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
      },
      include: CREDIT_NOTE_DETAIL_INCLUDE,
    });

    // Never negative - the cap above only guarantees the sum of credit
    // notes doesn't exceed the invoice's total, not that it doesn't exceed
    // whatever's currently left in balanceDue (which can already be lower
    // than total if a payment was recorded first).
    const rawBalanceDue = invoice.balanceDue.sub(total);
    const balanceDue = rawBalanceDue.lt(0) ? new Prisma.Decimal(0) : rawBalanceDue;
    await db.purchaseInvoice.update({
      where: { id: invoice.id },
      data: { balanceDue, status: balanceDue.isZero() ? 'PAID' : undefined },
    });

    // false = Monotributo/Exento: el IVA de esta nota vuelve contra
    // mercaderías, no contra IVA Crédito Fiscal (ver
    // PurchaseCreditNotesService en apps/api y vat-cost.ts).
    const vatRecoverable = isVatRecoverable(await getOwnTaxCondition(db)) !== false;
    return { ...creditNote, vatRecoverable };
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
