import { Injectable, NotFoundException } from '@nestjs/common';
import {
  currentActorName,
  getTenantDb,
  getTenantId,
  getUserId,
  notify,
  NOTIFICATION_PREFERENCES,
  type DocumentComment,
  type Notification,
} from '@plexo/database';
import { entityLabel, entityLink } from './collaboration-links.js';
import type { CreateCommentDto } from './dto/create-comment.dto.js';

export type NotificationFilter = 'all' | 'unread' | 'mentions';

interface PersonSummary {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  role: string;
}

export interface NotificationView extends Notification {
  actor: PersonSummary | null;
}

export interface CommentView extends DocumentComment {
  author: PersonSummary | null;
}

const PERSON_SELECT = { id: true, name: true, email: true, avatarUrl: true, role: true } as const;
const PAGE_SIZE = 50;

function me(): string {
  const userId = getUserId();
  if (!userId) {
    throw new NotFoundException('Usuario no identificado');
  }
  return userId;
}

/**
 * La campana y los comentarios. Todo filtrado por el usuario que consulta
 * (recipientUserId = yo) además del aislamiento por empresa de RLS - nadie
 * ve los avisos de un compañero.
 */
@Injectable()
export class CollaborationService {
  async listNotifications(filter: NotificationFilter): Promise<NotificationView[]> {
    const rows = await getTenantDb().notification.findMany({
      where: {
        recipientUserId: me(),
        ...(filter === 'unread' ? { readAt: null } : {}),
        ...(filter === 'mentions' ? { category: { in: ['MENTION', 'TASK'] } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    });
    const people = await this.peopleById(rows.map((r) => r.actorUserId));
    return rows.map((r) => ({ ...r, actor: r.actorUserId ? (people.get(r.actorUserId) ?? null) : null }));
  }

  async unreadCount(): Promise<{ unread: number }> {
    const unread = await getTenantDb().notification.count({ where: { recipientUserId: me(), readAt: null } });
    return { unread };
  }

  async markRead(id: string): Promise<void> {
    await getTenantDb().notification.updateMany({
      where: { id, recipientUserId: me(), readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(): Promise<void> {
    await getTenantDb().notification.updateMany({
      where: { recipientUserId: me(), readAt: null },
      data: { readAt: new Date() },
    });
  }

  async getPreferences() {
    const user = await getTenantDb().user.findUnique({ where: { id: me() }, select: { mutedNotificationTypes: true } });
    const muted = new Set(user?.mutedNotificationTypes ?? []);
    return Object.entries(NOTIFICATION_PREFERENCES).map(([key, label]) => ({ key, label, enabled: !muted.has(key) }));
  }

  async setPreferences(muted: string[]) {
    await getTenantDb().user.update({ where: { id: me() }, data: { mutedNotificationTypes: [...new Set(muted)] } });
    return this.getPreferences();
  }

  /** Compañeros activos para mencionar o asignar una tarea - sin el
   * que consulta, y visible para cualquier rol (no es la gestión del
   * equipo, que sigue siendo sólo de Dueño/Administrador). */
  people(): Promise<PersonSummary[]> {
    return getTenantDb().user.findMany({
      where: { status: 'ACTIVE', isExternalAccountant: false, id: { not: me() } },
      select: PERSON_SELECT,
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
  }

  async listComments(entityType: string, entityId: string): Promise<CommentView[]> {
    const rows = await getTenantDb().documentComment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
    const people = await this.peopleById(rows.map((r) => r.authorUserId));
    return rows.map((r) => ({ ...r, author: people.get(r.authorUserId) ?? null }));
  }

  async addComment(dto: CreateCommentDto): Promise<CommentView> {
    const label = await entityLabel(dto.entityType, dto.entityId);
    if (!label) {
      throw new NotFoundException('El documento no existe');
    }
    const db = getTenantDb();
    const authorUserId = me();
    // Sólo quedan las menciones a usuarios reales de esta empresa (RLS).
    const mentioned = dto.mentionedUserIds?.length
      ? (await db.user.findMany({ where: { id: { in: dto.mentionedUserIds } }, select: { id: true } })).map((u) => u.id)
      : [];

    const comment = await db.documentComment.create({
      data: {
        tenantId: getTenantId(),
        entityType: dto.entityType,
        entityId: dto.entityId,
        authorUserId,
        body: dto.body.trim(),
        mentionedUserIds: mentioned,
      },
    });

    if (mentioned.length > 0) {
      const body = comment.body;
      await notify({
        recipientUserIds: mentioned,
        category: 'MENTION',
        type: 'mention.comment',
        message: `**${await currentActorName()}** te mencionó en **${label}**`,
        quote: body.length > 160 ? `${body.slice(0, 157)}…` : body,
        link: entityLink(dto.entityType, dto.entityId),
      });
    }

    const people = await this.peopleById([authorUserId]);
    return { ...comment, author: people.get(authorUserId) ?? null };
  }

  private async peopleById(ids: (string | null)[]): Promise<Map<string, PersonSummary>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) {
      return new Map();
    }
    const users = await getTenantDb().user.findMany({ where: { id: { in: unique } }, select: PERSON_SELECT });
    return new Map(users.map((u) => [u.id, u]));
  }
}
