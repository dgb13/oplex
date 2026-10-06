import type { PrismaService } from '@plexo/database';
import { VisitsAnalyticsService } from './visits-analytics.service.js';

const DAY = 86_400_000;
const NOW = new Date('2026-10-20T15:00:00Z').getTime(); // 12:00 en Argentina

// withTenantContext/getTenantDb reales necesitan Postgres: se simulan con un
// "tenant actual" que el mock de getTenantDb lee.
let currentTenant = '';
const tenantRows: Record<string, { createdAt: Date; activity: number; status: string | null }> = {};
jest.mock('@plexo/database', () => ({
  withTenantContext: async (_p: unknown, tenantId: string, fn: () => Promise<unknown>) => {
    currentTenant = tenantId;
    return fn();
  },
  getTenantDb: () => ({
    tenant: { findUniqueOrThrow: async () => ({ createdAt: tenantRows[currentTenant].createdAt }) },
    userActivityLog: { count: async () => tenantRows[currentTenant].activity },
    tenantSubscription: {
      findUnique: async () => (tenantRows[currentTenant].status ? { status: tenantRows[currentTenant].status } : null),
    },
  }),
}));

function prismaWith(ids: string[]) {
  return { $queryRaw: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))) } as unknown as PrismaService;
}

function cfResponse(account: Record<string, unknown>) {
  return { ok: true, status: 200, json: async () => ({ data: { viewer: { accounts: [account] } }, errors: null }) };
}

type CfCall = { query: string; variables: Record<string, { datetime_geq: string; datetime_lt: string }> };
const calls = (mock: jest.Mock): CfCall[] => mock.mock.calls.map((c) => JSON.parse(c[1].body));
const SPLIT = new Date(NOW - 7 * DAY).toISOString();

