import type { AccountingService } from '@plexo/accounting';
import { Prisma } from '@plexo/database';
import type { PurchaseCreditNoteService } from '@plexo/purchases';
import { PurchaseCreditNotesService } from './purchase-credit-notes.service.js';

// Same reasoning as goods-receipts.service.spec.ts/purchase-invoices.service.spec.ts:
// @plexo/purchases' barrel also re-exports PdfGeneratorService (ESM-only
// @react-pdf/renderer), which apps/api's jest config has no transform for -
// this test never touches the real PurchaseCreditNoteService, only mocks it.
jest.mock('@plexo/purchases', () => ({ PurchaseCreditNoteService: jest.fn() }));

describe('PurchaseCreditNotesService.createCreditNote', () => {
  it('posts the journal entry dated the supplier\'s own credit note date, not "now"', async () => {
    const creditNote = {
      id: 'pcn-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      supplierCreditNoteDate: new Date('2026-07-18'),
    };
    const purchaseCreditNoteService = {
      create: jest.fn().mockResolvedValue(creditNote),
    } as unknown as PurchaseCreditNoteService;
    const accountingService = {
      postPurchaseCreditNoteJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseCreditNotesService(purchaseCreditNoteService, accountingService);

    await service.createCreditNote({
      purchaseInvoiceId: 'pinv-1',
      supplierCreditNoteNumber: '0001-00000099',
      supplierCreditNoteDate: '2026-07-18',
      reason: 'Mercadería defectuosa',
      subtotal: 100,
    } as never);

    const journalArg = (accountingService.postPurchaseCreditNoteJournalEntry as jest.Mock).mock
      .calls[0][0];
    expect(journalArg.date).toEqual(new Date('2026-07-18'));
  });

  it('wires purchaseCreditNoteId/subtotal/taxTotal/total straight from the created credit note, untouched', async () => {
    // The composition root doesn't recompute anything here (unlike
    // PurchaseInvoicesService.createInvoice, which aggregates taxLines into
    // ivaCredito/percepciones) - it just forwards what
    // PurchaseCreditNoteService.create() already computed. Still worth
    // pinning down: a typo swapping subtotal/taxTotal here would post a
    // balanced-but-wrong entry, since postPurchaseCreditNoteJournalEntry's
    // own balance check can't detect the swap (total stays total either way).
    const creditNote = {
      id: 'pcn-2',
      subtotal: new Prisma.Decimal('33.33'),
      taxTotal: new Prisma.Decimal('6.9993'),
      total: new Prisma.Decimal('40.3293'),
      supplierCreditNoteDate: new Date('2026-07-19'),
    };
    const purchaseCreditNoteService = {
      create: jest.fn().mockResolvedValue(creditNote),
    } as unknown as PurchaseCreditNoteService;
    const accountingService = {
      postPurchaseCreditNoteJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseCreditNotesService(purchaseCreditNoteService, accountingService);

    const result = await service.createCreditNote({ purchaseInvoiceId: 'pinv-2' } as never);

    expect(result).toBe(creditNote);
    const journalArg = (accountingService.postPurchaseCreditNoteJournalEntry as jest.Mock).mock
      .calls[0][0];
    expect(journalArg.purchaseCreditNoteId).toBe('pcn-2');
    expect(journalArg.subtotal).toBe(creditNote.subtotal);
    expect(journalArg.taxTotal).toBe(creditNote.taxTotal);
    expect(journalArg.total).toBe(creditNote.total);
  });

  it('propagates the error and never calls AccountingService when PurchaseCreditNoteService.create rejects (e.g. cap exceeded)', async () => {
    const failure = new Error('Credit note total would exceed the invoice total');
    const purchaseCreditNoteService = {
      create: jest.fn().mockRejectedValue(failure),
    } as unknown as PurchaseCreditNoteService;
    const accountingService = {
      postPurchaseCreditNoteJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseCreditNotesService(purchaseCreditNoteService, accountingService);

    await expect(
      service.createCreditNote({ purchaseInvoiceId: 'pinv-3' } as never),
    ).rejects.toThrow(failure);
    expect(accountingService.postPurchaseCreditNoteJournalEntry).not.toHaveBeenCalled();
  });

  it('Monotributo/Exento (vatRecoverable=false): devuelve el IVA contra mercaderías - subtotal+taxTotal y taxTotal 0', async () => {
    const creditNote = {
      id: 'pcn-4',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      supplierCreditNoteDate: new Date('2026-07-20'),
      vatRecoverable: false,
    };
    const purchaseCreditNoteService = {
      create: jest.fn().mockResolvedValue(creditNote),
    } as unknown as PurchaseCreditNoteService;
    const accountingService = {
      postPurchaseCreditNoteJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseCreditNotesService(purchaseCreditNoteService, accountingService);

    await service.createCreditNote({ purchaseInvoiceId: 'pinv-4' } as never);

    const journalArg = (accountingService.postPurchaseCreditNoteJournalEntry as jest.Mock).mock
      .calls[0][0];
    expect(new Prisma.Decimal(journalArg.subtotal).toNumber()).toBe(121);
    expect(new Prisma.Decimal(journalArg.taxTotal).toNumber()).toBe(0);
    expect(journalArg.total).toBe(creditNote.total);
  });
});
