import type { PrismaService } from '@plexo/database';
import type { SubscriptionService } from '@plexo/subscriptions';
import { TenantProvisioningService } from './tenant-provisioning.service.js';

function makePrisma() {
  const fakeTx = {
    tenant: { create: jest.fn().mockResolvedValue({}) },
    currency: { create: jest.fn().mockResolvedValue({}) },
    warehouse: { create: jest.fn().mockResolvedValue({}) },
    taxDefinition: { createMany: jest.fn().mockResolvedValue({ count: 7 }) },
    user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
  } as unknown as PrismaService;
  return { prisma, fakeTx };
}

describe('TenantProvisioningService.provision', () => {
  it('creates the tenant, its base currency, the owner user, then starts the trial - in that order', async () => {
    const { prisma, fakeTx } = makePrisma();
    const callOrder: string[] = [];
    fakeTx.tenant.create.mockImplementation(() => {
      callOrder.push('tenant');
      return Promise.resolve({});
    });
    fakeTx.currency.create.mockImplementation(() => {
      callOrder.push('currency');
      return Promise.resolve({});
    });
    fakeTx.user.create.mockImplementation(() => {
      callOrder.push('user');
      return Promise.resolve({ id: 'user-1' });
    });
    const subscriptionService = {
      startTrial: jest.fn().mockImplementation(() => {
        callOrder.push('trial');
        return Promise.resolve({});
      }),
    } as unknown as SubscriptionService;
    const service = new TenantProvisioningService(prisma, subscriptionService);

    await service.provision({
      tenantId: 'tenant-1',
      name: 'Acme',
      ownerEmail: 'o@acme.com',
      passwordHash: 'hashed',
      mustChangePassword: true,
      autoVerifyEmail: false,
      planKey: 'GOLD',
    });

    expect(callOrder).toEqual(['tenant', 'currency', 'user', 'trial']);
    expect(subscriptionService.startTrial).toHaveBeenCalledWith('GOLD');
  });

  it('creates a base ARS currency for the new tenant', async () => {
    const { prisma, fakeTx } = makePrisma();
    const subscriptionService = { startTrial: jest.fn().mockResolvedValue({}) } as unknown as SubscriptionService;
    const service = new TenantProvisioningService(prisma, subscriptionService);

    await service.provision({
      tenantId: 'tenant-1',
      name: 'Acme',
      ownerEmail: 'o@acme.com',
      passwordHash: 'hashed',
      mustChangePassword: true,
      autoVerifyEmail: false,
      planKey: 'GOLD',
    });

    expect(fakeTx.currency.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', code: 'ARS', name: 'Peso argentino', isBase: true },
    });
  });

  it('creates a "Depósito principal" so a new tenant can load stock right away', async () => {
    const { prisma, fakeTx } = makePrisma();
    const subscriptionService = { startTrial: jest.fn().mockResolvedValue({}) } as unknown as SubscriptionService;
    const service = new TenantProvisioningService(prisma, subscriptionService);

    await service.provision({
      tenantId: 'tenant-1',
      name: 'Acme',
      ownerEmail: 'o@acme.com',
      passwordHash: 'hashed',
      mustChangePassword: true,
      autoVerifyEmail: false,
      planKey: 'GOLD',
    });

    expect(fakeTx.warehouse.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', name: 'Depósito principal' },
    });
  });

  it('creates the Argentine VAT rates (21%, 10,5%, 27%, 5%, 2,5%, Exento, No gravado)', async () => {
    const { prisma, fakeTx } = makePrisma();
    const subscriptionService = { startTrial: jest.fn().mockResolvedValue({}) } as unknown as SubscriptionService;
    const service = new TenantProvisioningService(prisma, subscriptionService);

    await service.provision({
      tenantId: 'tenant-1',
      name: 'Acme',
      ownerEmail: 'o@acme.com',
      passwordHash: 'hashed',
      mustChangePassword: true,
      autoVerifyEmail: false,
      planKey: 'GOLD',
    });

    const { data } = fakeTx.taxDefinition.createMany.mock.calls[0][0];
    expect(data.map((d: { code: string }) => d.code)).toEqual([
      'IVA21',
      'IVA10_5',
      'IVA27',
      'IVA5',
      'IVA2_5',
      'IVA_EXENTO',
      'IVA_NO_GRAVADO',
    ]);
    expect(data[0]).toEqual({ tenantId: 'tenant-1', code: 'IVA21', name: 'IVA 21%', calculationType: 'PERCENTAGE', rate: 21 });
  });

  it('sets emailVerifiedAt to null when autoVerifyEmail is false (signup público)', async () => {
    const { prisma, fakeTx } = makePrisma();
    const subscriptionService = { startTrial: jest.fn().mockResolvedValue({}) } as unknown as SubscriptionService;
    const service = new TenantProvisioningService(prisma, subscriptionService);

    await service.provision({
      tenantId: 'tenant-1',
      name: 'Acme',
      ownerEmail: 'o@acme.com',
      passwordHash: 'hashed',
      mustChangePassword: false,
      autoVerifyEmail: false,
      planKey: 'SILVER',
    });

    const userArgs = fakeTx.user.create.mock.calls[0][0].data;
    expect(userArgs.emailVerifiedAt).toBeNull();
  });

  it('sets emailVerifiedAt to a Date when autoVerifyEmail is true (admin backoffice)', async () => {
    const { prisma, fakeTx } = makePrisma();
    const subscriptionService = { startTrial: jest.fn().mockResolvedValue({}) } as unknown as SubscriptionService;
    const service = new TenantProvisioningService(prisma, subscriptionService);

    await service.provision({
      tenantId: 'tenant-1',
      name: 'Acme',
      ownerEmail: 'o@acme.com',
      passwordHash: 'hashed',
      mustChangePassword: true,
      autoVerifyEmail: true,
      planKey: 'DIAMOND',
    });

    const userArgs = fakeTx.user.create.mock.calls[0][0].data;
    expect(userArgs.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('returns the generated tenantId and the created userId', async () => {
    const { prisma } = makePrisma();
    const subscriptionService = { startTrial: jest.fn().mockResolvedValue({}) } as unknown as SubscriptionService;
    const service = new TenantProvisioningService(prisma, subscriptionService);

    const result = await service.provision({
      tenantId: 'tenant-1',
      name: 'Acme',
      ownerEmail: 'o@acme.com',
      passwordHash: 'hashed',
      mustChangePassword: true,
      autoVerifyEmail: true,
      planKey: 'DIAMOND',
    });

    expect(result).toEqual({ tenantId: 'tenant-1', userId: 'user-1' });
  });
});
