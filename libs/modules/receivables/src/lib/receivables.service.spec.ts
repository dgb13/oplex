import { NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { ReceivablesService } from './receivables.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const ASOF = new Date('2026-07-20T00:00:00.000Z');
const daysAgo = (n: number) => new Date(ASOF.getTime() - n * 24 * 60 * 60 * 1000);

describe('ReceivablesService.getAgingReport', () => {
  it('buckets each open invoice by days overdue and totals per customer', async () => {
    const invoices = [
      // customer-1: one current, one 10 days overdue
      { customerId: 'customer-1', customer: { name: 'Acme' }, balanceDue: new Prisma.Decimal(100), dueDate: daysAgo(-5) },
      { customerId: 'customer-1', customer: { name: 'Acme' }, balanceDue: new Prisma.Decimal(50), dueDate: daysAgo(10) },
      // customer-2: one 45 days overdue, one 95 days overdue, one with no due date
      { customerId: 'customer-2', customer: { name: 'Beta' }, balanceDue: new Prisma.Decimal(200), dueDate: daysAgo(45) },
      { customerId: 'customer-2', customer: { name: 'Beta' }, balanceDue: new Prisma.Decimal(300), dueDate: daysAgo(95) },
      { customerId: 'customer-2', customer: { name: 'Beta' }, balanceDue: new Prisma.Decimal(10), dueDate: null },
    ];
    const db = { invoice: { findMany: jest.fn().mockResolvedValue(invoices) } };
    const service = new ReceivablesService();

    const report = await runInTenant(db, () => service.getAgingReport(ASOF));

    expect(db.invoice.findMany).toHaveBeenCalledWith({
      where: { balanceDue: { gt: 0 } },
      include: { customer: true },
    });

    const acme = report.find((r) => r.customerId === 'customer-1');
    expect(acme?.current.toNumber()).toBe(100);
    expect(acme?.days1to30.toNumber()).toBe(50);
    expect(acme?.totalOutstanding.toNumber()).toBe(150);

    const beta = report.find((r) => r.customerId === 'customer-2');
    expect(beta?.days31to60.toNumber()).toBe(200);
    expect(beta?.days90Plus.toNumber()).toBe(300);
    expect(beta?.current.toNumber()).toBe(10); // no dueDate -> current
    expect(beta?.totalOutstanding.toNumber()).toBe(510);

    // sorted by totalOutstanding desc
    expect(report[0].customerId).toBe('customer-2');
  });
});

describe('ReceivablesService.getCalendarEntries', () => {
  it('maps open invoices with a dueDate in range to CalendarEntry', async () => {
    const invoice = {
      id: 'inv-1',
      customerName: 'Panadería La Espiga',
      balanceDue: new Prisma.Decimal(184500),
      dueDate: new Date('2026-09-16T00:00:00.000Z'),
      documentLetter: 'A',
      pointOfSale: '0001',
      number: '00000234',
    };
    const db = { invoice: { findMany: jest.fn().mockResolvedValue([invoice]) } };
    const service = new ReceivablesService();

    const entries = await runInTenant(db, () =>
      service.getCalendarEntries(new Date('2026-09-01'), new Date('2026-09-30')),
    );

    expect(db.invoice.findMany).toHaveBeenCalledWith({
      where: { balanceDue: { gt: 0 }, dueDate: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30') } },
    });
    expect(entries).toEqual([
      {
        id: 'inv-1',
        source: 'collect',
        title: 'Panadería La Espiga',
        date: '2026-09-16T00:00:00.000Z',
        amount: 184500,
        flow: 'in',
        ref: 'A 0001-00000234',
        editable: false,
        link: { module: 'invoice', id: 'inv-1' },
      },
    ]);
  });
});

describe('ReceivablesService.listCustomerBalances', () => {
  it('joins the grouped balances back to customer name/credit limit', async () => {
    const db = {
      invoice: {
        groupBy: jest.fn().mockResolvedValue([
          { customerId: 'customer-1', _sum: { balanceDue: new Prisma.Decimal(150) } },
        ]),
      },
      company: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'customer-1', name: 'Acme', creditLimit: new Prisma.Decimal(1000) }]),
      },
    };
    const service = new ReceivablesService();

    const balances = await runInTenant(db, () => service.listCustomerBalances());

    expect(balances).toEqual([
      {
        customerId: 'customer-1',
        customerName: 'Acme',
        creditLimit: expect.any(Prisma.Decimal),
        outstanding: expect.any(Prisma.Decimal),
        availableCredit: expect.any(Prisma.Decimal),
      },
    ]);
    expect(balances[0].availableCredit.toNumber()).toBe(850);
  });

  it('skips the customer lookup entirely when nobody owes anything', async () => {
    const db = {
      invoice: { groupBy: jest.fn().mockResolvedValue([]) },
      company: { findMany: jest.fn() },
    };
    const service = new ReceivablesService();

    const balances = await runInTenant(db, () => service.listCustomerBalances());

    expect(balances).toEqual([]);
    expect(db.company.findMany).not.toHaveBeenCalled();
  });
});

