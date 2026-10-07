import { Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { PurchaseCreditNoteService, type CreatePurchaseCreditNoteDto } from '@plexo/purchases';

/**
 * Composes PurchaseCreditNoteService (libs/modules/purchases - creates the
 * Nota de Crédito de Compra itself, caps it against the invoice total, and
 * brings the invoice's balanceDue/status down) with AccountingService
 * (posts the mirror-image journal entry - debits Proveedores, credits IVA
 * Crédito Fiscal and Mercaderías) - same shape as PurchaseInvoicesService.
 * PurchaseCreditNoteService can't call AccountingService itself (this
 * repo's rule: a lib module never imports another module's Service), so
 * this is the composition root.
 *
 * Atomicity for free, same reason as the other composition roots:
 * everything runs through getTenantDb(), the same per-request transaction -
 * if the accounting call throws, the whole transaction rolls back,
 * including the PurchaseCreditNote/balanceDue update just made above.
 */
@Injectable()
export class PurchaseCreditNotesService {
  constructor(
    private readonly purchaseCreditNoteService: PurchaseCreditNoteService,
    private readonly accountingService: AccountingService,
  ) {}

  async createCreditNote(dto: CreatePurchaseCreditNoteDto) {
    const creditNote = await this.purchaseCreditNoteService.create(dto);

    // Monotributo/Exento: el IVA nunca fue crédito fiscal (ver
    // PurchaseInvoiceService.create), así que la nota de crédito lo devuelve
    // todo contra mercaderías en vez de contra IVA Crédito Fiscal.
    const vatRecoverable = creditNote.vatRecoverable !== false;
    await this.accountingService.postPurchaseCreditNoteJournalEntry({
      purchaseCreditNoteId: creditNote.id,
      subtotal: vatRecoverable ? creditNote.subtotal : creditNote.subtotal.add(creditNote.taxTotal),
      taxTotal: vatRecoverable ? creditNote.taxTotal : 0,
      total: creditNote.total,
      // The supplier's own credit note date, not "now" - same criterion as
      // PurchaseInvoicesService.createInvoice's supplierInvoiceDate.
      date: creditNote.supplierCreditNoteDate,
    });

    return creditNote;
  }
}
