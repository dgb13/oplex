import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { AccountingService } from './accounting.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T, userId = 'user-1'): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId, tx: db as never }, fn);
}

function runWithoutUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, fn);
}

describe('AccountingService.postJournalEntry', () => {
  const dto = {
    description: 'Sale on credit',
    lines: [
      { accountId: 'acc-ar', direction: 'DEBIT' as const, amount: 121 },
      { accountId: 'acc-sales', direction: 'CREDIT' as const, amount: 100 },
      { accountId: 'acc-vat', direction: 'CREDIT' as const, amount: 21 },
    ],
  };

  it('throws when there is no authenticated user', async () => {
    const service = new AccountingService();
    await expect(runWithoutUser({}, () => service.postJournalEntry(dto))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an entry where debits and credits do not balance', async () => {
    const service = new AccountingService();
    const unbalanced = {
      description: 'Oops',
      lines: [
        { accountId: 'acc-a', direction: 'DEBIT' as const, amount: 100 },
        { accountId: 'acc-b', direction: 'CREDIT' as const, amount: 90 },
      ],
    };

    await expect(runInTenant({}, () => service.postJournalEntry(unbalanced))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('posts a balanced compound entry (one debit, two credits) as a single createMany', async () => {
    const journalEntry = { create: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }) };
    const service = new AccountingService();

    await runInTenant({ journalEntry }, () => service.postJournalEntry(dto));

    const createArgs = (journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.createdById).toBe('user-1');
    expect(createArgs.data.lines.createMany.data).toHaveLength(3);
  });
});

describe('AccountingService.postInvoiceJournalEntry', () => {
  function dbWithAccounts(existingByCode: Record<string, { id: string }> = {}) {
    const created: { code: string; name: string; type: string }[] = [];
    return {
      accountingAccount: {
        findFirst: jest.fn(({ where }: { where: { code: string } }) =>
          Promise.resolve(existingByCode[where.code] ?? null),
        ),
        create: jest.fn(({ data }: { data: { code: string; name: string; type: string } }) => {
          created.push({ code: data.code, name: data.name, type: data.type });
          return Promise.resolve({ id: `acc-${data.code}`, ...data });
        }),
      },
      journalEntry: {
        create: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
      },
      _created: created,
    };
  }

  it('books debit AR / credit Sales+VAT, creating accounts on first use', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postInvoiceJournalEntry({
        invoiceId: 'inv-1',
        subtotal: 100,
        taxTotal: 21,
        total: 121,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(
      expect.arrayContaining(['1.1.02', '4.1.01', '2.1.03']),
    );
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.invoiceId).toBe('inv-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-1.1.02', direction: 'DEBIT', amount: 121 },
      { accountId: 'acc-4.1.01', direction: 'CREDIT', amount: 100 },
      { accountId: 'acc-2.1.03', direction: 'CREDIT', amount: 21 },
    ]);
  });

  it('reuses an existing account instead of creating a duplicate for the same code', async () => {
    const db = dbWithAccounts({ '1.1.02': { id: 'existing-ar' } });
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postInvoiceJournalEntry({ invoiceId: 'inv-2', subtotal: 100, taxTotal: 21, total: 121 }),
    );

    expect(db._created.some((a) => a.code === '1.1.02')).toBe(false);
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data[0].accountId).toBe('existing-ar');
  });

  it('omits the VAT line entirely for a tax-exempt sale', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postInvoiceJournalEntry({ invoiceId: 'inv-3', subtotal: 50, taxTotal: 0, total: 50 }),
    );

    expect(db._created.some((a) => a.code === '2.1.03')).toBe(false);
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toHaveLength(2);
  });

  it('skips posting entirely for a zero-total invoice', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postInvoiceJournalEntry({ invoiceId: 'inv-4', subtotal: 0, taxTotal: 0, total: 0 }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService.postCreditNoteJournalEntry', () => {
  function dbWithAccounts(existingByCode: Record<string, { id: string }> = {}) {
    const created: { code: string; name: string; type: string }[] = [];
    return {
      accountingAccount: {
        findFirst: jest.fn(({ where }: { where: { code: string } }) =>
          Promise.resolve(existingByCode[where.code] ?? null),
        ),
        create: jest.fn(({ data }: { data: { code: string; name: string; type: string } }) => {
          created.push({ code: data.code, name: data.name, type: data.type });
          return Promise.resolve({ id: `acc-${data.code}`, ...data });
        }),
      },
      journalEntry: {
        create: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
      },
      _created: created,
    };
  }

  it('skips posting entirely for a zero-total credit note', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postCreditNoteJournalEntry({
        creditNoteId: 'cn-1',
        invoiceId: 'inv-1',
        subtotal: 0,
        taxTotal: 0,
        total: 0,
      }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it('books the mirror image of the sale entry: credit AR, debit Sales+VAT', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postCreditNoteJournalEntry({
        creditNoteId: 'cn-1',
        invoiceId: 'inv-1',
        subtotal: 100,
        taxTotal: 21,
        total: 121,
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.creditNoteId).toBe('cn-1');
    expect(createArgs.data.description).toBe('Nota de crédito - comprobante inv-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-1.1.02', direction: 'CREDIT', amount: 121 },
      { accountId: 'acc-4.1.01', direction: 'DEBIT', amount: 100 },
      { accountId: 'acc-2.1.03', direction: 'DEBIT', amount: 21 },
    ]);
  });

  it('omits the VAT line entirely for a tax-exempt credit note', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postCreditNoteJournalEntry({
        creditNoteId: 'cn-2',
        invoiceId: 'inv-2',
        subtotal: 50,
        taxTotal: 0,
        total: 50,
      }),
    );

    expect(db._created.some((a) => a.code === '2.1.03')).toBe(false);
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toHaveLength(2);
  });

  it('adds the COGS reversal pair (credit COGS / debit Mercaderías) when cogsAmount is given', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postCreditNoteJournalEntry({
        creditNoteId: 'cn-3',
        invoiceId: 'inv-3',
        subtotal: 100,
        taxTotal: 21,
        total: 121,
        cogsAmount: 60,
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual(
      expect.arrayContaining([
        { accountId: 'acc-5.1.01', direction: 'CREDIT', amount: 60 },
        { accountId: 'acc-1.1.04', direction: 'DEBIT', amount: 60 },
      ]),
    );
  });
});

