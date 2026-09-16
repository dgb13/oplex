import { NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { CalendarEventService } from './calendar-event.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T, opts: { userId?: string } = {}): T {
  return tenantContextStorage.run(
    { tenantId: 'tenant-1', userId: opts.userId ?? 'user-1', role: 'OWNER' as never, tx: db as never },
    fn,
  );
}

describe('CalendarEventService.create', () => {
  it('stamps tenantId from the tenant context', async () => {
    const db = { calendarEvent: { create: jest.fn().mockResolvedValue({ id: 'e1' }) } };
    const service = new CalendarEventService();

    await runInTenant(db, () =>
      service.create({ title: 'Reunión con contador', startsAt: '2026-10-01T15:00:00.000Z' }),
    );

    expect((db.calendarEvent.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-1',
      title: 'Reunión con contador',
    });
  });
});

describe('CalendarEventService.update', () => {
  it('throws when the event does not exist', async () => {
    const db = { calendarEvent: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CalendarEventService();

    await expect(runInTenant(db, () => service.update('missing', { title: 'x' }))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates the given fields', async () => {
    const db = {
      calendarEvent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'e1' }),
        update: jest.fn().mockResolvedValue({ id: 'e1', status: 'DONE' }),
      },
    };
    const service = new CalendarEventService();

    await runInTenant(db, () => service.update('e1', { status: 'DONE' }));

    expect(db.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({ status: 'DONE' }),
    });
  });
});

describe('CalendarEventService.remove', () => {
  it('throws when the event does not exist', async () => {
    const db = { calendarEvent: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CalendarEventService();

    await expect(runInTenant(db, () => service.remove('missing'))).rejects.toThrow(NotFoundException);
  });

  it('deletes the row when it exists', async () => {
    const db = {
      calendarEvent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'e1' }),
        delete: jest.fn().mockResolvedValue({ id: 'e1' }),
      },
    };
    const service = new CalendarEventService();

    await runInTenant(db, () => service.remove('e1'));

    expect(db.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
  });
});

describe('CalendarEventService.getCalendarEntries', () => {
  it('maps rows to CalendarEntry with source "custom" and editable true', async () => {
    const db = {
      calendarEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            title: 'Cierre contable del mes',
            startsAt: new Date('2026-09-25T12:00:00.000Z'),
            kind: 'TASK',
            linkType: null,
            linkId: null,
          },
        ]),
      },
    };
    const service = new CalendarEventService();

    const entries = await runInTenant(db, () =>
      service.getCalendarEntries(new Date('2026-09-01'), new Date('2026-09-30')),
    );

    expect(entries).toEqual([
      {
        id: 'e1',
        source: 'custom',
        title: 'Cierre contable del mes',
        date: '2026-09-25T12:00:00.000Z',
        amount: null,
        flow: null,
        ref: 'Tarea',
        editable: true,
        link: undefined,
      },
    ]);
  });

  it('populates link when linkType/linkId are set', async () => {
    const db = {
      calendarEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e2',
            title: 'Seguimiento factura',
            startsAt: new Date('2026-09-10T00:00:00.000Z'),
            kind: 'REMINDER',
            linkType: 'invoice',
            linkId: 'inv-1',
          },
        ]),
      },
    };
    const service = new CalendarEventService();

    const entries = await runInTenant(db, () =>
      service.getCalendarEntries(new Date('2026-09-01'), new Date('2026-09-30')),
    );

    expect(entries[0]?.link).toEqual({ module: 'invoice', id: 'inv-1' });
  });
});
