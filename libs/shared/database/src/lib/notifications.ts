import { EventEmitter } from 'node:events';
import type { Notification } from '../generated/client.js';
import type { NotificationCategory, UserRole } from '../generated/enums.js';
import { getTenantDb, getTenantId, getUserId, onCommit } from './tenant-context.js';

/**
 * Preferencias que cada usuario puede apagar desde "Qué me avisa Oplex".
 * Las menciones y las tareas asignadas no están acá a propósito: siempre
 * llegan (son un pedido directo de otra persona).
 */
export const NOTIFICATION_PREFERENCES = {
  'production.status': 'Terminan, inician o cancelan una orden tuya',
  'production.short_materials': 'Faltan insumos para una orden tuya',
  'purchases.goods_received': 'Llega la mercadería de tu orden de compra',
  'stock.below_minimum': 'Un artículo queda bajo el mínimo',
  'task.completed': 'Completan una tarea que asignaste',
} as const;
export type NotificationPreferenceKey = keyof typeof NOTIFICATION_PREFERENCES;

export interface NotifyInput {
  recipientUserIds: (string | null | undefined)[];
  category: NotificationCategory;
  type: string;
  // Si el aviso se puede silenciar, la preferencia que lo controla.
  preference?: NotificationPreferenceKey;
  // Markdown mínimo: sólo **negrita**. Ya incluye el nombre de quien actuó.
  message: string;
  quote?: string;
  link?: string;
}

export interface NotificationCreatedEvent {
  tenantId: string;
  notification: Notification;
}

/**
 * Bus en memoria (mismo proceso) que el gateway del WebSocket escucha para
 * empujar cada aviso a la sala del usuario. Se emite sólo después del
 * commit (ver onCommit), nunca por algo que terminó en rollback.
 */
export const notificationBus = new EventEmitter();
export const NOTIFICATION_CREATED = 'notification.created';

/**
 * Crea un aviso por destinatario dentro de la transacción del request.
 * Nunca le avisa a quien hizo la acción (actor = getUserId()), ni a quien
 * silenció esa preferencia, ni a usuarios suspendidos. Pensado para
 * llamarse desde cualquier módulo sin inyectar nada: es una función, no un
 * provider de Nest, así ningún módulo de negocio suma dependencias.
 */
export async function notify(input: NotifyInput): Promise<Notification[]> {
  const actorUserId = getUserId() ?? null;
  const candidates = [...new Set(input.recipientUserIds.filter((id): id is string => !!id && id !== actorUserId))];
  if (candidates.length === 0) {
    return [];
  }

  const db = getTenantDb();
  const tenantId = getTenantId();
  const recipients = await db.user.findMany({
    where: { id: { in: candidates }, status: 'ACTIVE' },
    select: { id: true, mutedNotificationTypes: true },
  });
  const allowed = recipients.filter((u) => !input.preference || !u.mutedNotificationTypes.includes(input.preference));

  const created: Notification[] = [];
  for (const recipient of allowed) {
    created.push(
      await db.notification.create({
        data: {
          tenantId,
          recipientUserId: recipient.id,
          actorUserId,
          category: input.category,
          type: input.type,
          message: input.message,
          quote: input.quote,
          link: input.link,
        },
      }),
    );
  }

  if (created.length > 0) {
    onCommit(() => {
      for (const notification of created) {
        notificationBus.emit(NOTIFICATION_CREATED, { tenantId, notification } satisfies NotificationCreatedEvent);
      }
    });
  }
  return created;
}

/** Usuarios activos de la empresa con alguno de estos roles. */
export async function userIdsWithRoles(roles: UserRole[]): Promise<string[]> {
  const users = await getTenantDb().user.findMany({
    where: { role: { in: roles }, status: 'ACTIVE' },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Nombre para mostrar de quien está actuando ("María López", o su email). */
export async function currentActorName(): Promise<string> {
  const userId = getUserId();
  if (!userId) {
    return 'Alguien';
  }
  const user = await getTenantDb().user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return user?.name?.trim() || user?.email || 'Alguien';
}