describe('AccountingService.createReversingEntry', () => {
  it('throws when the original entry does not exist', async () => {
    const db = { journalEntry: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new AccountingService();

    await expect(
      runInTenant(db, () => service.createReversingEntry({ originalEntryId: 'missing' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('swaps DEBIT/CREDIT on every line and links back via reversalOfId', async () => {
    const original = {
      id: 'entry-1',
      description: 'Sale on credit',
      lines: [
        { accountId: 'acc-ar', direction: 'DEBIT', amount: new Prisma.Decimal(121) },
        { accountId: 'acc-sales', direction: 'CREDIT', amount: new Prisma.Decimal(100) },
        { accountId: 'acc-vat', direction: 'CREDIT', amount: new Prisma.Decimal(21) },
      ],
    };
    const db = {
      journalEntry: {
        findUnique: jest.fn().mockResolvedValue(original),
        create: jest.fn().mockResolvedValue({ id: 'entry-2', lines: [] }),
      },
    };
    const service = new AccountingService();

    await runInTenant(db, () => service.createReversingEntry({ originalEntryId: 'entry-1' }));

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.reversalOfId).toBe('entry-1');
    expect(createArgs.data.description).toBe('Reversal of: Sale on credit');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-ar', direction: 'CREDIT', amount: original.lines[0].amount },
      { accountId: 'acc-sales', direction: 'DEBIT', amount: original.lines[1].amount },
      { accountId: 'acc-vat', direction: 'DEBIT', amount: original.lines[2].amount },
    ]);
  });
});

describe('AccountingService.getTrialBalance', () => {
  it('nets debit-normal and credit-normal accounts with opposite signs', async () => {
    const db = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'acc-cash', code: '1000', name: 'Cash', type: 'ASSET' },
          { id: 'acc-sales', code: '4000', name: 'Sales', type: 'INCOME' },
        ]),
      },
      journalEntryLine: {
        groupBy: jest.fn().mockResolvedValue([
          { accountId: 'acc-cash', direction: 'DEBIT', _sum: { amount: new Prisma.Decimal(500) } },
          { accountId: 'acc-cash', direction: 'CREDIT', _sum: { amount: new Prisma.Decimal(200) } },
          { accountId: 'acc-sales', direction: 'CREDIT', _sum: { amount: new Prisma.Decimal(300) } },
        ]),
      },
    };
    const service = new AccountingService();

    const trialBalance = await runInTenant(db, () => service.getTrialBalance());

    const cash = trialBalance.find((r) => r.accountId === 'acc-cash');
    const sales = trialBalance.find((r) => r.accountId === 'acc-sales');
    // ASSET is debit-normal: 500 debit - 200 credit = 300
    expect(cash?.balance.toNumber()).toBe(300);
    // INCOME is credit-normal: 300 credit - 0 debit = 300
    expect(sales?.balance.toNumber()).toBe(300);
  });

  it('defaults an account with no postings yet to a zero balance', async () => {
    const db = {
      accountingAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'acc-new', code: '5000', name: 'Unused', type: 'EXPENSE' }]),
      },
      journalEntryLine: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new AccountingService();

    const trialBalance = await runInTenant(db, () => service.getTrialBalance());

    expect(trialBalance[0].balance.toNumber()).toBe(0);
  });
});

describe('AccountingService.getAccountBalancesAsOf', () => {
  it('only counts journal_entry_lines strictly before the given date', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { accountId: 'acc-cash', direction: 'DEBIT', _sum: { amount: new Prisma.Decimal(700) } },
    ]);
    const db = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([{ id: 'acc-cash', code: '1.1.03', name: 'Caja', type: 'ASSET' }]),
      },
      journalEntryLine: { groupBy },
    };
    const service = new AccountingService();
    const asOf = new Date('2026-03-01T00:00:00Z');

    const balances = await runInTenant(db, () => service.getAccountBalancesAsOf(['acc-cash'], asOf));

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ journalEntry: { date: { lt: asOf } } }) }),
    );
    expect(balances.get('acc-cash')?.toNumber()).toBe(700);
  });

  it('defaults an account with no lines yet before that date to zero', async () => {
    const db = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([{ id: 'acc-new', code: '2.1.05', name: 'Proveedores', type: 'LIABILITY' }]),
      },
      journalEntryLine: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new AccountingService();

    const balances = await runInTenant(db, () =>
      service.getAccountBalancesAsOf(['acc-new'], new Date('2026-01-01T00:00:00Z')),
    );

    expect(balances.get('acc-new')?.toNumber()).toBe(0);
  });
});

describe('AccountingService.updateAccount', () => {
  it('throws NotFoundException when the account does not exist', async () => {
    const db = { accountingAccount: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new AccountingService();

    await expect(
      runInTenant(db, () => service.updateAccount('missing', { isMonetary: false })),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates isMonetary for an existing account', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'acc-1', isMonetary: false });
    const db = {
      accountingAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'acc-1', isMonetary: true }),
        update,
      },
    };
    const service = new AccountingService();

    await runInTenant(db, () => service.updateAccount('acc-1', { isMonetary: false }));

    expect(update).toHaveBeenCalledWith({ where: { id: 'acc-1' }, data: { isMonetary: false } });
  });
});

describe('AccountingService.getAccountLedger', () => {
  it('throws when the account does not exist', async () => {
    const db = { accountingAccount: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new AccountingService();

    await expect(runInTenant(db, () => service.getAccountLedger('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });
});

function dbWithAccounts(existingByCode: Record<string, { id: string }> = {}) {
  const created: { code: string; name: string; type: string; isMonetary?: boolean }[] = [];
  return {
    accountingAccount: {
      findFirst: jest.fn(({ where }: { where: { code: string } }) =>
        Promise.resolve(existingByCode[where.code] ?? null),
      ),
      create: jest.fn(
        ({ data }: { data: { code: string; name: string; type: string; isMonetary?: boolean } }) => {
          created.push({ code: data.code, name: data.name, type: data.type, isMonetary: data.isMonetary });
          return Promise.resolve({ id: `acc-${data.code}`, ...data });
        },
      ),
    },
    journalEntry: {
      create: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    },
    // Tenant ya pasado a una cuenta contable por cuenta de dinero (ver
    // ensureMoneyAccounts), y cada cuenta de dinero ya con la suya:
    // "acc-fa:<id>".
    tenantSettings: { findUnique: jest.fn().mockResolvedValue({ moneyAccountsSplitAt: new Date('2026-10-01') }) },
    financialAccount: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, name: `Cuenta ${where.id}`, accountingAccount: { id: `acc-fa:${where.id}` } }),
      ),
    },
    _created: created,
  };
}

describe('AccountingService.postGoodsReceiptAccrual', () => {
  it('books debit Mercaderías / credit GRNI for the receipt amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postGoodsReceiptAccrual({ goodsReceiptId: 'receipt-1', amount: 18150 }),
    );

    expect(db._created.map((a) => a.code)).toEqual(expect.arrayContaining(['1.1.04', '2.1.04']));
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.goodsReceiptId).toBe('receipt-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-1.1.04', direction: 'DEBIT', amount: 18150 },
      { accountId: 'acc-2.1.04', direction: 'CREDIT', amount: 18150 },
    ]);
  });

  it('skips posting entirely for a zero amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postGoodsReceiptAccrual({ goodsReceiptId: 'receipt-1', amount: 0 }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService.reverseSupplierReturnAccrual', () => {
  it('books debit GRNI / credit Mercaderías for the returned amount (mirror image of the accrual)', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.reverseSupplierReturnAccrual({ supplierReturnId: 'return-1', amount: 300 }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.supplierReturnId).toBe('return-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-2.1.04', direction: 'DEBIT', amount: 300 },
      { accountId: 'acc-1.1.04', direction: 'CREDIT', amount: 300 },
    ]);
  });
});

