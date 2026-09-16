import { api } from '@/lib/api';

export type CalendarEntrySource = 'sale' | 'collect' | 'pay' | 'tax' | 'prod' | 'cash' | 'custom';
export type CalendarEntryFlow = 'in' | 'out' | null;

export interface CalendarEntry {
  id: string;
  source: CalendarEntrySource;
  title: string;
  date: string;
  amount: number | null;
  flow: CalendarEntryFlow;
  ref: string | null;
  editable: boolean;
  link?: { module: string; id: string };
}

export type CalendarEventKind = 'MEETING' | 'TASK' | 'REMINDER' | 'CUSTOM';
export type CalendarEventStatus = 'PENDING' | 'DONE' | 'CANCELLED';

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  kind: CalendarEventKind;
  status: CalendarEventStatus;
  linkType: string | null;
  linkId: string | null;
  assignedTo: string | null;
}

export interface CreateCalendarEventInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  kind?: CalendarEventKind;
}

export interface GetCalendarEntriesParams {
  from: string;
  to: string;
  kinds?: CalendarEntrySource[];
}

/** Cliente de la Agenda (ver docs/plan-agenda.md). GET /calendar es el
 * endpoint compuesto (Fase 1: impuestos + cuentas a cobrar/pagar + eventos
 * propios) - la composición vive en apps/api, este cliente no sabe nada de
 * eso, sólo pega al endpoint final. */
export const calendarApi = {
  getEntries: (params: GetCalendarEntriesParams) =>
    api
      .get<CalendarEntry[]>('/calendar', {
        params: { from: params.from, to: params.to, kinds: params.kinds?.join(',') },
      })
      .then((r) => r.data),
  createEvent: (input: CreateCalendarEventInput) =>
    api.post<CalendarEvent>('/calendar/events', input).then((r) => r.data),
  deleteEvent: (id: string) => api.delete(`/calendar/events/${id}`).then((r) => r.data),
};
