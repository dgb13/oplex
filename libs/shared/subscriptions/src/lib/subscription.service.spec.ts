import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage, type PrismaService } from '@plexo/database';
import { SubscriptionService } from './subscription.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-1',
    key: 'GOLD',
    name: 'Gold',
    maxUsers: 6,
    maxClients: 75,
    maxMonthlyInvoices: 3000,
    ...overrides,
  };
}

function makeActiveSubscription(overrides: Record<string, unknown> = {}) {
  return { id: 'sub-1', tenantId: 'tenant-1', status: 'ACTIVE', plan: makePlan(), ...overrides };
}

describe('SubscriptionService.getCurrentForTenant', () => {
  it('reads the tenant-scoped subscription including its plan', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(makeActiveSubscription());
    const db = { tenantSubscription: { findUniqueOrThrow } };
    const service = new SubscriptionService({} as PrismaService);

    const result = await runInTenant(db, () => service.getCurrentForTenant());

    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      include: { plan: true },
    });
    expect(result.status).toBe('ACTIVE');
  });
});

describe('SubscriptionService.startTrial', () => {
  it('looks up the plan by key and creates a TRIALING subscription ~7 days out', async () => {
    const plan = makePlan();
    const prisma = { plan: { findUniqueOrThrow: jest.fn().mockResolvedValue(plan) } } as unknown as PrismaService;
    const create = jest.fn().mockResolvedValue({ id: 'sub-1', status: 'TRIALING', plan });
    const db = { tenantSubscription: { create } };
    const service = new SubscriptionService(prisma);

    await runInTenant(db, () => service.startTrial('GOLD'));

    expect((prisma.plan.findUniqueOrThrow as jest.Mock)).toHaveBeenCalledWith({ where: { key: 'GOLD' } });
    const args = create.mock.calls[0][0];
    expect(args.data.tenantId).toBe('tenant-1');
    expect(args.data.planId).toBe('plan-1');
    expect(args.data.status).toBe('TRIALING');
    const daysOut = (args.data.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysOut).toBeGreaterThan(6.9);
    expect(daysOut).toBeLessThan(7.1);
  });
});

describe('SubscriptionService quota checks', () => {
  it('assertCanAddUser allows when under the plan limit', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(makeActiveSubscription());
    const count = jest.fn().mockResolvedValue(3);
    const db = { tenantSubscription: { findUniqueOrThrow }, user: { count } };
    const service = new SubscriptionService({} as PrismaService);

    await expect(runInTenant(db, () => service.assertCanAddUser())).resolves.toBeUndefined();
  });

  it('assertCanAddUser rejects when the plan limit is reached', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(makeActiveSubscription());
    const count = jest.fn().mockResolvedValue(6);
    const db = { tenantSubscription: { findUniqueOrThrow }, user: { count } };
    const service = new SubscriptionService({} as PrismaService);

    await expect(runInTenant(db, () => service.assertCanAddUser())).rejects.toThrow(ForbiddenException);
  });

  it('assertCanAddUser excludes filas espejo de contadores externos (isExternalAccountant) del cupo', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(makeActiveSubscription());
    const count = jest.fn().mockResolvedValue(3);
    const db = { tenantSubscription: { findUniqueOrThrow }, user: { count } };
    const service = new SubscriptionService({} as PrismaService);

    await runInTenant(db, () => service.assertCanAddUser());

    expect(count).toHaveBeenCalledWith({ where: { isExternalAccountant: { not: true } } });
  });

  it('assertCanAddClient only counts active companies with a CUSTOMER role', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(makeActiveSubscription());
    const count = jest.fn().mockResolvedValue(10);
    const db = { tenantSubscription: { findUniqueOrThrow }, company: { count } };
    const service = new SubscriptionService({} as PrismaService);

    await runInTenant(db, () => service.assertCanAddClient());

    expect(count).toHaveBeenCalledWith({
      where: { active: true, roles: { some: { role: 'CUSTOMER' } } },
    });
  });

  it('assertCanIssueInvoiceThisMonth excludes CANCELLED invoices from the count', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(makeActiveSubscription());
    const count = jest.fn().mockResolvedValue(1);
    const db = { tenantSubscription: { findUniqueOrThrow }, invoice: { count } };
    const service = new SubscriptionService({} as PrismaService);

    await runInTenant(db, () => service.assertCanIssueInvoiceThisMonth());

    const where = count.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: 'CANCELLED' });
  });

  it('rejects any of the 3 checks once the subscription is EXPIRED, before even counting', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(makeActiveSubscription({ status: 'EXPIRED' }));
    const count = jest.fn();
    const db = { tenantSubscription: { findUniqueOrThrow }, user: { count } };
    const service = new SubscriptionService({} as PrismaService);

    await expect(runInTenant(db, () => service.assertCanAddUser())).rejects.toThrow(
      /período de prueba venció/,
    );
    expect(count).not.toHaveBeenCalled();
  });

  it('rejects when the subscription is CANCELLED too, even though nothing sets that status yet', async () => {
    const findUniqueOrThrow = jest.fn().mockResolvedValue(makeActiveSubscription({ status: 'CANCELLED' }));
    const count = jest.fn();
    const db = { tenantSubscription: { findUniqueOrThrow }, user: { count } };
    const service = new SubscriptionService({} as PrismaService);

    await expect(runInTenant(db, () => service.assertCanAddUser())).rejects.toThrow(
      /período de prueba venció/,
    );
    expect(count).not.toHaveBeenCalled();
  });
});

describe('SubscriptionService plan catalog (global, no tenant context)', () => {
  it('listActivePlans reads only active plans, ordered by sortOrder, via the raw PrismaService', async () => {
    const findMany = jest.fn().mockResolvedValue([makePlan()]);
    const prisma = { plan: { findMany } } as unknown as PrismaService;
    const service = new SubscriptionService(prisma);

    await service.listActivePlans();

    expect(findMany).toHaveBeenCalledWith({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  });

  it('createPlan rejects a duplicate key', async () => {
    const prisma = {
      plan: { findUnique: jest.fn().mockResolvedValue(makePlan()), create: jest.fn() },
    } as unknown as PrismaService;
    const service = new SubscriptionService(prisma);

    await expect(
      service.createPlan({
        key: 'GOLD',
        name: 'Gold',
        priceMonthly: 100,
        maxUsers: 1,
        maxClients: 1,
        maxMonthlyInvoices: 1,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('createPlan persists Decimal fields via Prisma.Decimal', async () => {
    const create = jest.fn().mockResolvedValue(makePlan());
    const prisma = {
      plan: { findUnique: jest.fn().mockResolvedValue(null), create },
    } as unknown as PrismaService;
    const service = new SubscriptionService(prisma);

    await service.createPlan({
      key: 'NEW',
      name: 'Nuevo',
      priceMonthly: 500,
      maxUsers: 2,
      maxClients: 2,
      maxMonthlyInvoices: 2,
      debitDiscountPercent: 10,
    });

    const data = create.mock.calls[0][0].data;
    expect(data.priceMonthly).toBeInstanceOf(Prisma.Decimal);
    expect(data.priceMonthly.toNumber()).toBe(500);
    expect(data.debitDiscountPercent.toNumber()).toBe(10);
  });

  it('updatePlan throws NotFoundException for an unknown id', async () => {
    const prisma = { plan: { findUnique: jest.fn().mockResolvedValue(null) } } as unknown as PrismaService;
    const service = new SubscriptionService(prisma);

    await expect(service.updatePlan('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
  });
});
