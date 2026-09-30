import { Injectable, NotFoundException } from '@nestjs/common';
import { currentActorName, getTenantDb, getTenantId, getUserId, notify, type CalendarEvent } from '@plexo/database';
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

// Adónde lleva un aviso de tarea - mismas rutas que calendarLinks.ts del
// front para los vínculos que tienen pantalla propia; si no, a la Agenda.
function taskLink(event: CalendarEvent): string {
  if (event.linkType === 'production-order' && event.linkId) {
    return `/production/orders/${event.linkId}`;
  }
  return '/agenda';
}

// "jue 01/10" armado a mano: Intl según la versión de ICU del servidor
// separa con "-" o agrega coma.
const WEEKDAY = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' });
const DUE_FORMAT = {
  format: (d: Date) =>
    `${WEEKDAY.format(d).replace('.', '')} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
};

@Injectable()
export class CalendarEventService {
  async create(dto: CreateCalendarEventDto): Promise<CalendarEvent> {
    const event = await getTenantDb().calendarEvent.create({
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
        createdByUserId: getUserId(),
      },
    });
    await this.notifyAssigned(event);
    return event;
  }

  /** Tareas pendientes asignadas a quien consulta ("Mis tareas"). */
  myOpenTasks(): Promise<CalendarEvent[]> {
    return getTenantDb().calendarEvent.findMany({
      where: { kind: 'TASK', status: 'PENDING', assignedTo: getUserId() ?? '__nadie__' },
      orderBy: { startsAt: 'asc' },
    });
  }

  /** Tareas vinculadas a un documento (ej. una orden de producción). */
  tasksFor(linkType: string, linkId: string): Promise<CalendarEvent[]> {
    return getTenantDb().calendarEvent.findMany({
      where: { kind: 'TASK', linkType, linkId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async notifyAssigned(event: CalendarEvent): Promise<void> {
    if (event.kind !== 'TASK' || !event.assignedTo) {
      return;
    }
    await notify({
      recipientUserIds: [event.assignedTo],
      category: 'TASK',
      type: 'task.assigned',
      message: `**${await currentActorName()}** te asignó una tarea: **${event.title}** · vence ${DUE_FORMAT.format(event.startsAt)}`,
      link: taskLink(event),
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
    const completing = dto.status === 'DONE' && existing.status !== 'DONE';
    const reopening = dto.status && dto.status !== 'DONE' && existing.status === 'DONE';
    const updated = await getTenantDb().calendarEvent.update({
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
        ...(completing ? { completedAt: new Date(), completedByUserId: getUserId() } : {}),
        ...(reopening ? { completedAt: null, completedByUserId: null } : {}),
      },
    });

    if (updated.kind === 'TASK') {
      if (completing && updated.createdByUserId) {
        await notify({
          recipientUserIds: [updated.createdByUserId],
          category: 'TASK',
          type: 'task.completed',
          preference: 'task.completed',
          message: `**${await currentActorName()}** completó tu tarea **${updated.title}**`,
          link: taskLink(updated),
        });
      }
      if (dto.assignedTo && dto.assignedTo !== existing.assignedTo) {
        await this.notifyAssigned(updated);
      }
    }
    return updated;
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
