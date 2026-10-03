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
    ensureMoneyAccounts: jest.fn().mockResolvedValue(undefined),
    postCheckRejectionJournalEntry: jest.fn().mockResolvedValue({}),
    postExchangeRateRevaluation: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    postCheckDepositJournalEntry: jest.fn().mockResolvedValue({}),
    postOwnCheckClearedJournalEntry: jest.fn().mockResolvedValue({}),
    postTransferJournalEntry: jest.fn().mockResolvedValue({}),
    postMoneyMovementJournalEntry: jest.fn().mockResolvedValue({}),
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

describe('TreasuryService - asientos por cuenta de dinero', () => {
  it('depositar un cheque también lo asienta: entra al banco, sale de Cheques en Cartera', async () => {
    const { service, accountingService } = makeServices({
      checkService: {
        depositCheck: jest.fn().mockResolvedValue({ ...baseCheck, status: 'DEPOSITED', financialAccountId: 'acc-1' }),
      },
    });

    await runInTenant({}, () => service.depositCheck('chk-1', 'acc-1'));

    expect(accountingService.ensureMoneyAccounts).toHaveBeenCalled();
    expect(accountingService.postCheckDepositJournalEntry).toHaveBeenCalledWith({
      checkId: 'chk-1',
      financialAccountId: 'acc-1',
      amount: baseCheck.amount,
    });
  });

  it('un cheque propio que se cobra cancela "Cheques Diferidos a Pagar" contra el banco', async () => {
    const { service, accountingService } = makeServices({
      checkService: {
        markCleared: jest.fn().mockResolvedValue({ ...baseCheck, kind: 'OWN', status: 'CLEARED', financialAccountId: 'acc-1' }),
      },
    });

    await runInTenant({}, () => service.markCleared('chk-1'));

    expect(accountingService.postOwnCheckClearedJournalEntry).toHaveBeenCalledWith({
      checkId: 'chk-1',
      financialAccountId: 'acc-1',
      amount: baseCheck.amount,
    });
  });

  it.each([
    ['DEPOSITED', 'acc-1', { financialAccountId: 'acc-1' }],
    ['PORTFOLIO', null, { kind: 'CHECKS_IN_PORTFOLIO' }],
    ['ENDORSED', null, { kind: 'ACCOUNTS_PAYABLE' }],
  ] as const)('el rechazo de un cheque %s sale de donde estaba', async (previousStatus, financialAccountId, money) => {
    const { service, accountingService } = makeServices({
      checkService: {
        rejectCheck: jest.fn().mockResolvedValue({
          check: { ...baseCheck, status: 'REJECTED', financialAccountId },
          wasDeposited: previousStatus === 'DEPOSITED',
          previousStatus,
        }),
      },
    });
    const db = { receipt: { findUnique: jest.fn().mockResolvedValue({ invoiceId: 'invoice-1' }) } };

    await runInTenant(db, () => service.rejectCheck('chk-1', { reason: 'sin fondos' }));

    expect(accountingService.postCheckRejectionJournalEntry).toHaveBeenCalledWith(expect.objectContaining({ money }));
  });
});

