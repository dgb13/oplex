import { Injectable, Logger } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';

export const VISIT_RANGES = [1, 7, 30, 90] as const;
export type VisitRange = (typeof VISIT_RANGES)[number];

const DAY_MS = 86_400_000;
// Argentina no tiene horario de verano: siempre UTC-3.
const AR_OFFSET_MS = -3 * 3_600_000;
const CACHE_MS = 15 * 60_000;
const ACTIVE_WINDOW_MS = 7 * DAY_MS;
const CF_GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

export interface RankRow {
  key: string;
  value: number;
}

export interface VisitsDay {
  /** YYYY-MM-DD en hora de Argentina. */
  date: string;
  visits: number;
  pageViews: number;
  signups: number;
}

export interface VisitsReport {
  range: VisitRange;
  /** false = falta CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_ANALYTICS_TOKEN en el .env. */
  cloudflareConfigured: boolean;
  /** Error al consultar Cloudflare (los números de Oplex igual se muestran). */
  cloudflareError: string | null;
  generatedAt: string;
  visits: number | null;
  pageViews: number | null;
  previousVisits: number | null;
  signups: number;
  previousSignups: number;
  activeCompanies: number;
  payingCompanies: number;
  days: VisitsDay[];
  countries: RankRow[];
  referers: RankRow[];
  pages: RankRow[];
  devices: RankRow[];
}

interface CloudflareData {
  visits: number;
  pageViews: number;
  previousVisits: number;
  hours: Array<{ hour: string; visits: number; pageViews: number }>;
  countries: RankRow[];
  referers: RankRow[];
  pages: RankRow[];
  devices: RankRow[];
}

// Las consultas de más de 7 días salen de datos resumidos que todavía no
// incluyen las visitas recientes (probado contra la API: 7 días traía las
// de hoy, 7,9 días no). Por eso un período largo se pide en dos tramos -
// los últimos 7 días y lo anterior - y se suman.
const RECENT_SPLIT_MS = 7 * DAY_MS;
const RANK_LIMIT = 8;

const FILTER_TYPE = 'AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject';
const QUERY = `query Visits($acc: string!, $cur: ${FILTER_TYPE}!, $chart: ${FILTER_TYPE}!) {
  viewer { accounts(filter: { accountTag: $acc }) {
    total: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $cur) { count sum { visits } }
    byHour: rumPageloadEventsAdaptiveGroups(limit: 5000, filter: $chart, orderBy: [datetimeHour_ASC]) { count sum { visits } dimensions { datetimeHour } }
    byCountry: rumPageloadEventsAdaptiveGroups(limit: 20, filter: $cur, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { countryName } }
    byReferer: rumPageloadEventsAdaptiveGroups(limit: 20, filter: $cur, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { refererHost } }
    byPath: rumPageloadEventsAdaptiveGroups(limit: 20, filter: $cur, orderBy: [count_DESC]) { count dimensions { requestPath } }
    byDevice: rumPageloadEventsAdaptiveGroups(limit: 20, filter: $cur, orderBy: [sum_visits_DESC]) { sum { visits } dimensions { deviceType userAgentBrowser } }
  } } }`;
const PREVIOUS_QUERY = `query Previous($acc: string!, $prev: ${FILTER_TYPE}!) {
  viewer { accounts(filter: { accountTag: $acc }) {
    previous: rumPageloadEventsAdaptiveGroups(limit: 1, filter: $prev) { sum { visits } }
  } } }`;

/** Medianoche de Argentina del día de `t`, como instante UTC. */
function arMidnight(t: number): number {
  const local = t + AR_OFFSET_MS;
  return local - (local % DAY_MS) - AR_OFFSET_MS;
}

function arDate(t: number): string {
  return new Date(t + AR_OFFSET_MS).toISOString().slice(0, 10);
}

type Group = { count?: number; sum?: { visits?: number }; dimensions?: Record<string, string> };

