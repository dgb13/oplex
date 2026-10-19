import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AssistantChannel,
  AssistantIntent,
  AssistantMessageRole,
  getTenantDb,
  Prisma,
  PrismaService,
  withTenantContext,
  type UserRole,
} from '@plexo/database';
import { ASSISTANT_TOOL_TITLES } from './assistant-tools.catalog.js';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

// Una respuesta llega a lo sumo ~60s después de su pregunta (timeout del
// controller/webhook) - este margen alcanza de sobra para traer, en un solo
// query, las respuestas de toda una página de preguntas.
const REPLY_WINDOW_MS = 5 * 60_000;

// Decisión del usuario (2026-10-19): el historial se guarda 12 meses.
const RETENTION_MONTHS = 12;

// Argentina no tiene horario de verano: UTC-3 fijo todo el año.
const ARGENTINA_OFFSET_MS = -3 * 60 * 60_000;

/** Cómo terminó el turno, para la columna "Estado" del Historial.
 * - ANSWERED_WITH_DATA: consulta de datos que usó al menos una herramienta.
 * - ANSWERED_WITHOUT_DATA: consulta de datos que se respondió sin herramientas
 *   (casi siempre "no tengo cómo responder eso" - mismo criterio que el
 *   reporte de "sin responder" de /admin).
 * - HELP: pregunta de uso del sistema.
 * - NO_REPLY: no hay respuesta guardada (falló la IA o se cortó el pedido). */
export type AssistantHistoryStatus = 'ANSWERED_WITH_DATA' | 'ANSWERED_WITHOUT_DATA' | 'HELP' | 'NO_REPLY';

export interface AssistantHistoryEntry {
  id: string;
  createdAt: Date;
  channel: AssistantChannel | null;
  user: { id: string; name: string; role: UserRole | null };
  question: string;
  answer: string | null;
  status: AssistantHistoryStatus;
  tools: string[];
  feedback: 'UP' | 'DOWN' | null;
}

export interface AssistantHistoryPage {
  entries: AssistantHistoryEntry[];
  // createdAt (ISO) de la última pregunta de la página - se pasa como
  // `before` para pedir la siguiente. null = no hay más.
  nextCursor: string | null;
}

export interface AssistantHistoryStats {
  questionsToday: number;
  whatsappToday: number;
  withoutDataToday: number;
}

export interface ListHistoryParams {
  channel?: AssistantChannel;
  before?: Date;
  limit?: number;
}

/** Inicio del día de hoy en Argentina, expresado en UTC. */
export function startOfArgentinaDay(now: Date): Date {
  const local = new Date(now.getTime() + ARGENTINA_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - ARGENTINA_OFFSET_MS);
}

function toolNamesOf(toolCalls: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  // Web guarda {tool, data}, WhatsApp sólo {tool} - en los dos casos alcanza
  // con el nombre.
  const names = toolCalls
    .map((call) => (call && typeof call === 'object' && !Array.isArray(call) ? call['tool'] : null))
    .filter((name): name is string => typeof name === 'string');
  return [...new Set(names)];
}

function statusOf(reply: { intent: AssistantIntent | null; toolCalls: Prisma.JsonValue | null } | null): AssistantHistoryStatus {
  if (!reply) {
    return 'NO_REPLY';
  }
  if (reply.intent === AssistantIntent.AYUDA) {
    return 'HELP';
  }
  return toolNamesOf(reply.toolCalls).length > 0 ? 'ANSWERED_WITH_DATA' : 'ANSWERED_WITHOUT_DATA';
}

/**
 * Historial del asistente para Preferencias › Asistente (etapa 1 de
 * docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md): lo que
 * preguntó cada persona del tenant y qué contestó el asistente, por web y
 * por WhatsApp. A diferencia de AssistantConversationService (que siempre
 * filtra por el usuario de la sesión), esto cruza a TODOS los usuarios del
 * tenant - por eso el controller lo restringe a OWNER/ADMIN. RLS sigue
 * acotándolo al tenant.
 *
 * Una fila = una pregunta (role USER) + la respuesta que la siguió en la
 * misma conversación, si la hay. Se pagina por pregunta, no por respuesta,
 * para que un turno que falló también aparezca ("No respondió").
 */
