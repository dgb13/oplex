import type { PrismaService } from '@plexo/database';
import { AdminTenantInsightsService, computeTenantHealth } from './admin-tenant-insights.service.js';

const NOW = new Date('2026-10-25T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('computeTenantHealth', () => {
  const base = {
    status: 'ACTIVE' as const,
    subscriptionStatus: 'ACTIVE',
    trialEndsAt: null,
    lastActivityAt: daysAgo(0),
    openTickets: 0,
  };

  it('is ok for an active, paying, recently used tenant', () => {
    expect(computeTenantHealth(base, NOW)).toEqual({ health: 'ok', reasons: [] });
  });

  it('warns after 7 idle days, a trial ending soon or open tickets', () => {
    expect(computeTenantHealth({ ...base, lastActivityAt: daysAgo(8) }, NOW)).toEqual({
      health: 'warn',
      reasons: ['Sin actividad hace 8 días'],
    });
    expect(
      computeTenantHealth({ ...base, subscriptionStatus: 'TRIALING', trialEndsAt: new Date(NOW.getTime() + 3 * 86400000) }, NOW)
        .reasons,
    ).toEqual(['La prueba vence en 3 días']);
    expect(computeTenantHealth({ ...base, openTickets: 2 }, NOW).health).toBe('warn');
  });

  it('is bad when suspended, past due, idle 14+ days or never used', () => {
    expect(computeTenantHealth({ ...base, status: 'SUSPENDED' }, NOW).health).toBe('bad');
    expect(computeTenantHealth({ ...base, subscriptionStatus: 'PAST_DUE' }, NOW).health).toBe('bad');
    expect(computeTenantHealth({ ...base, lastActivityAt: daysAgo(16) }, NOW).reasons).toEqual(['Sin actividad hace 16 días']);
    expect(computeTenantHealth({ ...base, lastActivityAt: null }, NOW).reasons).toEqual(['Nunca usó el sistema']);
  });
});

describe('AdminTenantInsightsService.listTenants', () => {
  function makeListPrisma(tenantIds: string[]) {
    const fakeTx = {
      tenant: { findUniqueOrThrow: jest.fn() },
      user: { count: jest.fn().mockResolvedValue(3) },
      invoice: { count: jest.fn().mockResolvedValue(7), findFirst: jest.fn().mockResolvedValue(null) },
      tenantSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      article: { count: jest.fn().mockResolvedValue(120) },
      companyRole: { count: jest.fn().mockResolvedValueOnce(40).mockResolvedValueOnce(5) },
      quote: { count: jest.fn().mockResolvedValue(9) },
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          afipEnv: 'PRODUCCION',
          afipCertExpiresAt: new Date('2028-01-01'),
          afipProductionAt: new Date('2026-10-01'),
        }),
      },
      whatsAppLink: { count: jest.fn().mockResolvedValue(1) },
      connector: { findUnique: jest.fn().mockResolvedValue(null) },
      storefrontSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      userActivityLog: { findFirst: jest.fn().mockResolvedValue({ createdAt: new Date() }) },
      supportTicket: { count: jest.fn().mockResolvedValue(0) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(tenantIds.map((id) => ({ id }))),
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    return { prisma, fakeTx };
  }

  it('returns one summary per tenant with integrations and usage', async () => {
    const { prisma, fakeTx } = makeListPrisma(['tenant-1']);
    fakeTx.tenant.findUniqueOrThrow.mockResolvedValue({
      id: 'tenant-1',
      name: 'Acme',
      taxId: '30-11111111-1',
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01'),
    });
    const service = new AdminTenantInsightsService(prisma);

    const [row] = await service.listTenants();

    expect(row).toMatchObject({
      id: 'tenant-1',
      activeUsers: 3,
      invoicesThisMonth: 7,
      articles: 120,
      customers: 40,
      suppliers: 5,
      quotes: 9,
      arcaEnv: 'PRODUCCION',
      whatsappLinks: 1,
      mercadoPagoConnectedAt: null,
      health: 'ok',
    });
  });

  it('skips a tenant that fails to load instead of aborting the whole list', async () => {
    const { prisma, fakeTx } = makeListPrisma(['tenant-1', 'tenant-2']);
    fakeTx.companyRole.count.mockResolvedValue(0);
    fakeTx.tenant.findUniqueOrThrow
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'tenant-2', name: 'Beta', taxId: null, status: 'ACTIVE', createdAt: new Date() });
    const service = new AdminTenantInsightsService(prisma);

    const result = await service.listTenants();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tenant-2');
  });
});
