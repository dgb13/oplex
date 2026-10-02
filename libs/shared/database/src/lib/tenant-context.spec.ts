import { beforeCommit, getTenantDb, getTenantId, getUserRole, onCommit, tenantContextStorage, withTenantContext } from './tenant-context.js';
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

  it('corre los pasos de beforeCommit después de todo el request, en orden y dentro de la transacción', async () => {
    const { prisma } = makePrisma();
    const order: string[] = [];

    const result = await withTenantContext(prisma, 'tenant-1', async () => {
      await beforeCommit(async () => {
        order.push(`cae (tenant ${getTenantId()})`);
      });
      order.push('stock');
      await beforeCommit(async () => {
        order.push('segundo paso');
      });
      order.push('asiento');
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(order).toEqual(['stock', 'asiento', 'cae (tenant tenant-1)', 'segundo paso']);
  });

  it('no corre beforeCommit si el request falla antes - el CAE nunca se pide para algo que se revierte', async () => {
    const { prisma } = makePrisma();
    const step = jest.fn().mockResolvedValue(undefined);

    await expect(
      withTenantContext(prisma, 'tenant-1', async () => {
        await beforeCommit(step);
        throw new Error('Insufficient available stock');
      }),
    ).rejects.toThrow('Insufficient available stock');

    expect(step).not.toHaveBeenCalled();
  });

  it('si un paso de beforeCommit falla, falla la transacción entera y no corre onCommit', async () => {
    const { prisma } = makePrisma();
    const afterCommitCb = jest.fn();

    await expect(
      withTenantContext(prisma, 'tenant-1', async () => {
        onCommit(afterCommitCb);
        await beforeCommit(async () => {
          throw new Error('AFIP WSFE no autorizó el comprobante');
        });
      }),
    ).rejects.toThrow('AFIP WSFE no autorizó el comprobante');

    expect(afterCommitCb).not.toHaveBeenCalled();
  });

  it('sin contexto de tenant, beforeCommit corre en el momento', async () => {
    const step = jest.fn().mockResolvedValue(undefined);

    await beforeCommit(step);

    expect(step).toHaveBeenCalled();
  });
});
