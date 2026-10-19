import { Body, Controller, ForbiddenException, Get, Logger, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { CurrentUser } from '@plexo/auth';
import { AssistantChannel, AssistantIntent, LongRunningTransaction } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyReply } from 'fastify';
import type { OutgoingHttpHeaders } from 'node:http';
import { SendAssistantMessageDto } from './dto/send-assistant-message.dto.js';
import { SetMessageFeedbackDto } from './dto/set-message-feedback.dto.js';
import {
  AssistantAccessService,
  blockedTopicFor,
  blockedTopicReply,
  WEB_DISABLED_MESSAGE,
  type AssistantAccess,
} from './assistant-access.service.js';
import { AssistantActionsService, type ActionReply, type AssistantActionCard } from './assistant-actions.service.js';
import { AssistantConversationService } from './assistant-conversation.service.js';
import { AssistantHelpService } from './assistant-help.service.js';
import { AssistantIntentRouterService } from './assistant-intent-router.service.js';
import { AssistantOrchestratorService } from './assistant-orchestrator.service.js';
import { AssistantSettingsService } from './assistant-settings.service.js';
import type { AssistantStreamChunk } from './assistant-stream.types.js';

// Hasta 4 vueltas de tool use (MAX_TOOL_CALL_ROUNDS en el orquestador),
// cada una una llamada real a Claude - sin esto, TenantContextInterceptor
// corta la transacción del request a los 5s de default aunque Claude siga
// respondiendo. Mismo bug/fix ya encontrado en vivo para
// POST /purchase-invoices/ai-scan/extract (ver PROGRESS.md).
const ASSISTANT_MESSAGE_TIMEOUT_MS = 60_000;

// Sin @Public(): todas las rutas exigen el JwtAuthGuard global, igual que
// el resto de la API - no hay ninguna razón para que sean alcanzables sin
// sesión. Sin @Roles/@RequireModuleAccess acá: cualquier usuario autenticado
// puede preguntarle al asistente (el permiso real de datos se valida
// DENTRO de cada herramienta, ver AssistantToolsService).
@Controller('assistant')
export class AssistantController {
  private readonly logger = new Logger(AssistantController.name);

  constructor(
    private readonly assistantSettingsService: AssistantSettingsService,
    private readonly assistantConversationService: AssistantConversationService,
    private readonly assistantIntentRouterService: AssistantIntentRouterService,
    private readonly assistantHelpService: AssistantHelpService,
    private readonly assistantOrchestratorService: AssistantOrchestratorService,
    private readonly subscriptionService: SubscriptionService,
    private readonly assistantAccessService: AssistantAccessService,
    private readonly assistantActionsService: AssistantActionsService,
  ) {}

  // `webEnabled`: el widget se oculta si la empresa apagó el asistente en la
  // web (Preferencias › Asistente). El POST igual lo vuelve a chequear.
  @Get('settings')
  async getSettings() {
    const [settings, config] = await Promise.all([
      this.assistantSettingsService.getSettings(),
      this.assistantAccessService.getConfig(),
    ]);
    return { ...settings, webEnabled: config.webEnabled };
  }

  /** Canal web prendido + permisos del turno, ANTES de gastar en Claude. */
  private async resolveWebAccess(user: AuthenticatedUser): Promise<AssistantAccess> {
    const access = await this.assistantAccessService.resolve(user);
    if (!access.webEnabled) {
      throw new ForbiddenException(WEB_DISABLED_MESSAGE);
    }
    return access;
  }

  // Cupo mensual restante - el widget lo pinta como una línea fina bajo el
  // header (ver AssistantWidget.tsx), mismo dato que ya usa el semáforo de
  // Carga de comprobantes IA (SubscriptionService.getAssistantUsage() nunca
  // lanza, a diferencia de assertCanUseAssistant()).
  @Get('usage')
  getUsage() {
    return this.subscriptionService.getAssistantUsage();
  }