describe('AccountingService.postProductionJournalEntry', () => {
  it('books a wash entry (debit/credit Mercaderías) when inputs and outputs cost the same', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postProductionJournalEntry({
        productionOrderId: 'order-1',
        inputsCost: 7500,
        outputsCost: 7500,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(['1.1.04']);
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.productionOrderId).toBe('order-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-1.1.04', direction: 'DEBIT', amount: 7500 },
      { accountId: 'acc-1.1.04', direction: 'CREDIT', amount: 7500 },
    ]);
  });

  it('absorbs a shortfall (outputs < inputs) as a loss, keeping the entry balanced', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postProductionJournalEntry({
        productionOrderId: 'order-2',
        inputsCost: 1000,
        outputsCost: 900,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(expect.arrayContaining(['1.1.04', '5.1.07']));
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-1.1.04', direction: 'DEBIT', amount: 900 },
      { accountId: 'acc-1.1.04', direction: 'CREDIT', amount: 1000 },
      { accountId: 'acc-5.1.07', direction: 'DEBIT', amount: 100 },
    ]);
  });

  it('absorbs a surplus (outputs > inputs) as a gain, keeping the entry balanced', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postProductionJournalEntry({
        productionOrderId: 'order-3',
        inputsCost: 900,
        outputsCost: 1000,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(expect.arrayContaining(['1.1.04', '4.2.06']));
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-1.1.04', direction: 'DEBIT', amount: 1000 },
      { accountId: 'acc-1.1.04', direction: 'CREDIT', amount: 900 },
      { accountId: 'acc-4.2.06', direction: 'CREDIT', amount: 100 },
    ]);
  });

  it('skips posting entirely when both inputs and outputs cost nothing', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postProductionJournalEntry({ productionOrderId: 'order-4', inputsCost: 0, outputsCost: 0 }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService.postPurchaseInvoiceJournalEntry', () => {
  it('clears GRNI, books IVA Crédito/Percepciones, credits Proveedores for the total', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postPurchaseInvoiceJournalEntry({
        purchaseInvoiceId: 'pinv-1',
        grniClearedAmount: 18150,
        nonGrniAmount: 0,
        ivaCredito: 3811.5,
        percepciones: [{ concept: 'Percepción IIBB', amount: 200 }],
        total: 22161.5,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(
      expect.arrayContaining(['2.1.05', '2.1.04', '1.1.05', '1.1.06']),
    );
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.purchaseInvoiceId).toBe('pinv-1');
    const lines = createArgs.data.lines.createMany.data;
    expect(lines).toContainEqual({
      accountId: 'acc-2.1.05',
      direction: 'CREDIT',
      amount: 22161.5,
    });
    expect(lines).toContainEqual({
      accountId: 'acc-2.1.04',
      direction: 'DEBIT',
      amount: 18150,
    });
    expect(lines).toContainEqual({
      accountId: 'acc-1.1.05',
      direction: 'DEBIT',
      amount: 3811.5,
    });
    expect(lines).toContainEqual({
      accountId: 'acc-1.1.06',
      direction: 'DEBIT',
      amount: 200,
    });
    // debits (18150 + 3811.5 + 200 = 22161.5) == credit (22161.5) - balances
    expect(lines).toHaveLength(4);
  });

  it('books the non-GRNI remainder to Compras sin remito for a pure-services invoice', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postPurchaseInvoiceJournalEntry({
        purchaseInvoiceId: 'pinv-2',
        grniClearedAmount: 0,
        nonGrniAmount: 1000,
        ivaCredito: 210,
        percepciones: [],
        total: 1210,
      }),
    );

    expect(db._created.some((a) => a.code === '2.1.04')).toBe(false);
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data;
    expect(lines).toContainEqual({
      accountId: 'acc-5.1.02',
      direction: 'DEBIT',
      amount: 1000,
    });
    expect(lines).toHaveLength(3);
  });

  it('skips posting entirely for a zero-total invoice', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postPurchaseInvoiceJournalEntry({
        purchaseInvoiceId: 'pinv-3',
        grniClearedAmount: 0,
        nonGrniAmount: 0,
        ivaCredito: 0,
        percepciones: [],
        total: 0,
      }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService.postSupplierPaymentJournalEntry', () => {
  it('books debit Proveedores / credit Caja for the paid amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postSupplierPaymentJournalEntry({ money: { financialAccountId: 'fa-1' }, supplierPaymentId: 'pay-1', amount: 500 }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.supplierPaymentId).toBe('pay-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-2.1.05', direction: 'DEBIT', amount: 500 },
      { accountId: 'acc-fa:fa-1', direction: 'CREDIT', amount: 500 },
    ]);
  });

  it('skips posting entirely for a zero amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postSupplierPaymentJournalEntry({ money: { financialAccountId: 'fa-1' }, supplierPaymentId: 'pay-2', amount: 0 }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it('debits Proveedores for cash + withheld, credits Caja for cash only, and one liability account per taxType', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postSupplierPaymentJournalEntry({
        money: { financialAccountId: 'fa-1' }, supplierPaymentId: 'pay-3',
        amount: 700,
        withholdings: [
          { taxType: 'INCOME_TAX', amount: 100 },
          { taxType: 'GROSS_INCOME', amount: 50 },
          { taxType: 'GROSS_INCOME', amount: 25 },
        ],
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data;
    // Proveedores debited for the full 875 cancelled (700 cash + 175
    // withheld) - always balanced by construction.
    expect(lines).toContainEqual({ accountId: 'acc-2.1.05', direction: 'DEBIT', amount: 875 });
    expect(lines).toContainEqual({ accountId: 'acc-fa:fa-1', direction: 'CREDIT', amount: 700 });
    expect(lines).toContainEqual({ accountId: 'acc-2.1.06', direction: 'CREDIT', amount: 100 });
    // Two GROSS_INCOME lines (different jurisdictions in real usage) summed
    // into a single 2.1.08 credit line - one aggregate account, not one per
    // withholding line.
    expect(lines).toContainEqual({ accountId: 'acc-2.1.08', direction: 'CREDIT', amount: 75 });
    expect(lines).toHaveLength(4);
    expect(db._created.some((a) => a.code === '2.1.07')).toBe(false);
  });

  it('books only the withheld liability lines when the cash amount is zero (fully withheld payment)', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postSupplierPaymentJournalEntry({
        money: { financialAccountId: 'fa-1' }, supplierPaymentId: 'pay-4',
        amount: 0,
        withholdings: [{ taxType: 'VAT', amount: 50 }],
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data;
    expect(lines).toEqual([
      { accountId: 'acc-2.1.05', direction: 'DEBIT', amount: 50 },
      { accountId: 'acc-2.1.07', direction: 'CREDIT', amount: 50 },
    ]);
  });
});

