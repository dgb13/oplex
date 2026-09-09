import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import { AssistantSettingsService } from './assistant-settings.service.js';

// Cuántos mensajes previos (usuario+asistente combinados) se le vuelven a
// dar de comer a Claude como contexto de la conversación - acota el costo
// de tokens de un hilo que crece sin límite (docs/plan-asistente-ia-conversacional.md,
// sección 8.2). Sólo se replaya el texto final de cada turno pasado, nunca
// los tool_use/tool_result intermedios de una vuelta ya cerrada - si una
// pregunta nueva necesita ese dato de nuevo, la herramienta se vuelve a
// llamar, no se asume que sigue vigente.
const HISTORY_MESSAGE_LIMIT = 20;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Fase 3 (docs/plan-asistente-ia-conversacional.md, sección 9) - historial
 * persistente. Un usuario tiene una única conversación "activa" (la más
 * reciente) que crece indefinidamente hasta que pide una nueva - no hay UI
 * todavía para elegir entre varias conversaciones viejas, sólo continuar la
 * activa o arrancar de cero. Todo scoped por tenantId (RLS) + userId
 * explícito (RLS por sí sola no alcanza acá: dos usuarios del MISMO tenant
 * no deben ver el historial de chat del otro).
 */
@Injectable()
export class AssistantConversationService {
  constructor(private readonly assistantSettingsService: AssistantSettingsService) {}

  async getOrCreateActive(user: AuthenticatedUser) {
    const db = getTenantDb();
    const existing = await db.assistantConversation.findFirst({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return existing;
    }
    return db.assistantConversation.create({ data: { tenantId: getTenantId(), userId: user.sub } });
  }

  async startNew(user: AuthenticatedUser) {
    return getTenantDb().assistantConversation.create({ data: { tenantId: getTenantId(), userId: user.sub } });
  }

  async listMessages(user: AuthenticatedUser) {
    const conversation = await this.getOrCreateActive(user);
    return getTenantDb().assistantMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Últimos HISTORY_MESSAGE_LIMIT mensajes de la conversación activa,
   * en el formato mínimo que necesita Anthropic.Messages.MessageParam -
   * no importa el `id`/`toolCalls`/`feedback` acá, sólo texto y rol. */
  async getRecentHistory(user: AuthenticatedUser): Promise<{ conversationId: string; history: HistoryMessage[] }> {
    const conversation = await this.getOrCreateActive(user);
    const messages = await getTenantDb().assistantMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_MESSAGE_LIMIT,
    });
    return {
      conversationId: conversation.id,
      history: messages.reverse().map((m) => ({ role: m.role === 'USER' ? 'user' : 'assistant', content: m.content })),
    };
  }

  // Rate limit por usuario, ventana deslizante simple sobre la propia
  // tabla de mensajes - sin infra nueva (sin Redis), mismo espíritu
  // pragmático que el circuit breaker de @plexo/ai-invoice-scan (cuenta
  // filas recientes en vez de un contador en memoria). Corta un loop
  // accidental (ej. un bug del frontend reintentando) o abuso,
  // independiente del cupo mensual por plan. Ventana/tope configurables
  // por el SuperAdmin (PlatformSettings), no fijos en código.
  async assertNotRateLimited(user: AuthenticatedUser): Promise<void> {
    const settings = await this.assistantSettingsService.getSettings();
    const since = new Date(Date.now() - settings.assistantRateLimitWindowMinutes * 60_000);
    const count = await getTenantDb().assistantMessage.count({
      where: { role: 'USER', createdAt: { gte: since }, conversation: { userId: user.sub } },
    });
    if (count >= settings.assistantRateLimitMaxMessages) {
      throw new ForbiddenException(`Demasiadas consultas seguidas - esperá unos minutos antes de volver a preguntar.`);
    }
  }

  appendMessage(conversationId: string, role: 'USER' | 'ASSISTANT', content: string, toolCalls?: unknown) {
    return getTenantDb().assistantMessage.create({
      data: { tenantId: getTenantId(), conversationId, role, content, toolCalls: toolCalls ?? undefined },
    });
  }

  async setFeedback(user: AuthenticatedUser, messageId: string, feedback: 'UP' | 'DOWN') {
    const db = getTenantDb();
    const message = await db.assistantMessage.findUnique({
      where: { id: messageId },
      include: { conversation: true },
    });
    if (!message) {
      throw new NotFoundException('Mensaje no encontrado');
    }
    // RLS ya impide leer un mensaje de otro tenant (el findUnique de arriba
    // directamente no lo devuelve) - este chequeo es la capa que falta,
    // dueño real del mensaje DENTRO del mismo tenant, mismo motivo que la
    // función de arriba.
    if (message.conversation.userId !== user.sub) {
      throw new ForbiddenException('No podés calificar un mensaje de otra persona');
    }
    if (message.role !== 'ASSISTANT') {
      throw new ForbiddenException('Sólo se puede calificar una respuesta del asistente');
    }
    return db.assistantMessage.update({ where: { id: messageId }, data: { feedback } });
  }
}