  // Fase 3 - el widget carga esto al montar para no arrancar en blanco
  // cada vez que se abre la página (docs/planesdemodulos/plan-asistente-ia-conversacional.md,
  // sección 9).
  @Get('conversation')
  async getConversation(@CurrentUser() user: AuthenticatedUser) {
    const messages = await this.assistantConversationService.listMessages(user);
    // Las tarjetas de acciones se guardaron con el estado de ese momento -
    // se reemplazan por el actual (una "esperando" pudo confirmarse o vencer).
    const cardIds = messages.flatMap((m) => actionCardsOf(m.toolCalls).map((c) => c.id));
    const current = await this.assistantActionsService.currentCards(cardIds);
    return {
      messages: messages.map((m) =>
        Array.isArray(m.toolCalls) && cardIds.length
          ? {
              ...m,
              toolCalls: m.toolCalls.map((call) => {
                const card = actionCardsOf([call])[0];
                return card && current.has(card.id) ? { ...(call as object), data: current.get(card.id) } : call;
              }),
            }
          : m,
      ),
    };
  }

  // Botones de la tarjeta de una acción en el widget. La respuesta se guarda
  // en la conversación como un mensaje más del asistente.
  @Post('actions/:id/confirm')
  async confirmAction(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.persistActionReply(user, await this.assistantActionsService.confirm(user, id));
  }

  @Post('actions/:id/cancel')
  async cancelAction(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.persistActionReply(user, await this.assistantActionsService.cancel(user, id));
  }

  // Desde el Historial (Dueño/Admin o quien la pidió - lo valida el servicio).
  @Post('actions/:id/undo')
  undoAction(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistantActionsService.undo(user, id);
  }

  // Nueva factura (/invoicing?asistente=<id>) lee de acá lo que preparó el
  // asistente. Emitir la factura sigue siendo el POST /sales de siempre.
  @Get('actions/:id/invoice-draft')
  getInvoiceDraft(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assistantActionsService.getInvoiceDraft(user, id);
  }

  private async persistActionReply(user: AuthenticatedUser, result: ActionReply) {
    const conversation = await this.assistantConversationService.getOrCreateActive(user);
    const saved = await this.assistantConversationService.appendMessage(
      conversation.id,
      AssistantChannel.WEB,
      'ASSISTANT',
      result.reply,
      [{ tool: 'confirmar_accion', data: result.card }],
      AssistantIntent.DATOS,
    );
    return { reply: result.reply, card: result.card, messageId: saved.id };
  }

  // "Nueva conversación" a mano - arranca un hilo aparte, el anterior
  // queda en la base pero deja de ser "el activo" (getOrCreateActive toma
  // siempre el más reciente).
  @Post('conversation/new')
  async startNewConversation(@CurrentUser() user: AuthenticatedUser) {
    await this.assistantConversationService.startNew(user);
    return { messages: [] };
  }

