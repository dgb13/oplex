import type { PrismaService } from '@plexo/database';
import type { SubscriptionBillingService, SubscriptionService } from '@plexo/subscriptions';
import { SubscriptionsSchedulerService } from './subscriptions-scheduler.service.js';

jest.mock('@plexo/database', () => ({
  ...jest.requireActual('@plexo/database'),
  withTenantContext: jest.fn((_prisma: unknown, _tenantId: string, fn: () => unknown) => fn()),
}));

const { withTenantContext } = jest.requireMock('@plexo/database') as { withTenantContext: jest.Mock };

function makeBillingService() {
  return { sweepBillingStatus: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionBillingService;
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
    const scheduler = new SubscriptionsSchedulerService(prisma, subscriptionService, makeBillingService());

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
    const scheduler = new SubscriptionsSchedulerService(prisma, subscriptionService, makeBillingService());

    await expect(scheduler.expireTrialsForAllTenants()).resolves.toBeUndefined();
    expect(subscriptionService.expireIfTrialEnded).toHaveBeenCalledTimes(2);
  });
});
