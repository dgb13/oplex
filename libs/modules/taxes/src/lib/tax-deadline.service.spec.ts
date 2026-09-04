import { NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { TaxDeadlineService } from './tax-deadline.service.js';

function runInTenant<T>(
  db: Record<string, unknown>,
  fn: () => T,
  opts: { userId?: string } = {},
): T {
  return tenantContextStorage.run(
    { tenantId: 'tenant-1', userId: opts.userId ?? 'user-1', role: 'ACCOUNTANT' as never, tx: db as never },
    fn,
  );
}

describe('TaxDeadlineService.create', () => {
  it('stamps tenantId and createdByUserId from the tenant context', async () => {
    const db = { taxDeadline: { create: jest.fn().mockResolvedValue({ id: 'd1' }) } };
    const service = new TaxDeadlineService();

    await runInTenant(
      db,
      () => service.create({ kind: 'IVA', dueDate: '2026-10-20', description: 'IVA mensual' }),
      { userId: 'user-42' },
    );

    expect((db.taxDeadline.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-1',
      kind: 'IVA',
      description: 'IVA mensual',
      createdByUserId: 'user-42',
    });
  });
});

describe('TaxDeadlineService.list', () => {
  it('filters by status when given, orders by dueDate ascending', async () => {
    const db = { taxDeadline: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new TaxDeadlineService();

    await runInTenant(db, () => service.list('PENDING'));

    expect(db.taxDeadline.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      orderBy: { dueDate: 'asc' },
    });
  });

  it('omits the where clause when no status is given', async () => {
    const db = { taxDeadline: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new TaxDeadlineService();

    await runInTenant(db, () => service.list());

    expect(db.taxDeadline.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { dueDate: 'asc' },
    });
  });
});

describe('TaxDeadlineService.markDone', () => {
  it('throws when the deadline does not exist', async () => {
    const db = { taxDeadline: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new TaxDeadlineService();

    await expect(runInTenant(db, () => service.markDone('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates status to DONE', async () => {
    const db = {
      taxDeadline: {
        findUnique: jest.fn().mockResolvedValue({ id: 'd1', status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({ id: 'd1', status: 'DONE' }),
      },
    };
    const service = new TaxDeadlineService();

    await runInTenant(db, () => service.markDone('d1'));

    expect(db.taxDeadline.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { status: 'DONE' } });
  });
});