/**
 * /admin/visitas: visitas de la web pública (Cloudflare Web Analytics, ver
 * PublicWebAnalytics en la web) cruzadas con lo que sabe Oplex - registros,
 * empresas activas y que pagan.
 *
 * Cloudflare: API GraphQL, dataset rumPageloadEventsAdaptiveGroups, con un
 * token de cuenta de sólo lectura (Account Analytics: Read). Los números
 * son MUESTREADOS (Cloudflare guarda una parte y estima el total), guarda
 * unos 6 meses y acepta hasta ~93 días por consulta - por eso 90 días es el
 * período más largo. Sólo cuenta requestHost = DOMAIN (y www.) y sin bots.
 *
 * Embudo por cohorte: de las empresas registradas en el período, cuántas
 * tuvieron actividad de algún usuario en los últimos 7 días y cuántas
 * tienen la suscripción ACTIVE (paga; TRIALING no cuenta).
 *
 * Cache de 15 minutos por período: el panel no le pega a Cloudflare en cada
 * carga.
 */
@Injectable()
export class VisitsAnalyticsService {
  private readonly logger = new Logger(VisitsAnalyticsService.name);
  private readonly cache = new Map<VisitRange, { at: number; report: VisitsReport }>();

  constructor(private readonly prisma: PrismaService) {}

  async report(range: VisitRange): Promise<VisitsReport> {
    const cached = this.cache.get(range);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.report;

    const now = Date.now();
    // "Hoy" = desde la medianoche de Argentina; el resto, N días hacia atrás.
    const from = range === 1 ? arMidnight(now) : now - range * DAY_MS;
    const span = now - from;
    const prevFrom = from - (range === 1 ? DAY_MS : span);
    const prevTo = range === 1 ? now - DAY_MS : from;
    // El gráfico de "Hoy" muestra la última semana, como en el boceto.
    const chartFrom = range === 1 ? arMidnight(now) - 6 * DAY_MS : arMidnight(from);

    const [cf, oplex] = await Promise.all([
      this.cloudflare({ from, to: now, prevFrom, prevTo, chartFrom }),
      this.oplexNumbers({ from, now, prevFrom, prevTo }),
    ]);

    const days = new Map<string, VisitsDay>();
    for (let t = chartFrom; t <= now; t += DAY_MS) {
      const date = arDate(t);
      days.set(date, { date, visits: 0, pageViews: 0, signups: 0 });
    }
    for (const h of cf.data?.hours ?? []) {
      const day = days.get(arDate(new Date(h.hour).getTime()));
      if (day) {
        day.visits += h.visits;
        day.pageViews += h.pageViews;
      }
    }
    for (const createdAt of oplex.signupDates) {
      const day = days.get(arDate(createdAt.getTime()));
      if (day) day.signups += 1;
    }

    const report: VisitsReport = {
      range,
      cloudflareConfigured: cf.configured,
      cloudflareError: cf.error,
      generatedAt: new Date(now).toISOString(),
      visits: cf.data?.visits ?? null,
      pageViews: cf.data?.pageViews ?? null,
      previousVisits: cf.data?.previousVisits ?? null,
      signups: oplex.signups,
      previousSignups: oplex.previousSignups,
      activeCompanies: oplex.active,
      payingCompanies: oplex.paying,
      days: [...days.values()],
      countries: cf.data?.countries ?? [],
      referers: cf.data?.referers ?? [],
      pages: cf.data?.pages ?? [],
      devices: cf.data?.devices ?? [],
    };
    // Un error de Cloudflare no se cachea: la próxima carga reintenta.
    if (!cf.error) this.cache.set(range, { at: now, report });
    return report;
  }

  private async cloudflare(p: {
    from: number;
    to: number;
    prevFrom: number;
    prevTo: number;
    chartFrom: number;
  }): Promise<{ configured: boolean; error: string | null; data: CloudflareData | null }> {
    const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
    const token = process.env['CLOUDFLARE_ANALYTICS_TOKEN'];
    if (!accountId || !token) return { configured: false, error: null, data: null };

    const domain = process.env['DOMAIN'] || 'oplex.com.ar';
    const filter = (from: number, to: number) => ({
      datetime_geq: new Date(from).toISOString(),
      datetime_lt: new Date(to).toISOString(),
      requestHost_in: [domain, `www.${domain}`],
      bot: 0,
    });

    const post = async (query: string, variables: Record<string, unknown>) => {
      const res = await fetch(CF_GRAPHQL_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { acc: accountId, ...variables } }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json()) as {
        data?: { viewer?: { accounts?: Array<Record<string, Group[]>> } };
        errors?: Array<{ message: string }> | null;
      };
      if (!res.ok || body.errors?.length) throw new Error(body.errors?.[0]?.message ?? `HTTP ${res.status}`);
      return body.data?.viewer?.accounts?.[0] ?? {};
    };