describe('AccountingService.postReceiptJournalEntry', () => {
  it('books debit Caja / credit Deudores por Ventas for the collected amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postReceiptJournalEntry({ money: { financialAccountId: 'fa-1' }, receiptId: 'receipt-1', amount: 300 }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.receiptId).toBe('receipt-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-fa:fa-1', direction: 'DEBIT', amount: 300 },
      { accountId: 'acc-1.1.02', direction: 'CREDIT', amount: 300 },
    ]);
  });

  it('skips posting entirely for a zero amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postReceiptJournalEntry({ money: { financialAccountId: 'fa-1' }, receiptId: 'receipt-2', amount: 0 }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService.postBankStatementAdjustmentJournalEntry', () => {
  it('books debit Gastos Bancarios / credit Caja for an EXPENSE line', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postBankStatementAdjustmentJournalEntry({
        financialAccountId: 'fa-1', bankStatementLineId: 'line-1',
        kind: 'EXPENSE',
        amount: 850,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(expect.arrayContaining(['5.1.03']));
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.bankStatementLineId).toBe('line-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-5.1.03', direction: 'DEBIT', amount: 850 },
      { accountId: 'acc-fa:fa-1', direction: 'CREDIT', amount: 850 },
    ]);
  });

  it('books debit Caja / credit Intereses Ganados for an INCOME line', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postBankStatementAdjustmentJournalEntry({
        financialAccountId: 'fa-1', bankStatementLineId: 'line-2',
        kind: 'INCOME',
        amount: 120,
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-fa:fa-1', direction: 'DEBIT', amount: 120 },
      { accountId: 'acc-4.2.02', direction: 'CREDIT', amount: 120 },
    ]);
  });

  it('skips posting entirely for a zero or negative amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postBankStatementAdjustmentJournalEntry({
        financialAccountId: 'fa-1', bankStatementLineId: 'line-3',
        kind: 'EXPENSE',
        amount: 0,
      }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService.postCashSessionAdjustmentJournalEntry', () => {
  it('books debit Faltante de Caja / credit Caja for a negative difference (shortage)', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postCashSessionAdjustmentJournalEntry({
        financialAccountId: 'fa-1', cashSessionId: 'session-1',
        difference: -50,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(expect.arrayContaining(['5.1.05']));
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.cashSessionId).toBe('session-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-5.1.05', direction: 'DEBIT', amount: 50 },
      { accountId: 'acc-fa:fa-1', direction: 'CREDIT', amount: 50 },
    ]);
  });

  it('books debit Caja / credit Sobrante de Caja for a positive difference (overage)', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postCashSessionAdjustmentJournalEntry({
        financialAccountId: 'fa-1', cashSessionId: 'session-2',
        difference: 30,
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-fa:fa-1', direction: 'DEBIT', amount: 30 },
      { accountId: 'acc-4.2.04', direction: 'CREDIT', amount: 30 },
    ]);
  });

  it('skips posting entirely for an exact close (difference = 0)', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postCashSessionAdjustmentJournalEntry({
        financialAccountId: 'fa-1', cashSessionId: 'session-3',
        difference: 0,
      }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService.postExchangeRateRevaluation', () => {
  /** ledger = lo que la cuenta contable de la cuenta de dinero tiene hoy, en pesos. */
  function dbWithAccounts(ledger: number) {
    return {
      accountingAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: { code: string; name: string; type: string } }) =>
          Promise.resolve({ id: `acc-${data.code}`, ...data }),
        ),
      },
      journalEntry: {
        create: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
      },
      journalEntryLine: {
        aggregate: jest.fn(({ where }: { where: { direction: string } }) =>
          Promise.resolve({ _sum: { amount: new Prisma.Decimal(where.direction === 'DEBIT' ? Math.max(ledger, 0) : Math.max(-ledger, 0)) } }),
        ),
      },
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ moneyAccountsSplitAt: new Date('2026-10-01') }) },
      financialAccount: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve({ id: where.id, name: 'Caja USD', accountingAccount: { id: `acc-fa:${where.id}`, name: 'Caja USD' } }),
        ),
      },
    };
  }

  it('books debit Caja / credit Ganancia por Diferencia de Cambio when the rate went up', async () => {
    const db = dbWithAccounts(100000);

    await runInTenant(db, () =>
      new AccountingService().postExchangeRateRevaluation({
        financialAccountId: 'fa-1',
        currentBalance: 100,
        previousRate: 1000,
        newRate: 1100,
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.description).toBe('Ganancia por diferencia de cambio - Caja USD');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-fa:fa-1', direction: 'DEBIT', amount: 10000 },
      { accountId: 'acc-4.2.05', direction: 'CREDIT', amount: 10000 },
    ]);
  });

  it('books debit Pérdida por Diferencia de Cambio / credit Caja when the rate went down', async () => {
    const db = dbWithAccounts(110000);

    await runInTenant(db, () =>
      new AccountingService().postExchangeRateRevaluation({
        financialAccountId: 'fa-1',
        currentBalance: 100,
        previousRate: 1100,
        newRate: 1000,
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-5.1.06', direction: 'DEBIT', amount: 10000 },
      { accountId: 'acc-fa:fa-1', direction: 'CREDIT', amount: 10000 },
    ]);
  });

  it('lleva la cuenta a saldo × cotización nueva aunque algo haya entrado a otra cotización', async () => {
    // 100 USD a 1000 = 100.000, y entraron 10 USD asentados a 1200 = 12.000.
    const db = dbWithAccounts(112000);

    await runInTenant(db, () =>
      new AccountingService().postExchangeRateRevaluation({
        financialAccountId: 'fa-1',
        currentBalance: 110,
        previousRate: 1000,
        newRate: 1100,
      }),
    );

    // 110 × 1100 = 121.000 - 112.000
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-fa:fa-1', direction: 'DEBIT', amount: 9000 },
      { accountId: 'acc-4.2.05', direction: 'CREDIT', amount: 9000 },
    ]);
  });

  it('skips posting when the account is already at that value', async () => {
    const db = dbWithAccounts(100000);

    const result = await runInTenant(db, () =>
      new AccountingService().postExchangeRateRevaluation({
        financialAccountId: 'fa-1',
        currentBalance: 100,
        previousRate: 1000,
        newRate: 1000,
      }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it('la primera revaluación asienta el valor que nunca se valuó contra Saldos Iniciales, no como ganancia', async () => {
    const db = dbWithAccounts(0);

    await runInTenant(db, () =>
      new AccountingService().postExchangeRateRevaluation({
        financialAccountId: 'fa-1',
        currentBalance: 100,
        previousRate: null,
        newRate: 1000,
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.description).toBe('Valuación inicial en pesos - Caja USD');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-fa:fa-1', direction: 'DEBIT', amount: 100000 },
      { accountId: 'acc-3.1.02', direction: 'CREDIT', amount: 100000 },
    ]);
  });
});

describe('AccountingService.postInflationAdjustmentJournalEntry', () => {
  it('books debit Pérdida / credit Ajuste de Capital for a positive (loss) RECPAM', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postInflationAdjustmentJournalEntry({
        inflationAdjustmentId: 'adj-1',
        recpamAmount: 239.2,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(expect.arrayContaining(['5.1.04', '3.1.01']));
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.inflationAdjustmentId).toBe('adj-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-5.1.04', direction: 'DEBIT', amount: 239.2 },
      { accountId: 'acc-3.1.01', direction: 'CREDIT', amount: 239.2 },
    ]);
  });

  it('creates the Ajuste de Capital account as non-monetary, never the isMonetary=true default', async () => {
    // Regression: this EQUITY account is one of the 3 types InflationAdjustmentService's
    // RECPAM calc treats as monetary when isMonetary=true (see MONETARY_TYPES). Left at
    // the schema default, the balance this same entry leaves would get swept into the
    // NEXT period's net monetary position - a capital adjustment must never do that.
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postInflationAdjustmentJournalEntry({ inflationAdjustmentId: 'adj-1', recpamAmount: 239.2 }),
    );

    expect(db._created.find((a) => a.code === '3.1.01')?.isMonetary).toBe(false);
  });

  it('books debit Ajuste de Capital / credit Ganancia for a negative (gain) RECPAM', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postInflationAdjustmentJournalEntry({
        inflationAdjustmentId: 'adj-2',
        recpamAmount: -50,
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-3.1.01', direction: 'DEBIT', amount: 50 },
      { accountId: 'acc-4.2.03', direction: 'CREDIT', amount: 50 },
    ]);
  });

  it('skips posting entirely for a RECPAM of exactly zero', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postInflationAdjustmentJournalEntry({ inflationAdjustmentId: 'adj-3', recpamAmount: 0 }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService.getTrialBalance with a date range', () => {
  it('restricts the underlying groupBy to the given range when from/to are provided', async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const db = {
      accountingAccount: { findMany: jest.fn().mockResolvedValue([]) },
      journalEntryLine: { groupBy },
    };
    const service = new AccountingService();
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-09-01T00:00:00Z');

    await runInTenant(db, () => service.getTrialBalance(from, to));

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { journalEntry: { date: { gte: from, lte: to } } } }),
    );
  });

  it('omits the date filter entirely when neither from nor to is given (unchanged behavior)', async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const db = {
      accountingAccount: { findMany: jest.fn().mockResolvedValue([]) },
      journalEntryLine: { groupBy },
    };
    const service = new AccountingService();

    await runInTenant(db, () => service.getTrialBalance());

    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });
});

