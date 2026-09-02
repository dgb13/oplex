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
      service.postSupplierPaymentJournalEntry({ supplierPaymentId: 'pay-1', amount: 500 }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.supplierPaymentId).toBe('pay-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-2.1.05', direction: 'DEBIT', amount: 500 },
      { accountId: 'acc-1.1.03', direction: 'CREDIT', amount: 500 },
    ]);
  });

  it('skips posting entirely for a zero amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postSupplierPaymentJournalEntry({ supplierPaymentId: 'pay-2', amount: 0 }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
  });

  it('debits Proveedores for cash + withheld, credits Caja for cash only, and one liability account per taxType', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postSupplierPaymentJournalEntry({
        supplierPaymentId: 'pay-3',
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
    expect(lines).toContainEqual({ accountId: 'acc-1.1.03', direction: 'CREDIT', amount: 700 });
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
        supplierPaymentId: 'pay-4',
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
      service.postReceiptJournalEntry({ receiptId: 'receipt-1', amount: 300 }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.receiptId).toBe('receipt-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-1.1.03', direction: 'DEBIT', amount: 300 },
      { accountId: 'acc-1.1.02', direction: 'CREDIT', amount: 300 },
    ]);
  });

  it('skips posting entirely for a zero amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postReceiptJournalEntry({ receiptId: 'receipt-2', amount: 0 }),
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
        bankStatementLineId: 'line-1',
        kind: 'EXPENSE',
        amount: 850,
      }),
    );

    expect(db._created.map((a) => a.code)).toEqual(expect.arrayContaining(['5.1.03', '1.1.03']));
    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.bankStatementLineId).toBe('line-1');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-5.1.03', direction: 'DEBIT', amount: 850 },
      { accountId: 'acc-1.1.03', direction: 'CREDIT', amount: 850 },
    ]);
  });

  it('books debit Caja / credit Intereses Ganados for an INCOME line', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    await runInTenant(db, () =>
      service.postBankStatementAdjustmentJournalEntry({
        bankStatementLineId: 'line-2',
        kind: 'INCOME',
        amount: 120,
      }),
    );

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.lines.createMany.data).toEqual([
      { accountId: 'acc-1.1.03', direction: 'DEBIT', amount: 120 },
      { accountId: 'acc-4.2.02', direction: 'CREDIT', amount: 120 },
    ]);
  });

  it('skips posting entirely for a zero or negative amount', async () => {
    const db = dbWithAccounts();
    const service = new AccountingService();

    const result = await runInTenant(db, () =>
      service.postBankStatementAdjustmentJournalEntry({
        bankStatementLineId: 'line-3',
        kind: 'EXPENSE',
        amount: 0,
      }),
    );

    expect(result).toBeUndefined();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
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
        supplierPaymentId: 'pay-round-1',
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
