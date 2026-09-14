import type { PrismaService } from '@plexo/database';
import type { SubscriptionService } from '@plexo/subscriptions';
import { TenantProvisioningService } from './tenant-provisioning.service.js';

function makePrisma() {
  const fakeTx = {
    tenant: { create: jest.fn().mockResolvedValue({}) },
    currency: { create: jest.fn().mockResolvedValue({}) },
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