describe('ReceivablesService.getCustomerStatement', () => {
  it('throws when the customer does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ReceivablesService();

    await expect(runInTenant(db, () => service.getCustomerStatement('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  function baseDb(overrides: {
    openInvoices?: unknown[];
    invoices?: unknown[];
    creditNotes?: unknown[];
    receipts?: unknown[];
  }) {
    // invoice.findMany is called twice: once for the open-balance metrics,
    // once for the full ledger - mockResolvedValueOnce twice lets each
    // call return a different fixture.
    const findMany = jest.fn();
    findMany.mockResolvedValueOnce(overrides.openInvoices ?? []);
    findMany.mockResolvedValueOnce(overrides.invoices ?? []);
    return {
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'customer-1', name: 'Acme', creditLimit: new Prisma.Decimal(500) }),
      },
      invoice: { findMany },
      creditNote: { findMany: jest.fn().mockResolvedValue(overrides.creditNotes ?? []) },
      receipt: { findMany: jest.fn().mockResolvedValue(overrides.receipts ?? []) },
    };
  }

  it('splits totalOutstanding into vencido/a vencer from the open-balance snapshot', async () => {
    const asOfDaysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    const db = baseDb({
      openInvoices: [
        { balanceDue: new Prisma.Decimal(100), dueDate: asOfDaysAgo(5) }, // vencida
        { balanceDue: new Prisma.Decimal(40), dueDate: asOfDaysAgo(-10) }, // a vencer
        { balanceDue: new Prisma.Decimal(10), dueDate: null }, // sin vencimiento -> a vencer
      ],
    });
    const service = new ReceivablesService();

    const statement = await runInTenant(db, () => service.getCustomerStatement('customer-1'));

    expect(statement.totalOutstanding.toNumber()).toBe(150);
    expect(statement.totalOverdue.toNumber()).toBe(100);
    expect(statement.totalNotYetDue.toNumber()).toBe(50);
  });

  it('mergea Factura/NC/Recibo en orden cronológico con Debe/Haber/Saldo Acumulado correctos', async () => {
    const invoiceRef = { documentLetter: 'A', pointOfSale: '0001', number: '00000001' };
    const db = baseDb({
      invoices: [
        {
          id: 'inv-1',
          issueDate: new Date('2026-08-01'),
          ...invoiceRef,
          dueDate: new Date('2026-08-31'),
          total: new Prisma.Decimal(1000),
          balanceDue: new Prisma.Decimal(0),
          status: 'PAID',
        },
      ],
      creditNotes: [
        {
          id: 'nc-1',
          issueDate: new Date('2026-08-05'),
          documentLetter: 'A',
          pointOfSale: '0001',
          number: '00000001',
          total: new Prisma.Decimal(200),
          invoice: invoiceRef,
        },
      ],
      receipts: [
        {
          id: 'rec-1',
          paidAt: new Date('2026-08-10'),
          method: 'Transferencia',
          amount: new Prisma.Decimal(800),
          invoice: invoiceRef,
        },
      ],
    });
    const service = new ReceivablesService();

    const statement = await runInTenant(db, () => service.getCustomerStatement('customer-1'));

    expect(statement.entries.map((e) => e.type)).toEqual(['INVOICE', 'CREDIT_NOTE', 'RECEIPT']);

    const [invoiceEntry, creditNoteEntry, receiptEntry] = statement.entries;
    expect(invoiceEntry.debe.toNumber()).toBe(1000);
    expect(invoiceEntry.balance.toNumber()).toBe(1000);
    expect(invoiceEntry.status).toBe('Totalmente imputado');

    expect(creditNoteEntry.haber.toNumber()).toBe(200);
    expect(creditNoteEntry.balance.toNumber()).toBe(800);

    expect(receiptEntry.haber.toNumber()).toBe(800);
    expect(receiptEntry.balance.toNumber()).toBe(0);

    // Invariante: el saldo acumulado final cierra contra balanceDue real
    // (0 en este caso, la factura quedó PAID).
    expect(statement.entries.at(-1)?.balance.toNumber()).toBe(0);
  });

  it('pendingOnly deja sólo facturas con saldo pendiente, sin tocar el saldo acumulado ya calculado', async () => {
    const invoiceRef = { documentLetter: 'A', pointOfSale: '0001', number: '00000001' };
    const db = baseDb({
      invoices: [
        {
          id: 'inv-1',
          issueDate: new Date('2026-08-01'),
          ...invoiceRef,
          dueDate: null,
          total: new Prisma.Decimal(1000),
          balanceDue: new Prisma.Decimal(0),
          status: 'PAID',
        },
        {
          id: 'inv-2',
          issueDate: new Date('2026-08-02'),
          documentLetter: 'A',
          pointOfSale: '0001',
          number: '00000002',
          dueDate: null,
          total: new Prisma.Decimal(500),
          balanceDue: new Prisma.Decimal(500),
          status: 'ISSUED',
        },
      ],
      receipts: [
        {
          id: 'rec-1',
          // A propósito después de inv-2 (08-02) en la fecha.
          paidAt: new Date('2026-08-03'),
          method: 'Efectivo',
          amount: new Prisma.Decimal(1000),
          invoice: invoiceRef,
        },
      ],
    });
    const service = new ReceivablesService();

    const statement = await runInTenant(db, () =>
      service.getCustomerStatement('customer-1', { pendingOnly: true }),
    );

    expect(statement.entries).toHaveLength(1);
    expect(statement.entries[0].id).toBe('inv-2');
    // Saldo acumulado real al momento de esa fila (inv-1 1000 + inv-2 500 =
    // 1500 - rec-1 todavía no pasó, es del 08-03).
    expect(statement.entries[0].balance.toNumber()).toBe(1500);
  });
});