describe('TreasuryService.transferBetweenAccounts', () => {
  const transfer = { fromFinancialAccountId: 'fa-pending', toFinancialAccountId: 'fa-bank', amount: 900 };

  function makeDb(fromCurrency: string | null, toCurrency: string | null, rate?: number) {
    return {
      financialAccount: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === 'fa-pending'
              ? { id: 'fa-pending', name: 'Cobranzas a depositar', currencyId: fromCurrency }
              : { id: 'fa-bank', name: 'Banco Galicia', currencyId: toCurrency },
          ),
        ),
      },
      exchangeRateHistory: {
        findFirst: jest.fn().mockResolvedValue(rate ? { rate: new Prisma.Decimal(rate) } : null),
      },
    };
  }

  it('mueve los dos saldos y asienta Debe destino / Haber origen, reclasificando antes', async () => {
    const order: string[] = [];
    const { service, accountingService, reportsFinancialService } = makeServices({
      reportsFinancialService: {
        transferBetweenAccounts: jest.fn(() => {
          order.push('balances');
          return Promise.resolve({ from: { id: 'tx-1' }, to: { id: 'tx-2' } });
        }) as never,
      },
      accountingService: {
        ensureMoneyAccounts: jest.fn(() => {
          order.push('ensure');
          return Promise.resolve();
        }) as never,
      },
    });

    await runInTenant(makeDb(null, null), () => service.transferBetweenAccounts(transfer));

    expect(order).toEqual(['ensure', 'balances']);
    expect(reportsFinancialService.transferBetweenAccounts).toHaveBeenCalledWith(transfer);
    expect(accountingService.postTransferJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        fromFinancialAccountId: 'fa-pending',
        toFinancialAccountId: 'fa-bank',
        amount: new Prisma.Decimal(900),
        description: 'Transferencia de Cobranzas a depositar a Banco Galicia',
      }),
    );
  });

  it('no deja transferir entre cuentas de distinta moneda (eso es una compra de divisas)', async () => {
    const { service, reportsFinancialService } = makeServices({
      reportsFinancialService: { transferBetweenAccounts: jest.fn() as never },
    });

    await expect(runInTenant(makeDb(null, 'usd'), () => service.transferBetweenAccounts(transfer))).rejects.toThrow(
      /misma moneda/,
    );
    expect(reportsFinancialService.transferBetweenAccounts).not.toHaveBeenCalled();
  });

  it('entre dos cuentas en dólares, el asiento va en pesos a la última cotización', async () => {
    const { service, accountingService } = makeServices({
      reportsFinancialService: { transferBetweenAccounts: jest.fn().mockResolvedValue({}) as never },
    });

    await runInTenant(makeDb('usd', 'usd', 1500), () => service.transferBetweenAccounts({ ...transfer, amount: 10 }));

    expect(accountingService.postTransferJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ amount: new Prisma.Decimal(15000) }),
    );
  });
});

describe('TreasuryService.createFinancialAccount', () => {
  it('el saldo inicial queda como movimiento de la cuenta y se asienta contra Saldos Iniciales', async () => {
    const createFinancialAccount = jest.fn().mockResolvedValue({ id: 'fa-new', name: 'Banco Nación', currencyId: null });
    const { service, reportsFinancialService, accountingService } = makeServices({
      reportsFinancialService: { createFinancialAccount },
    });
    const db = { financialAccount: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'fa-new' }) } };

    await runInTenant(db, () => service.createFinancialAccount({ name: 'Banco Nación', provider: 'BANK', currentBalance: 5000 }));

    // La cuenta nace en 0: el saldo entra por el movimiento, no dos veces.
    expect(createFinancialAccount).toHaveBeenCalledWith(expect.objectContaining({ currentBalance: undefined }));
    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith({
      financialAccountId: 'fa-new',
      amount: 5000,
      externalRef: 'Saldo inicial',
    });
    expect(accountingService.postMoneyMovementJournalEntry).toHaveBeenCalledWith({
      financialAccountId: 'fa-new',
      amount: 5000,
      counterpart: { kind: 'OPENING_BALANCE' },
      description: 'Saldo inicial - Banco Nación',
    });
  });

  it('sin saldo inicial no hay movimiento ni asiento', async () => {
    const { service, reportsFinancialService, accountingService } = makeServices({
      reportsFinancialService: { createFinancialAccount: jest.fn().mockResolvedValue({ id: 'fa-new', currencyId: null }) },
    });

    await runInTenant({}, () => service.createFinancialAccount({ name: 'Caja chica', provider: 'CASH' }));

    expect(reportsFinancialService.recordFinancialTransaction).not.toHaveBeenCalled();
    expect(accountingService.postMoneyMovementJournalEntry).not.toHaveBeenCalled();
  });

  it('en dólares se valúa a la última cotización (Valuación inicial)', async () => {
    const { service, accountingService } = makeServices({
      reportsFinancialService: {
        createFinancialAccount: jest.fn().mockResolvedValue({ id: 'fa-usd', name: 'Caja USD', currencyId: 'usd' }),
      },
    });
    const db = {
      exchangeRateHistory: { findFirst: jest.fn().mockResolvedValue({ rate: new Prisma.Decimal(1500) }) },
      financialAccount: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'fa-usd',
          currencyId: 'usd',
          currentBalance: new Prisma.Decimal(100),
          lastRevaluationRate: null,
        }),
        update: jest.fn().mockResolvedValue({ id: 'fa-usd', lastRevaluationRate: 1500 }),
      },
    };

    await runInTenant(db, () =>
      service.createFinancialAccount({ name: 'Caja USD', provider: 'CASH', currencyId: 'usd', currentBalance: 100 }),
    );

    expect(accountingService.postMoneyMovementJournalEntry).not.toHaveBeenCalled();
    expect(accountingService.postExchangeRateRevaluation).toHaveBeenCalledWith(
      expect.objectContaining({ financialAccountId: 'fa-usd', previousRate: null, newRate: 1500 }),
    );
  });
});

