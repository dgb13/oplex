import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, type CalendarEvent } from '@plexo/database';
import type { CalendarEntry } from '@plexo/types';
import type { CreateCalendarEventDto } from './dto/create-calendar-event.dto.js';
import type { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';

const KIND_LABEL: Record<CalendarEvent['kind'], string> = {
  MEETING: 'Reunión',
  TASK: 'Tarea',
  REMINDER: 'Recordatorio',
  CUSTOM: 'Propio',
};

function toCalendarEntry(event: CalendarEvent): CalendarEntry {
  return {
    id: event.id,
    source: 'custom',
    title: event.title,
    date: event.startsAt.toISOString(),
    amount: null,
    flow: null,
    ref: KIND_LABEL[event.kind],
    editable: true,
    link: event.linkType && event.linkId ? { module: event.linkType, id: event.linkId } : undefined,
  };
}

@Injectable()
export class CalendarEventService {
  create(dto: CreateCalendarEventDto): Promise<CalendarEvent> {
    return getTenantDb().calendarEvent.create({
      data: {
        tenantId: getTenantId(),
        title: dto.title,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        allDay: dto.allDay,
        kind: dto.kind,
        linkType: dto.linkType,
        linkId: dto.linkId,
        assignedTo: dto.assignedTo,
      },
    });
  }

  list(): Promise<CalendarEvent[]> {
    return getTenantDb().calendarEvent.findMany({ orderBy: { startsAt: 'asc' } });
  }

  async update(id: string, dto: UpdateCalendarEventDto): Promise<CalendarEvent> {
    const existing = await getTenantDb().calendarEvent.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Evento no encontrado');
    }
    return getTenantDb().calendarEvent.update({
      where: { id },
      data: {
        title: dto.title,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        allDay: dto.allDay,
        kind: dto.kind,
        status: dto.status,
        linkType: dto.linkType,
        linkId: dto.linkId,
        assignedTo: dto.assignedTo,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await getTenantDb().calendarEvent.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Evento no encontrado');
    }
    await getTenantDb().calendarEvent.delete({ where: { id } });
  }

  /** Función pura de la Agenda (ver docs/plan-agenda.md) - sólo toca su
   * propia tabla, nunca importa otro módulo de negocio. */
  async getCalendarEntries(from: Date, to: Date): Promise<CalendarEntry[]> {
    const events = await getTenantDb().calendarEvent.findMany({
      where: { startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: 'asc' },
    });
    return events.map(toCalendarEntry);
  }
}
