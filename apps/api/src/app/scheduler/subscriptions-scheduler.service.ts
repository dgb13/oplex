import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, withTenantContext } from '@plexo/database';
import { SubscriptionBillingService, SubscriptionService } from '@plexo/subscriptions';

/**
 * Daily sweep across every tenant, same list_tenant_ids() + withTenantContext
 * recipe as ReceivablesSchedulerService (see that file's docstring for why
 * this needs its own tenant loop instead of a request-scoped tenant
 * context - it runs outside any HTTP request). Flips TRIALING -> EXPIRED
 * once trialEndsAt has passed, ACTIVE -> PAST_DUE once the paid period ends
 * without a new payment, and PAST_DUE -> EXPIRED once its grace days are
 * over (see SubscriptionBillingService.sweepBillingStatus).
 */
@Injectable()
export class SubscriptionsSchedulerService {
  private readonly logger = new Logger(SubscriptionsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly billingService: SubscriptionBillingService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireTrialsForAllTenants(): Promise<void> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;

    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          const expired = await this.subscriptionService.expireIfTrialEnded();
          if (expired) {
            this.logger.log(`Tenant ${tenantId}: trial expired`);
          }
          const change = await this.billingService.sweepBillingStatus();
          if (change) {
            this.logger.log(`Tenant ${tenantId}: subscription -> ${change}`);
          }
        });
      } catch (err) {
        this.logger.error(`Failed to check trial expiry for tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
  }
}
