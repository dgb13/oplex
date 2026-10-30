import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext, type TenantStatus } from '@plexo/database';

export type TenantHealth = 'ok' | 'warn' | 'bad';

/** Fila de la lista de Tenants del admin: plan, integraciones y uso. */
export interface TenantSummary {
  id: string;
  name: string;
  taxId: string | null;
  status: TenantStatus;
  createdAt: Date;
  activeUsers: number;
  invoicesThisMonth: number;
  planKey: string | null;
  planName: string | null;
  planPriceMonthly: number | null;
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  articles: number;
  customers: number;
  suppliers: number;
  quotes: number;
  arcaEnv: 'PRODUCCION' | 'HOMOLOGACION' | null; // null = sin certificado
  arcaProductionAt: Date | null;
  firstCaeInvoiceAt: Date | null;
  whatsappLinks: number;
  mercadoPagoConnectedAt: Date | null;
  storefrontPublished: boolean;
  lastActivityAt: Date | null;
  openTickets: number;
  health: TenantHealth;
  healthReasons: string[];
}

export interface TenantUserDetail {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  createdAt: Date;
  lastLoginAt: Date | null;
  whatsappPhone: string | null; // enmascarado, sólo los últimos 4 dígitos
  whatsappVerifiedAt: Date | null;
}

export interface TenantMilestone {
  key: string;
  label: string;
  at: Date | null;
  detail: string | null;
}

export interface TenantDetail extends TenantSummary {
  milestones: TenantMilestone[];
  users: TenantUserDetail[];
  arca: {
    env: 'PRODUCCION' | 'HOMOLOGACION' | null;
    certExpiresAt: Date | null;
    lastCheckAt: Date | null;
    lastCheckOk: boolean | null;
    lastCheckMessage: string | null;
    productionAt: Date | null;
  };
  mercadoPago: {
    status: string | null;
    nickname: string | null;
    connectedAt: Date | null;
    lastErrorMessage: string | null;
    paymentsLast30Days: number;
  };
  storefront: { subdomain: string | null; published: boolean; template: string | null; ordersTotal: number };
  email: { mode: string; customDomain: string | null; domainStatus: string | null };
  usage: {
    invoicesTotal: number;
    assistantMessagesLast30Days: number;
    aiEventsLast30Days: number;
    errorsLast30Days: number;
    resolvedTickets: number;
  };
  note: { body: string; updatedByEmail: string | null; updatedAt: Date } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rango del mes calendario actual en UTC - mismo criterio que
 * defaultDateRange() en reports-sales.service.ts, reescrito acá porque esa
 * función vive en una lib de reportes tenant-scoped y este uso es
 * cross-tenant (un solo "ahora" para el barrido completo, no por request). */
function currentMonthRangeUtc(now: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
}

/**
 * Semáforo de la lista. Reglas explícitas (se muestran como motivo en la
 * pantalla, nada deducido en silencio):
 * - En riesgo: suspendido, suscripción vencida/cancelada/impaga, o sin
 *   actividad hace 14 días o más.
 * - Mirar: sin actividad hace 7 días o más, prueba que vence en 5 días o
 *   menos, o consultas de soporte sin resolver.
 */
export function computeTenantHealth(
  input: Pick<TenantSummary, 'status' | 'subscriptionStatus' | 'trialEndsAt' | 'lastActivityAt' | 'openTickets'>,
  now: Date,
): { health: TenantHealth; reasons: string[] } {
  const bad: string[] = [];
  const warn: string[] = [];
  if (input.status === 'SUSPENDED') bad.push('Suspendido');
  if (input.subscriptionStatus === 'PAST_DUE') bad.push('Pago vencido');
  if (input.subscriptionStatus === 'EXPIRED') bad.push('Prueba o plan vencido');
  if (input.subscriptionStatus === 'CANCELLED') bad.push('Dio de baja el plan');

  const idleDays = input.lastActivityAt ? Math.floor((now.getTime() - input.lastActivityAt.getTime()) / DAY_MS) : null;
  if (idleDays === null) bad.push('Nunca usó el sistema');
  else if (idleDays >= 14) bad.push(`Sin actividad hace ${idleDays} días`);
  else if (idleDays >= 7) warn.push(`Sin actividad hace ${idleDays} días`);

  if (input.subscriptionStatus === 'TRIALING' && input.trialEndsAt) {
    const left = Math.ceil((input.trialEndsAt.getTime() - now.getTime()) / DAY_MS);
    if (left < 0) warn.push('La prueba ya venció');
    else if (left <= 5) warn.push(left === 0 ? 'La prueba vence hoy' : `La prueba vence en ${left} días`);
  }
  if (input.openTickets > 0) warn.push(`${input.openTickets} consulta(s) sin resolver`);

  if (bad.length) return { health: 'bad', reasons: [...bad, ...warn] };
  if (warn.length) return { health: 'warn', reasons: warn };
  return { health: 'ok', reasons: [] };
}

function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}

