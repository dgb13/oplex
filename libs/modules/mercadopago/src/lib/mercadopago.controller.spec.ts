import { JwtService } from '@nestjs/jwt';
import type { ConnectorService } from '@plexo/connectors';
import { tenantContextStorage, type PrismaService } from '@plexo/database';
import type { FastifyReply } from 'fastify';
import { MercadoPagoController } from './mercadopago.controller.js';
import { MercadoPagoStateService } from './mercadopago-state.service.js';
import type { MercadoPagoConnector } from './mercadopago.connector.js';

function makeStateService(): MercadoPagoStateService {
  return new MercadoPagoStateService(new JwtService({ secret: 'test-secret' }));
}

function makeConnectorMock(overrides: Partial<jest.Mocked<MercadoPagoConnector>> = {}) {
  return {
    getAuthorizationUrl: jest.fn().mockReturnValue('https://auth.mercadopago.com/authorization?...'),
    handleOAuthCallback: jest.fn().mockResolvedValue(undefined),
    refreshIfNeeded: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
    provider: 'MERCADO_PAGO',
    ...overrides,
  } as unknown as jest.Mocked<MercadoPagoConnector>;
}

function makeConnectorServiceMock(overrides: Partial<jest.Mocked<ConnectorService>> = {}) {
  return {
    getConnector: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ConnectorService>;
}

/** $transaction just runs the callback against a stub tx - same pattern as
 * apps/api's auth.service.spec.ts (withTenantContext's own machinery is
 * already covered by tenant-context.spec.ts, not re-tested here). */
function makePrisma(): PrismaService {
  const fakeTx = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
  return { $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)) } as unknown as PrismaService;
}

function makeReply(): jest.Mocked<FastifyReply> {
  return { redirect: jest.fn() } as unknown as jest.Mocked<FastifyReply>;
}

function runAsUser<T>(fn: () => T): T {
  const tx = { tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) } };
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', roles: ['OWNER'], tx: tx as never }, fn);
}

describe('MercadoPagoController.authorize', () => {
  it('signs a fresh state and returns the URL the connector builds from it', () => {
    const connector = makeConnectorMock();
    const controller = new MercadoPagoController(connector, makeConnectorServiceMock(), makeStateService(), makePrisma());

    const result = runAsUser(() => controller.authorize());

    expect(result).toEqual({ authorizationUrl: 'https://auth.mercadopago.com/authorization?...' });
    expect(connector.getAuthorizationUrl).toHaveBeenCalledWith('tenant-1', expect.any(String));
  });
});

describe('MercadoPagoController.callback', () => {
  it('rejects an invalid/forged state - redirects to the error page without touching the connector', async () => {
    const connector = makeConnectorMock();
    const controller = new MercadoPagoController(connector, makeConnectorServiceMock(), makeStateService(), makePrisma());
    const reply = makeReply();

    await controller.callback({ code: 'some-code', state: 'not-a-real-token' }, reply);

    expect(connector.handleOAuthCallback).not.toHaveBeenCalled();
    expect(reply.redirect).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:4200/mercadopago?connector=mercadopago&status=error'),
      302,
    );
  });

  it('redirects to the "denied" page when the seller declines consent (no code, error=access_denied)', async () => {
    const connector = makeConnectorMock();
    const controller = new MercadoPagoController(connector, makeConnectorServiceMock(), makeStateService(), makePrisma());
    const reply = makeReply();

    await controller.callback({ error: 'access_denied' }, reply);

    expect(connector.handleOAuthCallback).not.toHaveBeenCalled();
    expect(reply.redirect).toHaveBeenCalledWith(expect.stringContaining('status=denied'), 302);
  });

  it('opens tenant context for the tenantId carried in state, delegates to the connector, redirects to "connected"', async () => {
    const stateService = makeStateService();
    const state = stateService.sign({ tenantId: 'tenant-9', userId: 'user-9', codeVerifier: 'v' });
    const connector = makeConnectorMock();
    const prisma = makePrisma();
    const controller = new MercadoPagoController(connector, makeConnectorServiceMock(), stateService, prisma);
    const reply = makeReply();

    await controller.callback({ code: 'auth-code', state }, reply);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(connector.handleOAuthCallback).toHaveBeenCalledWith('tenant-9', 'auth-code', state);
    expect(reply.redirect).toHaveBeenCalledWith(expect.stringContaining('status=connected'), 302);
  });

  it('redirects to the error page (without leaking the internal failure) when the connector throws', async () => {
    const stateService = makeStateService();
    const state = stateService.sign({ tenantId: 'tenant-1', userId: 'user-1', codeVerifier: 'v' });
    const connector = makeConnectorMock({
      handleOAuthCallback: jest.fn().mockRejectedValue(new Error('invalid_grant')),
    });
    const controller = new MercadoPagoController(connector, makeConnectorServiceMock(), stateService, makePrisma());
    const reply = makeReply();

    await controller.callback({ code: 'auth-code', state }, reply);

    expect(reply.redirect).toHaveBeenCalledWith(expect.stringContaining('status=error'), 302);
  });
});

