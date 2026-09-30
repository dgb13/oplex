import { api } from './api';

// Trabajo en equipo: campana de avisos, comentarios con @menciones y tareas
// (las tareas son eventos de la Agenda de tipo TASK - ver
// CalendarEventService en el backend).

export type NotificationCategory = 'PRODUCTION' | 'PURCHASES' | 'STOCK' | 'MENTION' | 'TASK';
export type NotificationFilter = 'all' | 'unread' | 'mentions';

export interface Person {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
}

export interface AppNotification {
  id: string;
  recipientUserId: string;
  actorUserId: string | null;
  category: NotificationCategory;
  type: string;
  // Markdown mínimo: sólo **negrita** (ver RichText).
  message: string;
  quote: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  actor?: Person | null;
}

export interface NotificationPreference {
  key: string;
  label: string;
  enabled: boolean;
}

export interface DocumentComment {
  id: string;
  entityType: string;
  entityId: string;
  authorUserId: string;
  body: string;
  mentionedUserIds: string[];
  createdAt: string;
  author: Person | null;
}

export interface TeamTask {
  id: string;
  title: string;
  startsAt: string;
  status: 'PENDING' | 'DONE' | 'CANCELLED';
  assignedTo: string | null;
  createdByUserId: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  linkType: string | null;
  linkId: string | null;
  createdAt?: string;
}

export const NOTIFICATION_CREATED_EVENT = 'notification.created';

export const collaborationApi = {
  listNotifications: (filter: NotificationFilter) =>
    api.get<AppNotification[]>('/notifications', { params: { filter } }).then((r) => r.data),
  unreadCount: () => api.get<{ unread: number }>('/notifications/unread-count').then((r) => r.data.unread),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  getPreferences: () => api.get<NotificationPreference[]>('/notifications/preferences').then((r) => r.data),
  setPreferences: (muted: string[]) =>
    api.put<NotificationPreference[]>('/notifications/preferences', { muted }).then((r) => r.data),
  people: () => api.get<Person[]>('/collaboration/people').then((r) => r.data),
  listComments: (entityType: string, entityId: string) =>
    api.get<DocumentComment[]>('/comments', { params: { entityType, entityId } }).then((r) => r.data),
  addComment: (input: { entityType: string; entityId: string; body: string; mentionedUserIds: string[] }) =>
    api.post<DocumentComment>('/comments', input).then((r) => r.data),
  myTasks: () => api.get<TeamTask[]>('/calendar/events/tasks/mine').then((r) => r.data),
  tasksFor: (linkType: string, linkId: string) =>
    api.get<TeamTask[]>('/calendar/events/tasks', { params: { linkType, linkId } }).then((r) => r.data),
  createTask: (input: { title: string; dueDate: string; assignedTo: string; linkType?: string; linkId?: string }) =>
    api
      .post<TeamTask>('/calendar/events', {
        title: input.title,
        // Mediodía UTC del día elegido: el vencimiento no se corre de día por
        // la zona horaria (mismo criterio que dateInputToIso de Producción).
        startsAt: `${input.dueDate}T12:00:00.000Z`,
        allDay: true,
        kind: 'TASK',
        assignedTo: input.assignedTo,
        linkType: input.linkType,
        linkId: input.linkId,
      })
      .then((r) => r.data),
  setTaskDone: (id: string, done: boolean) =>
    api.patch<TeamTask>(`/calendar/events/${id}`, { status: done ? 'DONE' : 'PENDING' }).then((r) => r.data),
};

export function personName(p: Pick<Person, 'name' | 'email'> | null | undefined): string {
  return p?.name?.trim() || p?.email || 'Alguien';
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const d = new Date(iso);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const yesterday = new Date(now - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return `ayer ${time}`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

/** "Hoy" / "Ayer" / "lun 28/09" - encabezados de grupo en la campana. */
export function dayLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (d.toDateString() === new Date(now).toDateString()) return 'Hoy';
  if (d.toDateString() === new Date(now - 86400000).toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function dueLabel(iso: string, now = Date.now()): { text: string; tone: 'late' | 'soon' | 'normal' } {
  const due = new Date(iso);
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const t = new Date(now);
  const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  const days = Math.round((dueDay - today) / 86400000);
  if (days < 0) return { text: days === -1 ? 'venció ayer' : `venció hace ${-days} días`, tone: 'late' };
  if (days === 0) return { text: 'vence hoy', tone: 'soon' };
  if (days === 1) return { text: 'vence mañana', tone: 'soon' };
  return {
    text: `vence ${due.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' })}`,
    tone: 'normal',
  };
}
