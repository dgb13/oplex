import { BadRequestException } from '@nestjs/common';
import type { AccountingService } from '@plexo/accounting';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { InvoicingService } from '@plexo/invoicing';
import type { QuoteService } from '@plexo/quotes';
import type { ReportsFinancialService } from '@plexo/reports-financial';
import type { TenantSettingsService } from '@plexo/tenant-settings';
import type { CheckService } from '@plexo/treasury';
import { SalesService } from './sales.service.js';

// @plexo/invoicing (y su árbol de dependencias) importa @react-pdf/renderer
// para el PDF de Facturación - ESM-only (sin build CJS), Jest lo arrastra
// vía el import de producción de SalesService y falla al parsearlo. Mismo
// mock vacío que ya usa @plexo/receivables en receivables-scheduler.service.spec.ts -
// esta suite sólo necesita InvoicingService como tipo (siempre mockeado a
// mano), nunca la implementación real.
jest.mock('@plexo/invoicing', () => ({}));

// Mismo motivo que el mock de arriba - @plexo/quotes (agregado a
// SalesService para createInvoiceFromQuote) también arrastra
// @react-pdf/renderer vía su propio PdfGeneratorService.
jest.mock('@plexo/quotes', () => ({}));

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeCheckService(overrides: Partial<CheckService> = {}): CheckService {
  return { registerThirdPartyCheck: jest.fn(), ...overrides } as unknown as CheckService;
}

function makeQuoteService(overrides: Partial<QuoteService> = {}): QuoteService {
  return { get: jest.fn(), ...overrides } as unknown as QuoteService;
}

function makeReportsFinancialService(overrides: Partial<ReportsFinancialService> = {}): ReportsFinancialService {
  return { recordFinancialTransaction: jest.fn(), ...overrides } as unknown as ReportsFinancialService;
}

/** Default settings (SHARED mode) resolve to `from: undefined` via
 * resolveEmailFrom - matches the current global-sender behavior tests
 * expect unless a test overrides it. */
function makeTenantSettingsService(): TenantSettingsService {
  return {
    getSettings: jest.fn().mockResolvedValue({
      arReminderIntervalDays: null,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
      reminderCcEmail: null,
    }),
  } as unknown as TenantSettingsService;
}

function makeBranchDb(branch: unknown = defaultBranch()) {
  return { company: { findUnique: jest.fn().mockResolvedValue(branch) } };
}

function defaultBranch() {
  return {
    id: 'branch-1',
    active: true,
    pointOfSaleNumber: '0001',
    roles: [{ role: 'BRANCH' }],
  };
}

