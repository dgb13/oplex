import { Injectable } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import {
  SubscriptionBillingService,
  type OplexBankDetails,
  type SubscriptionPaymentWithPlan,
} from '@plexo/subscriptions';
import type { RecordSubscriptionPaymentDto } from './dto/admin-subscription.dto.js';

export interface TenantSubscriptionRow {
  tenantId: string;
  tenantName: string;
  planKey: string;
  planName: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  paymentMethod: string | null;
  pendingPayment: SubscriptionPaymentWithPlan | null;
}

/** Suscripciones de todos los tenants para el backoffice. Cada operación
 * entra al tenant con withTenantContext (RLS), mismo recipe que
 * AdminTenantsService, y delega la lógica en SubscriptionBillingService. */
@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: SubscriptionBillingService,
  ) {}

  async list(): Promise<TenantSubscriptionRow[]> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    const rows: TenantSubscriptionRow[] = [];
    for (const { id: tenantId } of tenants) {
      const row = await withTenantContext(this.prisma, tenantId, async () => {
        const tenant = await getTenantDb().tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
        const { subscription, pendingPayment } = await this.billing.getOverview().catch(() => ({
          subscription: null,
          pendingPayment: null,
        }));
        if (!tenant || !subscription) return null;
        return {
          tenantId,
          tenantName: tenant.name,
          planKey: subscription.plan.key,
          planName: subscription.plan.name,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodEnd: subscription.currentPeriodEnd,
          graceEndsAt: subscription.graceEndsAt,
          paymentMethod: subscription.paymentMethod,
          pendingPayment,
        };
      });
      if (row) rows.push(row);
    }
    return rows.sort((a, b) => Number(Boolean(b.pendingPayment)) - Number(Boolean(a.pendingPayment)) || a.tenantName.localeCompare(b.tenantName));
  }

  payments(tenantId: string) {
    return withTenantContext(this.prisma, tenantId, async () => (await this.billing.getOverview()).payments);
  }

  recordPayment(tenantId: string, dto: RecordSubscriptionPaymentDto, adminEmail: string) {
    return withTenantContext(this.prisma, tenantId, () => this.billing.recordPayment(dto, adminEmail));
  }

  confirmPayment(tenantId: string, paymentId: string, adminEmail: string) {
    return withTenantContext(this.prisma, tenantId, () => this.billing.confirmPayment(paymentId, adminEmail));
  }

  rejectPayment(tenantId: string, paymentId: string, adminEmail: string) {
    return withTenantContext(this.prisma, tenantId, () => this.billing.rejectPayment(paymentId, adminEmail));
  }

  extendTrial(tenantId: string, days: number) {
    return withTenantContext(this.prisma, tenantId, () => this.billing.extendTrial(days));
  }

  changePlan(tenantId: string, planKey: string) {
    return withTenantContext(this.prisma, tenantId, () => this.billing.changePlan(planKey));
  }

  getOplexBank() {
    return this.billing.getOplexBankDetails();
  }

  updateOplexBank(details: OplexBankDetails) {
    return this.billing.updateOplexBankDetails(details);
  }
}