    // Tramos del gráfico (que arranca igual o antes que el período):
    // [inicio, ahora - 7 días) y [ahora - 7 días, ahora], si hace falta. En
    // cada tramo los totales y rankings usan sólo la parte que cae dentro
    // del período (un tramo vacío no devuelve nada).
    const split = p.to - RECENT_SPLIT_MS;
    const segments: Array<[number, number]> =
      p.chartFrom < split
        ? [
            [p.chartFrom, split],
            [split, p.to],
          ]
        : [[p.chartFrom, p.to]];

    try {
      const parts = await Promise.all(
        segments.map(([a, b]) => {
          const curFrom = Math.min(Math.max(a, p.from), b);
          return post(QUERY, { cur: filter(curFrom, b), chart: filter(a, b) });
        }),
      );
      const previous = await post(PREVIOUS_QUERY, { prev: filter(p.prevFrom, p.prevTo) });

      const visitsOf = (g: Group) => g.sum?.visits ?? 0;
      const merge = (alias: string, key: (g: Group) => string, value: (g: Group) => number): RankRow[] => {
        const sums = new Map<string, number>();
        for (const acc of parts) {
          for (const g of acc[alias] ?? []) sums.set(key(g), (sums.get(key(g)) ?? 0) + value(g));
        }
        return [...sums.entries()]
          .map(([k, v]) => ({ key: k, value: v }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, RANK_LIMIT);
      };
      const sumTotal = (pick: (g: Group) => number) =>
        parts.reduce((s, acc) => s + pick(acc['total']?.[0] ?? {}), 0);

      return {
        configured: true,
        error: null,
        data: {
          visits: sumTotal(visitsOf),
          pageViews: sumTotal((g) => g.count ?? 0),
          previousVisits: visitsOf(previous['previous']?.[0] ?? {}),
          hours: parts.flatMap((acc) =>
            (acc['byHour'] ?? []).map((g) => ({
              hour: g.dimensions?.['datetimeHour'] ?? '',
              visits: visitsOf(g),
              pageViews: g.count ?? 0,
            })),
          ),
          countries: merge('byCountry', (g) => g.dimensions?.['countryName'] ?? '', visitsOf),
          referers: merge('byReferer', (g) => g.dimensions?.['refererHost'] ?? '', visitsOf),
          pages: merge('byPath', (g) => g.dimensions?.['requestPath'] ?? '', (g) => g.count ?? 0),
          devices: merge(
            'byDevice',
            (g) => `${g.dimensions?.['deviceType'] ?? ''}|${g.dimensions?.['userAgentBrowser'] ?? ''}`,
            visitsOf,
          ),
        },
      };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.warn(`Cloudflare Web Analytics: ${message}`);
      return { configured: true, error: message, data: null };
    }
  }

  /** Mismo recipe que AdminTenantsService.listTenants: un withTenantContext
   * por tenant; uno que falla no tumba el panel. */
  private async oplexNumbers(p: { from: number; now: number; prevFrom: number; prevTo: number }) {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    const signupDates: Date[] = [];
    let signups = 0;
    let previousSignups = 0;
    let active = 0;
    let paying = 0;

    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          const db = getTenantDb();
          const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { createdAt: true } });
          const created = tenant.createdAt.getTime();
          signupDates.push(tenant.createdAt);
          if (created >= p.prevFrom && created < p.prevTo) previousSignups += 1;
          if (created < p.from || created > p.now) return;

          signups += 1;
          const [recentActivity, subscription] = await Promise.all([
            db.userActivityLog.count({ where: { createdAt: { gte: new Date(p.now - ACTIVE_WINDOW_MS) } } }),
            db.tenantSubscription.findUnique({ where: { tenantId }, select: { status: true } }),
          ]);
          if (recentActivity > 0) active += 1;
          if (subscription?.status === 'ACTIVE') paying += 1;
        });
      } catch (err) {
        this.logger.error(`Visitas: no se pudo leer el tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
    return { signupDates, signups, previousSignups, active, paying };
  }
}
