import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  PrismaService,
  type Plan,
  type SubscriptionPayment,
  type TenantSubscription,
} from '@plexo/database';
import {
  addDaysUtc,
  addMonthsUtc,
  computeSubscriptionCharge,
  SUBSCRIPTION_MONTH_OPTIONS,
  type SubscriptionPaymentMethodValue,
} from './subscription-pricing.js';

/** Días que una transferencia avisada mantiene activa la cuenta mientras
 * Oplex la confirma (regla aprobada con el usuario, 2026-10-03). */
export const TRANSFER_PROVISIONAL_DAYS = 3;
/** Días de gracia con la cuenta funcionando después de un vencimiento sin
 * pago, antes de pasar a sólo lectura. */
export const GRACE_DAYS = 5;

export type SubscriptionPaymentWithPlan = SubscriptionPayment & { plan: Plan };

export interface BillingOverview {
  subscription: TenantSubscription & { plan: Plan };
  pendingPayment: SubscriptionPaymentWithPlan | null;
  payments: SubscriptionPaymentWithPlan[];
}

export interface OplexBankDetails {
  holder: string | null;
  cuit: string | null;
  bankName: string | null;
  cbu: string | null;
  alias: string | null;
}

export interface ReportTransferInput {
  planKey: string;
  months: number;
  reference?: string;
  receiptUrl?: string;
}

export interface RecordPaymentInput {
  planKey: string;
  months: number;
  method: SubscriptionPaymentMethodValue;
  reference?: string;
  /** Si viene, reemplaza el total calculado (p. ej. un acuerdo especial). */
  total?: number;
}

/**
 * Cobro de los planes de Oplex a cada tenant. Todos los métodos corren en el
 * contexto de UN tenant (getTenantDb): los del tenant desde su request, los
 * de Oplex desde /admin dentro de withTenantContext (ver
 * AdminSubscriptionsService en apps/api), igual que el resto del backoffice.
 *
 * Estados (SubscriptionStatus):
 * - TRIALING: prueba gratis hasta trialEndsAt.
 * - ACTIVE: pago (o cubierto provisoriamente por una transferencia avisada)
 *   hasta currentPeriodEnd.
 * - PAST_DUE: venció sin pago; sigue funcionando hasta graceEndsAt.
 * - EXPIRED: sólo lectura (SubscriptionService.assertSubscriptionActive).
 */
