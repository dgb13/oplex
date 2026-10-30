import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PrismaService } from '@plexo/database';
import { AllowWhenReadOnly, SubscriptionReadOnlyGuard } from './read-only.guard.js';

jest.mock('@plexo/database', () => ({
  ...jest.requireActual('@plexo/database'),
  withTenantContext: jest.fn(),
}));
const { withTenantContext } = jest.requireMock('@plexo/database') as { withTenantContext: jest.Mock };

class PlatformAdminGuard {}

class Routes {
  create() {
    return 'create';
  }
  @AllowWhenReadOnly()
  pay() {
    return 'pay';
  }
  @AllowWhenReadOnly((req) => (req.body as { active?: boolean }).active === false)
  update() {
    return 'update';
  }
}
class AdminRoutes {
  act() {
    return 'act';
  }
}
Reflect.defineMetadata('__guards__', [PlatformAdminGuard], AdminRoutes);

function context(cls: object, handler: () => void, request: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    getClass: () => cls,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const user = { sub: 'u1', tenantId: 't1', roles: ['OWNER'] };

describe('SubscriptionReadOnlyGuard', () => {
  const guard = new SubscriptionReadOnlyGuard(new Reflector(), {} as PrismaService);
  const proto = Routes.prototype;

  beforeEach(() => withTenantContext.mockReset());

  function withStatus(status: string) {
    withTenantContext.mockResolvedValue({ status });
  }

  it('con la cuenta vencida frena las escrituras con el código que reconoce la web', async () => {
    withStatus('EXPIRED');
    await expect(guard.canActivate(context(Routes, proto.create, { method: 'POST', user, body: {} }))).rejects.toMatchObject({
      response: { code: 'SUBSCRIPTION_READ_ONLY' },
    });
  });

  it('deja leer, y deja escribir con la cuenta activa', async () => {
    expect(await guard.canActivate(context(Routes, proto.create, { method: 'GET', user }))).toBe(true);
    expect(withTenantContext).not.toHaveBeenCalled();

    withStatus('ACTIVE');
    expect(await guard.canActivate(context(Routes, proto.create, { method: 'POST', user }))).toBe(true);
  });

  it('respeta @AllowWhenReadOnly, también con condición', async () => {
    withStatus('EXPIRED');
    expect(await guard.canActivate(context(Routes, proto.pay, { method: 'POST', user }))).toBe(true);
    expect(await guard.canActivate(context(Routes, proto.update, { method: 'PATCH', user, body: { active: false } }))).toBe(true);
    await expect(
      guard.canActivate(context(Routes, proto.update, { method: 'PATCH', user, body: { name: 'Otro' } })),
    ).rejects.toMatchObject({ response: { code: 'SUBSCRIPTION_READ_ONLY' } });
  });

  it('no toca el backoffice ni las rutas sin usuario', async () => {
    withStatus('EXPIRED');
    expect(await guard.canActivate(context(AdminRoutes, AdminRoutes.prototype.act, { method: 'POST', user }))).toBe(true);
    expect(await guard.canActivate(context(Routes, function webhook() {
      return 'webhook';
    }, { method: 'POST' }))).toBe(true);
    expect(withTenantContext).not.toHaveBeenCalled();
  });
});
