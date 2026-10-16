import type { PrismaService } from '@plexo/database';
import type { SubscriptionBillingService, SubscriptionNoticeService, SubscriptionService } from '@plexo/subscriptions';
import { SubscriptionsSchedulerService } from './subscriptions-scheduler.service.js';

jest.mock('@plexo/database', () => ({
  ...jest.requireActual('@plexo/database'),
  withTenantContext: jest.fn((_prisma: unknown, _tenantId: string, fn: () => unknown) => fn()),
}));

const { withTenantContext } = jest.requireMock('@plexo/database') as { withTenantContext: jest.Mock };

function makeBillingService(change: 'PAST_DUE' | 'EXPIRED' | null = null) {
  return { sweepBillingStatus: jest.fn().mockResolvedValue(change) } as unknown as SubscriptionBillingService;
}

function makeNotices() {
  return {
    sendTrialEnded: jest.fn().mockResolvedValue(undefined),
    sendPastDue: jest.fn().mockResolvedValue(undefined),
    sendTrialEndingIfDue: jest.fn().mockResolvedValue(false),
    sendRenewalIfDue: jest.fn().mockResolvedValue(false),
    pendingTransferDueTomorrow: jest.fn().mockResolvedValue(null),
    sendOplexPendingDigest: jest.fn().mockResolvedValue(undefined),
  } as unknown as SubscriptionNoticeService & Record<string, jest.Mock>;
}

describe('SubscriptionsSchedulerService.expireTrialsForAllTenants', () => {
  beforeEach(() => {
    withTenantContext.mockClear();
    withTenantContext.mockImplementation((_prisma, _tenantId, fn) => fn());
  });

  it('sweeps every tenant from list_tenant_ids(), checking trial expiry independently for each', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
    } as unknown as PrismaService;
    const subscriptionService = {
      expireIfTrialEnded: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    } as unknown as SubscriptionService;
    const scheduler = new SubscriptionsSchedulerService(prisma, subscriptionService, makeBillingService(), makeNotices());

    await scheduler.expireTrialsForAllTenants();

    expect(withTenantContext).toHaveBeenCalledTimes(2);
    expect(withTenantContext.mock.calls[0][1]).toBe('tenant-1');
    expect(withTenantContext.mock.calls[1][1]).toBe('tenant-2');
    expect(subscriptionService.expireIfTrialEnded).toHaveBeenCalledTimes(2);
  });

  it('logs and continues when one tenant fails, without aborting the rest of the sweep', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
    } as unknown as PrismaService;
    const subscriptionService = {
      expireIfTrialEnded: jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(false),
    } as unknown as SubscriptionService;
    const scheduler = new SubscriptionsSchedulerService(prisma, subscriptionService, makeBillingService(), makeNotices());

    await expect(scheduler.expireTrialsForAllTenants()).resolves.toBeUndefined();
    expect(subscriptionService.expireIfTrialEnded).toHaveBeenCalledTimes(2);
  });
});

describe('SubscriptionsSchedulerService - avisos por mail', () => {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
  } as unknown as PrismaService;

  beforeEach(() => {
    withTenantContext.mockImplementation((_prisma, _tenantId, fn) => fn());
  });

  it('manda "terminó la prueba" sólo al tenant que vence y "plan vencido" al pasar a PAST_DUE', async () => {
    const subscriptionService = {
      expireIfTrialEnded: jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    } as unknown as SubscriptionService;
    const notices = makeNotices();
    const scheduler = new SubscriptionsSchedulerService(prisma, subscriptionService, makeBillingService('PAST_DUE'), notices);

    await scheduler.expireTrialsForAllTenants();

    expect(notices.sendTrialEnded).toHaveBeenCalledTimes(1);
    expect(notices.sendPastDue).toHaveBeenCalledTimes(2);
  });

  it('junta en un solo mail a facturacion@ las transferencias que vencen mañana', async () => {
    const subscriptionService = {} as unknown as SubscriptionService;
    const notices = makeNotices();
    const row = { tenantName: 'Panadería La Espiga SRL', total: 290037, coveredUntil: new Date('2026-11-19T13:24:00Z') };
    (notices.pendingTransferDueTomorrow as jest.Mock).mockResolvedValueOnce(row).mockResolvedValueOnce(null);
    const scheduler = new SubscriptionsSchedulerService(prisma, subscriptionService, makeBillingService(), notices);

    await scheduler.sendDailyNotices(new Date('2026-11-18T12:00:00Z'));

    expect(notices.sendTrialEndingIfDue).toHaveBeenCalledTimes(2);
    expect(notices.sendRenewalIfDue).toHaveBeenCalledWith(10, expect.any(Date));
    expect(notices.sendOplexPendingDigest).toHaveBeenCalledWith([row]);
  });
});