describe('VisitsAnalyticsService', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    for (const k of Object.keys(tenantRows)) delete tenantRows[k];
    tenantRows['t-new-active-paying'] = { createdAt: new Date(NOW - 3 * DAY), activity: 12, status: 'ACTIVE' };
    tenantRows['t-new-trial'] = { createdAt: new Date(NOW - 5 * DAY), activity: 4, status: 'TRIALING' };
    tenantRows['t-new-idle'] = { createdAt: new Date(NOW - 6 * DAY), activity: 0, status: 'TRIALING' };
    tenantRows['t-prev'] = { createdAt: new Date(NOW - 10 * DAY), activity: 9, status: 'ACTIVE' };
    tenantRows['t-old'] = { createdAt: new Date(NOW - 200 * DAY), activity: 30, status: 'ACTIVE' };
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('sin token de Cloudflare igual arma el embudo con los datos de Oplex', async () => {
    delete process.env['CLOUDFLARE_ACCOUNT_ID'];
    delete process.env['CLOUDFLARE_ANALYTICS_TOKEN'];
    global.fetch = jest.fn();
    const service = new VisitsAnalyticsService(prismaWith(Object.keys(tenantRows)));

    const r = await service.report(7);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(r.cloudflareConfigured).toBe(false);
    expect(r.visits).toBeNull();
    // Cohorte de los últimos 7 días: 3 registros, 2 con actividad, 1 pagando.
    expect(r).toEqual(expect.objectContaining({ signups: 3, previousSignups: 1, activeCompanies: 2, payingCompanies: 1 }));
    expect(r.days).toHaveLength(8);
    expect(r.days.reduce((s, d) => s + d.signups, 0)).toBe(3);
  });

  it('suma visitas por día en hora de Argentina y arma los rankings', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_ANALYTICS_TOKEN'] = 'tok';
    process.env['DOMAIN'] = 'oplex.com.ar';
    const recent = cfResponse({
        total: [{ count: 300, sum: { visits: 120 } }],
        byHour: [
          // 02:00 UTC del 20 = 23:00 del 19 en Argentina.
          { count: 20, sum: { visits: 10 }, dimensions: { datetimeHour: '2026-10-20T02:00:00Z' } },
          { count: 30, sum: { visits: 20 }, dimensions: { datetimeHour: '2026-10-20T13:00:00Z' } },
        ],
        byCountry: [
          { sum: { visits: 100 }, dimensions: { countryName: 'AR' } },
          { sum: { visits: 0 }, dimensions: { countryName: 'XX' } },
        ],
        byReferer: [{ sum: { visits: 50 }, dimensions: { refererHost: '' } }],
        byPath: [{ count: 200, dimensions: { requestPath: '/' } }],
        byDevice: [{ sum: { visits: 70 }, dimensions: { deviceType: 'mobile', userAgentBrowser: 'Chrome' } }],
      });
    // "7 días": el gráfico arranca a la medianoche de hace 7 días, antes del
    // corte, así que hay un tramo viejo (vacío) y uno reciente.
    const fetchMock = jest.fn(async (_url: string, init: { body: string }) => {
      const { query, variables } = JSON.parse(init.body);
      if (query.includes('Previous')) return cfResponse({ previous: [{ sum: { visits: 80 } }] });
      return variables.chart.datetime_geq === SPLIT ? recent : cfResponse({});
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new VisitsAnalyticsService(prismaWith([]));

    const r = await service.report(7);

    expect(r).toEqual(expect.objectContaining({ visits: 120, pageViews: 300, previousVisits: 80, cloudflareError: null }));
    expect(r.days.find((d) => d.date === '2026-10-19')?.visits).toBe(10);
    expect(r.days.find((d) => d.date === '2026-10-20')?.visits).toBe(20);
    expect(r.countries).toEqual([{ key: 'AR', value: 100 }]);
    expect(r.devices).toEqual([{ key: 'mobile|Chrome', value: 70 }]);

    const sent = calls(fetchMock as unknown as jest.Mock);
    expect(sent).toHaveLength(3);
    expect(sent[0].variables['cur']).toEqual(
      expect.objectContaining({ requestHost_in: ['oplex.com.ar', 'www.oplex.com.ar'], bot: 0 }),
    );
    // El tramo viejo no suma nada al período (cur vacío: desde = hasta).
    expect(sent[0].variables['cur'].datetime_geq).toBe(sent[0].variables['cur'].datetime_lt);
    expect((fetchMock.mock.calls[0][1] as unknown as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer tok');
  });

  it('"Hoy" arranca a la medianoche de Argentina y el gráfico muestra la semana', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_ANALYTICS_TOKEN'] = 'tok';
    const fetchMock = jest.fn().mockResolvedValue(cfResponse({}));
    global.fetch = fetchMock;
    const service = new VisitsAnalyticsService(prismaWith([]));

    const r = await service.report(1);

    const sent = calls(fetchMock);
    // Hoy y su semana caben en un solo tramo, más la consulta del período anterior.
    expect(sent).toHaveLength(2);
    expect(sent[0].variables['cur'].datetime_geq).toBe('2026-10-20T03:00:00.000Z');
    expect(r.days).toHaveLength(7);
  });

  it('un error de Cloudflare se informa, no rompe el reporte y no se cachea', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_ANALYTICS_TOKEN'] = 'tok';
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: null, errors: [{ message: 'not authorized' }] }) });
    global.fetch = fetchMock;
    const service = new VisitsAnalyticsService(prismaWith(Object.keys(tenantRows)));

    const r = await service.report(30);
    await service.report(30);

    expect(r.cloudflareError).toBe('not authorized');
    expect(r.visits).toBeNull();
    expect(r.signups).toBe(4);
    // 30 días = 2 tramos por reporte; el error no se cachea, el segundo reintenta.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('cachea 15 minutos por período', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_ANALYTICS_TOKEN'] = 'tok';
    const fetchMock = jest.fn().mockResolvedValue(cfResponse({ total: [{ count: 1, sum: { visits: 1 } }] }));
    global.fetch = fetchMock;
    const service = new VisitsAnalyticsService(prismaWith([]));

    await service.report(30);
    await service.report(30);
    jest.setSystemTime(NOW + 16 * 60_000);
    await service.report(30);

    // 3 consultas por reporte (2 tramos + período anterior), 2 reportes reales.
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('30 días se pide en dos tramos y se suman', async () => {
    process.env['CLOUDFLARE_ACCOUNT_ID'] = 'acc';
    process.env['CLOUDFLARE_ANALYTICS_TOKEN'] = 'tok';
    const fetchMock = jest.fn(async (_url: string, init: { body: string }) => {
      const { query, variables } = JSON.parse(init.body);
      if (query.includes('Previous')) return cfResponse({ previous: [{ sum: { visits: 5 } }] });
      const old = variables.cur.datetime_lt === SPLIT;
      return cfResponse({
        total: [{ count: old ? 40 : 10, sum: { visits: old ? 20 : 5 } }],
        byCountry: [{ sum: { visits: old ? 20 : 5 }, dimensions: { countryName: 'AR' } }],
        byPath: [{ count: old ? 40 : 10, dimensions: { requestPath: old ? '/' : '/signup' } }],
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new VisitsAnalyticsService(prismaWith([]));

    const r = await service.report(30);

    expect(r).toEqual(expect.objectContaining({ visits: 25, pageViews: 50, previousVisits: 5 }));
    expect(r.countries).toEqual([{ key: 'AR', value: 25 }]);
    expect(r.pages).toEqual([
      { key: '/', value: 40 },
      { key: '/signup', value: 10 },
    ]);
  });
});
