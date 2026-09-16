import { Prisma, tenantContextStorage } from '@plexo/database';
import { ReportsSalesService } from './reports-sales.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('ReportsSalesService.getSalesByCustomer', () => {
  it('joins grouped totals back to customer name and sorts by total sales desc', async () => {
    const db = {
      invoice: {
        groupBy: jest.fn().mockResolvedValue([
          { customerId: 'c1', _sum: { total: new Prisma.Decimal(100) }, _count: 2 },
          { customerId: 'c2', _sum: { total: new Prisma.Decimal(500) }, _count: 1 },
        ]),
      },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
      company: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'c1', name: 'Acme' },
            { id: 'c2', name: 'Beta' },
          ]),
      },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesByCustomer());

    expect(db.invoice.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'CANCELLED' } }) }),
    );
    expect(result[0]).toMatchObject({ customerId: 'c2', customerName: 'Beta', totalSales: new Prisma.Decimal(500) });
    expect(result[1]).toMatchObject({ customerId: 'c1', customerName: 'Acme', totalSales: new Prisma.Decimal(100) });
  });

  it('skips the customer lookup when there is no activity in range', async () => {
    const db = {
      invoice: { groupBy: jest.fn().mockResolvedValue([]) },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
      company: { findMany: jest.fn() },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesByCustomer());

    expect(result).toEqual([]);
    expect(db.company.findMany).not.toHaveBeenCalled();
  });

  it('nets a fully-credited invoice down to zero instead of counting it as gross revenue', async () => {
    const db = {
      invoice: {
        groupBy: jest.fn().mockResolvedValue([
          { customerId: 'c1', _sum: { total: new Prisma.Decimal(2420) }, _count: 1 },
        ]),
      },
      creditNote: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ total: new Prisma.Decimal(2420), invoice: { customerId: 'c1' } }]),
      },
      company: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Acme' }]) },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesByCustomer());

    expect(result).toEqual([
      expect.objectContaining({ customerId: 'c1', totalSales: new Prisma.Decimal(0) }),
    ]);
  });

  it('still surfaces a customer whose only activity this period is a return of a prior-period sale', async () => {
    const db = {
      invoice: { groupBy: jest.fn().mockResolvedValue([]) },
      creditNote: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ total: new Prisma.Decimal(500), invoice: { customerId: 'c1' } }]),
      },
      company: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: 'Acme' }]) },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesByCustomer());

    expect(result).toEqual([
      expect.objectContaining({ customerId: 'c1', invoiceCount: 0, totalSales: new Prisma.Decimal(-500) }),
    ]);
  });
});

describe('ReportsSalesService.getSalesByProduct', () => {
  it('joins grouped line totals back to article/variant info and sorts by revenue desc', async () => {
    const db = {
      invoiceLine: {
        groupBy: jest.fn().mockResolvedValue([
          {
            articleVariantId: 'v1',
            _sum: { quantity: new Prisma.Decimal(3), lineTotal: new Prisma.Decimal(150) },
          },
          {
            articleVariantId: 'v2',
            _sum: { quantity: new Prisma.Decimal(1), lineTotal: new Prisma.Decimal(400) },
          },
        ]),
      },
      creditNoteLine: { findMany: jest.fn().mockResolvedValue([]) },
      articleVariant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'v1', sku: 'SKU-1', article: { name: 'Widget' } },
          { id: 'v2', sku: 'SKU-2', article: { name: 'Gadget' } },
        ]),
      },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesByProduct());

    expect(db.invoiceLine.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoice: expect.objectContaining({ status: { not: 'CANCELLED' } }),
        }),
      }),
    );
    expect(result[0]).toMatchObject({ articleVariantId: 'v2', sku: 'SKU-2', articleName: 'Gadget' });
    expect(result[1]).toMatchObject({ articleVariantId: 'v1', sku: 'SKU-1', articleName: 'Widget' });
  });

  it('nets a fully-credited line down to zero instead of counting it as gross revenue', async () => {
    const db = {
      invoiceLine: {
        groupBy: jest.fn().mockResolvedValue([
          { articleVariantId: 'v1', _sum: { quantity: new Prisma.Decimal(1), lineTotal: new Prisma.Decimal(2420) } },
        ]),
      },
      creditNoteLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            quantity: new Prisma.Decimal(1),
            lineTotal: new Prisma.Decimal(2420),
            invoiceLine: { articleVariantId: 'v1' },
          },
        ]),
      },
      articleVariant: {
        findMany: jest.fn().mockResolvedValue([{ id: 'v1', sku: 'SKU-1', article: { name: 'Widget' } }]),
      },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesByProduct());

    expect(result).toEqual([
      expect.objectContaining({
        articleVariantId: 'v1',
        quantitySold: new Prisma.Decimal(0),
        revenue: new Prisma.Decimal(0),
      }),
    ]);
  });
});