@Injectable()
export class SubscriptionBillingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(): Promise<BillingOverview> {
    const db = getTenantDb();
    const [subscription, payments] = await Promise.all([
      db.tenantSubscription.findUniqueOrThrow({ where: { tenantId: getTenantId() }, include: { plan: true } }),
      db.subscriptionPayment.findMany({ include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 24 }),
    ]);
    return { subscription, payments, pendingPayment: payments.find((p) => p.status === 'PENDING') ?? null };
  }

  /** El tenant avisa que transfirió. Queda PENDING hasta que Oplex lo
   * confirma; mientras tanto la cuenta sigue activa TRANSFER_PROVISIONAL_DAYS. */
  async reportTransfer(input: ReportTransferInput): Promise<SubscriptionPaymentWithPlan> {
    const db = getTenantDb();
    const existing = await db.subscriptionPayment.findFirst({ where: { status: 'PENDING' } });
    if (existing) {
      throw new BadRequestException('Ya hay una transferencia esperando confirmación');
    }
    const plan = await this.findPaidPlan(input.planKey);
    assertMonths(input.months);

    const now = new Date();
    const periodStart = await this.nextPeriodStart(now);
    const charge = computeSubscriptionCharge(plan, 'TRANSFER', input.months);
    const payment = await db.subscriptionPayment.create({
      data: {
        tenantId: getTenantId(),
        planId: plan.id,
        method: 'TRANSFER',
        status: 'PENDING',
        months: input.months,
        periodStart,
        periodEnd: addMonthsUtc(periodStart, input.months),
        listPrice: charge.listPrice,
        discountAmount: charge.discountAmount,
        netAmount: charge.netAmount,
        vatAmount: charge.vatAmount,
        total: charge.total,
        reference: input.reference?.trim() || null,
        receiptUrl: input.receiptUrl ?? null,
      },
      include: { plan: true },
    });

    // Cobertura provisoria: nunca acorta lo que ya estaba cubierto.
    const subscription = await this.getSubscription();
    const coveredUntil = latest(subscription.currentPeriodEnd, subscription.trialEndsAt, addDaysUtc(now, TRANSFER_PROVISIONAL_DAYS));
    if (subscription.status !== 'ACTIVE' || !subscription.currentPeriodEnd || subscription.currentPeriodEnd < now) {
      await db.tenantSubscription.update({
        where: { tenantId: getTenantId() },
        data: { status: 'ACTIVE', currentPeriodEnd: coveredUntil, graceEndsAt: null },
      });
    }
    return payment;
  }

  /** Oplex registra un pago recibido por fuera (transferencia sin aviso,
   * efectivo, acuerdo). Queda PAID y activa el plan. */
  async recordPayment(input: RecordPaymentInput, reviewedBy: string): Promise<SubscriptionPaymentWithPlan> {
    const plan = await this.findPaidPlan(input.planKey);
    assertMonths(input.months);
    const now = new Date();
    const periodStart = await this.nextPeriodStart(now);
    const periodEnd = addMonthsUtc(periodStart, input.months);
    const charge = computeSubscriptionCharge(plan, input.method, input.months);
    const total = input.total ?? charge.total;

    const payment = await getTenantDb().subscriptionPayment.create({
      data: {
        tenantId: getTenantId(),
        planId: plan.id,
        method: input.method,
        status: 'PAID',
        months: input.months,
        periodStart,
        periodEnd,
        listPrice: charge.listPrice,
        discountAmount: charge.discountAmount,
        // Con un total acordado a mano, se desarma neto/IVA desde ese total.
        netAmount: input.total === undefined ? charge.netAmount : round2(total / 1.21),
        vatAmount: input.total === undefined ? charge.vatAmount : round2(total - total / 1.21),
        total,
        reference: input.reference?.trim() || null,
        reviewedAt: now,
        reviewedBy,
      },
      include: { plan: true },
    });
    await this.activate(plan.id, periodEnd, input.method);
    return payment;
  }

  async confirmPayment(paymentId: string, reviewedBy: string): Promise<SubscriptionPaymentWithPlan> {
    const db = getTenantDb();
    const pending = await this.findPending(paymentId);
    // Se recalcula desde el último período pago: el provisorio de 3 días no cuenta.
    const periodStart = await this.nextPeriodStart(new Date());
    const periodEnd = addMonthsUtc(periodStart, pending.months);
    const payment = await db.subscriptionPayment.update({
      where: { id: paymentId },
      data: { status: 'PAID', periodStart, periodEnd, reviewedAt: new Date(), reviewedBy },
      include: { plan: true },
    });
    await this.activate(pending.planId, periodEnd, pending.method);
    return payment;
  }

  async rejectPayment(paymentId: string, reviewedBy: string): Promise<SubscriptionPaymentWithPlan> {
    const db = getTenantDb();
    await this.findPending(paymentId);
    const payment = await db.subscriptionPayment.update({
      where: { id: paymentId },
      data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy },
      include: { plan: true },
    });

    // Se saca la cobertura provisoria: queda lo que esté realmente pago.
    const now = new Date();
    const paidUntil = await this.lastPaidPeriodEnd();
    const subscription = await this.getSubscription();
    if (paidUntil && paidUntil > now) {
      await db.tenantSubscription.update({ where: { tenantId: getTenantId() }, data: { currentPeriodEnd: paidUntil } });
    } else if (subscription.trialEndsAt && subscription.trialEndsAt > now) {
      await db.tenantSubscription.update({
        where: { tenantId: getTenantId() },
        data: { status: 'TRIALING', currentPeriodEnd: paidUntil },
      });
    } else {
      await db.tenantSubscription.update({
        where: { tenantId: getTenantId() },
        data: { status: 'EXPIRED', currentPeriodEnd: paidUntil, graceEndsAt: null },
      });
    }
    return payment;
  }

  /** Más días de prueba. Vuelve a TRIALING aunque la prueba ya hubiera vencido. */
  async extendTrial(days: number): Promise<void> {
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new BadRequestException('Los días extra tienen que ser entre 1 y 90');
    }
    const subscription = await this.getSubscription();
    const now = new Date();
    const base = subscription.trialEndsAt && subscription.trialEndsAt > now ? subscription.trialEndsAt : now;
    await getTenantDb().tenantSubscription.update({
      where: { tenantId: getTenantId() },
      data: { status: 'TRIALING', trialEndsAt: addDaysUtc(base, days), graceEndsAt: null },
    });
  }

  /** Cuenta de Oplex donde el tenant transfiere (PlatformSettings). */
  async getOplexBankDetails(): Promise<OplexBankDetails> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 'global' } });
    return {
      holder: settings?.oplexBankHolder ?? null,
      cuit: settings?.oplexBankCuit ?? null,
      bankName: settings?.oplexBankName ?? null,
      cbu: settings?.oplexBankCbu ?? null,
      alias: settings?.oplexBankAlias ?? null,
    };
  }

  async updateOplexBankDetails(details: OplexBankDetails): Promise<OplexBankDetails> {
    const data = {
      oplexBankHolder: details.holder?.trim() || null,
      oplexBankCuit: details.cuit?.trim() || null,
      oplexBankName: details.bankName?.trim() || null,
      oplexBankCbu: details.cbu?.replace(/\D/g, '') || null,
      oplexBankAlias: details.alias?.trim() || null,
    };
    await this.prisma.platformSettings.upsert({ where: { id: 'global' }, create: { id: 'global', ...data }, update: data });
    return this.getOplexBankDetails();
  }

  /** El propio tenant cambia de plan. Al bajar, primero tiene que entrar en
   * los topes del plan nuevo (usuarios y clientes activos). */
  async changeOwnPlan(planKey: string): Promise<void> {
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Ese plan no existe o no está a la venta');
    }
    const db = getTenantDb();
    const [users, clients] = await Promise.all([
      db.user.count({ where: { isExternalAccountant: { not: true } } }),
      db.company.count({ where: { active: true, roles: { some: { role: 'CUSTOMER' } } } }),
    ]);
    if (users > plan.maxUsers) {
      throw new BadRequestException(
        `El plan ${plan.name} permite ${plan.maxUsers} usuario${plan.maxUsers === 1 ? '' : 's'} y hoy tenés ${users}. Desactivá los que sobran antes de cambiar.`,
      );
    }
    if (clients > plan.maxClients) {
      throw new BadRequestException(
        `El plan ${plan.name} permite ${plan.maxClients} clientes y hoy tenés ${clients} activos. Desactivá los que sobran antes de cambiar.`,
      );
    }
    await this.changePlan(planKey);
  }

  /** Cambia de plan sin tocar fechas: los topes nuevos aplican ya y el precio
   * nuevo desde el próximo cobro (regla aprobada, sin prorrateo). */
  async changePlan(planKey: string): Promise<void> {
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Ese plan no existe o no está a la venta');
    }
    await getTenantDb().tenantSubscription.update({ where: { tenantId: getTenantId() }, data: { planId: plan.id } });
  }

  /** Cron diario (ver SubscriptionsSchedulerService): ACTIVE vencido pasa a
   * PAST_DUE con días de gracia, y PAST_DUE con la gracia cumplida a EXPIRED.
   * Devuelve el cambio hecho, o null si no hizo nada. */
  async sweepBillingStatus(now = new Date()): Promise<'PAST_DUE' | 'EXPIRED' | null> {
    const subscription = await getTenantDb().tenantSubscription.findUnique({ where: { tenantId: getTenantId() } });
    if (!subscription) return null;
    if (subscription.status === 'ACTIVE' && subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) {
      await getTenantDb().tenantSubscription.update({
        where: { tenantId: getTenantId() },
        data: { status: 'PAST_DUE', graceEndsAt: addDaysUtc(subscription.currentPeriodEnd, GRACE_DAYS) },
      });
      return 'PAST_DUE';
    }
    if (subscription.status === 'PAST_DUE' && subscription.graceEndsAt && subscription.graceEndsAt < now) {
      await getTenantDb().tenantSubscription.update({
        where: { tenantId: getTenantId() },
        data: { status: 'EXPIRED' },
      });
      return 'EXPIRED';
    }
    return null;
  }

  private async activate(planId: string, periodEnd: Date, method: string): Promise<void> {
    await getTenantDb().tenantSubscription.update({
      where: { tenantId: getTenantId() },
      data: { status: 'ACTIVE', planId, currentPeriodEnd: periodEnd, paymentMethod: method, graceEndsAt: null },
    });
  }

  /** Un pago nuevo arranca donde termina lo ya pagado, o hoy si no hay nada
   * vigente (así pagar antes de tiempo no hace perder días). */
  private async nextPeriodStart(now: Date): Promise<Date> {
    const paidUntil = await this.lastPaidPeriodEnd();
    return paidUntil && paidUntil > now ? paidUntil : now;
  }

  private async lastPaidPeriodEnd(): Promise<Date | null> {
    const last = await getTenantDb().subscriptionPayment.findFirst({
      where: { status: 'PAID' },
      orderBy: { periodEnd: 'desc' },
      select: { periodEnd: true },
    });
    return last?.periodEnd ?? null;
  }

  private getSubscription(): Promise<TenantSubscription> {
    return getTenantDb().tenantSubscription.findUniqueOrThrow({ where: { tenantId: getTenantId() } });
  }

  private async findPending(paymentId: string): Promise<SubscriptionPayment> {
    const payment = await getTenantDb().subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Pago no encontrado');
    if (payment.status !== 'PENDING') throw new BadRequestException('Ese pago ya fue revisado');
    return payment;
  }

  private async findPaidPlan(planKey: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan || !plan.isActive) throw new NotFoundException('Ese plan no existe o no está a la venta');
    if (Number(plan.priceMonthly) <= 0) throw new BadRequestException('Ese plan es gratis: no lleva pago');
    return plan;
  }
}

function assertMonths(months: number): void {
  if (!(SUBSCRIPTION_MONTH_OPTIONS as readonly number[]).includes(months)) {
    throw new BadRequestException('Se puede pagar 1, 3, 6 o 12 meses');
  }
}

function latest(...dates: (Date | null | undefined)[]): Date {
  return dates.filter((d): d is Date => d instanceof Date).reduce((a, b) => (b > a ? b : a));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
