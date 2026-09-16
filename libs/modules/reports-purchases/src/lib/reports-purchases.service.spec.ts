import { Prisma, tenantContextStorage } from '@plexo/database';
import { ReportsPurchasesService } from './reports-purchases.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('ReportsPurchasesService.getPurchasesBySupplier', () => {
  it('joins grouped totals back to supplier name and sorts by total purchased desc', async () => {
    const db = {
      purchaseOrder: {
        groupBy: jest.fn().mockResolvedValue([
          { supplierId: 's1', _sum: { total: new Prisma.Decimal(100) }, _count: 2 },
          { supplierId: 's2', _sum: { total: new Prisma.Decimal(500) }, _count: 1 },
        ]),
      },
      company: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 's1', name: 'CRIPSA' },
            { id: 's2', name: 'INFOANTINA SA' },
          ]),
      },
    };
    const service = new ReportsPurchasesService();

    const result = await runInTenant(db, () => service.getPurchasesBySupplier());

    expect(db.purchaseOrder.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'CANCELLED' } }) }),
    );
    expect(result[0]).toMatchObject({ supplierId: 's2', supplierName: 'INFOANTINA SA', totalPurchased: new Prisma.Decimal(500) });
    expect(result[1]).toMatchObject({ supplierId: 's1', supplierName: 'CRIPSA', totalPurchased: new Prisma.Decimal(100) });
  });

  it('skips the supplier lookup when there is no activity in range', async () => {
    const db = {
      purchaseOrder: { groupBy: jest.fn().mockResolvedValue([]) },
      company: { findMany: jest.fn() },
    };
    const service = new ReportsPurchasesService();

    const result = await runInTenant(db, () => service.getPurchasesBySupplier());

    expect(result).toEqual([]);
    expect(db.company.findMany).not.toHaveBeenCalled();
  });
});

describe('ReportsPurchasesService.getPurchasesByBuyer', () => {
  it('joins grouped totals back to the buyer and sorts by total purchased desc', async () => {
    const db = {
      purchaseOrder: {
        groupBy: jest.fn().mockResolvedValue([
          { createdByUserId: 'u1', _sum: { total: new Prisma.Decimal(1890000) }, _count: 10 },
          { createdByUserId: 'u2', _sum: { total: new Prisma.Decimal(4980000) }, _count: 16 },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', name: 'Lucas Medina', avatarUrl: null, email: 'lucas@demo.plexo' },
          { id: 'u2', name: 'Ana Ríos', avatarUrl: null, email: 'ana@demo.plexo' },
        ]),
      },
    };
    const service = new ReportsPurchasesService();

    const result = await runInTenant(db, () => service.getPurchasesByBuyer());

    expect(result[0]).toMatchObject({ userId: 'u2', userName: 'Ana Ríos', orderCount: 16 });
    expect(result[1]).toMatchObject({ userId: 'u1', userName: 'Lucas Medina', orderCount: 10 });
  });

  it('falls back to email when the user has no display name', async () => {
    const db = {
      purchaseOrder: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ createdByUserId: 'u1', _sum: { total: new Prisma.Decimal(100) }, _count: 1 }]),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', name: null, avatarUrl: null, email: 'a@demo.plexo' }]) },
    };
    const service = new ReportsPurchasesService();

    const result = await runInTenant(db, () => service.getPurchasesByBuyer());

    expect(result).toEqual([expect.objectContaining({ userId: 'u1', userName: 'a@demo.plexo' })]);
  });

  it('skips the user lookup when there is no activity in range', async () => {
    const db = {
      purchaseOrder: { groupBy: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn() },
    };
    const service = new ReportsPurchasesService();

    const result = await runInTenant(db, () => service.getPurchasesByBuyer());

    expect(result).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});
