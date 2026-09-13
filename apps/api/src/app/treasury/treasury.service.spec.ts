import { NotFoundException } from '@nestjs/common';
import type { AccountingService } from '@plexo/accounting';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { InvoicingService } from '@plexo/invoicing';
import type { ReportsFinancialService } from '@plexo/reports-financial';
import type { CheckService } from '@plexo/treasury';
import { TreasuryService } from './treasury.service.js';

// Mismo mock vacío que sales.service.spec.ts - @plexo/invoicing arrastra
// @react-pdf/renderer (ESM-only) vía el import de producción de
// TreasuryService, y esta suite sólo necesita InvoicingService como tipo.
jest.mock('@plexo/invoicing', () => ({}));

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeServices(overrides: {
  checkService?: Partial<CheckService>;
  reportsFinancialService?: Partial<ReportsFinancialService>;
  invoicingService?: Partial<InvoicingService>;
  accountingService?: Partial<AccountingService>;
} = {}) {
  const checkService = { ...overrides.checkService } as unknown as CheckService;
  const reportsFinancialService = {
    recordFinancialTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
    ...overrides.reportsFinancialService,
  } as unknown as ReportsFinancialService;
  const invoicingService = {
    reopenInvoiceBalance: jest.fn().mockResolvedValue({}),
    ...overrides.invoicingService,
  } as unknown as InvoicingService;
  const accountingService = {
    postCheckRejectionJournalEntry: jest.fn().mockResolvedValue({}),
    postExchangeRateRevaluation: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    ...overrides.accountingService,
  } as unknown as AccountingService;
  const service = new TreasuryService(checkService, reportsFinancialService, invoicingService, accountingService);
  return { service, checkService, reportsFinancialService, invoicingService, accountingService };
}

const baseCheck = {
  id: 'chk-1',
  number: '00012345',
  bankName: 'Banco Galicia',
  amount: new Prisma.Decimal(1000),
  receiptId: 'receipt-1',
  rejectionFeeAmount: null as number | null,
  rejectedAt: null as Date | null,
};

describe('TreasuryService.depositCheck', () => {
  it('deposits the check and credits the financial account for its exact amount', async () => {
    const { service, checkService, reportsFinancialService } = makeServices({
      checkService: {
        depositCheck: jest.fn().mockResolvedValue({ ...baseCheck, status: 'DEPOSITED', financialAccountId: 'acc-1' }),
      },
    });

    await runInTenant({}, () => service.depositCheck('chk-1', 'acc-1'));

    expect(checkService.depositCheck).toHaveBeenCalledWith('chk-1', 'acc-1');
    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ financialAccountId: 'acc-1', amount: 1000 }),
    );
  });
});

describe('TreasuryService.markCleared', () => {
  it('debits the backing account when an OWN check clears', async () => {
    const { service, reportsFinancialService } = makeServices({
      checkService: {
        markCleared: jest
          .fn()
          .mockResolvedValue({ ...baseCheck, kind: 'OWN', status: 'CLEARED', financialAccountId: 'acc-1' }),
      },
    });

    await runInTenant({}, () => service.markCleared('chk-1'));

    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ financialAccountId: 'acc-1', amount: -1000 }),
    );
  });

  it('does not touch any account when a THIRD_PARTY check clears (already credited at deposit)', async () => {
    const { service, reportsFinancialService } = makeServices({
      checkService: {
        markCleared: jest
          .fn()
          .mockResolvedValue({ ...baseCheck, kind: 'THIRD_PARTY', status: 'CLEARED', financialAccountId: 'acc-1' }),
      },
    });

    await runInTenant({}, () => service.markCleared('chk-1'));

    expect(reportsFinancialService.recordFinancialTransaction).not.toHaveBeenCalled();
  });
});

