import { getTenantDb, getTenantId, getUserRole, tenantContextStorage, withTenantContext } from './tenant-context.js';
import type { PrismaClient } from '../generated/client.js';

describe('tenant-context', () => {
  it('throws when no tenant context is active', () => {
    expect(() => getTenantId()).toThrow(/No tenant context active/);
    expect(() => getTenantDb()).toThrow(/No tenant context active/);
  });

  it('resolves tenantId and tx inside an active context', () => {
    const fakeTx = {} as never;
    tenantContextStorage.run({ tenantId: 'tenant-123', tx: fakeTx }, () => {
      expect(getTenantId()).toBe('tenant-123');
      expect(getTenantDb()).toBe(fakeTx);
    });
  });

  it('resolves the acting user role when present, undefined otherwise', () => {
    const fakeTx = {} as never;
    tenantContextStorage.run({ tenantId: 'tenant-123', role: 'ACCOUNTANT', tx: fakeTx }, () => {
      expect(getUserRole()).toBe('ACCOUNTANT');
    });
    tenantContextStorage.run({ tenantId: 'tenant-123', tx: fakeTx }, () => {
      expect(getUserRole()).toBeUndefined();
    });
  });
});

describe('withTenantContext', () => {
  function makePrisma() {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const $transaction = jest.fn((fn: (tx: unknown) => unknown) => fn({ $executeRaw: executeRaw }));
    return { prisma: { $transaction } as unknown as PrismaClient, $transaction, executeRaw };
  }

  it('opens a plain $transaction (Prisma default timeout) when no timeoutMs is given', async () => {
    const { prisma, $transaction } = makePrisma();

    await withTenantContext(prisma, 'tenant-1', async () => 'ok');

    expect($transaction).toHaveBeenCalledWith(expect.any(Function), undefined);
  });

  it('passes { timeout } through to $transaction when timeoutMs is given - the escape hatch for a slow external call inside the request (see @LongRunningTransaction)', async () => {
    const { prisma, $transaction } = makePrisma();

    await withTenantContext(prisma, 'tenant-1', async () => 'ok', undefined, undefined, 30_000);

    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 30_000 });
  });
});
