import type { CalendarEventService } from '@plexo/calendar';
import type { InvoicingService } from '@plexo/invoicing';
import type { PayablesService } from '@plexo/payables';
import type { CashSessionsService } from '@plexo/pos';
import type { ProductionOrderService } from '@plexo/production';
import type { ReceivablesService } from '@plexo/receivables';
import type { SubscriptionService } from '@plexo/subscriptions';
import type { TaxDeadlineService } from '@plexo/taxes';
import type { AuthenticatedUser, CalendarEntry } from '@plexo/types';
import { AgendaService } from './agenda.service.js';

const FROM = new Date('2026-09-01');
const TO = new Date('2026-09-30');

function entry(source: CalendarEntry['source'], id: string, date: string): CalendarEntry {
  return { id, source, title: id, date, amount: null, flow: null, ref: null, editable: source === 'custom' };
}

function makeUser(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    sub: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@test.local',
    role: 'VIEWER',
    moduleAccess: [],
    mustChangePassword: false,
    ...overrides,
  };
}

function makeServices(opts: { productionEnabled?: boolean } = {}) {
  const taxDeadlineService = {
    getCalendarEntries: jest.fn().mockResolvedValue([entry('tax', 'tax-1', '2026-09-10')]),
  } as unknown as TaxDeadlineService;
  const receivablesService = {
    getCalendarEntries: jest.fn().mockResolvedValue([entry('collect', 'collect-1', '2026-09-05')]),
  } as unknown as ReceivablesService;
  const payablesService = {
    getCalendarEntries: jest.fn().mockResolvedValue([entry('pay', 'pay-1', '2026-09-20')]),
  } as unknown as PayablesService;
  const calendarEventService = {
    getCalendarEntries: jest.fn().mockResolvedValue([entry('custom', 'custom-1', '2026-09-16')]),
  } as unknown as CalendarEventService;
  const invoicingService = {
    getCalendarEntries: jest.fn().mockResolvedValue([entry('sale', 'sale-1', '2026-09-12')]),
  } as unknown as InvoicingService;
  const productionOrderService = {
    getCalendarEntries: jest.fn().mockResolvedValue([entry('prod', 'prod-1', '2026-09-08')]),
  } as unknown as ProductionOrderService;
  const cashSessionsService = {
    getCalendarEntries: jest.fn().mockResolvedValue([entry('cash', 'cash-1', '2026-09-18')]),
  } as unknown as CashSessionsService;
  const subscriptionService = {
    assertCanUseProduction: jest.fn(() =>
      opts.productionEnabled === false ? Promise.reject(new Error('plan sin producción')) : Promise.resolve(undefined),
    ),
  } as unknown as SubscriptionService;
  return {
    taxDeadlineService,
    receivablesService,
    payablesService,
    calendarEventService,
    invoicingService,
    productionOrderService,
    cashSessionsService,
    subscriptionService,
  };
}

function makeService(services: ReturnType<typeof makeServices>) {
  return new AgendaService(
    services.taxDeadlineService,
    services.receivablesService,
    services.payablesService,
    services.calendarEventService,
    services.invoicingService,
    services.productionOrderService,
    services.cashSessionsService,
    services.subscriptionService,
  );
}

describe('AgendaService.getCalendarEntries', () => {
  it('OWNER with a plan that includes Production sees every source, merged and sorted by date', async () => {
    const services = makeServices();
    const service = makeService(services);

    const entries = await service.getCalendarEntries(makeUser({ role: 'OWNER' }), FROM, TO);

    expect(entries.map((e) => e.source)).toEqual(['collect', 'prod', 'tax', 'sale', 'custom', 'cash', 'pay']);
  });

  it('a VIEWER with an explicit "taxes" read grant sees tax + sale + custom, never collect/pay/cash', async () => {
    const services = makeServices();
    const service = makeService(services);
    const accountantLike = makeUser({
      role: 'VIEWER',
      moduleAccess: [{ module: 'taxes', canRead: true, canWrite: false }],
    });

    const entries = await service.getCalendarEntries(accountantLike, FROM, TO);

    // 'sale' (GET /invoicing/invoices) y 'custom' nunca se gatean por rol,
    // y 'prod' sólo por el plan (por defecto habilitado en este mock) -
    // ninguno de los tres depende de moduleAccess/roles de este usuario.
    expect(entries.map((e) => e.source).sort()).toEqual(['custom', 'prod', 'sale', 'tax']);
    expect(services.receivablesService.getCalendarEntries).not.toHaveBeenCalled();
    expect(services.payablesService.getCalendarEntries).not.toHaveBeenCalled();
    expect(services.cashSessionsService.getCalendarEntries).not.toHaveBeenCalled();
  });

  it('a VIEWER with no grants at all still sees sale + custom (no @Roles on those real endpoints)', async () => {
    const services = makeServices();
    const service = makeService(services);

    const entries = await service.getCalendarEntries(makeUser({ role: 'VIEWER' }), FROM, TO);

    expect(entries.map((e) => e.source).sort()).toEqual(['custom', 'prod', 'sale']);
    expect(services.taxDeadlineService.getCalendarEntries).not.toHaveBeenCalled();
  });

  it('SALES sees collect and cash but not pay (mirrors each controller\'s own role list)', async () => {
    const services = makeServices();
    const service = makeService(services);

    const entries = await service.getCalendarEntries(makeUser({ role: 'SALES' }), FROM, TO);

    expect(entries.map((e) => e.source).sort()).toEqual(['cash', 'collect', 'custom', 'prod', 'sale']);
  });

  it('never includes "prod" when the tenant\'s plan does not cover Production, even for OWNER', async () => {
    const services = makeServices({ productionEnabled: false });
    const service = makeService(services);

    const entries = await service.getCalendarEntries(makeUser({ role: 'OWNER' }), FROM, TO);

    expect(entries.map((e) => e.source)).not.toContain('prod');
    expect(services.productionOrderService.getCalendarEntries).not.toHaveBeenCalled();
  });

  it('filters the merged result by kinds when given', async () => {
    const services = makeServices();
    const service = makeService(services);

    const entries = await service.getCalendarEntries(makeUser({ role: 'OWNER' }), FROM, TO, ['tax']);

    expect(entries.map((e) => e.source)).toEqual(['tax']);
  });
});
