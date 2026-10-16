import type { AuthEmailSender } from '@plexo/auth-email';
import { tenantContextStorage, type PrismaService } from '@plexo/database';
import { SubscriptionNoticeService } from './subscription-notice.service.js';

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

const SILVER = { name: 'Silver', priceMonthly: 79900, annualDiscountPercent: 20 };

function makeDb(subscription: Record<string, unknown>, payments: Record<string, unknown>[] = []) {
  const state = { subscription: { plan: SILVER, ...subscription }, payments };
  return {
    state,
    tenant: { findUnique: jest.fn(async () => ({ name: 'Panadería La Espiga SRL', taxId: '30-00000000-0' })) },
    user: {
      findMany: jest.fn(async () => [
        { email: 'martina@laespiga.test', name: 'Martina Ruiz' },
        { email: 'socio@laespiga.test', name: null },
      ]),
    },
    tenantSubscription: {
      findUnique: jest.fn(async () => state.subscription),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(state.subscription, data)),
    },
    subscriptionPayment: {
      findFirst: jest.fn(async ({ where }: { where: { status: string } }) => state.payments.find((p) => p['status'] === where.status) ?? null),
    },
  };
}

function setup(db: ReturnType<typeof makeDb>) {
  const email = { sendHtmlNotice: jest.fn().mockResolvedValue(undefined) } as unknown as AuthEmailSender & { sendHtmlNotice: jest.Mock };
  const prisma = {
    plan: { findFirst: jest.fn().mockResolvedValue({ maxUsers: 1, maxMonthlyInvoices: 50 }) },
  } as unknown as PrismaService;
  const service = new SubscriptionNoticeService(prisma, email);
  const run = <T>(fn: () => T): T => tenantContextStorage.run({ tenantId: 'tenant-1', userId: undefined, tx: db as never }, fn);
  return { service, email, run };
}

describe('SubscriptionNoticeService', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(day('2026-11-13')));
  afterEach(() => jest.useRealTimers());

  it('"faltan 3 días": a cada dueño, una sola vez por prueba', async () => {
    const db = makeDb({ status: 'TRIALING', trialEndsAt: day('2026-11-16'), trialEndingNoticeSentAt: null });
    const { service, email, run } = setup(db);

    expect(await run(() => service.sendTrialEndingIfDue())).toBe(true);
    expect(email.sendHtmlNotice).toHaveBeenCalledTimes(2);
    const [first] = email.sendHtmlNotice.mock.calls[0];
    expect(first.to).toBe('martina@laespiga.test');
    expect(first.subject).toBe('Te quedan 3 días de prueba en Oplex');
    expect(first.text).toContain('Hola, Martina:');
    expect(first.text).toContain('Basic Gratis: sin costo, con 1 usuario y 50 facturas por mes.');
    expect(email.sendHtmlNotice.mock.calls[1][0].text).toContain('Hola:');

    expect(await run(() => service.sendTrialEndingIfDue())).toBe(false);
    expect(email.sendHtmlNotice).toHaveBeenCalledTimes(2);
  });

  it('no avisa la prueba si todavía faltan más de 3 días', async () => {
    const db = makeDb({ status: 'TRIALING', trialEndsAt: day('2026-11-20'), trialEndingNoticeSentAt: null });
    const { service, email, run } = setup(db);
    expect(await run(() => service.sendTrialEndingIfDue())).toBe(false);
    expect(email.sendHtmlNotice).not.toHaveBeenCalled();
  });

  it('renovación: 7 días antes, una vez por período, con la gracia en el texto', async () => {
    const periodEnd = day('2026-11-18');
    const db = makeDb({ status: 'ACTIVE', currentPeriodEnd: periodEnd, renewalNoticeSentFor: null }, [
      { status: 'PAID', periodEnd },
    ]);
    const { service, email, run } = setup(db);

    expect(await run(() => service.sendRenewalIfDue(10))).toBe(true);
    expect(email.sendHtmlNotice.mock.calls[0][0].subject).toBe('Tu Plan Silver vence el 18/11');
    expect(email.sendHtmlNotice.mock.calls[0][0].text).toContain('sigue funcionando 10 días más');
    expect(db.state.subscription).toMatchObject({ renewalNoticeSentFor: periodEnd });

    expect(await run(() => service.sendRenewalIfDue(10))).toBe(false);
  });

  it('no pide renovar con una transferencia avisada ni si lo vigente es sólo el crédito provisorio', async () => {
    const withPending = makeDb({ status: 'ACTIVE', currentPeriodEnd: day('2026-11-18') }, [
      { status: 'PAID', periodEnd: day('2026-11-18') },
      { status: 'PENDING' },
    ]);
    const provisional = makeDb({ status: 'ACTIVE', currentPeriodEnd: day('2026-11-16') });
    for (const db of [withPending, provisional]) {
      const { service, email, run } = setup(db);
      expect(await run(() => service.sendRenewalIfDue(10))).toBe(false);
      expect(email.sendHtmlNotice).not.toHaveBeenCalled();
    }
  });

  it('el recordatorio a Oplex toma la transferencia cuyo crédito vence mañana (fecha argentina)', async () => {
    // 13/11 a las 9 de Argentina; el crédito vence el 14/11 a las 10:24.
    const now = new Date('2026-11-13T12:00:00Z');
    const db = makeDb({ status: 'ACTIVE', currentPeriodEnd: new Date('2026-11-14T13:24:00Z') }, [
      { status: 'PENDING', total: 290037 },
    ]);
    const { service, run } = setup(db);

    expect(await run(() => service.pendingTransferDueTomorrow(now))).toEqual({
      tenantName: 'Panadería La Espiga SRL',
      total: 290037,
      coveredUntil: new Date('2026-11-14T13:24:00Z'),
    });
    expect(await run(() => service.pendingTransferDueTomorrow(new Date('2026-11-12T12:00:00Z')))).toBeNull();
  });

  it('el resumen diario va a facturacion@ y no sale si no hay nada', async () => {
    const { service, email } = setup(makeDb({}));
    await service.sendOplexPendingDigest([]);
    expect(email.sendHtmlNotice).not.toHaveBeenCalled();

    await service.sendOplexPendingDigest([{ tenantName: 'Taller El Pistón', total: 54329, coveredUntil: day('2026-11-19') }]);
    expect(email.sendHtmlNotice).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'facturacion@oplex.com.ar', subject: 'Mañana vence: 1 transferencia sin confirmar' }),
    );
  });

  it('un mail que falla no corta el resto', async () => {
    const db = makeDb({ status: 'EXPIRED' });
    const { service, email, run } = setup(db);
    email.sendHtmlNotice.mockRejectedValueOnce(new Error('rebotó'));
    await expect(run(() => service.sendTrialEnded())).resolves.toBeUndefined();
    expect(email.sendHtmlNotice).toHaveBeenCalledTimes(2);
  });
});