describe('MercadoPagoController.disconnect', () => {
  it('delegates to the connector for the current tenant', async () => {
    const connector = makeConnectorMock();
    const controller = new MercadoPagoController(connector, makeConnectorServiceMock(), makeStateService(), makePrisma());

    const result = await runAsUser(() => controller.disconnect());

    expect(connector.disconnect).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual({ status: 'DISCONNECTED' });
  });
});

describe('MercadoPagoController.status', () => {
  it('reports DISCONNECTED when this tenant never started connecting', async () => {
    const connectorService = makeConnectorServiceMock({ getConnector: jest.fn().mockResolvedValue(null) });
    const controller = new MercadoPagoController(makeConnectorMock(), connectorService, makeStateService(), makePrisma());

    const result = await runAsUser(() => controller.status());

    expect(result).toEqual({
      status: 'DISCONNECTED',
      nickname: null,
      connectedAt: null,
      connectedByName: null,
      linksEnabled: true,
    });
  });

  it('reports the stored status/nickname/connectedAt when a connector exists', async () => {
    const connectedAt = new Date('2026-08-30');
    const connectorService = makeConnectorServiceMock({
      getConnector: jest
        .fn()
        .mockResolvedValue({ status: 'CONNECTED', externalNickname: 'MI NEGOCIO', connectedAt }),
    });
    const controller = new MercadoPagoController(makeConnectorMock(), connectorService, makeStateService(), makePrisma());

    const result = await runAsUser(() => controller.status());

    expect(result).toEqual({ status: 'CONNECTED', nickname: 'MI NEGOCIO', connectedAt, connectedByName: null, linksEnabled: true });
  });

  it('names the user who connected the account', async () => {
    const connectorService = makeConnectorServiceMock({
      getConnector: jest.fn().mockResolvedValue({
        status: 'CONNECTED',
        externalNickname: 'MI NEGOCIO',
        connectedAt: null,
        connectedByUserId: 'user-9',
      }),
    });
    const findUnique = jest.fn().mockResolvedValue({ name: null, email: 'laura@ejemplo.com' });
    const controller = new MercadoPagoController(makeConnectorMock(), connectorService, makeStateService(), makePrisma());

    const result = await tenantContextStorage.run(
      {
        tenantId: 'tenant-1',
        userId: 'user-1',
        roles: ['OWNER'],
        tx: {
          user: { findUnique },
          tenantSettings: { findUnique: jest.fn().mockResolvedValue({ mercadoPagoLinksEnabled: false }) },
        } as never,
      },
      () => controller.status(),
    );

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'user-9' }, select: { name: true, email: true } });
    expect(result.connectedByName).toBe('laura@ejemplo.com');
    expect(result.linksEnabled).toBe(false);
  });
});
