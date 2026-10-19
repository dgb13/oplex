import { tenantContextStorage } from '@plexo/database';

jest.mock('@plexo/receivables', () => ({}));
jest.mock('@plexo/pos', () => ({}));
jest.mock('@plexo/reports-sales', () => ({}));
jest.mock('@plexo/inventory', () => ({}));
jest.mock('@plexo/payables', () => ({}));
jest.mock('@plexo/purchases', () => ({}));

import {
  accessFromConfig,
  AssistantAccessService,
  blockedTopicFor,
  normalizeTopicsByRole,
  type AssistantTenantConfigView,
} from './assistant-access.service.js';
import { DEFAULT_TOPICS_BY_ROLE } from './assistant-topics.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function config(overrides: Partial<AssistantTenantConfigView> = {}): AssistantTenantConfigView {
  return { webEnabled: true, whatsappEnabled: true, salesOwnDataOnly: true, topicsByRole: DEFAULT_TOPICS_BY_ROLE, ...overrides };
}

describe('normalizeTopicsByRole', () => {
  it('uses the defaults when nothing was saved yet', () => {
    expect(normalizeTopicsByRole(null)).toEqual(DEFAULT_TOPICS_BY_ROLE);
  });

  it('drops unknown topics and roles, and never grants a topic the role cannot have in Oplex', () => {
    const result = normalizeTopicsByRole({
      caja: ['ACCOUNTANT', 'SALES'],
      compras: ['SALES', 'PURCHASES', 'OWNER', 'HACKER'],
      sueldos: ['SALES'],
    });

    // Contador/a no tiene Caja y Ventas no tiene Cuentas a pagar en el sistema.
    expect(result.caja).toEqual(['SALES']);
    expect(result.compras).toEqual(['PURCHASES']);
    expect(result).not.toHaveProperty('sueldos');
  });

  it('keeps an explicitly emptied topic empty instead of falling back to the default', () => {
    expect(normalizeTopicsByRole({ ventas: [] }).ventas).toEqual([]);
  });
});

describe('accessFromConfig', () => {
  it('gives OWNER and ADMIN every topic regardless of the matrix', () => {
    const empty = config({ topicsByRole: normalizeTopicsByRole(Object.fromEntries(Object.keys(DEFAULT_TOPICS_BY_ROLE).map((k) => [k, []]))) });

    const access = accessFromConfig(empty, { sub: 'u', role: 'ADMIN' });

    expect([...access.allowedTopics].sort()).toEqual(['ayuda', 'caja', 'compras', 'costos', 'deudas', 'stock', 'ventas']);
    expect(access.allowedTools).toEqual(
      new Set(['ventas_por_articulo', 'deuda_por_cliente', 'saldo_caja', 'stock_articulo', 'costo_articulo', 'compras_resumen']),
    );
    expect(access.scope).toEqual({});
  });

  it('gives a configurable role only the topics enabled for it', () => {
    const access = accessFromConfig(config(), { sub: 'u', role: 'INVENTORY' });

    expect([...access.allowedTopics].sort()).toEqual(['ayuda', 'compras', 'stock']);
    expect(access.allowedTools).toEqual(new Set(['stock_articulo', 'compras_resumen']));
  });

  it('scopes SALES to its own invoices only when "salesOwnDataOnly" is on', () => {
    expect(accessFromConfig(config(), { sub: 'seller-1', role: 'SALES' }).scope).toEqual({ onlyIssuedBy: 'seller-1' });
    expect(accessFromConfig(config({ salesOwnDataOnly: false }), { sub: 'seller-1', role: 'SALES' }).scope).toEqual({});
    expect(accessFromConfig(config(), { sub: 'acc-1', role: 'ACCOUNTANT' }).scope).toEqual({});
  });
});

describe('blockedTopicFor', () => {
  const viewer = accessFromConfig(config(), { sub: 'u', role: 'VIEWER' });

  it('blocks a data question about a topic the person does not have', () => {
    expect(blockedTopicFor(viewer, { intent: 'datos', topic: 'ventas' })).toBe('ventas');
  });

  it('never blocks a question the classifier could not place in a topic', () => {
    expect(blockedTopicFor(viewer, { intent: 'datos', topic: 'otro' })).toBeNull();
  });

  it('blocks help questions only when "ayuda" is off for the role', () => {
    expect(blockedTopicFor(viewer, { intent: 'ayuda', topic: 'otro' })).toBeNull();
    const noHelp = accessFromConfig(config({ topicsByRole: normalizeTopicsByRole({ ayuda: [] }) }), { sub: 'u', role: 'VIEWER' });
    expect(blockedTopicFor(noHelp, { intent: 'ayuda', topic: 'otro' })).toBe('ayuda');
  });
});

describe('AssistantAccessService', () => {
  const service = new AssistantAccessService();

  it('shows a non-capable cell as disabled with the reason', async () => {
    const db = { assistantTenantConfig: { findUnique: jest.fn().mockResolvedValue(null) } };

    const screen = await runInTenant(db, () => service.getConfigScreen());

    const caja = screen.topics.find((t) => t.id === 'caja');
    expect(caja?.cells.find((c) => c.role === 'ACCOUNTANT')).toEqual({
      role: 'ACCOUNTANT',
      enabled: false,
      capable: false,
      reason: 'El rol Contador/a no tiene acceso a Caja en Oplex.',
    });
    expect(screen.webEnabled).toBe(true);
  });

  it('merges a partial update over the current matrix and upserts the tenant row', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ webEnabled: true, whatsappEnabled: false, salesOwnDataOnly: true, topicsByRole: { ventas: ['SALES'] } });
    const db = { assistantTenantConfig: { findUnique, upsert } };

    await runInTenant(db, () => service.updateConfig({ whatsappEnabled: false, topicsByRole: { ventas: ['SALES'] } }));

    const data = upsert.mock.calls[0][0].update;
    expect(upsert.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-1' });
    expect(data.whatsappEnabled).toBe(false);
    expect(data.webEnabled).toBe(true);
    expect(data.topicsByRole.ventas).toEqual(['SALES']);
    // Los demás temas quedan como estaban (acá, los defaults).
    expect(data.topicsByRole.stock).toEqual(DEFAULT_TOPICS_BY_ROLE.stock);
  });
});