describe('ReportsSalesService.getRevenueByMonth', () => {
  it('buckets invoices by the month of issueDate, filling in months with no activity', async () => {
    const db = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            issueDate: new Date('2026-07-15T00:00:00Z'),
            subtotal: new Prisma.Decimal(100),
            taxTotal: new Prisma.Decimal(21),
            total: new Prisma.Decimal(121),
          },
          {
            issueDate: new Date('2026-09-02T00:00:00Z'),
            subtotal: new Prisma.Decimal(200),
            taxTotal: new Prisma.Decimal(42),
            total: new Prisma.Decimal(242),
          },
        ]),
      },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () =>
      service.getRevenueByMonth(new Date('2026-07-01T00:00:00Z'), new Date('2026-09-30T00:00:00Z')),
    );

    expect(result).toEqual([
      { month: '2026-07', invoiceCount: 1, subtotal: new Prisma.Decimal(100), taxTotal: new Prisma.Decimal(21), total: new Prisma.Decimal(121) },
      { month: '2026-08', invoiceCount: 0, subtotal: new Prisma.Decimal(0), taxTotal: new Prisma.Decimal(0), total: new Prisma.Decimal(0) },
      { month: '2026-09', invoiceCount: 1, subtotal: new Prisma.Decimal(200), taxTotal: new Prisma.Decimal(42), total: new Prisma.Decimal(242) },
    ]);
  });

  it('nets a credit note into the month it was issued, not the original invoice month', async () => {
    const db = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            issueDate: new Date('2026-07-15T00:00:00Z'),
            subtotal: new Prisma.Decimal(100),
            taxTotal: new Prisma.Decimal(21),
            total: new Prisma.Decimal(121),
          },
        ]),
      },
      creditNote: {
        findMany: jest.fn().mockResolvedValue([
          {
            issueDate: new Date('2026-08-01T00:00:00Z'),
            subtotal: new Prisma.Decimal(100),
            taxTotal: new Prisma.Decimal(21),
            total: new Prisma.Decimal(121),
          },
        ]),
      },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () =>
      service.getRevenueByMonth(new Date('2026-07-01T00:00:00Z'), new Date('2026-08-31T00:00:00Z')),
    );

    expect(result).toEqual([
      { month: '2026-07', invoiceCount: 1, subtotal: new Prisma.Decimal(100), taxTotal: new Prisma.Decimal(21), total: new Prisma.Decimal(121) },
      { month: '2026-08', invoiceCount: 0, subtotal: new Prisma.Decimal(-100), taxTotal: new Prisma.Decimal(-21), total: new Prisma.Decimal(-121) },
    ]);
  });
});

describe('ReportsSalesService.getSalesBySeller', () => {
  it('joins grouped totals back to the seller and sorts by total sales desc', async () => {
    const db = {
      invoice: {
        groupBy: jest.fn().mockResolvedValue([
          { issuedByUserId: 'u1', _sum: { total: new Prisma.Decimal(100) }, _count: 2 },
          { issuedByUserId: 'u2', _sum: { total: new Prisma.Decimal(500) }, _count: 1 },
        ]),
      },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', name: 'Lucía Fernández', avatarUrl: null, email: 'lucia@demo.plexo' },
          { id: 'u2', name: null, avatarUrl: 'https://example.com/a.png', email: 'martin@demo.plexo' },
        ]),
      },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesBySeller());

    expect(result[0]).toMatchObject({ userId: 'u2', userName: 'martin@demo.plexo', avatarUrl: 'https://example.com/a.png' });
    expect(result[1]).toMatchObject({ userId: 'u1', userName: 'Lucía Fernández', avatarUrl: null });
  });

  it('nets a return against the original invoice seller, not the credit note issuer', async () => {
    const db = {
      invoice: {
        groupBy: jest.fn().mockResolvedValue([
          { issuedByUserId: 'u1', _sum: { total: new Prisma.Decimal(1000) }, _count: 1 },
        ]),
      },
      creditNote: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ total: new Prisma.Decimal(300), invoice: { issuedByUserId: 'u1' } }]),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', name: 'Lucía Fernández', avatarUrl: null }]) },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesBySeller());

    expect(result).toEqual([
      expect.objectContaining({ userId: 'u1', totalSales: new Prisma.Decimal(700) }),
    ]);
  });

  it('skips the user lookup when there is no activity in range', async () => {
    const db = {
      invoice: { groupBy: jest.fn().mockResolvedValue([]) },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn() },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesBySeller());

    expect(result).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