describe('SalesService.createSale', () => {
  it('resolves the branch, creates the invoice, records one SALE_OUT movement per line, then posts the journal entry with the resulting COGS', async () => {
    const invoice = {
      id: 'invoice-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      exchangeRate: new Prisma.Decimal(1),
      issueDate: new Date('2026-01-01'),
      lines: [
        { articleVariantId: 'variant-1', quantity: new Prisma.Decimal(3) },
        { articleVariantId: 'variant-2', quantity: new Prisma.Decimal(1) },
      ],
      taxLines: [],
    };
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(invoice),
    } as unknown as InvoicingService;
    const inventoryService = {
      recordMovement: jest
        .fn()
        .mockResolvedValueOnce({ unitCost: new Prisma.Decimal(10) })
        .mockResolvedValueOnce({ unitCost: new Prisma.Decimal(20) }),
    } as unknown as InventoryService;
    const accountingService = {
      postInvoiceJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());
    const dto = {
      customerId: 'customer-1',
      warehouseId: 'warehouse-1',
      documentLetter: 'B' as const,
      branchId: 'branch-1',
      currencyId: 'currency-1',
      lines: [
        { articleVariantId: 'variant-1', quantity: 3 },
        { articleVariantId: 'variant-2', quantity: 1 },
      ],
    };

    const result = await runInTenant(makeBranchDb(), () => service.createSale(dto));

    expect(invoicingService.createInvoice).toHaveBeenCalledWith(
      {
        customerId: dto.customerId,
        documentLetter: dto.documentLetter,
        pointOfSale: '0001',
        currencyId: dto.currencyId,
        globalDiscountPercent: undefined,
        dueDate: undefined,
        lines: dto.lines,
      },
      undefined,
    );
    expect(inventoryService.recordMovement).toHaveBeenNthCalledWith(1, {
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-1',
      type: 'SALE_OUT',
      quantity: 3,
      invoiceId: 'invoice-1',
      sourceType: 'INVOICE',
      sourceId: 'invoice-1',
    });
    expect(inventoryService.recordMovement).toHaveBeenNthCalledWith(2, {
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-2',
      type: 'SALE_OUT',
      quantity: 1,
      invoiceId: 'invoice-1',
      sourceType: 'INVOICE',
      sourceId: 'invoice-1',
    });
    // COGS = 3*10 + 1*20 = 50, posted only after both movements are known.
    const postedEntry = (accountingService.postInvoiceJournalEntry as jest.Mock).mock.calls[0][0];
    expect(postedEntry).toMatchObject({
      invoiceId: 'invoice-1',
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
      date: invoice.issueDate,
    });
    expect((postedEntry.cogsAmount as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(50);
    expect(result).toBe(invoice);
  });

  it('passes the resolved custom sender through to createInvoice when the tenant has a verified domain', async () => {
    const invoice = {
      id: 'invoice-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      exchangeRate: new Prisma.Decimal(1),
      issueDate: new Date('2026-01-01'),
      lines: [],
      taxLines: [],
    };
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(invoice),
    } as unknown as InvoicingService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      postInvoiceJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    } as unknown as AccountingService;
    const tenantSettingsService = {
      getSettings: jest.fn().mockResolvedValue({
        arReminderIntervalDays: null,
        emailSenderMode: 'CUSTOM_DOMAIN',
        emailFromName: 'Facturación Acme',
        emailFromLocalPart: 'facturas',
        emailCustomDomain: 'acme.com',
        domainStatus: 'verified',
        reminderTone: 'NEUTRAL',
      }),
    } as unknown as TenantSettingsService;

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), tenantSettingsService, makeCheckService());

    await runInTenant(makeBranchDb(), () =>
      service.createSale({
        customerId: 'customer-1',
        warehouseId: 'warehouse-1',
        documentLetter: 'B',
        branchId: 'branch-1',
        currencyId: 'currency-1',
        lines: [],
      }),
    );

    expect(invoicingService.createInvoice).toHaveBeenCalledWith(
      expect.anything(),
      'Facturación Acme <facturas@acme.com>',
    );
  });

  it('rejects when the referenced company is not flagged as a BRANCH', async () => {
    const invoicingService = { createInvoice: jest.fn() } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {} as unknown as AccountingService;
    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());
    const db = makeBranchDb({
      id: 'branch-1',
      active: true,
      pointOfSaleNumber: '0001',
      roles: [{ role: 'CUSTOMER' }],
    });

    await expect(
      runInTenant(db, () =>
        service.createSale({
          customerId: 'customer-1',
          warehouseId: 'warehouse-1',
          documentLetter: 'B',
          branchId: 'branch-1',
          currencyId: 'currency-1',
          lines: [{ articleVariantId: 'variant-1', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('not flagged as a branch');
    expect(invoicingService.createInvoice).not.toHaveBeenCalled();
  });

  it('rejects when the branch is inactive', async () => {
    const invoicingService = { createInvoice: jest.fn() } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {} as unknown as AccountingService;
    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());
    const db = makeBranchDb({
      id: 'branch-1',
      active: false,
      pointOfSaleNumber: '0001',
      roles: [{ role: 'BRANCH' }],
    });

    await expect(
      runInTenant(db, () =>
        service.createSale({
          customerId: 'customer-1',
          warehouseId: 'warehouse-1',
          documentLetter: 'B',
          branchId: 'branch-1',
          currencyId: 'currency-1',
          lines: [{ articleVariantId: 'variant-1', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('inactive');
    expect(invoicingService.createInvoice).not.toHaveBeenCalled();
  });

  it('propagates an insufficient-stock error without swallowing it (the enclosing tx rolls back the invoice too)', async () => {
    const invoice = {
      id: 'invoice-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      exchangeRate: new Prisma.Decimal(1),
      issueDate: new Date('2026-01-01'),
      lines: [{ articleVariantId: 'variant-1', quantity: new Prisma.Decimal(999) }],
      taxLines: [],
    };
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(invoice),
    } as unknown as InvoicingService;
    const failure = new Error('Insufficient stock in this warehouse');
    const inventoryService = {
      recordMovement: jest.fn().mockRejectedValue(failure),
    } as unknown as InventoryService;
    const accountingService = {
      postInvoiceJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());

    await expect(
      runInTenant(makeBranchDb(), () =>
        service.createSale({
          customerId: 'customer-1',
          warehouseId: 'warehouse-1',
          documentLetter: 'B',
          branchId: 'branch-1',
          currencyId: 'currency-1',
          lines: [{ articleVariantId: 'variant-1', quantity: 999 }],
        }),
      ),
    ).rejects.toThrow(failure);
  });

  it('propagates an unbalanced-entry error from accounting after recording stock movements (the enclosing tx rolls back everything)', async () => {
    const invoice = {
      id: 'invoice-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      exchangeRate: new Prisma.Decimal(1),
      issueDate: new Date('2026-01-01'),
      lines: [{ articleVariantId: 'variant-1', quantity: new Prisma.Decimal(1) }],
      taxLines: [],
    };
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(invoice),
    } as unknown as InvoicingService;
    const inventoryService = {
      recordMovement: jest.fn().mockResolvedValue({}),
    } as unknown as InventoryService;
    const failure = new Error('Journal entry is not balanced');
    const accountingService = {
      postInvoiceJournalEntry: jest.fn().mockRejectedValue(failure),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());

    await expect(
      runInTenant(makeBranchDb(), () =>
        service.createSale({
          customerId: 'customer-1',
          warehouseId: 'warehouse-1',
          documentLetter: 'B',
          branchId: 'branch-1',
          currencyId: 'currency-1',
          lines: [{ articleVariantId: 'variant-1', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow(failure);
    // Inventory now runs before accounting (COGS needs the movement's
    // stamped cost first) - the movement call did happen, it's the shared
    // per-request transaction that rolls it back, not this method.
    expect(inventoryService.recordMovement).toHaveBeenCalledTimes(1);
  });

  it('converts a non-base-currency invoice to its ARS-equivalent before posting the journal entry, without touching cogsAmount', async () => {
    const invoice = {
      id: 'invoice-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      exchangeRate: new Prisma.Decimal(1050),
      issueDate: new Date('2026-01-01'),
      lines: [{ articleVariantId: 'variant-1', quantity: new Prisma.Decimal(1) }],
      taxLines: [],
    };
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(invoice),
    } as unknown as InvoicingService;
    const inventoryService = {
      recordMovement: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(30) }),
    } as unknown as InventoryService;
    const accountingService = {
      postInvoiceJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());

    await runInTenant(makeBranchDb(), () =>
      service.createSale({
        customerId: 'customer-1',
        warehouseId: 'warehouse-1',
        documentLetter: 'B',
        branchId: 'branch-1',
        currencyId: 'currency-usd',
        lines: [{ articleVariantId: 'variant-1', quantity: 1 }],
      }),
    );

    const postedEntry = (accountingService.postInvoiceJournalEntry as jest.Mock).mock.calls[0][0];
    // 100/21/121 USD * 1050 = 105000/22050/127050 ARS-equivalent - not the
    // raw USD figures, which would corrupt the trial balance (a ledger only
    // makes sense in a single unit of account).
    expect((postedEntry.subtotal as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(105000);
    expect((postedEntry.taxTotal as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(22050);
    expect((postedEntry.total as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(127050);
    // cogsAmount comes from inventory cost, already in ARS regardless of the
    // sale's currency - must NOT be multiplied by exchangeRate too.
    expect((postedEntry.cogsAmount as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(30);
  });
});

describe('SalesService.voidSale', () => {
  function makeCreditNote(overrides: Record<string, unknown> = {}) {
    return {
      id: 'credit-note-1',
      invoiceId: 'invoice-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      exchangeRate: new Prisma.Decimal(1),
      issueDate: new Date('2026-02-01'),
      lines: [
        { id: 'cn-line-1', invoiceLineId: 'line-1', quantity: new Prisma.Decimal(3) },
        { id: 'cn-line-2', invoiceLineId: 'line-2', quantity: new Prisma.Decimal(1) },
      ],
      ...overrides,
    };
  }

  it('creates the credit note, posts its journal entry, then restocks each credited line at its original movement', async () => {
    const creditNote = makeCreditNote();
    const invoicingService = {
      createCreditNote: jest.fn().mockResolvedValue(creditNote),
    } as unknown as InvoicingService;
    const inventoryService = {
      recordMovement: jest.fn().mockResolvedValue({}),
    } as unknown as InventoryService;
    const accountingService = {
      postCreditNoteJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-2', lines: [] }),
    } as unknown as AccountingService;
    const originalMovementsByLine: Record<string, unknown> = {
      'line-1': { warehouseId: 'warehouse-1', articleVariantId: 'variant-1', unitCost: null },
      'line-2': { warehouseId: 'warehouse-1', articleVariantId: 'variant-2', unitCost: null },
    };
    const db = {
      stockMovement: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: { where: { invoiceLineId: string } }) =>
            Promise.resolve(originalMovementsByLine[where.invoiceLineId] ?? null),
          ),
      },
    };

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());
    const dto = {
      invoiceId: 'invoice-1',
      reason: 'Devolución de mercadería',
      lines: [
        { invoiceLineId: 'line-1', quantity: 3 },
        { invoiceLineId: 'line-2', quantity: 1 },
      ],
    };

    const result = await runInTenant(db, () => service.voidSale(dto));

    expect(invoicingService.createCreditNote).toHaveBeenCalledWith(dto);
    const postedEntry = (accountingService.postCreditNoteJournalEntry as jest.Mock).mock.calls[0][0];
    expect(postedEntry).toMatchObject({
      creditNoteId: 'credit-note-1',
      invoiceId: 'invoice-1',
      subtotal: creditNote.subtotal,
      taxTotal: creditNote.taxTotal,
      total: creditNote.total,
      date: creditNote.issueDate,
    });
    expect((postedEntry.cogsAmount as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(0);
    expect(inventoryService.recordMovement).toHaveBeenNthCalledWith(1, {
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-1',
      type: 'RETURN',
      quantity: 3,
      unitCost: undefined,
      invoiceId: 'invoice-1',
      invoiceLineId: 'line-1',
      sourceType: 'CREDIT_NOTE',
      sourceId: 'credit-note-1',
    });
    expect(inventoryService.recordMovement).toHaveBeenNthCalledWith(2, {
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-2',
      type: 'RETURN',
      quantity: 1,
      unitCost: undefined,
      invoiceId: 'invoice-1',
      invoiceLineId: 'line-2',
      sourceType: 'CREDIT_NOTE',
      sourceId: 'credit-note-1',
    });
    expect(result).toBe(creditNote);
  });

  it('re-weights the return at the original sale unit cost and sums it into cogsAmount', async () => {
    const creditNote = makeCreditNote({
      lines: [{ id: 'cn-line-1', invoiceLineId: 'line-1', quantity: new Prisma.Decimal(3) }],
    });
    const invoicingService = {
      createCreditNote: jest.fn().mockResolvedValue(creditNote),
    } as unknown as InvoicingService;
    const inventoryService = {
      recordMovement: jest.fn().mockResolvedValue({}),
    } as unknown as InventoryService;
    const accountingService = {
      postCreditNoteJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-2', lines: [] }),
    } as unknown as AccountingService;
    const db = {
      stockMovement: {
        findFirst: jest.fn().mockResolvedValue({
          warehouseId: 'warehouse-1',
          articleVariantId: 'variant-1',
          unitCost: new Prisma.Decimal(42),
        }),
      },
    };

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());

    await runInTenant(db, () =>
      service.voidSale({
        invoiceId: 'invoice-1',
        reason: 'Devolución de mercadería',
        lines: [{ invoiceLineId: 'line-1', quantity: 3 }],
      }),
    );

    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RETURN', unitCost: 42 }),
    );
    const postedEntry = (accountingService.postCreditNoteJournalEntry as jest.Mock).mock.calls[0][0];
    expect((postedEntry.cogsAmount as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(126);
  });

  it('skips restock/COGS for a credited line with no matching original SALE_OUT movement', async () => {
    const creditNote = makeCreditNote({
      lines: [{ id: 'cn-line-1', invoiceLineId: 'line-1', quantity: new Prisma.Decimal(1) }],
    });
    const invoicingService = {
      createCreditNote: jest.fn().mockResolvedValue(creditNote),
    } as unknown as InvoicingService;
    const inventoryService = {
      recordMovement: jest.fn().mockResolvedValue({}),
    } as unknown as InventoryService;
    const accountingService = {
      postCreditNoteJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-2', lines: [] }),
    } as unknown as AccountingService;
    const db = { stockMovement: { findFirst: jest.fn().mockResolvedValue(null) } };

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());

    await runInTenant(db, () =>
      service.voidSale({
        invoiceId: 'invoice-1',
        reason: 'Devolución de mercadería',
        lines: [{ invoiceLineId: 'line-1', quantity: 1 }],
      }),
    );

    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
    const postedEntry = (accountingService.postCreditNoteJournalEntry as jest.Mock).mock.calls[0][0];
    expect((postedEntry.cogsAmount as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(0);
  });

  it('propagates a journal-posting failure without swallowing it', async () => {
    const creditNote = makeCreditNote();
    const invoicingService = {
      createCreditNote: jest.fn().mockResolvedValue(creditNote),
    } as unknown as InvoicingService;
    const inventoryService = { recordMovement: jest.fn() } as unknown as InventoryService;
    const failure = new Error('Credit note journal entry is not balanced');
    const accountingService = {
      postCreditNoteJournalEntry: jest.fn().mockRejectedValue(failure),
    } as unknown as AccountingService;
    const db = { stockMovement: { findFirst: jest.fn().mockResolvedValue(null) } };

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());

    await expect(
      runInTenant(db, () =>
        service.voidSale({
          invoiceId: 'invoice-1',
          reason: 'Devolución de mercadería',
          lines: [{ invoiceLineId: 'line-1', quantity: 3 }],
        }),
      ),
    ).rejects.toThrow(failure);
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });

  it('converts a non-base-currency credit note to its ARS-equivalent before posting the journal entry', async () => {
    const creditNote = makeCreditNote({ exchangeRate: new Prisma.Decimal(1050), lines: [] });
    const invoicingService = {
      createCreditNote: jest.fn().mockResolvedValue(creditNote),
    } as unknown as InvoicingService;
    const inventoryService = { recordMovement: jest.fn() } as unknown as InventoryService;
    const accountingService = {
      postCreditNoteJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-2', lines: [] }),
    } as unknown as AccountingService;
    const db = { stockMovement: { findFirst: jest.fn().mockResolvedValue(null) } };

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());

    await runInTenant(db, () =>
      service.voidSale({
        invoiceId: 'invoice-1',
        reason: 'Devolución de mercadería',
        lines: [],
      }),
    );

    const postedEntry = (accountingService.postCreditNoteJournalEntry as jest.Mock).mock.calls[0][0];
    expect((postedEntry.subtotal as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(105000);
    expect((postedEntry.taxTotal as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(22050);
    expect((postedEntry.total as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(127050);
  });
});

describe('SalesService.recordReceipt', () => {
  function makeReceipt(overrides: Record<string, unknown> = {}) {
    return {
      id: 'receipt-1',
      invoiceId: 'invoice-1',
      amount: new Prisma.Decimal(300),
      method: 'CASH',
      paidAt: new Date('2026-02-05'),
      ...overrides,
    };
  }

  it('records the receipt then posts its journal entry', async () => {
    const receipt = makeReceipt();
    const invoicingService = {
      recordReceipt: jest.fn().mockResolvedValue(receipt),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {
      postReceiptJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-3', lines: [] }),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());
    const dto = { invoiceId: 'invoice-1', amount: 300, method: 'CASH' };

    const result = await service.recordReceipt(dto);

    expect(invoicingService.recordReceipt).toHaveBeenCalledWith(dto);
    expect(accountingService.postReceiptJournalEntry).toHaveBeenCalledWith({
      receiptId: 'receipt-1',
      amount: receipt.amount,
      date: receipt.paidAt,
    });
    expect(result).toBe(receipt);
  });

  it('propagates a journal-posting failure without swallowing it', async () => {
    const receipt = makeReceipt();
    const invoicingService = {
      recordReceipt: jest.fn().mockResolvedValue(receipt),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const failure = new Error('Receipt journal entry is not balanced');
    const accountingService = {
      postReceiptJournalEntry: jest.fn().mockRejectedValue(failure),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService, makeReportsFinancialService(), makeQuoteService(), makeTenantSettingsService(), makeCheckService());

    await expect(
      service.recordReceipt({ invoiceId: 'invoice-1', amount: 300, method: 'CASH' }),
    ).rejects.toThrow(failure);
  });

  it('registers the third-party check in cartera against the receipt and the invoice\'s own customer', async () => {
    const receipt = makeReceipt();
    const invoicingService = {
      recordReceipt: jest.fn().mockResolvedValue(receipt),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {
      postReceiptJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-3', lines: [] }),
    } as unknown as AccountingService;
    const checkService = makeCheckService();
    const service = new SalesService(
      invoicingService,
      inventoryService,
      accountingService,
      makeReportsFinancialService(),
      makeQuoteService(),
      makeTenantSettingsService(),
      checkService,
    );
    const db = { invoice: { findUnique: jest.fn().mockResolvedValue({ customerId: 'customer-1' }) } };
    const checkDetail = {
      number: '00012345',
      bankName: 'Banco Galicia',
      issueDate: '2026-08-20',
      dueDate: '2026-09-20',
    };

    await runInTenant(db, () =>
      service.recordReceipt({ invoiceId: 'invoice-1', amount: 300, method: 'CHECK', check: checkDetail }),
    );

    expect(checkService.registerThirdPartyCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: receipt.id,
        customerId: 'customer-1',
        amount: 300,
        number: '00012345',
        bankName: 'Banco Galicia',
        createdByUserId: 'user-1',
      }),
    );
  });

  it('does not touch CheckService when the receipt was not paid with a check', async () => {
    const receipt = makeReceipt();
    const invoicingService = {
      recordReceipt: jest.fn().mockResolvedValue(receipt),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {
      postReceiptJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-3', lines: [] }),
    } as unknown as AccountingService;
    const checkService = makeCheckService();
    const service = new SalesService(
      invoicingService,
      inventoryService,
      accountingService,
      makeReportsFinancialService(),
      makeQuoteService(),
      makeTenantSettingsService(),
      checkService,
    );

    await service.recordReceipt({ invoiceId: 'invoice-1', amount: 300, method: 'CASH' });

    expect(checkService.registerThirdPartyCheck).not.toHaveBeenCalled();
  });

  it('credits the chosen financial account for a cash/transfer receipt (closes the balance gap)', async () => {
    const receipt = makeReceipt();
    const invoicingService = {
      recordReceipt: jest.fn().mockResolvedValue(receipt),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {
      postReceiptJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-3', lines: [] }),
    } as unknown as AccountingService;
    const reportsFinancialService = makeReportsFinancialService();
    const service = new SalesService(
      invoicingService,
      inventoryService,
      accountingService,
      reportsFinancialService,
      makeQuoteService(),
      makeTenantSettingsService(),
      makeCheckService(),
    );
    const db = {
      financialAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'fa-1', currencyId: null }) },
      invoice: { findUnique: jest.fn().mockResolvedValue({ currencyId: 'ars', currency: { code: 'ARS' } }) },
    };

    await runInTenant(db, () =>
      service.recordReceipt({ invoiceId: 'invoice-1', amount: 300, method: 'CASH', financialAccountId: 'fa-1' }),
    );

    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith({
      financialAccountId: 'fa-1',
      amount: 300,
      externalRef: 'Cobro factura invoice-1',
    });
  });

  it('does not credit any financial account for a third-party check (not cash until deposited)', async () => {
    const receipt = makeReceipt();
    const invoicingService = {
      recordReceipt: jest.fn().mockResolvedValue(receipt),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {
      postReceiptJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-3', lines: [] }),
    } as unknown as AccountingService;
    const reportsFinancialService = makeReportsFinancialService();
    const service = new SalesService(
      invoicingService,
      inventoryService,
      accountingService,
      reportsFinancialService,
      makeQuoteService(),
      makeTenantSettingsService(),
      makeCheckService(),
    );
    const db = { invoice: { findUnique: jest.fn().mockResolvedValue({ customerId: 'customer-1' }) } };

    await runInTenant(db, () =>
      service.recordReceipt({
        invoiceId: 'invoice-1',
        amount: 300,
        method: 'CHECK',
        financialAccountId: 'fa-1',
        check: {
          number: '00012345',
          bankName: 'Banco Galicia',
          issueDate: '2026-08-20',
          dueDate: '2026-09-20',
        },
      }),
    );

    expect(reportsFinancialService.recordFinancialTransaction).not.toHaveBeenCalled();
  });

  it('rejects a receipt against a financial account whose currency does not match the invoice', async () => {
    const receipt = makeReceipt();
    const invoicingService = {
      recordReceipt: jest.fn().mockResolvedValue(receipt),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {
      postReceiptJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-3', lines: [] }),
    } as unknown as AccountingService;
    const reportsFinancialService = makeReportsFinancialService();
    const service = new SalesService(
      invoicingService,
      inventoryService,
      accountingService,
      reportsFinancialService,
      makeQuoteService(),
      makeTenantSettingsService(),
      makeCheckService(),
    );
    const db = {
      financialAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'fa-1', currencyId: 'usd' }) },
      invoice: { findUnique: jest.fn().mockResolvedValue({ currencyId: 'ars', currency: { code: 'ARS' } }) },
    };

    await expect(
      runInTenant(db, () =>
        service.recordReceipt({ invoiceId: 'invoice-1', amount: 300, method: 'CASH', financialAccountId: 'fa-1' }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(reportsFinancialService.recordFinancialTransaction).not.toHaveBeenCalled();
  });

  it('throws when there is no authenticated user to attribute the check to', async () => {
    const receipt = makeReceipt();
    const invoicingService = {
      recordReceipt: jest.fn().mockResolvedValue(receipt),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {
      postReceiptJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-3', lines: [] }),
    } as unknown as AccountingService;
    const service = new SalesService(
      invoicingService,
      inventoryService,
      accountingService,
      makeReportsFinancialService(),
      makeQuoteService(),
      makeTenantSettingsService(),
      makeCheckService(),
    );
    const db = { invoice: { findUnique: jest.fn().mockResolvedValue({ customerId: 'customer-1' }) } };
    const checkDetail = {
      number: '00012345',
      bankName: 'Banco Galicia',
      issueDate: '2026-08-20',
      dueDate: '2026-09-20',
    };

    await expect(
      tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () =>
        service.recordReceipt({ invoiceId: 'invoice-1', amount: 300, method: 'CHECK', check: checkDetail }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('SalesService.createInvoiceFromQuote', () => {
  function makeQuote(overrides: Record<string, unknown> = {}) {
    return {
      id: 'quote-1',
      customerId: 'customer-1',
      status: 'ACCEPTED',
      currencyId: 'usd',
      currency: { id: 'usd', code: 'USD', isBase: false },
      lines: [{ articleVariantId: 'variant-1', quantity: new Prisma.Decimal(2), unitPrice: new Prisma.Decimal(100) }],
      ...overrides,
    };
  }

  function makeInvoice() {
    return {
      id: 'invoice-1',
      subtotal: new Prisma.Decimal(220000),
      taxTotal: new Prisma.Decimal(0),
      total: new Prisma.Decimal(220000),
      exchangeRate: new Prisma.Decimal(1100),
      issueDate: new Date('2026-01-01'),
      lines: [],
      taxLines: [],
    };
  }

  function makeServices(quote: unknown) {
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(makeInvoice()),
    } as unknown as InvoicingService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      postInvoiceJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    } as unknown as AccountingService;
    const quoteService = makeQuoteService({ get: jest.fn().mockResolvedValue(quote) });
    const service = new SalesService(
      invoicingService,
      inventoryService,
      accountingService,
      makeReportsFinancialService(),
      quoteService,
      makeTenantSettingsService(),
      makeCheckService(),
    );
    return { service, invoicingService, quoteService };
  }

  const convertDto = { warehouseId: 'warehouse-1', documentLetter: 'B' as const, branchId: 'branch-1' };

  it('converts each line multiplying by the latest exchange rate when the quote currency is not the base', async () => {
    const quote = makeQuote();
    const { service, invoicingService } = makeServices(quote);
    const db = {
      ...makeBranchDb(),
      invoice: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      currency: { findFirst: jest.fn().mockResolvedValue({ id: 'ars', code: 'ARS', isBase: true }) },
      exchangeRateHistory: { findFirst: jest.fn().mockResolvedValue({ rate: new Prisma.Decimal(1100) }) },
    };

    const invoice = await runInTenant(db, () => service.createInvoiceFromQuote('quote-1', convertDto));

    const createInvoiceArgs = (invoicingService.createInvoice as jest.Mock).mock.calls[0][0];
    expect(createInvoiceArgs.currencyId).toBe('ars');
    expect(createInvoiceArgs.exchangeRate).toBe(1100);
    expect(createInvoiceArgs.lines).toEqual([{ articleVariantId: 'variant-1', quantity: 2, unitPrice: 110000 }]);
    expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: invoice.id }, data: { quoteId: 'quote-1' } });
  });

  it('passes line amounts through unchanged (factor 1) when the quote is already in the base currency', async () => {
    const quote = makeQuote({ currencyId: 'ars', currency: { id: 'ars', code: 'ARS', isBase: true } });
    const { service, invoicingService } = makeServices(quote);
    const exchangeRateHistoryFindFirst = jest.fn();
    const db = {
      ...makeBranchDb(),
      invoice: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({}) },
      currency: { findFirst: jest.fn().mockResolvedValue({ id: 'ars', code: 'ARS', isBase: true }) },
      exchangeRateHistory: { findFirst: exchangeRateHistoryFindFirst },
    };

    await runInTenant(db, () => service.createInvoiceFromQuote('quote-1', convertDto));

    expect(exchangeRateHistoryFindFirst).not.toHaveBeenCalled();
    const createInvoiceArgs = (invoicingService.createInvoice as jest.Mock).mock.calls[0][0];
    expect(createInvoiceArgs.exchangeRate).toBe(1);
    expect(createInvoiceArgs.lines).toEqual([{ articleVariantId: 'variant-1', quantity: 2, unitPrice: 100 }]);
  });

  it('rejects when the quote currency has no exchange rate loaded yet', async () => {
    const quote = makeQuote();
    const { service } = makeServices(quote);
    const db = {
      ...makeBranchDb(),
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      currency: { findFirst: jest.fn().mockResolvedValue({ id: 'ars', code: 'ARS', isBase: true }) },
      exchangeRateHistory: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(
      runInTenant(db, () => service.createInvoiceFromQuote('quote-1', convertDto)),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a quote that is not ACCEPTED', async () => {
    const quote = makeQuote({ status: 'SENT' });
    const { service } = makeServices(quote);

    await expect(
      runInTenant(makeBranchDb(), () => service.createInvoiceFromQuote('quote-1', convertDto)),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a quote that was already converted to an invoice', async () => {
    const quote = makeQuote();
    const { service } = makeServices(quote);
    const db = {
      ...makeBranchDb(),
      invoice: { findFirst: jest.fn().mockResolvedValue({ id: 'invoice-existing', number: 'B-0001' }) },
    };

    await expect(
      runInTenant(db, () => service.createInvoiceFromQuote('quote-1', convertDto)),
    ).rejects.toThrow(BadRequestException);
  });
});