describe('ReceivablesService.listInvoicesBecomingOverdue', () => {
  it('queries the same pre-transition set that refreshOverdueStatuses is about to flip', async () => {
    const invoices = [
      { id: 'inv-1', customer: { name: 'Acme', email: 'acme@example.com' } },
    ];
    const db = { invoice: { findMany: jest.fn().mockResolvedValue(invoices) } };
    const service = new ReceivablesService();

    const result = await runInTenant(db, () => service.listInvoicesBecomingOverdue(ASOF));

    expect(db.invoice.findMany).toHaveBeenCalledWith({
      where: {
        balanceDue: { gt: 0 },
        dueDate: { lt: ASOF },
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });
    expect(result).toBe(invoices);
  });
});

describe('ReceivablesService.listInvoicesNeedingRecurringReminder', () => {
  it('queries already-OVERDUE invoices last reminded at or before the interval cutoff', async () => {
    const invoices = [{ id: 'inv-1', customer: { name: 'Acme', email: 'acme@example.com' } }];
    const db = { invoice: { findMany: jest.fn().mockResolvedValue(invoices) } };
    const service = new ReceivablesService();

    const result = await runInTenant(db, () =>
      service.listInvoicesNeedingRecurringReminder(7, ASOF),
    );

    expect(db.invoice.findMany).toHaveBeenCalledWith({
      where: {
        balanceDue: { gt: 0 },
        status: 'OVERDUE',
        OR: [{ lastOverdueReminderAt: null }, { lastOverdueReminderAt: { lte: daysAgo(7) } }],
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });
    expect(result).toBe(invoices);
  });
});

describe('ReceivablesService.markReminderSent', () => {
  it('stamps lastOverdueReminderAt on every invoice id given', async () => {
    const db = { invoice: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) } };
    const service = new ReceivablesService();

    await runInTenant(db, () => service.markReminderSent(['inv-1', 'inv-2'], ASOF));

    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['inv-1', 'inv-2'] } },
      data: { lastOverdueReminderAt: ASOF },
    });
  });

  it('skips the query entirely for an empty list', async () => {
    const db = { invoice: { updateMany: jest.fn() } };
    const service = new ReceivablesService();

    await runInTenant(db, () => service.markReminderSent([]));

    expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });
});

describe('ReceivablesService.refreshOverdueStatuses', () => {
  it('marks overdue invoices and reports how many changed', async () => {
    const db = { invoice: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) } };
    const service = new ReceivablesService();

    const result = await runInTenant(db, () => service.refreshOverdueStatuses(ASOF));

    expect(result).toEqual({ updated: 3 });
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: {
        balanceDue: { gt: 0 },
        dueDate: { lt: ASOF },
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      data: { status: 'OVERDUE' },
    });
  });
});