@Injectable()
export class AssistantHistoryService {
  private readonly logger = new Logger(AssistantHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListHistoryParams = {}): Promise<AssistantHistoryPage> {
    const db = getTenantDb();
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    const questions = await db.assistantMessage.findMany({
      where: {
        role: AssistantMessageRole.USER,
        ...(params.channel ? { channel: params.channel } : {}),
        ...(params.before ? { createdAt: { lt: params.before } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: { conversation: { select: { userId: true } } },
    });
    const hasMore = questions.length > limit;
    const page = hasMore ? questions.slice(0, limit) : questions;
    if (page.length === 0) {
      return { entries: [], nextCursor: null };
    }

    // Todos los mensajes de esas conversaciones dentro del rango de la
    // página: la respuesta de cada pregunta es el mensaje que la sigue en
    // su conversación, si es del asistente.
    const oldest = page[page.length - 1].createdAt;
    const newest = page[0].createdAt;
    const conversationIds = [...new Set(page.map((q) => q.conversationId))];
    const nearby = await db.assistantMessage.findMany({
      where: {
        conversationId: { in: conversationIds },
        createdAt: { gte: oldest, lte: new Date(newest.getTime() + REPLY_WINDOW_MS) },
      },
      orderBy: { createdAt: 'asc' },
    });
    const byConversation = new Map<string, typeof nearby>();
    for (const message of nearby) {
      const list = byConversation.get(message.conversationId) ?? [];
      list.push(message);
      byConversation.set(message.conversationId, list);
    }

    const userIds = [...new Set(page.map((q) => q.conversation.userId))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, role: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const entries = page.map((question): AssistantHistoryEntry => {
      const thread = byConversation.get(question.conversationId) ?? [];
      const index = thread.findIndex((m) => m.id === question.id);
      const next = index >= 0 ? thread[index + 1] : undefined;
      const reply = next?.role === AssistantMessageRole.ASSISTANT ? next : null;
      const user = userById.get(question.conversation.userId);
      return {
        id: question.id,
        createdAt: question.createdAt,
        channel: question.channel,
        // Un usuario borrado no rompe la fila: se muestra igual, sin nombre.
        user: { id: question.conversation.userId, name: user?.name || user?.email || 'Usuario eliminado', role: user?.role ?? null },
        question: question.content,
        answer: reply?.content ?? null,
        status: statusOf(reply),
        tools: toolNamesOf(reply?.toolCalls ?? null).map((name) => ASSISTANT_TOOL_TITLES[name] ?? name),
        feedback: reply?.feedback ?? null,
      };
    });

    return { entries, nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null };
  }

  async statsToday(now = new Date()): Promise<AssistantHistoryStats> {
    const db = getTenantDb();
    const since = startOfArgentinaDay(now);
    const [questionsToday, whatsappToday, withoutDataToday] = await Promise.all([
      db.assistantMessage.count({ where: { role: AssistantMessageRole.USER, createdAt: { gte: since } } }),
      db.assistantMessage.count({
        where: { role: AssistantMessageRole.USER, channel: AssistantChannel.WHATSAPP, createdAt: { gte: since } },
      }),
      db.assistantMessage.count({
        where: {
          role: AssistantMessageRole.ASSISTANT,
          intent: AssistantIntent.DATOS,
          toolCalls: { equals: Prisma.DbNull },
          createdAt: { gte: since },
        },
      }),
    ]);
    return { questionsToday, whatsappToday, withoutDataToday };
  }

  /** Borra lo que tenga más de RETENTION_MONTHS, tenant por tenant (mismo
   * patrón que InventoryReplenishmentSchedulerService: list_tenant_ids() +
   * withTenantContext, un fallo no frena al resto). Las conversaciones que
   * quedan vacías y son igual de viejas se borran también. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeOldHistoryForAllTenants(now = new Date()): Promise<void> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);

    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    for (const { id: tenantId } of tenants) {
      try {
        const deleted = await withTenantContext(this.prisma, tenantId, async () => {
          const db = getTenantDb();
          const messages = await db.assistantMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
          await db.assistantConversation.deleteMany({ where: { createdAt: { lt: cutoff }, messages: { none: {} } } });
          return messages.count;
        });
        if (deleted > 0) {
          this.logger.log(`Tenant ${tenantId}: ${deleted} mensaje(s) del asistente de más de ${RETENTION_MONTHS} meses borrados`);
        }
      } catch (err) {
        this.logger.error(`Falló la limpieza del historial del asistente para el tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
  }
}
