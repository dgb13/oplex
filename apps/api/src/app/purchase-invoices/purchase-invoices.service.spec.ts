import type { AccountingService } from '@plexo/accounting';
import { BadRequestException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { PurchaseInvoiceService } from '@plexo/purchases';
import type { ReportsFinancialService } from '@plexo/reports-financial';
import type { CheckService } from '@plexo/treasury';
import { PurchaseInvoicesService } from './purchase-invoices.service.js';

// Same reasoning as goods-receipts.service.spec.ts: @plexo/purchases' barrel
// also re-exports PdfGeneratorService (ESM-only @react-pdf/renderer), which
// apps/api's jest config has no transform for - this test never touches the
// real PurchaseInvoiceService, only mocks it.
jest.mock('@plexo/purchases', () => ({ PurchaseInvoiceService: jest.fn() }));

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeCheckService(overrides: Partial<CheckService> = {}): CheckService {
  return { endorseCheck: jest.fn(), issueOwnCheck: jest.fn(), ...overrides } as unknown as CheckService;
}

function makeReportsFinancialService(overrides: Partial<ReportsFinancialService> = {}): ReportsFinancialService {
  return { recordFinancialTransaction: jest.fn(), ...overrides } as unknown as ReportsFinancialService;
}

describe('PurchaseInvoicesService.createInvoice', () => {
  it('posts the journal entry dated the supplier\'s own invoice date, not "now"', async () => {
    const invoice = {
      id: 'pinv-1',
      total: new Prisma.Decimal(1000),
      supplierInvoiceDate: new Date('2026-07-15'),
      taxLines: [
        { type: 'IVA_CREDITO', amount: new Prisma.Decimal(210) },
        { type: 'PERCEPCION', concept: 'IIBB', amount: new Prisma.Decimal(30) },
      ],
    };
    const purchaseInvoiceService = {
      create: jest.fn().mockResolvedValue({
        invoice,
        grniClearedAmount: new Prisma.Decimal(700),
        nonGrniAmount: new Prisma.Decimal(60),
      }),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postPurchaseInvoiceJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, makeReportsFinancialService(), makeCheckService());

    await service.createInvoice({
      purchaseOrderId: 'po-1',
      supplierInvoiceNumber: '0001-00001234',
      supplierInvoiceDate: '2026-07-15',
      subtotal: 760,
    } as never);

    const journalArg = (accountingService.postPurchaseInvoiceJournalEntry as jest.Mock).mock.calls[0][0];
    expect(journalArg.date).toEqual(new Date('2026-07-15'));
  });

  it('wires grniClearedAmount/nonGrniAmount through as-is and aggregates taxLines by type into ivaCredito/percepciones', async () => {
    // This is the one place these numbers get assembled before reaching
    // AccountingService - a filter/reduce bug here (wrong type, wrong sum)
    // would post a wrong-but-still-balanced entry, since
    // postPurchaseInvoiceJournalEntry's own balance check can't tell a
    // misrouted amount from a correct one.
    const invoice = {
      id: 'pinv-2',
      total: new Prisma.Decimal(22161.5),
      supplierInvoiceDate: new Date('2026-07-15'),
      taxLines: [
        { type: 'IVA_CREDITO', amount: new Prisma.Decimal(3811.5), concept: 'IVA 21%' },
        { type: 'PERCEPCION', amount: new Prisma.Decimal(200), concept: 'Percepción IIBB' },
        { type: 'PERCEPCION', amount: new Prisma.Decimal(150), concept: 'Percepción IVA' },
      ],
    };
    const purchaseInvoiceService = {
      create: jest.fn().mockResolvedValue({
        invoice,
        grniClearedAmount: new Prisma.Decimal(18150),
        nonGrniAmount: new Prisma.Decimal(0),
      }),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postPurchaseInvoiceJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, makeReportsFinancialService(), makeCheckService());

    await service.createInvoice({ purchaseOrderId: 'po-2' } as never);

    const journalArg = (accountingService.postPurchaseInvoiceJournalEntry as jest.Mock).mock.calls[0][0];
    expect(journalArg.purchaseInvoiceId).toBe('pinv-2');
    expect(journalArg.grniClearedAmount.toNumber()).toBe(18150);
    expect(journalArg.nonGrniAmount.toNumber()).toBe(0);
    expect(journalArg.total).toBe(invoice.total);
    // ivaCredito: only the IVA_CREDITO line, summed (there's just one here,
    // but the reduce must still land on that one line's exact amount).
    expect(journalArg.ivaCredito.toNumber()).toBe(3811.5);
    // percepciones: both PERCEPCION lines, neither dropped nor merged -
    // each keeps its own concept/amount for AccountingService to sum.
    expect(journalArg.percepciones).toEqual([
      { concept: 'Percepción IIBB', amount: invoice.taxLines[1].amount },
      { concept: 'Percepción IVA', amount: invoice.taxLines[2].amount },
    ]);
  });
});

describe('PurchaseInvoicesService.recordPayment', () => {
  it('posts the journal entry dated when the payment was actually made, not "now"', async () => {
    const payment = {
      id: 'pay-1',
      amount: new Prisma.Decimal(500),
      paidAt: new Date('2026-07-20'),
      withholdings: [],
    };
    const purchaseInvoiceService = {
      recordPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postSupplierPaymentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, makeReportsFinancialService(), makeCheckService());

    await service.recordPayment('pinv-1', { amount: 500, method: 'Transferencia' } as never);

    const journalArg = (accountingService.postSupplierPaymentJournalEntry as jest.Mock).mock.calls[0][0];
    expect(journalArg.date).toEqual(new Date('2026-07-20'));
  });

  it('passes amount and every withholding line (taxType + amount) through to AccountingService untouched', async () => {
    const payment = {
      id: 'pay-2',
      amount: new Prisma.Decimal(700),
      paidAt: new Date('2026-07-20'),
      withholdings: [
        { taxType: 'INCOME_TAX', amount: new Prisma.Decimal(100), regimeId: 'r1' },
        { taxType: 'GROSS_INCOME', amount: new Prisma.Decimal(50), regimeId: 'r2' },
        { taxType: 'GROSS_INCOME', amount: new Prisma.Decimal(25), regimeId: 'r3' },
      ],
    };
    const purchaseInvoiceService = {
      recordPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postSupplierPaymentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, makeReportsFinancialService(), makeCheckService());

    await service.recordPayment('pinv-2', { amount: 700, method: 'Transferencia' } as never);

    const journalArg = (accountingService.postSupplierPaymentJournalEntry as jest.Mock).mock.calls[0][0];
    expect(journalArg.supplierPaymentId).toBe('pay-2');
    expect(journalArg.amount).toBe(payment.amount);
    // Composition root only maps {taxType, amount} - it does NOT
    // pre-aggregate by taxType (AccountingService does that itself), so the
    // two GROSS_INCOME lines must arrive here still separate.
    expect(journalArg.withholdings).toEqual([
      { taxType: 'INCOME_TAX', amount: payment.withholdings[0].amount },
      { taxType: 'GROSS_INCOME', amount: payment.withholdings[1].amount },
      { taxType: 'GROSS_INCOME', amount: payment.withholdings[2].amount },
    ]);
  });

  it('debits the chosen financial account for a cash/transfer payment (closes the balance gap)', async () => {
    const payment = { id: 'pay-5', amount: new Prisma.Decimal(500), paidAt: new Date('2026-07-20'), withholdings: [] };
    const purchaseInvoiceService = {
      recordPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postSupplierPaymentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const reportsFinancialService = makeReportsFinancialService();
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, reportsFinancialService, makeCheckService());
    const db = {
      financialAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'fa-1', currencyId: null }) },
      purchaseInvoice: {
        findUnique: jest.fn().mockResolvedValue({ currencyId: 'ars', currency: { code: 'ARS' } }),
      },
    };

    await runInTenant(db, () =>
      service.recordPayment('pinv-5', { amount: 500, method: 'Transferencia', financialAccountId: 'fa-1' } as never),
    );

    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith({
      financialAccountId: 'fa-1',
      amount: -500,
      externalRef: 'Pago factura de compra pinv-5',
    });
  });

  it('does not touch any financial account when the payment endorses a check from cartera', async () => {
    const payment = { id: 'pay-6', amount: new Prisma.Decimal(500), paidAt: new Date('2026-07-20'), withholdings: [] };
    const purchaseInvoiceService = {
      recordPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postSupplierPaymentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const reportsFinancialService = makeReportsFinancialService();
    const checkService = makeCheckService();
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, reportsFinancialService, checkService);
    const db = { purchaseInvoice: { findUnique: jest.fn().mockResolvedValue({ supplierId: 'supplier-1' }) } };

    await runInTenant(db, () =>
      service.recordPayment('pinv-6', { amount: 500, method: 'Cheque', endorseCheckId: 'chk-1' } as never),
    );

    expect(reportsFinancialService.recordFinancialTransaction).not.toHaveBeenCalled();
  });

  it('rejects a payment against a financial account whose currency does not match the purchase invoice', async () => {
    const payment = { id: 'pay-7', amount: new Prisma.Decimal(500), paidAt: new Date('2026-07-20'), withholdings: [] };
    const purchaseInvoiceService = {
      recordPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postSupplierPaymentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const reportsFinancialService = makeReportsFinancialService();
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, reportsFinancialService, makeCheckService());
    const db = {
      financialAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'fa-1', currencyId: 'usd' }) },
      purchaseInvoice: {
        findUnique: jest.fn().mockResolvedValue({ currencyId: 'ars', currency: { code: 'ARS' } }),
      },
    };

    await expect(
      runInTenant(db, () =>
        service.recordPayment('pinv-7', { amount: 500, method: 'Transferencia', financialAccountId: 'fa-1' } as never),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(reportsFinancialService.recordFinancialTransaction).not.toHaveBeenCalled();
  });

  it('rejects a payment that both endorses a check and issues one, without calling recordPayment at all', async () => {
    const purchaseInvoiceService = { recordPayment: jest.fn() } as unknown as PurchaseInvoiceService;
    const accountingService = { postSupplierPaymentJournalEntry: jest.fn() } as unknown as AccountingService;
    const checkService = makeCheckService();
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, makeReportsFinancialService(), checkService);

    await expect(
      service.recordPayment('pinv-1', {
        amount: 500,
        method: 'Cheque',
        endorseCheckId: 'chk-1',
        ownCheck: { number: '001', bankName: 'Banco Nación', issueDate: '2026-08-20', dueDate: '2026-09-20' },
      } as never),
    ).rejects.toThrow(BadRequestException);
    expect(purchaseInvoiceService.recordPayment).not.toHaveBeenCalled();
  });

  it('endorses a check from cartera against the payment and the invoice\'s own supplier', async () => {
    const payment = { id: 'pay-3', amount: new Prisma.Decimal(500), paidAt: new Date('2026-07-20'), withholdings: [] };
    const purchaseInvoiceService = {
      recordPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postSupplierPaymentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const checkService = makeCheckService();
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, makeReportsFinancialService(), checkService);
    const db = { purchaseInvoice: { findUnique: jest.fn().mockResolvedValue({ supplierId: 'supplier-1' }) } };

    await runInTenant(db, () =>
      service.recordPayment('pinv-3', { amount: 500, method: 'Cheque', endorseCheckId: 'chk-1' } as never),
    );

    expect(checkService.endorseCheck).toHaveBeenCalledWith('chk-1', 'pay-3', 'supplier-1');
    expect(checkService.issueOwnCheck).not.toHaveBeenCalled();
  });

  it('issues a new own check against the payment when no cartera check is endorsed', async () => {
    const payment = { id: 'pay-4', amount: new Prisma.Decimal(800), paidAt: new Date('2026-07-20'), withholdings: [] };
    const purchaseInvoiceService = {
      recordPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postSupplierPaymentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const checkService = makeCheckService();
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, makeReportsFinancialService(), checkService);
    const db = { purchaseInvoice: { findUnique: jest.fn().mockResolvedValue({ supplierId: 'supplier-1' }) } };
    const ownCheck = { number: '002', bankName: 'Banco Nación', issueDate: '2026-08-20', dueDate: '2026-09-20' };

    await runInTenant(db, () =>
      service.recordPayment('pinv-4', { amount: 800, method: 'Cheque', ownCheck } as never),
    );

    expect(checkService.issueOwnCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierPaymentId: 'pay-4',
        supplierId: 'supplier-1',
        amount: 800,
        number: '002',
        bankName: 'Banco Nación',
        createdByUserId: 'user-1',
      }),
    );
  });

  it('throws when there is no authenticated user to attribute the check to', async () => {
    const payment = { id: 'pay-5', amount: new Prisma.Decimal(500), paidAt: new Date('2026-07-20'), withholdings: [] };
    const purchaseInvoiceService = {
      recordPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postSupplierPaymentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const checkService = makeCheckService();
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService, makeReportsFinancialService(), checkService);
    const db = { purchaseInvoice: { findUnique: jest.fn().mockResolvedValue({ supplierId: 'supplier-1' }) } };

    await expect(
      tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () =>
        service.recordPayment('pinv-5', { amount: 500, method: 'Cheque', endorseCheckId: 'chk-1' } as never),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