/**
 * Panel de Tenants del backoffice (boceto aprobado): resumen con
 * integraciones y uso por tenant, y la ficha de cada uno. Cross-tenant: un
 * withTenantContext por tenant (list_tenant_ids(), mismo recipe que
 * SubscriptionsSchedulerService) - un tenant que falla no tumba el panel,
 * sólo falta en la lista con un log.
 */
@Injectable()
export class AdminTenantInsightsService {
  private readonly logger = new Logger(AdminTenantInsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listTenants(): Promise<TenantSummary[]> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    const now = new Date();
    const summaries: TenantSummary[] = [];
    for (const { id: tenantId } of tenants) {
      try {
        summaries.push(await withTenantContext(this.prisma, tenantId, () => this.loadSummary(tenantId, now)));
      } catch (err) {
        this.logger.error(`Failed to load tenant summary for ${tenantId}: ${(err as Error).message}`);
      }
    }
    return summaries;
  }

  async getTenantDetail(tenantId: string): Promise<TenantDetail> {
    const exists = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id WHERE id = ${tenantId}`;
    if (exists.length === 0) throw new NotFoundException('No existe ese tenant');
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);

    const detail = await withTenantContext(this.prisma, tenantId, async () => {
      const db = getTenantDb();
      const summary = await this.loadSummary(tenantId, now);
      const [
        settings,
        users,
        logins,
        waLinks,
        firstArticle,
        firstQuote,
        firstCaeInvoice,
        connector,
        mpPayments,
        storefront,
        storefrontOrders,
        invoicesTotal,
        assistantMessages,
        resolvedTickets,
        firstPaidPayment,
      ] = await Promise.all([
        db.tenantSettings.findUnique({
          where: { tenantId },
          select: {
            afipEnv: true,
            afipCertExpiresAt: true,
            afipLastCheckAt: true,
            afipLastCheckOk: true,
            afipLastCheckMessage: true,
            afipProductionAt: true,
            emailSenderMode: true,
            emailCustomDomain: true,
            domainStatus: true,
          },
        }),
        db.user.findMany({
          select: { id: true, email: true, name: true, roles: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        db.userActivityLog.groupBy({
          by: ['userId'],
          where: { action: 'auth.login', outcome: 'SUCCESS' },
          _max: { createdAt: true },
        }),
        db.whatsAppLink.findMany({ select: { userId: true, phoneE164: true, verifiedAt: true } }),
        db.article.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
        db.quote.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true, number: true } }),
        db.invoice.findFirst({
          where: { afipCae: { not: null } },
          orderBy: { issueDate: 'asc' },
          select: { issueDate: true, pointOfSale: true, number: true },
        }),
        db.connector.findUnique({
          where: { tenantId_provider: { tenantId, provider: 'MERCADO_PAGO' } },
          select: { status: true, externalNickname: true, connectedAt: true, lastErrorMessage: true },
        }),
        db.mercadoPagoPayment.count({ where: { createdAt: { gte: since30 } } }),
        db.storefrontSettings.findUnique({
          where: { tenantId },
          select: { subdomain: true, published: true, template: true, createdAt: true },
        }),
        db.storefrontOrder.count(),
        db.invoice.count(),
        db.assistantMessage.count({ where: { role: 'USER', createdAt: { gte: since30 } } }),
        db.supportTicket.count({ where: { status: 'RESOLVED' } }),
        db.subscriptionPayment.findFirst({
          where: { status: 'PAID' },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ]);

      const lastLoginByUser = new Map(logins.map((l) => [l.userId, l._max.createdAt]));
      const waByUser = new Map(waLinks.map((w) => [w.userId, w]));
      const firstWa = waLinks.reduce<Date | null>(
        (min, w) => (min === null || w.verifiedAt < min ? w.verifiedAt : min),
        null,
      );

      const milestones: TenantMilestone[] = [
        { key: 'signup', label: 'Se registró', at: summary.createdAt, detail: null },
        { key: 'article', label: 'Primer artículo cargado', at: firstArticle?.createdAt ?? null, detail: null },
        { key: 'quote', label: 'Primera cotización', at: firstQuote?.createdAt ?? null, detail: firstQuote?.number ?? null },
        {
          key: 'arca',
          label: 'ARCA en producción',
          at: settings?.afipProductionAt ?? null,
          detail: settings?.afipCertExpiresAt
            ? `Certificado vence ${settings.afipCertExpiresAt.toLocaleDateString('es-AR')}`
            : null,
        },
        {
          key: 'invoice',
          label: 'Primera factura con CAE',
          at: firstCaeInvoice?.issueDate ?? null,
          detail: firstCaeInvoice ? `${firstCaeInvoice.pointOfSale}-${firstCaeInvoice.number}` : null,
        },
        {
          key: 'whatsapp',
          label: 'WhatsApp vinculado',
          at: firstWa,
          detail: waLinks.length ? `${waLinks.length} número(s)` : null,
        },
        {
          key: 'mercadopago',
          label: 'Mercado Pago conectado',
          at: summary.mercadoPagoConnectedAt,
          detail: connector?.externalNickname ?? null,
        },
        {
          key: 'storefront',
          label: 'Tienda online creada',
          at: storefront?.createdAt ?? null,
          detail: storefront ? `${storefront.subdomain}${storefront.published ? ' · publicada' : ' · sin publicar'}` : null,
        },
        { key: 'paid', label: 'Primer pago del plan', at: firstPaidPayment?.createdAt ?? null, detail: null },
      ];

      return {
        ...summary,
        milestones,
        users: users.map((u) => {
          const wa = waByUser.get(u.id);
          return {
            ...u,
            lastLoginAt: lastLoginByUser.get(u.id) ?? null,
            whatsappPhone: wa ? maskPhone(wa.phoneE164) : null,
            whatsappVerifiedAt: wa?.verifiedAt ?? null,
          };
        }),
        arca: {
          env: summary.arcaEnv,
          certExpiresAt: settings?.afipCertExpiresAt ?? null,
          lastCheckAt: settings?.afipLastCheckAt ?? null,
          lastCheckOk: settings?.afipLastCheckOk ?? null,
          lastCheckMessage: settings?.afipLastCheckMessage ?? null,
          productionAt: settings?.afipProductionAt ?? null,
        },
        mercadoPago: {
          status: connector?.status ?? null,
          nickname: connector?.externalNickname ?? null,
          connectedAt: connector?.connectedAt ?? null,
          lastErrorMessage: connector?.lastErrorMessage ?? null,
          paymentsLast30Days: mpPayments,
        },
        storefront: {
          subdomain: storefront?.subdomain ?? null,
          published: storefront?.published ?? false,
          template: storefront?.template ?? null,
          ordersTotal: storefrontOrders,
        },
        email: {
          mode: settings?.emailSenderMode ?? 'SHARED',
          customDomain: settings?.emailCustomDomain ?? null,
          domainStatus: settings?.domainStatus ?? null,
        },
        usage: {
          invoicesTotal,
          assistantMessagesLast30Days: assistantMessages,
          aiEventsLast30Days: 0,
          errorsLast30Days: 0,
          resolvedTickets,
        },
        note: null as TenantDetail['note'],
      } satisfies TenantDetail;
    });

    // Tablas de plataforma (sin RLS, sin tenantId obligatorio): fuera del
    // contexto del tenant.
    const [aiEvents, errors, note] = await Promise.all([
      this.prisma.aiFeatureEvent.count({ where: { tenantId, createdAt: { gte: since30 } } }),
      this.prisma.systemErrorLog.count({ where: { tenantId, createdAt: { gte: since30 } } }),
      this.prisma.platformTenantNote.findUnique({ where: { tenantId } }),
    ]);
    detail.usage.aiEventsLast30Days = aiEvents;
    detail.usage.errorsLast30Days = errors;
    detail.note = note ? { body: note.body, updatedByEmail: note.updatedByEmail, updatedAt: note.updatedAt } : null;
    return detail;
  }

  async saveNote(tenantId: string, body: string, adminEmail: string): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed) {
      await this.prisma.platformTenantNote.deleteMany({ where: { tenantId } });
      return;
    }
    await this.prisma.platformTenantNote.upsert({
      where: { tenantId },
      create: { tenantId, body: trimmed, updatedByEmail: adminEmail },
      update: { body: trimmed, updatedByEmail: adminEmail },
    });
  }

  /** Corre dentro del withTenantContext del tenant. */
  private async loadSummary(tenantId: string, now: Date): Promise<TenantSummary> {
    const db = getTenantDb();
    const { from, to } = currentMonthRangeUtc(now);
    const [
      tenant,
      activeUsers,
      invoicesThisMonth,
      subscription,
      articles,
      customers,
      suppliers,
      quotes,
      settings,
      firstCaeInvoice,
      whatsappLinks,
      connector,
      storefront,
      lastActivity,
      openTickets,
    ] = await Promise.all([
      db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
      db.user.count(),
      db.invoice.count({ where: { issueDate: { gte: from, lt: to } } }),
      db.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } }),
      db.article.count({ where: { active: true } }),
      db.companyRole.count({ where: { role: 'CUSTOMER' } }),
      db.companyRole.count({ where: { role: 'SUPPLIER' } }),
      db.quote.count(),
      db.tenantSettings.findUnique({
        where: { tenantId },
        select: { afipEnv: true, afipCertExpiresAt: true, afipProductionAt: true },
      }),
      db.invoice.findFirst({
        where: { afipCae: { not: null } },
        orderBy: { issueDate: 'asc' },
        select: { issueDate: true },
      }),
      db.whatsAppLink.count(),
      db.connector.findUnique({
        where: { tenantId_provider: { tenantId, provider: 'MERCADO_PAGO' } },
        select: { status: true, connectedAt: true },
      }),
      db.storefrontSettings.findUnique({ where: { tenantId }, select: { published: true } }),
      db.userActivityLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      db.supportTicket.count({ where: { status: { not: 'RESOLVED' } } }),
    ]);

    // afipCertExpiresAt se setea junto con el certificado y se borra al
    // quitarlo: es la señal de "tiene certificado cargado".
    const arcaEnv = settings?.afipCertExpiresAt ? settings.afipEnv : null;
    const base = {
      id: tenant.id,
      name: tenant.name,
      taxId: tenant.taxId,
      status: tenant.status,
      createdAt: tenant.createdAt,
      activeUsers,
      invoicesThisMonth,
      planKey: subscription?.plan.key ?? null,
      planName: subscription?.plan.name ?? null,
      planPriceMonthly: subscription ? Number(subscription.plan.priceMonthly) : null,
      subscriptionStatus: subscription?.status ?? null,
      trialEndsAt: subscription?.trialEndsAt ?? null,
      articles,
      customers,
      suppliers,
      quotes,
      arcaEnv,
      arcaProductionAt: settings?.afipProductionAt ?? null,
      firstCaeInvoiceAt: firstCaeInvoice?.issueDate ?? null,
      whatsappLinks,
      mercadoPagoConnectedAt: connector?.status === 'CONNECTED' ? connector.connectedAt : null,
      storefrontPublished: storefront?.published ?? false,
      lastActivityAt: lastActivity?.createdAt ?? null,
      openTickets,
    };
    const { health, reasons } = computeTenantHealth(base, now);
    return { ...base, health, healthReasons: reasons };
  }
}
