import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, withTenantContext } from '@plexo/database';
import {
  GRACE_DAYS,
  SubscriptionBillingService,
  SubscriptionNoticeService,
  SubscriptionService,
} from '@plexo/subscriptions';
import { BACKUP_TIME_ZONE } from './backup-scheduler.service.js';

type PendingRow = NonNullable<Awaited<ReturnType<SubscriptionNoticeService['pendingTransferDueTomorrow']>>>;

/**
 * Daily sweep across every tenant, same list_tenant_ids() + withTenantContext
 * recipe as ReceivablesSchedulerService (see that file's docstring for why
 * this needs its own tenant loop instead of a request-scoped tenant
 * context - it runs outside any HTTP request). Flips TRIALING -> EXPIRED
 * once trialEndsAt has passed, ACTIVE -> PAST_DUE once the paid period ends
 * without a new payment, and PAST_DUE -> EXPIRED once its grace days are
 * over (see SubscriptionBillingService.sweepBillingStatus).
 *
 * Avisos por mail (mockup aprobado 2026-10-15): fin de prueba y plan
 * vencido salen en el mismo barrido, cuando cambia el estado; "faltan 3
 * días", la renovación y el recordatorio a facturacion@ salen a las 9 de
 * la mañana de Argentina, en sendDailyNotices.
 */
@Injectable()
export class SubscriptionsSchedulerService {
  private readonly logger = new Logger(SubscriptionsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    private readonly billingService: SubscriptionBillingService,
    private readonly notices: SubscriptionNoticeService,
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
            await this.notices.sendTrialEnded();
          }
          const change = await this.billingService.sweepBillingStatus();
          if (change) {
            this.logger.log(`Tenant ${tenantId}: subscription -> ${change}`);
          }
          if (change === 'PAST_DUE') {
            await this.notices.sendPastDue();
          }
        });
      } catch (err) {
        this.logger.error(`Failed to check trial expiry for tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
  }

  @Cron('0 9 * * *', { timeZone: BACKUP_TIME_ZONE })
  async sendDailyNotices(now = new Date()): Promise<void> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    const pending: PendingRow[] = [];

    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          if (await this.notices.sendTrialEndingIfDue(now)) {
            this.logger.log(`Tenant ${tenantId}: aviso de prueba por vencer`);
          }
          if (await this.notices.sendRenewalIfDue(GRACE_DAYS, now)) {
            this.logger.log(`Tenant ${tenantId}: aviso de renovación`);
          }
          const row = await this.notices.pendingTransferDueTomorrow(now);
          if (row) pending.push(row);
        });
      } catch (err) {
        this.logger.error(`Failed to send subscription notices for tenant ${tenantId}: ${(err as Error).message}`);
      }
    }

    await this.notices.sendOplexPendingDigest(pending);
  }
}
