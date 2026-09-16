import { NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { PayablesService } from './payables.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const ASOF = new Date('2026-07-20T00:00:00.000Z');
const daysAgo = (n: number) => new Date(ASOF.getTime() - n * 24 * 60 * 60 * 1000);

describe('PayablesService.getAgingReport', () => {
  it('buckets each open purchase invoice by days overdue and totals per supplier', async () => {
    const invoices = [
      { supplierId: 'supplier-1', supplier: { name: 'Sidex' }, balanceDue: new Prisma.Decimal(100), dueDate: daysAgo(-5) },
      { supplierId: 'supplier-1', supplier: { name: 'Sidex' }, balanceDue: new Prisma.Decimal(50), dueDate: daysAgo(10) },
      { supplierId: 'supplier-2', supplier: { name: 'Distribuidora' }, balanceDue: new Prisma.Decimal(200), dueDate: daysAgo(45) },
      { supplierId: 'supplier-2', supplier: { name: 'Distribuidora' }, balanceDue: new Prisma.Decimal(300), dueDate: daysAgo(95) },
      { supplierId: 'supplier-2', supplier: { name: 'Distribuidora' }, balanceDue: new Prisma.Decimal(10), dueDate: null },
    ];
    const db = { purchaseInvoice: { findMany: jest.fn().mockResolvedValue(invoices) } };
    const service = new PayablesService();

    const report = await runInTenant(db, () => service.getAgingReport(ASOF));

    expect(db.purchaseInvoice.findMany).toHaveBeenCalledWith({
      where: { balanceDue: { gt: 0 } },
      include: { supplier: true },
    });

    const sidex = report.find((r) => r.supplierId === 'supplier-1');
    expect(sidex?.current.toNumber()).toBe(100);
    expect(sidex?.days1to30.toNumber()).toBe(50);
    expect(sidex?.totalOutstanding.toNumber()).toBe(150);

    const distribuidora = report.find((r) => r.supplierId === 'supplier-2');
    expect(distribuidora?.days31to60.toNumber()).toBe(200);
    expect(distribuidora?.days90Plus.toNumber()).toBe(300);
    expect(distribuidora?.current.toNumber()).toBe(10); // no dueDate -> current
    expect(distribuidora?.totalOutstanding.toNumber()).toBe(510);

    // sorted by totalOutstanding desc
    expect(report[0].supplierId).toBe('supplier-2');
  });
});

describe('PayablesService.getCalendarEntries', () => {
  it('maps open purchase invoices with a dueDate in range to CalendarEntry', async () => {
    const invoice = {
      id: 'pi-1',
      supplierName: 'Distribuidora Sur S.A.',
      balanceDue: new Prisma.Decimal(92300),
      dueDate: new Date('2026-09-05T00:00:00.000Z'),
      supplierInvoiceNumber: 'OC-0088',
    };
    const db = { purchaseInvoice: { findMany: jest.fn().mockResolvedValue([invoice]) } };
    const service = new PayablesService();

    const entries = await runInTenant(db, () =>
      service.getCalendarEntries(new Date('2026-09-01'), new Date('2026-09-30')),
    );

    expect(db.purchaseInvoice.findMany).toHaveBeenCalledWith({
      where: { balanceDue: { gt: 0 }, dueDate: { gte: new Date('2026-09-01'), lte: new Date('2026-09-30') } },
    });
    expect(entries).toEqual([
      {
        id: 'pi-1',
        source: 'pay',
        title: 'Distribuidora Sur S.A.',
        date: '2026-09-05T00:00:00.000Z',
        amount: 92300,
        flow: 'out',
        ref: 'OC-0088',
        editable: false,
        link: { module: 'purchase-invoice', id: 'pi-1' },
      },
    ]);
  });
});

describe('PayablesService.listSupplierBalances', () => {
  it('joins the grouped balances back to supplier name', async () => {
    const db = {
      purchaseInvoice: {
        groupBy: jest.fn().mockResolvedValue([
          { supplierId: 'supplier-1', _sum: { balanceDue: new Prisma.Decimal(150) } },
        ]),
      },
      company: {
        findMany: jest.fn().mockResolvedValue([{ id: 'supplier-1', name: 'Sidex' }]),
      },
    };
    const service = new PayablesService();

    const balances = await runInTenant(db, () => service.listSupplierBalances());

    expect(balances).toEqual([
      { supplierId: 'supplier-1', supplierName: 'Sidex', outstanding: expect.any(Prisma.Decimal) },
    ]);
    expect(balances[0].outstanding.toNumber()).toBe(150);
  });

  it('skips the supplier lookup entirely when nobody is owed anything', async () => {
    const db = {
      purchaseInvoice: { groupBy: jest.fn().mockResolvedValue([]) },
      company: { findMany: jest.fn() },
    };
    const service = new PayablesService();

    const balances = await runInTenant(db, () => service.listSupplierBalances());

    expect(balances).toEqual([]);
    expect(db.company.findMany).not.toHaveBeenCalled();
  });
});

describe('PayablesService.getSupplierStatement', () => {
  function baseDb(overrides: {
    openInvoices?: unknown[];
    invoices?: unknown[];
    creditNotes?: unknown[];
    payments?: unknown[];
  }) {
    // purchaseInvoice.findMany is called twice: once for the open-balance
    // metrics, once for the full ledger - mockResolvedValueOnce twice lets
    // each call return a different fixture.
    const findMany = jest.fn();
    findMany.mockResolvedValueOnce(overrides.openInvoices ?? []);
    findMany.mockResolvedValueOnce(overrides.invoices ?? []);
    return {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'supplier-1', name: 'Sidex' }) },
      purchaseInvoice: { findMany },
      purchaseCreditNote: { findMany: jest.fn().mockResolvedValue(overrides.creditNotes ?? []) },
      supplierPayment: { findMany: jest.fn().mockResolvedValue(overrides.payments ?? []) },
    };
  }

  it('throws when the supplier does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new PayablesService();

    await expect(runInTenant(db, () => service.getSupplierStatement('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('splits totalOutstanding into vencido/a vencer from the open-balance snapshot', async () => {
    const asOfDaysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
    const db = baseDb({
      openInvoices: [
        { balanceDue: new Prisma.Decimal(100), dueDate: asOfDaysAgo(5) }, // vencida
        { balanceDue: new Prisma.Decimal(40), dueDate: asOfDaysAgo(-10) }, // a vencer
        { balanceDue: new Prisma.Decimal(10), dueDate: null }, // sin vencimiento -> a vencer
      ],
    });
    const service = new PayablesService();

    const statement = await runInTenant(db, () => service.getSupplierStatement('supplier-1'));

    expect(statement.totalOutstanding.toNumber()).toBe(150);
    expect(statement.totalOverdue.toNumber()).toBe(100);
    expect(statement.totalNotYetDue.toNumber()).toBe(50);
  });

  it('mergea Factura/NC/Pago en orden cronológico con Debe/Haber/Saldo Acumulado correctos', async () => {
    const db = baseDb({
      invoices: [
        {
          id: 'inv-1',
          supplierInvoiceDate: new Date('2026-08-01'),
          supplierInvoiceNumber: '0001-00000001',
          dueDate: new Date('2026-08-31'),
          total: new Prisma.Decimal(1000),
          balanceDue: new Prisma.Decimal(0), // saldada por el pago + la NC de abajo
          status: 'PAID',
        },
      ],
      creditNotes: [
        {
          id: 'nc-1',
          supplierCreditNoteDate: new Date('2026-08-05'),
          supplierCreditNoteNumber: 'NC-0001',
          total: new Prisma.Decimal(200),
          purchaseInvoice: { supplierInvoiceNumber: '0001-00000001' },
        },
      ],
      payments: [
        {
          id: 'pay-1',
          paidAt: new Date('2026-08-10'),
          method: 'Transferencia',
          amount: new Prisma.Decimal(700),
          withholdings: [{ amount: new Prisma.Decimal(100) }],
          purchaseInvoice: { supplierInvoiceNumber: '0001-00000001' },
        },
      ],
    });
    const service = new PayablesService();

    const statement = await runInTenant(db, () => service.getSupplierStatement('supplier-1'));

    expect(statement.entries.map((e) => e.type)).toEqual(['INVOICE', 'CREDIT_NOTE', 'PAYMENT']);

    const [invoiceEntry, creditNoteEntry, paymentEntry] = statement.entries;
    expect(invoiceEntry.haber.toNumber()).toBe(1000);
    expect(invoiceEntry.debe.toNumber()).toBe(0);
    expect(invoiceEntry.balance.toNumber()).toBe(1000);
    expect(invoiceEntry.status).toBe('Totalmente imputado');

    expect(creditNoteEntry.debe.toNumber()).toBe(200);
    expect(creditNoteEntry.balance.toNumber()).toBe(800);

    // El pago aplica amount + retenciones (700 + 100 = 800), no sólo
    // amount - es lo que realmente extingue balanceDue del lado real
    // (PurchaseInvoiceService.recordPayment).
    expect(paymentEntry.debe.toNumber()).toBe(800);
    expect(paymentEntry.balance.toNumber()).toBe(0);

    // Invariante: el saldo acumulado final cierra contra balanceDue real
    // (0 en este caso, la factura quedó PAID).
    expect(statement.entries.at(-1)?.balance.toNumber()).toBe(0);
  });

  it('pendingOnly deja sólo facturas con saldo pendiente, sin tocar el saldo acumulado ya calculado', async () => {
    const db = baseDb({
      invoices: [
        {
          id: 'inv-1',
          supplierInvoiceDate: new Date('2026-08-01'),
          supplierInvoiceNumber: 'F-1',
          dueDate: null,
          total: new Prisma.Decimal(1000),
          balanceDue: new Prisma.Decimal(0),
          status: 'PAID',
        },
        {
          id: 'inv-2',
          supplierInvoiceDate: new Date('2026-08-02'),
          supplierInvoiceNumber: 'F-2',
          dueDate: null,
          total: new Prisma.Decimal(500),
          balanceDue: new Prisma.Decimal(500),
          status: 'ISSUED',
        },
      ],
      payments: [
        {
          id: 'pay-1',
          // A propósito después de inv-2 (08-02) en la fecha - el orden
          // cronológico es inv-1, inv-2, pay-1, no el orden de creación de
          // los fixtures.
          paidAt: new Date('2026-08-03'),
          method: 'Efectivo',
          amount: new Prisma.Decimal(1000),
          withholdings: [],
          purchaseInvoice: { supplierInvoiceNumber: 'F-1' },
        },
      ],
    });
    const service = new PayablesService();

    const statement = await runInTenant(db, () =>
      service.getSupplierStatement('supplier-1', { pendingOnly: true }),
    );

    expect(statement.entries).toHaveLength(1);
    expect(statement.entries[0].id).toBe('inv-2');
    // Saldo acumulado real al momento de esa fila en el orden cronológico
    // completo (inv-1 1000 + inv-2 500 = 1500 - pay-1 todavía no pasó, es
    // del 08-03) - no un recálculo aislado sobre sólo las filas visibles.
    expect(statement.entries[0].balance.toNumber()).toBe(1500);
  });
});
