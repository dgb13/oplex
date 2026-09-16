import type { CalendarEventService } from '@plexo/calendar';
import type { PayablesService } from '@plexo/payables';
import type { ReceivablesService } from '@plexo/receivables';
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

function makeServices() {
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
  return { taxDeadlineService, receivablesService, payablesService, calendarEventService };
}

describe('AgendaService.getCalendarEntries', () => {
  it('OWNER sees every source, merged and sorted by date', async () => {
    const services = makeServices();
    const service = new AgendaService(
      services.taxDeadlineService,
      services.receivablesService,
      services.payablesService,
      services.calendarEventService,
    );

    const entries = await service.getCalendarEntries(makeUser({ role: 'OWNER' }), FROM, TO);

    expect(entries.map((e) => e.source)).toEqual(['collect', 'tax', 'custom', 'pay']);
  });

  it('a VIEWER with an explicit "taxes" read grant sees tax + custom, never collect/pay', async () => {
    const services = makeServices();
    const service = new AgendaService(
      services.taxDeadlineService,
      services.receivablesService,
      services.payablesService,
      services.calendarEventService,
    );
    const accountantLike = makeUser({
      role: 'VIEWER',
      moduleAccess: [{ module: 'taxes', canRead: true, canWrite: false }],
    });

    const entries = await service.getCalendarEntries(accountantLike, FROM, TO);

    expect(entries.map((e) => e.source).sort()).toEqual(['custom', 'tax']);
    expect(services.receivablesService.getCalendarEntries).not.toHaveBeenCalled();
    expect(services.payablesService.getCalendarEntries).not.toHaveBeenCalled();
  });

  it('a VIEWER with no grants at all sees only its own custom reminders', async () => {
    const services = makeServices();
    const service = new AgendaService(
      services.taxDeadlineService,
      services.receivablesService,
      services.payablesService,
      services.calendarEventService,
    );

    const entries = await service.getCalendarEntries(makeUser({ role: 'VIEWER' }), FROM, TO);

    expect(entries.map((e) => e.source)).toEqual(['custom']);
    expect(services.taxDeadlineService.getCalendarEntries).not.toHaveBeenCalled();
  });

  it('SALES sees receivables but not payables (mirrors ReceivablesController/PayablesController role lists)', async () => {
    const services = makeServices();
    const service = new AgendaService(
      services.taxDeadlineService,
      services.receivablesService,
      services.payablesService,
      services.calendarEventService,
    );

    const entries = await service.getCalendarEntries(makeUser({ role: 'SALES' }), FROM, TO);

    expect(entries.map((e) => e.source).sort()).toEqual(['collect', 'custom']);
  });

  it('filters the merged result by kinds when given', async () => {
    const services = makeServices();
    const service = new AgendaService(
      services.taxDeadlineService,
      services.receivablesService,
      services.payablesService,
      services.calendarEventService,
    );

    const entries = await service.getCalendarEntries(makeUser({ role: 'OWNER' }), FROM, TO, ['tax']);

    expect(entries.map((e) => e.source)).toEqual(['tax']);
  });
});