describe('AccountingService.postPurchaseCreditNoteJournalEntry', () => {
  it('books debit Proveedores / credit IVA Crédito Fiscal + Mercaderías, balanced', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postPurchaseCreditNoteJournalEntry({
        purchaseCreditNoteId: 'pcn-1',
        subtotal: 100,
        taxTotal: 21,
        total: 121,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(
      expect.arrayContaining(['2.1.05', '1.1.05', '1.1.04']),
    );
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.purchaseCreditNoteId).toBe('pcn-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-2.1.05', direction: 'DEBIT', amount: 121 },
      { accountId: 'acc-1.1.05', direction: 'CREDIT', amount: 21 },
      { accountId: 'acc-1.1.04', direction: 'CREDIT', amount: 100 },
    ]);
  });

  it('omits the IVA Crédito Fiscal line entirely when taxTotal is zero', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postPurchaseCreditNoteJournalEntry({
        purchaseCreditNoteId: 'pcn-2',
        subtotal: 100,
        taxTotal: 0,
        total: 100,
      }),
    );

    expect(db._created.some((a) => a.code === '1.1.05')).toBe(false);
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-2.1.05', direction: 'DEBIT', amount: 100 },
      { accountId: 'acc-1.1.04', direction: 'CREDIT', amount: 100 },
    ]);
  });

  it('omits the Mercaderías line when subtotal is zero (a pure-tax credit note)', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postPurchaseCreditNoteJournalEntry({
        purchaseCreditNoteId: 'pcn-3',
        subtotal: 0,
        taxTotal: 21,
        total: 21,
      }),
    );

    expect(db._created.some((a) => a.code === '1.1.04')).toBe(false);
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-2.1.05', direction: 'DEBIT', amount: 21 },
      { accountId: 'acc-1.1.05', direction: 'CREDIT', amount: 21 },
    ]);
  });

  it('skips posting entirely for a zero-total credit note', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postPurchaseCreditNoteJournalEntry({
        purchaseCreditNoteId: 'pcn-4',
        subtotal: 0,
        taxTotal: 0,
        total: 0,
      }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it('stays balanced when subtotal/taxTotal carry fractional cents (rounding edge case)', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    // 33.33 credited at 21% IVA -> taxTotal 6.9993, not a clean 2-decimal
    // number. AccountingService trusts whatever subtotal/taxTotal/total the
    // composition root computed (PurchaseCreditNotesService) rather than
    // re-deriving them - this proves the balance check and the emitted
    // line amounts survive a non-2-decimal input intact.
    await runInTenant(db, () =>
      service.postPurchaseCreditNoteJournalEntry({
        purchaseCreditNoteId: 'pcn-5',
        subtotal: '33.33',
        taxTotal: '6.9993',
        total: '40.3293',
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data as { direction: string; amount: number }[];
    const debit = lines.filter((l) => l.direction === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const credit = lines.filter((l) => l.direction === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    expect(debit).toBeCloseTo(credit, 8);
    expect(debit).toBeCloseTo(40.3293, 8);
  });
});

describe('AccountingService.reverseSupplierReturnAgainstPayable', () => {
  it('books debit Proveedores / credit Mercaderías for a return against an already-invoiced receipt', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.reverseSupplierReturnAgainstPayable({ supplierReturnId: 'return-2', amount: 250 }),
    );

    expect(db._created.map((a) => a.code)).toEqual(expect.arrayContaining(['2.1.05', '1.1.04']));
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.supplierReturnId).toBe('return-2');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-2.1.05', direction: 'DEBIT', amount: 250 },
      { accountId: 'acc-1.1.04', direction: 'CREDIT', amount: 250 },
    ]);
  });

  it('skips posting entirely for a zero amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.reverseSupplierReturnAgainstPayable({ supplierReturnId: 'return-3', amount: 0 }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService rounding edge cases (fractional cents)', () => {
  it('postInvoiceJournalEntry stays balanced with a non-2-decimal taxTotal', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postInvoiceJournalEntry({
        invoiceId: 'inv-round-1',
        subtotal: '33.33',
        taxTotal: '6.9993',
        total: '40.3293',
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data as { direction: string; amount: number }[];
    const debit = lines.filter((l) => l.direction === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const credit = lines.filter((l) => l.direction === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    expect(debit).toBeCloseTo(credit, 8);
    expect(debit).toBeCloseTo(40.3293, 8);
  });

  it('postPurchaseInvoiceJournalEntry stays balanced when GRNI/expense/IVA/percepciones all carry fractional cents', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postPurchaseInvoiceJournalEntry({
        purchaseInvoiceId: 'pinv-round-1',
        grniClearedAmount: '12.345',
        nonGrniAmount: '7.655',
        ivaCredito: '4.2',
        percepciones: [{ concept: 'IIBB', amount: '0.005' }],
        total: '24.205',
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data as { direction: string; amount: number }[];
    const debit = lines.filter((l) => l.direction === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const credit = lines.filter((l) => l.direction === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    expect(debit).toBeCloseTo(credit, 8);
    expect(credit).toBeCloseTo(24.205, 8);
  });

  it('postSupplierPaymentJournalEntry stays balanced when cash + several withheld amounts carry fractional cents', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postSupplierPaymentJournalEntry({
        money: { financialAccountId: 'fa-1' }, supplierPaymentId: 'pay-round-1',
        amount: '99.99',
        withholdings: [
          { taxType: 'GROSS_INCOME', amount: '3.0033' },
          { taxType: 'GROSS_INCOME', amount: '1.4967' },
        ],
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data as {
      accountId: string;
      direction: string;
      amount: number;
    }[];
    const debit = lines.filter((l) => l.direction === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const credit = lines.filter((l) => l.direction === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    // 99.99 cash + (3.0033 + 1.4967 = 4.5) withheld = 104.49 cancelled.
    expect(debit).toBeCloseTo(104.49, 8);
    expect(debit).toBeCloseTo(credit, 8);
    // The two GROSS_INCOME lines aggregate into a single 2.1.08 credit -
    // confirms the sum doesn't drift when combining two fractional-cent
    // amounts that individually don't round cleanly.
    const withheldLine = lines.find((l) => l.accountId === 'acc-2.1.08');
    expect(withheldLine?.amount).toBeCloseTo(4.5, 8);
  });

  it('postPurchaseCreditNoteJournalEntry stays balanced with a non-2-decimal taxTotal', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postPurchaseCreditNoteJournalEntry({
        purchaseCreditNoteId: 'pcn-round-1',
        subtotal: '16.66',
        taxTotal: '3.4986',
        total: '20.1586',
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data as { direction: string; amount: number }[];
    const debit = lines.filter((l) => l.direction === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const credit = lines.filter((l) => l.direction === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    expect(debit).toBeCloseTo(credit, 8);
    expect(debit).toBeCloseTo(20.1586, 8);
  });
});

describe('AccountingService - una cuenta contable por cuenta de dinero', () => {
  type Fa = {
    id: string;
    name: string;
    provider: string;
    currencyId: string | null;
    currentBalance: Prisma.Decimal;
    lastRevaluationRate: Prisma.Decimal | null;
    accountingAccount: { id: string; code: string } | null;
  };

  /** Base en memoria para ensureMoneyAccounts: "Caja" (1.1.03) con un saldo,
   * las cuentas de dinero dadas, y todo lo que se crea queda registrado. */
  function makeMoneyDb(opts: {
    legacyBalance: number;
    accounts: Fa[];
    split?: boolean;
    existingMoneyCodes?: string[];
    /** Lo que "Caja" registró por cobros/pagos sin cuenta de dinero ni cheque. */
    unassignedInCaja?: number;
    portfolioChecks?: number;
    ownIssuedChecks?: number;
  }) {
    const accounts = new Map(opts.accounts.map((a) => [a.id, { ...a }]));
    const codes = [...(opts.existingMoneyCodes ?? [])];
    const sum = (value: number | undefined) => Promise.resolve({ _sum: { amount: value ? new Prisma.Decimal(value) : null } });
    const db = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      check: {
        aggregate: jest.fn(({ where }: { where: { kind: string } }) =>
          sum(where.kind === 'OWN' ? opts.ownIssuedChecks : opts.portfolioChecks),
        ),
      },
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue(opts.split ? { moneyAccountsSplitAt: new Date('2026-10-01') } : null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      accountingAccount: {
        findFirst: jest.fn(({ where }: { where: { code: string } }) =>
          Promise.resolve(where.code === '1.1.03' ? { id: 'acc-caja', code: '1.1.03' } : null),
        ),
        findMany: jest.fn(({ where }: { where: { code: { startsWith: string } } }) =>
          Promise.resolve(codes.filter((code) => code.startsWith(where.code.startsWith)).map((code) => ({ code }))),
        ),
        create: jest.fn(({ data }: { data: { code: string; name: string } }) => {
          codes.push(data.code);
          return Promise.resolve({ id: `acc-${data.code}`, ...data });
        }),
      },
      journalEntryLine: {
        aggregate: jest.fn(({ where }: { where: { direction: string; journalEntry?: unknown } }) => {
          const balance = where.journalEntry ? (opts.unassignedInCaja ?? 0) : opts.legacyBalance;
          return Promise.resolve({
            _sum: { amount: new Prisma.Decimal(where.direction === 'DEBIT' ? Math.max(balance, 0) : Math.max(-balance, 0)) },
          });
        }),
      },
      financialAccount: {
        findMany: jest.fn(() => Promise.resolve([...accounts.values()])),
        findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(accounts.get(where.id) ?? null)),
        findFirst: jest.fn(({ where }: { where: { provider?: string; name?: string } }) =>
          Promise.resolve([...accounts.values()].find((a) => (where.provider ? a.provider === where.provider : a.name === where.name)) ?? null),
        ),
        create: jest.fn(({ data }: { data: { name: string; provider: string } }) => {
          const created: Fa = {
            id: `fa-${data.provider.toLowerCase()}`,
            name: data.name,
            provider: data.provider,
            currencyId: null,
            currentBalance: new Prisma.Decimal(0),
            lastRevaluationRate: null,
            accountingAccount: null,
          };
          accounts.set(created.id, created);
          return Promise.resolve(created);
        }),
        update: jest.fn(({ where, data }: { where: { id: string }; data: { accountingAccountId?: string } }) => {
          const account = accounts.get(where.id);
          if (account && data.accountingAccountId) {
            account.accountingAccount = { id: data.accountingAccountId, code: data.accountingAccountId.replace('acc-', '') };
          }
          return Promise.resolve(account);
        }),
      },
      financialTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      journalEntry: { create: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }) },
    };
    return db;
  }

  const fa = (id: string, name: string, balance: number, extra: Partial<Fa> = {}): Fa => ({
    id,
    name,
    provider: 'BANK',
    currencyId: null,
    currentBalance: new Prisma.Decimal(balance),
    lastRevaluationRate: null,
    accountingAccount: null,
    ...extra,
  });

  it('reclasifica "Caja": cada cuenta de dinero a su cuenta 1.1.03.NN y lo que sobra a "Cobranzas a depositar"', async () => {
    const db = makeMoneyDb({
      legacyBalance: 1500,
      accounts: [
        fa('fa-bank', 'Banco Galicia', 600),
        // 10 USD revaluados a 20 = 200 en pesos.
        fa('fa-usd', 'Caja USD', 10, { currencyId: 'usd', lastRevaluationRate: new Prisma.Decimal(20) }),
      ],
    });

    await runInTenant(db, () => new AccountingService().ensureMoneyAccounts());

    expect(db.$executeRaw).toHaveBeenCalled();
    const entry = (db.journalEntry.create as jest.Mock).mock.calls[0][0].data;
    expect(entry.description).toMatch(/Reclasificación/);
    expect(entry.lines.createMany.data).toEqual(
      expect.arrayContaining([
        { accountId: 'acc-1.1.03.01', direction: 'DEBIT', amount: 600 },
        { accountId: 'acc-1.1.03.02', direction: 'DEBIT', amount: 200 },
        { accountId: 'acc-1.1.03.03', direction: 'DEBIT', amount: 700 },
        { accountId: 'acc-caja', direction: 'CREDIT', amount: 1500 },
      ]),
    );
    // "Cobranzas a depositar" también muestra esos 700 en Tesorería.
    expect(db.financialAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Cobranzas a depositar', provider: 'PENDING_DEPOSIT' }),
    });
    expect(db.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ financialAccountId: 'fa-pending_deposit', amount: new Prisma.Decimal(700) }),
    });
    expect(db.tenantSettings.upsert).toHaveBeenCalled();
  });

  it('si las cuentas tienen más que "Caja", la diferencia va contra Saldos Iniciales de Cuentas de Dinero', async () => {
    const db = makeMoneyDb({ legacyBalance: 100, accounts: [fa('fa-bank', 'Banco Galicia', 400)] });

    await runInTenant(db, () => new AccountingService().ensureMoneyAccounts());

    const lines = (db.journalEntry.create as jest.Mock).mock.calls[0][0].data.lines.createMany.data;
    expect(lines).toEqual(
      expect.arrayContaining([
        { accountId: 'acc-1.1.03.01', direction: 'DEBIT', amount: 400 },
        { accountId: 'acc-3.1.02', direction: 'CREDIT', amount: 300 },
        { accountId: 'acc-caja', direction: 'CREDIT', amount: 100 },
      ]),
    );
    expect(db.financialTransaction.create).not.toHaveBeenCalled();
  });

  it('separa cada parte: cobros sin cuenta a "Cobranzas a depositar", cheques a sus cuentas y lo nunca asentado a Saldos Iniciales', async () => {
    const db = makeMoneyDb({
      legacyBalance: 1000,
      accounts: [fa('fa-bank', 'Banco Galicia', 1200)],
      // 500 cobrados - 100 pagados sin cuenta.
      unassignedInCaja: 400,
      portfolioChecks: 300,
      ownIssuedChecks: 200,
    });

    await runInTenant(db, () => new AccountingService().ensureMoneyAccounts());

    expect(db.journalEntryLine.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: 'acc-caja',
          journalEntry: {
            OR: [
              { receipt: { financialAccountId: null, check: null } },
              { supplierPayment: { financialAccountId: null, check: null } },
            ],
          },
        }),
      }),
    );
    expect(db.check.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind: 'THIRD_PARTY', status: 'PORTFOLIO' } }),
    );
    const lines = (db.journalEntry.create as jest.Mock).mock.calls[0][0].data.lines.createMany.data;
    expect(lines).toHaveLength(6);
    expect(lines).toEqual(
      expect.arrayContaining([
        { accountId: 'acc-1.1.03.01', direction: 'DEBIT', amount: 1200 },
        { accountId: 'acc-1.1.07', direction: 'DEBIT', amount: 300 },
        { accountId: 'acc-2.1.10', direction: 'CREDIT', amount: 200 },
        { accountId: 'acc-1.1.03.02', direction: 'DEBIT', amount: 400 },
        // 1000 - (1200 + 400 + 300 - 200)
        { accountId: 'acc-3.1.02', direction: 'CREDIT', amount: 700 },
        { accountId: 'acc-caja', direction: 'CREDIT', amount: 1000 },
      ]),
    );
    expect(db.financialTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ financialAccountId: 'fa-pending_deposit', amount: new Prisma.Decimal(400) }),
    });
  });

  it('corre una sola vez por tenant', async () => {
    const db = makeMoneyDb({ legacyBalance: 1500, accounts: [fa('fa-bank', 'Banco', 600)], split: true });

    await runInTenant(db, () => new AccountingService().ensureMoneyAccounts());

    expect(db.journalEntry.create).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('un tenant sin movimientos ni cuentas no genera asiento, sólo queda marcado', async () => {
    const db = makeMoneyDb({ legacyBalance: 0, accounts: [] });

    await runInTenant(db, () => new AccountingService().ensureMoneyAccounts());

    expect(db.journalEntry.create).not.toHaveBeenCalled();
    expect(db.tenantSettings.upsert).toHaveBeenCalled();
  });

  it('una cuenta nueva toma el siguiente código libre 1.1.03.NN y su mismo nombre', async () => {
    const db = makeMoneyDb({
      legacyBalance: 0,
      accounts: [fa('fa-new', 'Banco Nación', 0)],
      split: true,
      existingMoneyCodes: ['1.1.03.01', '1.1.03.02'],
    });

    await runInTenant(db, () =>
      new AccountingService().postBankStatementAdjustmentJournalEntry({
        bankStatementLineId: 'line-1',
        financialAccountId: 'fa-new',
        kind: 'EXPENSE',
        amount: 50,
      }),
    );

    expect(db.accountingAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: '1.1.03.03', name: 'Banco Nación', type: 'ASSET' }),
    });
    expect(db.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'fa-new' },
      data: { accountingAccountId: 'acc-1.1.03.03' },
    });
  });

  it('asentar dinero sin haber reclasificado antes es un error de programación (no se asienta mal en silencio)', async () => {
    const db = makeMoneyDb({ legacyBalance: 0, accounts: [fa('fa-bank', 'Banco', 0)] });

    await expect(
      runInTenant(db, () =>
        new AccountingService().postReceiptJournalEntry({
          receiptId: 'receipt-1',
          amount: 100,
          money: { financialAccountId: 'fa-bank' },
        }),
      ),
    ).rejects.toThrow(/ensureMoneyAccounts/);
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('AccountingService - asientos de dinero nuevos', () => {
  function makeDb() {
    return {
      accountingAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }: { data: { code: string } }) => Promise.resolve({ id: `acc-${data.code}`, ...data })),
      },
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ moneyAccountsSplitAt: new Date('2026-10-01') }) },
      financialAccount: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve({ id: where.id, name: where.id, accountingAccount: { id: `acc-fa:${where.id}` } }),
        ),
      },
      journalEntry: { create: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }) },
    };
  }
  const linesOf = (db: ReturnType<typeof makeDb>) =>
    (db.journalEntry.create as jest.Mock).mock.calls[0][0].data.lines.createMany.data;

  it('transferencia: Debe destino / Haber origen', async () => {
    const db = makeDb();

    await runInTenant(db, () =>
      new AccountingService().postTransferJournalEntry({
        fromFinancialAccountId: 'fa-pending',
        toFinancialAccountId: 'fa-bank',
        amount: 900,
        description: 'Transferencia de Cobranzas a depositar a Banco',
      }),
    );

    expect(linesOf(db)).toEqual([
      { accountId: 'acc-fa:fa-bank', direction: 'DEBIT', amount: 900 },
      { accountId: 'acc-fa:fa-pending', direction: 'CREDIT', amount: 900 },
    ]);
  });

  it('saldo inicial de una cuenta nueva: contra Saldos Iniciales de Cuentas de Dinero', async () => {
    const db = makeDb();

    await runInTenant(db, () =>
      new AccountingService().postMoneyMovementJournalEntry({
        financialAccountId: 'fa-bank',
        amount: 5000,
        counterpart: { kind: 'OPENING_BALANCE' },
        description: 'Saldo inicial - Banco',
      }),
    );

    expect(linesOf(db)).toEqual([
      { accountId: 'acc-fa:fa-bank', direction: 'DEBIT', amount: 5000 },
      { accountId: 'acc-3.1.02', direction: 'CREDIT', amount: 5000 },
    ]);
  });

  it('concepto frecuente: crea su cuenta la primera vez (Aportes de Socios)', async () => {
    const db = makeDb();

    await runInTenant(db, () =>
      new AccountingService().postMoneyMovementJournalEntry({
        financialAccountId: 'fa-cash',
        amount: 3000,
        counterpart: { concept: 'PARTNER_CONTRIBUTIONS' },
        description: 'Aporte de socios - Caja 2',
      }),
    );

    expect(db.accountingAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: '3.1.10', name: 'Aportes de Socios', type: 'EQUITY' }),
    });
    expect(linesOf(db)).toEqual([
      { accountId: 'acc-fa:fa-cash', direction: 'DEBIT', amount: 3000 },
      { accountId: 'acc-3.1.10', direction: 'CREDIT', amount: 3000 },
    ]);
  });

  it('egreso manual: Debe la cuenta elegida / Haber la cuenta de dinero', async () => {
    const db = {
      ...makeDb(),
      accountingAccount: {
        ...makeDb().accountingAccount,
        findUnique: jest.fn().mockResolvedValue({ id: 'acc-expense', code: '5.1.03', financialAccount: null }),
      },
    };

    await runInTenant(db, () =>
      new AccountingService().postMoneyMovementJournalEntry({
        financialAccountId: 'fa-cash',
        amount: -300,
        counterpart: { accountId: 'acc-expense' },
        description: 'Pago de flete',
      }),
    );

    expect(linesOf(db as never)).toEqual([
      { accountId: 'acc-fa:fa-cash', direction: 'CREDIT', amount: 300 },
      { accountId: 'acc-expense', direction: 'DEBIT', amount: 300 },
    ]);
  });

  it('contra otra cuenta de dinero no: eso es una transferencia (movería un solo saldo de Tesorería)', async () => {
    const db = {
      ...makeDb(),
      accountingAccount: {
        ...makeDb().accountingAccount,
        findUnique: jest.fn().mockResolvedValue({ id: 'acc-bank', code: '1.1.03.01', financialAccount: { id: 'fa-bank' } }),
      },
    };

    await expect(
      runInTenant(db, () =>
        new AccountingService().postMoneyMovementJournalEntry({
          financialAccountId: 'fa-cash',
          amount: -300,
          counterpart: { accountId: 'acc-bank' },
          description: 'Retiro',
        }),
      ),
    ).rejects.toThrow(/Transferencia entre cuentas/);
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it('depósito de cheque: entra al banco y sale de Cheques en Cartera', async () => {
    const db = makeDb();

    await runInTenant(db, () =>
      new AccountingService().postCheckDepositJournalEntry({ checkId: 'chk-1', financialAccountId: 'fa-bank', amount: 1000 }),
    );

    expect(linesOf(db)).toEqual([
      { accountId: 'acc-fa:fa-bank', direction: 'DEBIT', amount: 1000 },
      { accountId: 'acc-1.1.07', direction: 'CREDIT', amount: 1000 },
    ]);
  });

  it('cheque propio cobrado: cancela Cheques Diferidos a Pagar y sale del banco', async () => {
    const db = makeDb();

    await runInTenant(db, () =>
      new AccountingService().postOwnCheckClearedJournalEntry({ checkId: 'chk-2', financialAccountId: 'fa-bank', amount: 400 }),
    );

    expect(linesOf(db)).toEqual([
      { accountId: 'acc-2.1.10', direction: 'DEBIT', amount: 400 },
      { accountId: 'acc-fa:fa-bank', direction: 'CREDIT', amount: 400 },
    ]);
  });

  it('cobro con cheque de tercero: va a Cheques en Cartera, no a una cuenta de dinero', async () => {
    const db = makeDb();

    await runInTenant(db, () =>
      new AccountingService().postReceiptJournalEntry({ receiptId: 'r-1', amount: 300, money: { kind: 'CHECKS_IN_PORTFOLIO' } }),
    );

    expect(linesOf(db)).toEqual([
      { accountId: 'acc-1.1.07', direction: 'DEBIT', amount: 300 },
      { accountId: 'acc-1.1.02', direction: 'CREDIT', amount: 300 },
    ]);
  });

  it('pago con cheque propio diferido: la deuda pasa a Cheques Diferidos a Pagar', async () => {
    const db = makeDb();

    await runInTenant(db, () =>
      new AccountingService().postSupplierPaymentJournalEntry({
        supplierPaymentId: 'pay-1',
        amount: 500,
        money: { kind: 'OWN_CHECKS_PAYABLE' },
      }),
    );

    expect(linesOf(db)).toEqual([
      { accountId: 'acc-2.1.05', direction: 'DEBIT', amount: 500 },
      { accountId: 'acc-2.1.10', direction: 'CREDIT', amount: 500 },
    ]);
  });

  it('rechazo de un cheque endosado: vuelve a ser deuda con el proveedor', async () => {
    const db = makeDb();

    await runInTenant(db, () =>
      new AccountingService().postCheckRejectionJournalEntry({
        checkId: 'chk-3',
        amount: 1000,
        money: { kind: 'ACCOUNTS_PAYABLE' },
      }),
    );

    expect(linesOf(db)).toEqual([
      { accountId: 'acc-1.1.02', direction: 'DEBIT', amount: 1000 },
      { accountId: 'acc-2.1.05', direction: 'CREDIT', amount: 1000 },
    ]);
  });
});
