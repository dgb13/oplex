import { BadRequestException } from '@nestjs/common';
import type { AccountingService } from '@plexo/accounting';
import type { BankReconciliationService as BankReconciliationLibService } from '@plexo/bank-reconciliation';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { ReportsFinancialService } from '@plexo/reports-financial';
import { BankReconciliationService } from './bank-reconciliation.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeServices(overrides: {
  lib?: Partial<BankReconciliationLibService>;
  reportsFinancialService?: Partial<ReportsFinancialService>;
  accountingService?: Partial<AccountingService>;
} = {}) {
  const lib = { ...overrides.lib } as unknown as BankReconciliationLibService;
  const reportsFinancialService = {
    listUnreconciledTransactions: jest.fn().mockResolvedValue([]),
    reconcileTransaction: jest.fn().mockResolvedValue({}),
    recordFinancialTransaction: jest.fn().mockResolvedValue({ id: 'tx-new' }),
    ...overrides.reportsFinancialService,
  } as unknown as ReportsFinancialService;
  const accountingService = {
    postBankStatementAdjustmentJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-1' }),
    ...overrides.accountingService,
  } as unknown as AccountingService;
  const service = new BankReconciliationService(lib, reportsFinancialService, accountingService);
  return { service, lib, reportsFinancialService, accountingService };
}

function tx(id: string, amount: number, occurredAt: Date) {
  return { id, amount: new Prisma.Decimal(amount), occurredAt };
}

describe('BankReconciliationService.importStatement', () => {
  it('returns row errors without creating anything when parsing fails', async () => {
    const { service, lib } = makeServices({
      lib: {
        parseAndValidate: jest
          .fn()
          .mockResolvedValue({ fileHash: 'h', lines: [], errors: [{ row: 3, message: 'bad row' }] }),
        createImport: jest.fn(),
      },
    });

    const result = await runInTenant({}, () => service.importStatement('acc-1', Buffer.from('x'), 'x.xlsx'));

    expect(result).toEqual({ totalLines: 0, matchedCount: 0, pendingCount: 0, errors: [{ row: 3, message: 'bad row' }] });
    expect(lib.createImport).not.toHaveBeenCalled();
  });

  it('auto-matches a line with exactly one same-amount candidate within the date window', async () => {
    const lineDate = new Date('2026-09-01T00:00:00Z');
    const candidate = tx('tx-1', 15000, new Date('2026-09-02T00:00:00Z'));
    const { service, lib, reportsFinancialService } = makeServices({
      lib: {
        parseAndValidate: jest.fn().mockResolvedValue({ fileHash: 'h', lines: [], errors: [] }),
        createImport: jest.fn().mockResolvedValue({
          id: 'imp-1',
          lines: [{ id: 'line-1', amount: new Prisma.Decimal(15000), lineDate }],
        }),
        markLineMatched: jest.fn().mockResolvedValue({}),
      },
      reportsFinancialService: {
        listUnreconciledTransactions: jest.fn().mockResolvedValue([candidate]),
      },
    });

    const result = await runInTenant({}, () => service.importStatement('acc-1', Buffer.from('x'), 'x.xlsx'));

    expect(lib.markLineMatched).toHaveBeenCalledWith('line-1', 'tx-1');
    expect(reportsFinancialService.reconcileTransaction).toHaveBeenCalledWith('tx-1');
    expect(result).toEqual({ importId: 'imp-1', totalLines: 1, matchedCount: 1, pendingCount: 0, errors: [] });
  });

  it('leaves a line PENDING when there are two equal-amount candidates in the window', async () => {
    const lineDate = new Date('2026-09-01T00:00:00Z');
    const { service, lib, reportsFinancialService } = makeServices({
      lib: {
        parseAndValidate: jest.fn().mockResolvedValue({ fileHash: 'h', lines: [], errors: [] }),
        createImport: jest.fn().mockResolvedValue({
          id: 'imp-1',
          lines: [{ id: 'line-1', amount: new Prisma.Decimal(15000), lineDate }],
        }),
        markLineMatched: jest.fn(),
      },
      reportsFinancialService: {
        listUnreconciledTransactions: jest
          .fn()
          .mockResolvedValue([tx('tx-1', 15000, lineDate), tx('tx-2', 15000, lineDate)]),
      },
    });

    const result = await runInTenant({}, () => service.importStatement('acc-1', Buffer.from('x'), 'x.xlsx'));

    expect(lib.markLineMatched).not.toHaveBeenCalled();
    expect(reportsFinancialService.reconcileTransaction).not.toHaveBeenCalled();
    expect(result).toEqual({ importId: 'imp-1', totalLines: 1, matchedCount: 0, pendingCount: 1, errors: [] });
  });

  it('leaves a line PENDING when the only same-amount candidate is outside the 3-day window', async () => {
    const lineDate = new Date('2026-09-01T00:00:00Z');
    const farCandidate = tx('tx-1', 15000, new Date('2026-09-10T00:00:00Z'));
    const { service, lib } = makeServices({
      lib: {
        parseAndValidate: jest.fn().mockResolvedValue({ fileHash: 'h', lines: [], errors: [] }),
        createImport: jest.fn().mockResolvedValue({
          id: 'imp-1',
          lines: [{ id: 'line-1', amount: new Prisma.Decimal(15000), lineDate }],
        }),
        markLineMatched: jest.fn(),
      },
      reportsFinancialService: { listUnreconciledTransactions: jest.fn().mockResolvedValue([farCandidate]) },
    });

    const result = await runInTenant({}, () => service.importStatement('acc-1', Buffer.from('x'), 'x.xlsx'));

    expect(lib.markLineMatched).not.toHaveBeenCalled();
    expect(result.matchedCount).toBe(0);
    expect(result.pendingCount).toBe(1);
  });
});