describe('TreasuryService.rejectCheck', () => {
  it('reopens the invoice balance and posts the reversal entry, without touching any account when it had never been deposited', async () => {
    const { service, checkService, reportsFinancialService, invoicingService, accountingService } = makeServices({
      checkService: {
        rejectCheck: jest.fn().mockResolvedValue({
          check: { ...baseCheck, status: 'REJECTED', financialAccountId: null, rejectionFeeAmount: 0 },
          wasDeposited: false,
        }),
      },
    });
    const db = { receipt: { findUnique: jest.fn().mockResolvedValue({ invoiceId: 'invoice-1' }) } };

    await runInTenant(db, () => service.rejectCheck('chk-1', { reason: 'sin fondos' }));

    expect(checkService.rejectCheck).toHaveBeenCalledWith('chk-1', { reason: 'sin fondos', feeAmount: undefined });
    expect(reportsFinancialService.recordFinancialTransaction).not.toHaveBeenCalled();
    expect(invoicingService.reopenInvoiceBalance).toHaveBeenCalledWith('invoice-1', baseCheck.amount, 0);
    expect(accountingService.postCheckRejectionJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ checkId: 'chk-1', amount: baseCheck.amount, feeAmount: 0 }),
    );
  });

  it('also reverses the deposit credit when the rejected check had already been deposited', async () => {
    const { service, reportsFinancialService } = makeServices({
      checkService: {
        rejectCheck: jest.fn().mockResolvedValue({
          check: { ...baseCheck, status: 'REJECTED', financialAccountId: 'acc-1', rejectionFeeAmount: 25 },
          wasDeposited: true,
        }),
      },
    });
    const db = { receipt: { findUnique: jest.fn().mockResolvedValue({ invoiceId: 'invoice-1' }) } };

    await runInTenant(db, () => service.rejectCheck('chk-1', { reason: 'sin fondos', feeAmount: 25 }));

    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ financialAccountId: 'acc-1', amount: -1000 }),
    );
  });

  it('throws when the originating receipt no longer exists', async () => {
    const { service } = makeServices({
      checkService: {
        rejectCheck: jest.fn().mockResolvedValue({
          check: { ...baseCheck, status: 'REJECTED', financialAccountId: null },
          wasDeposited: false,
        }),
      },
    });
    const db = { receipt: { findUnique: jest.fn().mockResolvedValue(null) } };

    await expect(
      runInTenant(db, () => service.rejectCheck('chk-1', { reason: 'sin fondos' })),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('TreasuryService.revalueFinancialAccount', () => {
  it('posts the revaluation using the given rate and stores it as the new lastRevaluationRate', async () => {
    const { service, accountingService } = makeServices();
    const financialAccountUpdate = jest.fn().mockResolvedValue({ id: 'fa-1', lastRevaluationRate: 1100 });
    const db = {
      financialAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'fa-1',
          currencyId: 'usd',
          currentBalance: new Prisma.Decimal(100),
          lastRevaluationRate: new Prisma.Decimal(1000),
        }),
        update: financialAccountUpdate,
      },
    };

    await runInTenant(db, () => service.revalueFinancialAccount('fa-1', 1100));

    expect(accountingService.postExchangeRateRevaluation).toHaveBeenCalledWith({
      financialAccountId: 'fa-1',
      currentBalance: new Prisma.Decimal(100),
      previousRate: new Prisma.Decimal(1000),
      newRate: 1100,
    });
    expect(financialAccountUpdate).toHaveBeenCalledWith({
      where: { id: 'fa-1' },
      data: { lastRevaluationRate: 1100 },
    });
  });

  it('falls back to the latest ExchangeRateHistory rate when none is given', async () => {
    const { service, accountingService } = makeServices();
    const db = {
      financialAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'fa-1',
          currencyId: 'usd',
          currentBalance: new Prisma.Decimal(100),
          lastRevaluationRate: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      exchangeRateHistory: {
        findFirst: jest.fn().mockResolvedValue({ rate: new Prisma.Decimal(1050) }),
      },
    };

    await runInTenant(db, () => service.revalueFinancialAccount('fa-1'));

    expect(accountingService.postExchangeRateRevaluation).toHaveBeenCalledWith(
      expect.objectContaining({ newRate: 1050 }),
    );
  });

  it('throws when the account is in the tenant base currency (nothing to revalue)', async () => {
    const { service } = makeServices();
    const db = {
      financialAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'fa-1', currencyId: null }),
      },
    };

    await expect(runInTenant(db, () => service.revalueFinancialAccount('fa-1'))).rejects.toThrow(NotFoundException);
  });

  it('throws when there is no exchange rate on file and none was given', async () => {
    const { service } = makeServices();
    const db = {
      financialAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'fa-1', currencyId: 'usd' }),
      },
      exchangeRateHistory: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(runInTenant(db, () => service.revalueFinancialAccount('fa-1'))).rejects.toThrow(NotFoundException);
  });
});
