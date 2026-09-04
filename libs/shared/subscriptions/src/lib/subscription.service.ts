import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  Prisma,
  PrismaService,
  type Plan,
  type TenantSubscription,
} from '@plexo/database';
import type { CreatePlanDto } from './dto/create-plan.dto.js';
import type { UpdatePlanDto } from './dto/update-plan.dto.js';

const TRIAL_DAYS = 7;

// Named explicitly (not left to inference) - a composite TS build can't
// otherwise name the cross-package Prisma payload type these `include`-ing
// queries return, same reasoning as CompaniesService's CompanyWithRoles.
export type TenantSubscriptionWithPlan = TenantSubscription & { plan: Plan };

function defaultMonthRange(): { from: Date; to: Date } {
  const to = new Date();
  // Same UTC-boundary recipe as ReportsSalesService.defaultRange() - never
  // mix local setHours() with UTC getters, that's the bug this app already
  // hit once (see PROGRESS.md) for exactly this kind of "this month" cutoff.
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  return { from, to };
}

/**
 * Reads/writes for the whole SaaS billing engine: the global Plan catalog
 * (no tenant, no RLS - see schema.prisma) and each tenant's own
 * TenantSubscription (tenant-scoped, RLS'd like everything else). Lives in
 * libs/shared (not libs/modules) specifically so business-domain lib
 * Services (CompaniesService, InvoicingService) can inject it directly
 * without breaking this repo's rule that a business module never imports
 * another business module's Service - same precedent as EncryptionService
 * being injected into TenantSettingsService, or AfipCredentialsModule being
 * imported straight into CompaniesModule/InvoicingModule.
 *
 * The Plan-catalog methods (listActivePlans/listAllPlans/createPlan/
 * updatePlan) use the injected PrismaService directly, NEVER getTenantDb() -
 * there is no tenant context on the public GET /plans route, and Plan has
 * no RLS policy anyway (see the migration).
 */
@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  getCurrentForTenant(): Promise<TenantSubscriptionWithPlan> {
    return getTenantDb().tenantSubscription.findUniqueOrThrow({
      where: { tenantId: getTenantId() },
      include: { plan: true },
    });
  }

  /** Called by apps/api's SubscriptionsSchedulerService, once per tenant,
   * from inside its own withTenantContext() - a no-op update (count 0) for
   * every tenant that isn't currently an expired trial, same "cheap to run
   * for everyone, only writes where it matters" shape as
   * ReceivablesSchedulerService's daily sweep. */
  async expireIfTrialEnded(): Promise<boolean> {
    const result = await getTenantDb().tenantSubscription.updateMany({
      where: { tenantId: getTenantId(), status: 'TRIALING', trialEndsAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return result.count > 0;
  }

  /** Called from apps/api's AdminTenantsService, from WITHIN the
   * withTenantContext() callback that just created the brand-new tenant -
   * by the time this runs, getTenantId() already resolves to that new
   * tenant (ambient context, no explicit tenantId param needed here, same
   * convention every other business-domain service in this codebase
   * follows). */
  async startTrial(planKey: string): Promise<TenantSubscriptionWithPlan> {
    const tenantId = getTenantId();
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { key: planKey } });
    const trialEndsAt = new Date();
    trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + TRIAL_DAYS);

    return getTenantDb().tenantSubscription.create({
      data: { tenantId, planId: plan.id, status: 'TRIALING', trialEndsAt },
      include: { plan: true },
    });
  }

  async assertCanAddUser(): Promise<void> {
    const { plan } = await this.assertSubscriptionActive();
    // Un contador externo (fila espejo creada por MembershipsService,
    // isExternalAccountant: true) no es un asiento del tenant - no debe
    // hacer que un plan chico se quede sin cupo por darle acceso a su
    // estudio contable, ver docs/plan_modulo_contadores.txt.
    const count = await getTenantDb().user.count({ where: { isExternalAccountant: { not: true } } });
    if (count >= plan.maxUsers) {
      throw new ForbiddenException(
        `Alcanzaste el límite de usuarios de tu plan actual (${plan.name}: ${plan.maxUsers})`,
      );
    }
  }

  async assertCanAddClient(): Promise<void> {
    const { plan } = await this.assertSubscriptionActive();
    // Sólo cuenta empresas activas con rol CUSTOMER - una empresa
    // desactivada (ver CompaniesService.listCompanies) libera cupo, y una
    // empresa que es sólo SUPPLIER/BRANCH no es "un cliente".
    const count = await getTenantDb().company.count({
      where: { active: true, roles: { some: { role: 'CUSTOMER' } } },
    });
    if (count >= plan.maxClients) {
      throw new ForbiddenException(
        `Alcanzaste el límite de clientes de tu plan actual (${plan.name}: ${plan.maxClients})`,
      );
    }
  }

  async assertCanIssueInvoiceThisMonth(): Promise<void> {
    const { plan } = await this.assertSubscriptionActive();
    const { from, to } = defaultMonthRange();
    // Una factura CANCELLED no debe comer cupo para siempre - mismo
    // criterio de exclusión que ReportsSalesService.
    const count = await getTenantDb().invoice.count({
      where: { issueDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
    });
    if (count >= plan.maxMonthlyInvoices) {
      throw new ForbiddenException(
        `Alcanzaste el límite de facturas mensuales de tu plan actual (${plan.name}: ${plan.maxMonthlyInvoices})`,
      );
    }
  }

  /** Allowlist, not a blocklist for EXPIRED alone: CANCELLED has no write
   * path today (only reachable by hand in the DB, see SubscriptionsSchedulerService's
   * docstring), but a billing gate should fail closed for any status that
   * isn't actually "can use the product", not just the one case that
   * happens to be reachable right now. */
  private async assertSubscriptionActive() {
    const subscription = await this.getCurrentForTenant();
    if (subscription.status === 'EXPIRED' || subscription.status === 'CANCELLED') {
      throw new ForbiddenException(
        'Tu período de prueba venció - actualizá tu plan para seguir usando Oplex',
      );
    }
    return subscription;
  }

  listActivePlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  listAllPlans(): Promise<Plan[]> {
    return this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createPlan(dto: CreatePlanDto): Promise<Plan> {
    const existing = await this.prisma.plan.findUnique({ where: { key: dto.key } });
    if (existing) {
      throw new ForbiddenException(`Ya existe un plan con key "${dto.key}"`);
    }
    return this.prisma.plan.create({
      data: {
        key: dto.key,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        priceMonthly: new Prisma.Decimal(dto.priceMonthly),
        maxUsers: dto.maxUsers,
        maxClients: dto.maxClients,
        maxMonthlyInvoices: dto.maxMonthlyInvoices,
        debitDiscountPercent: new Prisma.Decimal(dto.debitDiscountPercent ?? 0),
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updatePlan(id: string, dto: UpdatePlanDto): Promise<Plan> {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Plan not found');
    }
    return this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name,
        sortOrder: dto.sortOrder,
        priceMonthly: dto.priceMonthly === undefined ? undefined : new Prisma.Decimal(dto.priceMonthly),
        maxUsers: dto.maxUsers,
        maxClients: dto.maxClients,
        maxMonthlyInvoices: dto.maxMonthlyInvoices,
        debitDiscountPercent:
          dto.debitDiscountPercent === undefined ? undefined : new Prisma.Decimal(dto.debitDiscountPercent),
        isActive: dto.isActive,
      },
    });
  }
}