describe('BankReconciliationService.createTransactionFromLine', () => {
  it('throws when the line is not PENDING', async () => {
    const { service } = makeServices({
      lib: { getLine: jest.fn().mockResolvedValue({ id: 'line-1', status: 'MATCHED' }) },
    });

    await expect(
      runInTenant({}, () => service.createTransactionFromLine('line-1', { kind: 'EXPENSE' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when kind=EXPENSE is used on a positive (income) line', async () => {
    const { service } = makeServices({
      lib: {
        getLine: jest
          .fn()
          .mockResolvedValue({ id: 'line-1', status: 'PENDING', amount: new Prisma.Decimal(100) }),
      },
    });

    await expect(
      runInTenant({}, () => service.createTransactionFromLine('line-1', { kind: 'EXPENSE' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when kind=INCOME is used on a negative (expense) line', async () => {
    const { service } = makeServices({
      lib: {
        getLine: jest
          .fn()
          .mockResolvedValue({ id: 'line-1', status: 'PENDING', amount: new Prisma.Decimal(-100) }),
      },
    });

    await expect(
      runInTenant({}, () => service.createTransactionFromLine('line-1', { kind: 'INCOME' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('records the transaction, posts the journal entry, and marks the line matched for a valid EXPENSE line', async () => {
    const lineDate = new Date('2026-09-02T00:00:00Z');
    const { service, lib, reportsFinancialService, accountingService } = makeServices({
      lib: {
        getLine: jest.fn().mockResolvedValue({
          id: 'line-1',
          status: 'PENDING',
          amount: new Prisma.Decimal(-850),
          lineDate,
          description: 'Comisión',
          financialAccountId: 'acc-1',
        }),
        markLineMatched: jest.fn().mockResolvedValue({}),
      },
    });

    const result = await runInTenant({}, () =>
      service.createTransactionFromLine('line-1', { kind: 'EXPENSE' }),
    );

    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith({
      financialAccountId: 'acc-1',
      amount: -850,
      occurredAt: lineDate.toISOString(),
      externalRef: 'Comisión',
    });
    expect(accountingService.postBankStatementAdjustmentJournalEntry).toHaveBeenCalledWith({
      bankStatementLineId: 'line-1',
      kind: 'EXPENSE',
      amount: 850,
      date: lineDate,
    });
    expect(reportsFinancialService.reconcileTransaction).toHaveBeenCalledWith('tx-new');
    expect(lib.markLineMatched).toHaveBeenCalledWith('line-1', 'tx-new');
    expect(result).toEqual({ transaction: { id: 'tx-new' }, journalEntry: { id: 'entry-1' } });
  });
});

describe('BankReconciliationService.linkLineToTransaction', () => {
  it('reconciles the target transaction and marks the line matched', async () => {
    const { service, lib, reportsFinancialService } = makeServices({
      lib: { markLineMatched: jest.fn().mockResolvedValue({}) },
    });

    await runInTenant({}, () => service.linkLineToTransaction('line-1', 'tx-1'));

    expect(reportsFinancialService.reconcileTransaction).toHaveBeenCalledWith('tx-1');
    expect(lib.markLineMatched).toHaveBeenCalledWith('line-1', 'tx-1');
  });
});
