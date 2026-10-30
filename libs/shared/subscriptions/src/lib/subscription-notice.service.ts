import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_EMAIL_SENDER, type AuthEmailSender } from '@plexo/auth-email';
import { getTenantDb, getTenantId, PrismaService, type Plan, type SubscriptionPayment } from '@plexo/database';
import { OPLEX_BILLING_EMAIL } from '@plexo/types';
import {
  oplexNewTransferCopy,
  oplexPendingReminderCopy,
  pastDueCopy,
  paymentConfirmedCopy,
  paymentRejectedCopy,
  renewalReminderCopy,
  trialEndedCopy,
  trialEndingCopy,
  type ClientContext,
  type NoticeCopy,
  type PendingTransferRow,
} from './subscription-notice-templates.js';

const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:4200';
const DAY_MS = 86_400_000;
/** "Faltan 3 días" de prueba (mockup aprobado 2026-10-15). */
export const TRIAL_ENDING_NOTICE_DAYS = 3;
/** Aviso de renovación, días antes de que termine lo pagado. */
export const RENEWAL_NOTICE_DAYS = 7;

/** Fecha argentina (AAAA-MM-DD) de un instante: UTC-3 sin horario de verano. */
function arDay(date: Date): string {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Mails de la suscripción: al dueño de la cuenta (prueba por vencer, fin de
 * prueba, plan vencido, pago confirmado o rechazado, renovación) y a
 * facturacion@ (transferencia avisada y recordatorio diario). Todo corre en
 * el contexto de UN tenant (getTenantDb) salvo sendOplexPendingDigest.
 * Ninguno lanza: un mail que no sale no debe frenar un pago ni el cron.
 */
@Injectable()
export class SubscriptionNoticeService {
  private readonly logger = new Logger(SubscriptionNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_EMAIL_SENDER) private readonly email: AuthEmailSender,
  ) {}

  /** Cron de las 9: "faltan 3 días" una sola vez por prueba. */
  async sendTrialEndingIfDue(now = new Date()): Promise<boolean> {
    const sub = await this.subscription();
    if (!sub || sub.status !== 'TRIALING' || !sub.trialEndsAt || sub.trialEndingNoticeSentAt) return false;
    if (Number(sub.plan.priceMonthly) <= 0) return false;
    const left = sub.trialEndsAt.getTime() - now.getTime();
    if (left <= 0 || left > TRIAL_ENDING_NOTICE_DAYS * DAY_MS) return false;
    const free = await this.freePlan();
    await this.toOwners((ctx) =>
      trialEndingCopy(ctx, {
        planName: sub.plan.name,
        trialEndsAt: sub.trialEndsAt as Date,
        planPrice: Number(sub.plan.priceMonthly),
        annualDiscountPercent: Number(sub.plan.annualDiscountPercent ?? 0),
        free,
      }),
    );
    await getTenantDb().tenantSubscription.update({ where: { tenantId: getTenantId() }, data: { trialEndingNoticeSentAt: now } });
    return true;
  }

  /** Cuando el cron pasa una prueba a sólo lectura. */
  async sendTrialEnded(): Promise<void> {
    const free = await this.freePlan();
    await this.toOwners((ctx) => trialEndedCopy(ctx, { free }));
  }

  /** Cuando el cron pasa un plan pago vencido a días de gracia. */
  async sendPastDue(): Promise<void> {
    const sub = await this.subscription();
    if (!sub?.currentPeriodEnd || !sub.graceEndsAt) return;
    const { currentPeriodEnd, graceEndsAt } = sub;
    await this.toOwners((ctx) => pastDueCopy(ctx, { planName: sub.plan.name, periodEnd: currentPeriodEnd, graceEndsAt }));
  }

  /** Cron de las 9: "tu plan vence el …" una vez por período pago, si no
   * hay una transferencia ya avisada. */
  async sendRenewalIfDue(graceDays: number, now = new Date()): Promise<boolean> {
    const sub = await this.subscription();
    if (!sub || sub.status !== 'ACTIVE' || !sub.currentPeriodEnd || Number(sub.plan.priceMonthly) <= 0) return false;
    const periodEnd = sub.currentPeriodEnd;
    const left = periodEnd.getTime() - now.getTime();
    if (left <= 0 || left > RENEWAL_NOTICE_DAYS * DAY_MS) return false;
    if (sub.renewalNoticeSentFor && sub.renewalNoticeSentFor.getTime() === periodEnd.getTime()) return false;
    const db = getTenantDb();
    const [pending, lastPaid] = await Promise.all([
      db.subscriptionPayment.findFirst({ where: { status: 'PENDING' }, select: { id: true } }),
      db.subscriptionPayment.findFirst({ where: { status: 'PAID' }, orderBy: { periodEnd: 'desc' }, select: { periodEnd: true } }),
    ]);
    // Con una transferencia avisada, o si lo "pago" es sólo el crédito
    // provisorio de 3 días, no corresponde pedir renovación.
    if (pending || !lastPaid || lastPaid.periodEnd < periodEnd) return false;
    await this.toOwners((ctx) =>
      renewalReminderCopy(ctx, { planName: sub.plan.name, periodEnd, planPrice: Number(sub.plan.priceMonthly), graceDays }),
    );
    await db.tenantSubscription.update({ where: { tenantId: getTenantId() }, data: { renewalNoticeSentFor: periodEnd } });
    return true;
  }

  async sendPaymentConfirmed(payment: SubscriptionPayment & { plan: Plan }): Promise<void> {
    await this.toOwners((ctx) =>
      paymentConfirmedCopy(
        { ...ctx, appUrl: `${FRONTEND_URL}/dashboard` },
        {
          planName: payment.plan.name,
          months: payment.months,
          periodStart: payment.periodStart,
          periodEnd: payment.periodEnd,
          netAmount: Number(payment.netAmount),
          vatAmount: Number(payment.vatAmount),
          total: Number(payment.total),
          reference: payment.reference,
        },
      ),
    );
  }

  async sendPaymentRejected(payment: SubscriptionPayment, readOnlyNow: boolean): Promise<void> {
    await this.toOwners((ctx) =>
      paymentRejectedCopy(ctx, {
        createdAt: payment.createdAt,
        total: Number(payment.total),
        reference: payment.reference,
        note: payment.reviewNote,
        readOnlyNow,
      }),
    );
  }

  /** A facturacion@ apenas el cliente avisa la transferencia. */
  async notifyOplexNewTransfer(payment: SubscriptionPayment & { plan: Plan }, coveredUntil: Date): Promise<void> {
    const tenant = await getTenantDb().tenant.findUnique({ where: { id: getTenantId() }, select: { name: true, taxId: true } });
    const copy = oplexNewTransferCopy({
      tenantName: tenant?.name ?? 'Cliente',
      taxId: tenant?.taxId ?? null,
      planName: payment.plan.name,
      months: payment.months,
      total: Number(payment.total),
      reference: payment.reference,
      reportedAt: payment.createdAt,
      reportedBy: payment.reportedBy,
      receiptUrl: payment.receiptUrl ? absoluteUrl(payment.receiptUrl) : null,
      coveredUntil,
      adminUrl: `${FRONTEND_URL}/admin/subscriptions`,
    });
    await this.send(OPLEX_BILLING_EMAIL, copy);
  }

  /** Fila para el recordatorio diario si la transferencia avisada sigue sin
   * confirmar y el crédito provisorio vence mañana (fecha argentina). */
  async pendingTransferDueTomorrow(now = new Date()): Promise<PendingTransferRow | null> {
    const sub = await this.subscription();
    if (!sub || sub.status !== 'ACTIVE' || !sub.currentPeriodEnd) return null;
    if (arDay(sub.currentPeriodEnd) !== arDay(new Date(now.getTime() + DAY_MS))) return null;
    const pending = await getTenantDb().subscriptionPayment.findFirst({ where: { status: 'PENDING' }, select: { total: true } });
    if (!pending) return null;
    const tenant = await getTenantDb().tenant.findUnique({ where: { id: getTenantId() }, select: { name: true } });
    return { tenantName: tenant?.name ?? 'Cliente', total: Number(pending.total), coveredUntil: sub.currentPeriodEnd };
  }

  /** Sin contexto de tenant: un solo mail con todas las filas del día. */
  async sendOplexPendingDigest(rows: PendingTransferRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.send(OPLEX_BILLING_EMAIL, oplexPendingReminderCopy(rows, `${FRONTEND_URL}/admin/subscriptions`));
  }

  private subscription() {
    return getTenantDb().tenantSubscription.findUnique({ where: { tenantId: getTenantId() }, include: { plan: true } });
  }

  private async freePlan(): Promise<{ maxUsers: number; maxMonthlyInvoices: number } | null> {
    const plan = await this.prisma.plan.findFirst({
      where: { isActive: true, priceMonthly: 0 },
      orderBy: { sortOrder: 'asc' },
      select: { maxUsers: true, maxMonthlyInvoices: true },
    });
    return plan ?? null;
  }

  /** Un mail por cada dueño activo de la cuenta (no los contadores externos). */
  private async toOwners(build: (ctx: ClientContext) => NoticeCopy): Promise<void> {
    const db = getTenantDb();
    const [tenant, owners] = await Promise.all([
      db.tenant.findUnique({ where: { id: getTenantId() }, select: { name: true } }),
      db.user.findMany({
        where: { roles: { has: 'OWNER' }, status: 'ACTIVE', isExternalAccountant: false },
        select: { email: true, name: true },
      }),
    ]);
    for (const owner of owners) {
      const firstName = owner.name?.trim().split(/\s+/)[0] || null;
      await this.send(
        owner.email,
        build({ firstName, tenantName: tenant?.name ?? 'tu empresa', billingUrl: `${FRONTEND_URL}/settings/billing` }),
      );
    }
  }

  private async send(to: string, copy: NoticeCopy): Promise<void> {
    try {
      await this.email.sendHtmlNotice({ to, ...copy });
    } catch (err) {
      this.logger.error(`No se pudo mandar "${copy.subject}" a ${to}: ${(err as Error).message}`);
    }
  }
}

function absoluteUrl(path: string): string {
  return /^https?:/.test(path) ? path : `${FRONTEND_URL}${path}`;
}
