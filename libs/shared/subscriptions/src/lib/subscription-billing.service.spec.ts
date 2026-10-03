import { tenantContextStorage, type PrismaService } from '@plexo/database';
import { SubscriptionBillingService } from './subscription-billing.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const SILVER = {
  id: 'plan-silver',
  key: 'SILVER',
  isActive: true,
  priceMonthly: 176439,
  debitDiscountPercent: 5,
  annualDiscountPercent: 20,
};

function makePrisma() {
  return { plan: { findUnique: jest.fn().mockResolvedValue(SILVER) } } as unknown as PrismaService;
}

/** DB en memoria mínima: una suscripción y su lista de pagos. */
function makeDb(subscription: Record<string, unknown>, payments: Record<string, unknown>[] = []) {
  const state = { subscription: { ...subscription }, payments: [...payments] };
  const db = {
    state,
    tenantSubscription: {
      findUnique: jest.fn(async () => state.subscription),
      findUniqueOrThrow: jest.fn(async () => state.subscription),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(state.subscription, data)),
    },
    subscriptionPayment: {
      findFirst: jest.fn(async ({ where }: { where: { status: string } }) => {
        const matches = state.payments.filter((p) => p['status'] === where.status);
        return matches.sort((a, b) => Number(b['periodEnd']) - Number(a['periodEnd']))[0] ?? null;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => state.payments.find((p) => p['id'] === where.id) ?? null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const payment = { id: `pay-${state.payments.length + 1}`, plan: SILVER, ...data };
        state.payments.push(payment);
        return payment;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const payment = state.payments.find((p) => p['id'] === where.id)!;
        return Object.assign(payment, data);
      }),
    },
  };
  return db;
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('SubscriptionBillingService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(day('2026-10-03')));
  afterEach(() => jest.useRealTimers());

  it('una transferencia avisada deja la cuenta vencida activa 3 días mientras se confirma', async () => {
    const db = makeDb({ status: 'EXPIRED', trialEndsAt: day('2026-08-13'), currentPeriodEnd: null });
    const service = new SubscriptionBillingService(makePrisma());

    const payment = await runInTenant(db, () => service.reportTransfer({ planKey: 'SILVER', months: 1, reference: 'op 123' }));

    expect(payment).toMatchObject({ status: 'PENDING', method: 'TRANSFER', total: 213491.19 });
    expect(db.state.subscription).toMatchObject({ status: 'ACTIVE', currentPeriodEnd: day('2026-10-06') });
  });

  it('no deja avisar dos transferencias a la vez', async () => {
    const db = makeDb({ status: 'ACTIVE' }, [{ id: 'p1', status: 'PENDING' }]);
    const service = new SubscriptionBillingService(makePrisma());
    await expect(runInTenant(db, () => service.reportTransfer({ planKey: 'SILVER', months: 1 }))).rejects.toThrow(
      'Ya hay una transferencia esperando confirmación',
    );
  });

  it('al confirmar, el período arranca hoy (los 3 días provisorios no cuentan)', async () => {
    const db = makeDb({ status: 'ACTIVE', currentPeriodEnd: day('2026-10-06') }, [
      { id: 'p1', status: 'PENDING', months: 3, planId: 'plan-silver', method: 'TRANSFER' },
    ]);
    const service = new SubscriptionBillingService(makePrisma());

    await runInTenant(db, () => service.confirmPayment('p1', 'admin@oplex'));

    expect(db.state.payments[0]).toMatchObject({ status: 'PAID', periodEnd: day('2027-01-03'), reviewedBy: 'admin@oplex' });
    expect(db.state.subscription).toMatchObject({ status: 'ACTIVE', currentPeriodEnd: day('2027-01-03'), paymentMethod: 'TRANSFER' });
  });

  it('pagar antes de vencer suma desde el fin de lo ya pagado', async () => {
    const db = makeDb({ status: 'ACTIVE', currentPeriodEnd: day('2026-10-20') }, [
      { id: 'old', status: 'PAID', periodEnd: day('2026-10-20') },
    ]);
    const service = new SubscriptionBillingService(makePrisma());

    await runInTenant(db, () => service.recordPayment({ planKey: 'SILVER', months: 12, method: 'CASH' }, 'admin@oplex'));

    expect(db.state.subscription).toMatchObject({ currentPeriodEnd: day('2027-10-20') });
    expect(db.state.payments[1]).toMatchObject({ status: 'PAID', discountAmount: 423453.6, total: 2049515.42 });
  });

  it('al rechazar sin nada pago ni prueba vigente, queda en sólo lectura', async () => {
    const db = makeDb({ status: 'ACTIVE', trialEndsAt: day('2026-08-13'), currentPeriodEnd: day('2026-10-06') }, [
      { id: 'p1', status: 'PENDING', months: 1 },
    ]);
    const service = new SubscriptionBillingService(makePrisma());

    await runInTenant(db, () => service.rejectPayment('p1', 'admin@oplex'));

    expect(db.state.payments[0]).toMatchObject({ status: 'REJECTED' });
    expect(db.state.subscription).toMatchObject({ status: 'EXPIRED', currentPeriodEnd: null });
  });

  it('el chequeo diario pasa de vencido a gracia de 5 días y después a sólo lectura', async () => {
    const db = makeDb({ status: 'ACTIVE', currentPeriodEnd: day('2026-10-01') });
    const service = new SubscriptionBillingService(makePrisma());

    expect(await runInTenant(db, () => service.sweepBillingStatus(day('2026-10-03')))).toBe('PAST_DUE');
    expect(db.state.subscription).toMatchObject({ status: 'PAST_DUE', graceEndsAt: day('2026-10-06') });

    expect(await runInTenant(db, () => service.sweepBillingStatus(day('2026-10-05')))).toBeNull();
    expect(await runInTenant(db, () => service.sweepBillingStatus(day('2026-10-07')))).toBe('EXPIRED');
  });

  it('un ACTIVE sin fecha de fin (activado a mano) no vence solo', async () => {
    const db = makeDb({ status: 'ACTIVE', currentPeriodEnd: null });
    const service = new SubscriptionBillingService(makePrisma());
    expect(await runInTenant(db, () => service.sweepBillingStatus())).toBeNull();
  });
});