describe('TreasuryService.recordManualMovement', () => {
  const bank = { id: 'fa-bank', name: 'Banco Galicia CC', currencyId: null, lastRevaluationRate: null };

  it('egreso con concepto: baja el saldo y se asienta contra el concepto', async () => {
    const { service, reportsFinancialService, accountingService } = makeServices();
    const db = { financialAccount: { findUnique: jest.fn().mockResolvedValue(bank) } };

    await runInTenant(db, () =>
      service.recordManualMovement({
        financialAccountId: 'fa-bank',
        direction: 'OUT',
        amount: 1850,
        concept: 'BANK_FEES',
        externalRef: 'Mantenimiento de cuenta',
      }),
    );

    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ financialAccountId: 'fa-bank', amount: -1850 }),
    );
    expect(accountingService.postMoneyMovementJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        financialAccountId: 'fa-bank',
        amount: new Prisma.Decimal(-1850),
        counterpart: { concept: 'BANK_FEES' },
        description: 'Gastos bancarios - Banco Galicia CC - Mantenimiento de cuenta',
      }),
    );
  });

  it('en dólares se asienta en pesos a la cotización de la cuenta', async () => {
    const { service, accountingService } = makeServices();
    const db = {
      financialAccount: {
        findUnique: jest.fn().mockResolvedValue({ ...bank, currencyId: 'usd', lastRevaluationRate: new Prisma.Decimal(1500) }),
      },
    };

    await runInTenant(db, () =>
      service.recordManualMovement({ financialAccountId: 'fa-bank', direction: 'IN', amount: 10, accountingAccountId: 'acc-x' }),
    );

    expect(accountingService.postMoneyMovementJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ amount: new Prisma.Decimal(15000), counterpart: { accountId: 'acc-x' } }),
    );
  });

  it('sin concepto, o con un concepto del otro sentido, no se registra', async () => {
    const { service, reportsFinancialService } = makeServices();
    const db = { financialAccount: { findUnique: jest.fn().mockResolvedValue(bank) } };

    await expect(
      runInTenant(db, () => service.recordManualMovement({ financialAccountId: 'fa-bank', direction: 'OUT', amount: 5 })),
    ).rejects.toThrow(/concepto/);
    await expect(
      runInTenant(db, () =>
        service.recordManualMovement({ financialAccountId: 'fa-bank', direction: 'OUT', amount: 5, concept: 'OTHER_INCOME' }),
      ),
    ).rejects.toThrow(/no es un egreso/);
    expect(reportsFinancialService.recordFinancialTransaction).not.toHaveBeenCalled();
  });
});
