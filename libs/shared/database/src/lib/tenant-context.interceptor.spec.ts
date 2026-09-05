import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { getTenantId } from './tenant-context.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';

function makeContext(user?: { tenantId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

// undefined por default (sin @LongRunningTransaction en la ruta) - los
// tests que sí lo necesitan pasan su propio mock.
function makeReflector(timeoutMs?: number): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(timeoutMs) } as unknown as Reflector;
}

describe('TenantContextInterceptor', () => {
  it('skips transaction wrapping when there is no authenticated user', async () => {
    const $transaction = jest.fn();
    const interceptor = new TenantContextInterceptor({ $transaction } as never, makeReflector());
    const handle = jest.fn(() => of('ok'));

    const result = await lastValueFrom(
      interceptor.intercept(makeContext(undefined), { handle } as unknown as CallHandler),
    );

    expect(result).toBe('ok');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('opens a transaction, sets the tenant, and exposes it via getTenantId inside the handler', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const fakeTx = { $executeRaw: executeRaw };
    const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx));
    const interceptor = new TenantContextInterceptor({ $transaction } as never, makeReflector());
    const handle = jest.fn(() => of(getTenantId()));

    const result = await lastValueFrom(
      interceptor.intercept(
        makeContext({ tenantId: 'tenant-abc' }),
        { handle } as unknown as CallHandler,
      ),
    );

    expect(result).toBe('tenant-abc');
    expect(executeRaw).toHaveBeenCalled();
  });

  it('passes the @LongRunningTransaction timeout through to $transaction when the route declares one', async () => {
    const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb({ $executeRaw: jest.fn() }));
    const interceptor = new TenantContextInterceptor({ $transaction } as never, makeReflector(30_000));
    const handle = jest.fn(() => of('ok'));

    await lastValueFrom(
      interceptor.intercept(
        makeContext({ tenantId: 'tenant-abc' }),
        { handle } as unknown as CallHandler,
      ),
    );

    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 30_000 });
  });
});
