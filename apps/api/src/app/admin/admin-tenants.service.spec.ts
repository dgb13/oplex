import type { PrismaService } from '@plexo/database';
import type { AuthService } from '../auth/auth.service.js';
import type { ProvisionedTenant, TenantProvisioningService } from '../auth/tenant-provisioning.service.js';
import { AdminTenantsService } from './admin-tenants.service.js';

function makePrisma() {
  const fakeTx = {
    tenant: { create: jest.fn().mockResolvedValue({}) },
    user: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
  } as unknown as PrismaService;
  return { prisma, fakeTx };
}

function makeAuthService() {
  return { impersonate: jest.fn() } as unknown as AuthService;
}

function makeTenantProvisioningService(impl?: (...args: unknown[]) => Promise<ProvisionedTenant>) {
  return {
    provision: jest.fn(impl ?? (() => Promise.resolve({ tenantId: 'tenant-x', userId: 'user-x' }))),
  } as unknown as TenantProvisioningService;
}

describe('AdminTenantsService.createTenant', () => {
  it('provisions the tenant with a temporary password that must be changed, auto-verified', async () => {
    const { prisma } = makePrisma();
    const tenantProvisioningService = makeTenantProvisioningService();
    const service = new AdminTenantsService(prisma, makeAuthService(), tenantProvisioningService);

    const result = await service.createTenant({
      name: 'Nueva Empresa SA',
      ownerEmail: 'owner@nueva.com',
      planKey: 'BASIC',
    });

    expect(tenantProvisioningService.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Nueva Empresa SA',
        ownerEmail: 'owner@nueva.com',
        planKey: 'BASIC',
        mustChangePassword: true,
        autoVerifyEmail: true,
      }),
    );
    const provisionArgs = (tenantProvisioningService.provision as jest.Mock).mock.calls[0][0];
    expect(provisionArgs.passwordHash).not.toBe(result.tempPassword); // hashed, not plaintext
    expect(result).toEqual({
      tenantId: expect.any(String),
      ownerEmail: 'owner@nueva.com',
      tempPassword: expect.any(String),
    });
  });
});

describe('AdminTenantsService.listTenantUsers', () => {
  it('returns the tenant users ordered by email, scoped to that tenant context', async () => {
    const { prisma, fakeTx } = makePrisma();
    (fakeTx as unknown as { user: { findMany: unknown } }).user.findMany = jest.fn().mockResolvedValue([
      { id: 'user-1', email: 'a@acme.com', name: 'A', role: 'OWNER' },
    ]);
    const service = new AdminTenantsService(prisma, makeAuthService(), makeTenantProvisioningService());

    const result = await service.listTenantUsers('tenant-1');

    expect(result).toEqual([{ id: 'user-1', email: 'a@acme.com', name: 'A', role: 'OWNER' }]);
    expect(
      (fakeTx as unknown as { user: { findMany: jest.Mock } }).user.findMany,
    ).toHaveBeenCalledWith({
      select: { id: true, email: true, name: true, role: true },
      orderBy: { email: 'asc' },
    });
  });
});

describe('AdminTenantsService.updateTenantStatus', () => {
  it('updates the tenant status inside its own tenant context', async () => {
    const { prisma, fakeTx } = makePrisma();
    const tenantUpdate = jest.fn().mockResolvedValue({});
    (fakeTx as unknown as { tenant: { update: unknown } }).tenant.update = tenantUpdate;
    const service = new AdminTenantsService(prisma, makeAuthService(), makeTenantProvisioningService());

    await service.updateTenantStatus('tenant-1', 'SUSPENDED');

    expect(tenantUpdate).toHaveBeenCalledWith({ where: { id: 'tenant-1' }, data: { status: 'SUSPENDED' } });
  });
});

describe('AdminTenantsService.impersonate', () => {
  it('delegates to AuthService.impersonate with the admin identity', () => {
    const authService = makeAuthService();
    const service = new AdminTenantsService(
      {} as unknown as PrismaService,
      authService,
      makeTenantProvisioningService(),
    );
    const admin = { id: 'admin-1', email: 'super@plexo.test' };

    service.impersonate('tenant-1', 'user-2', admin);

    expect(authService.impersonate).toHaveBeenCalledWith('tenant-1', 'user-2', admin);
  });
});