  @Patch('messages/:id/feedback')
  setMessageFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetMessageFeedbackDto,
  ) {
    return this.assistantConversationService.setFeedback(user, id, dto.feedback);
  }

  // Fase 2 suma la detección automática de intención (Capacidad 1 vs. 2,
  // sección 9 del plan) - el usuario nunca elige un "modo" a mano. Fase 3
  // suma historial persistente (últimos N mensajes de la conversación
  // activa, ver AssistantConversationService) + cupo mensual por plan +
  // rate limit por usuario, ambos gateados ANTES de gastar en Claude.
  @LongRunningTransaction(ASSISTANT_MESSAGE_TIMEOUT_MS)
  @Post('message')
  async sendMessage(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendAssistantMessageDto) {
    await this.subscriptionService.assertCanUseAssistant();
    const access = await this.resolveWebAccess(user);
    await this.assistantConversationService.assertNotRateLimited(user);

    const { conversationId, history } = await this.assistantConversationService.getRecentHistory(user);
    const question = await this.assistantConversationService.appendMessage(conversationId, AssistantChannel.WEB, 'USER', dto.message);

    // "SÍ"/"NO" suelto con una acción esperando: se resuelve sin la IA.
    const short = await this.assistantActionsService.handleShortReply(user, dto.message);
    if (short) {
      const saved = await this.assistantConversationService.appendMessage(
        conversationId,
        AssistantChannel.WEB,
        'ASSISTANT',
        short.reply,
        [{ tool: 'confirmar_accion', data: short.card }],
        AssistantIntent.DATOS,
      );
      return { reply: short.reply, messageId: saved.id };
    }

    const { intent, topic } = await this.assistantIntentRouterService.classify(dto.message);
    const blocked = blockedTopicFor(access, { intent, topic });
    let reply: string;
    let toolCalls: Array<{ tool: string }> | undefined;
    if (blocked) {
      reply = blockedTopicReply(blocked);
      await this.assistantConversationService.markBlocked(question.id, blocked);
    } else if (intent === 'ayuda') {
      reply = await this.assistantHelpService.answer(history, dto.message);
    } else {
      const result = await this.assistantOrchestratorService.chat(user, access, history, dto.message, {
        conversationId,
        questionMessageId: question.id,
        channel: AssistantChannel.WEB,
      });
      reply = result.text;
      toolCalls = result.toolNames.length ? result.toolNames.map((tool) => ({ tool })) : undefined;
    }

    const saved = await this.assistantConversationService.appendMessage(
      conversationId,
      AssistantChannel.WEB,
      'ASSISTANT',
      reply,
      toolCalls,
      intent === 'ayuda' ? AssistantIntent.AYUDA : AssistantIntent.DATOS,
      blocked ?? undefined,
    );
    return { reply, messageId: saved.id };
  }

  // Fase 3.5 - misma lógica que sendMessage() de arriba (cupo/rate limit
  // primero, esos SIGUEN pudiendo devolver un 403/JSON normal porque
  // corren antes de escribir cualquier header de streaming), pero la
  // respuesta de Claude se reenvía como Server-Sent Events a medida que
  // llega (docs/planesdemodulos/plan-asistente-ia-conversacional.md, sección 7: "streaming
  // token a token" + indicador liviano de qué herramienta está corriendo).
  // @Res({passthrough:false}) porque Nest no tiene una forma nativa de
  // devolver SSE sobre un POST sin asumir el shape de @Sse() (pensado para
  // GET/EventSource, que no sirve acá: el auth va por header Authorization,
  // no por cookie, y EventSource del browser no manda headers custom) - el
  // mismo patrón @Res({passthrough:false}) ya se usa en
  // oauth.controller.ts/mercadopago.controller.ts para escribir la
  // respuesta a mano.
  @LongRunningTransaction(ASSISTANT_MESSAGE_TIMEOUT_MS)
  @Post('message/stream')
  async sendMessageStream(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendAssistantMessageDto,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    await this.subscriptionService.assertCanUseAssistant();
    const access = await this.resolveWebAccess(user);
    await this.assistantConversationService.assertNotRateLimited(user);

    const { conversationId, history } = await this.assistantConversationService.getRecentHistory(user);
    const question = await this.assistantConversationService.appendMessage(conversationId, AssistantChannel.WEB, 'USER', dto.message);
    // "SÍ"/"NO" suelto con una acción esperando: se resuelve sin la IA (y sin
    // clasificar), pero viaja por el mismo stream que cualquier respuesta.
    const short = await this.assistantActionsService.handleShortReply(user, dto.message);
    const { intent, topic } = short
      ? { intent: 'accion' as const, topic: 'otro' as const }
      : await this.assistantIntentRouterService.classify(dto.message);
    const blocked = short ? null : blockedTopicFor(access, { intent, topic });
    if (blocked) {
      await this.assistantConversationService.markBlocked(question.id, blocked);
    }

    // hijack() le avisa a Fastify que esta respuesta se maneja 100% a mano
    // de acá en adelante - sin esto, Fastify no sabe que `reply.raw` ya fue
    // escrito directamente (nunca se llamó a `reply.send()`) y termina la
    // conexión de forma abrupta apenas el handler resuelve, aunque
    // `reply.raw.end()` ya se haya llamado limpiamente: encontrado en vivo
    // contra Claude real - el mensaje quedaba bien guardado en la base
    // (el streaming en sí funcionaba) pero el browser igual veía la
    // request como fallida (error de red al leer el stream), sin ningún
    // log del lado del servidor porque Fastify no considera eso un error
    // de la aplicación.
    //
    // `reply.getHeaders()` ANTES de escribir nada: @fastify/cors corre en
    // un hook `onRequest` (antes de que este método arranque a ejecutar)
    // que deja `Access-Control-Allow-Origin`/`Vary` ya bufferizados en
    // `reply` - sin este merge, `writeHead()` de abajo los pisa por
    // completo y la respuesta real (200 con el stream) sale sin headers
    // de CORS. Encontrado en vivo: el preflight OPTIONS salía perfecto
    // (ese lo maneja el propio plugin de CORS, ajeno al hijack), pero el
    // POST real fallaba en el browser con "Failed to fetch" - un error de
    // red genérico sin ningún detalle server-side porque el request se
    // procesó 100% bien, sólo que el browser bloqueó la respuesta por
    // CORS antes de dejarle leer nada a este código.
    const corsHeaders = reply.getHeaders() as OutgoingHttpHeaders;
    reply.hijack();
    reply.raw.writeHead(200, {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    let fullText = '';
    // Se persiste junto con el mensaje (columna `toolCalls`, ya existía sin
    // usarse) para que el mini-gráfico/tabla siga apareciendo al recargar
    // la página, no sólo mientras se recibe el stream en vivo.
    const toolCallsForPersist: Array<{ tool: string; data: unknown }> = [];
    try {
      const chunks = short
        ? shortReplyChunks(short)
        : blocked
          ? singleTextChunk(blockedTopicReply(blocked))
          : intent === 'ayuda'
            ? this.assistantHelpService.answerStream(history, dto.message)
            : this.assistantOrchestratorService.chatStream(user, access, history, dto.message, {
                conversationId,
                questionMessageId: question.id,
                channel: AssistantChannel.WEB,
              });
      for await (const chunk of chunks) {
        if (chunk.type === 'text') {
          fullText += chunk.text;
        } else if (chunk.type === 'tool_result') {
          toolCallsForPersist.push({ tool: chunk.tool, data: chunk.data });
        }
        send(chunk.type, chunk);
      }
      const saved = await this.assistantConversationService.appendMessage(
        conversationId,
        AssistantChannel.WEB,
        'ASSISTANT',
        fullText.trim(),
        toolCallsForPersist.length ? toolCallsForPersist : undefined,
        intent === 'ayuda' ? AssistantIntent.AYUDA : AssistantIntent.DATOS,
        blocked ?? undefined,
      );
      send('done', { type: 'done', messageId: saved.id });
    } catch (err) {
      // Los headers ya salieron con 200 - no hay forma de devolver un
      // status de error acá, por eso el mensaje viaja como evento `error`
      // dentro del stream (el widget lo trata como AssistantMessageFeedback
      // de tipo error, igual que hoy trata un catch de axios).
      this.logger.error('Falló el streaming del asistente', err instanceof Error ? err.stack : err);
      send('error', { type: 'error', message: 'El asistente no está disponible en este momento. Probá de nuevo en un rato.' });
    } finally {
      reply.raw.end();
    }
  }
}

// La respuesta fija de un tema bloqueado viaja por el mismo stream que una
// respuesta de Claude, así el widget no necesita un caso aparte.
async function* singleTextChunk(text: string): AsyncGenerator<AssistantStreamChunk> {
  yield { type: 'text', text };
}

async function* shortReplyChunks(result: ActionReply): AsyncGenerator<AssistantStreamChunk> {
  yield { type: 'tool_result', tool: 'confirmar_accion', data: result.card };
  yield { type: 'text', text: result.reply };
}

function actionCardsOf(toolCalls: unknown): AssistantActionCard[] {
  if (!Array.isArray(toolCalls)) {
    return [];
  }
  return toolCalls
    .map((call) => (call && typeof call === 'object' ? (call as { data?: unknown }).data : null))
    .filter(
      (data): data is AssistantActionCard =>
        !!data && typeof data === 'object' && (data as { type?: unknown }).type === 'assistant_action',
    );
}
