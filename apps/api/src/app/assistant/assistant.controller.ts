import { Body, Controller, Get, Logger, Param, Patch, Post, Res } from '@nestjs/common';
import { CurrentUser } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyReply } from 'fastify';
import { SendAssistantMessageDto } from './dto/send-assistant-message.dto.js';
import { SetMessageFeedbackDto } from './dto/set-message-feedback.dto.js';
import { AssistantConversationService } from './assistant-conversation.service.js';
import { AssistantHelpService } from './assistant-help.service.js';
import { AssistantIntentRouterService } from './assistant-intent-router.service.js';
import { AssistantOrchestratorService } from './assistant-orchestrator.service.js';
import { AssistantSettingsService } from './assistant-settings.service.js';

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
  ) {}

  @Get('settings')
  getSettings() {
    return this.assistantSettingsService.getSettings();
  }

  // Fase 3 - el widget carga esto al montar para no arrancar en blanco
  // cada vez que se abre la página (docs/plan-asistente-ia-conversacional.md,
  // sección 9).
  @Get('conversation')
  async getConversation(@CurrentUser() user: AuthenticatedUser) {
    const messages = await this.assistantConversationService.listMessages(user);
    return { messages };
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
    await this.assistantConversationService.assertNotRateLimited(user);

    const { conversationId, history } = await this.assistantConversationService.getRecentHistory(user);
    await this.assistantConversationService.appendMessage(conversationId, 'USER', dto.message);

    const intent = await this.assistantIntentRouterService.classify(dto.message);
    const reply =
      intent === 'ayuda'
        ? await this.assistantHelpService.answer(history, dto.message)
        : await this.assistantOrchestratorService.chat(user, history, dto.message);

    const saved = await this.assistantConversationService.appendMessage(conversationId, 'ASSISTANT', reply);
    return { reply, messageId: saved.id };
  }

  // Fase 3.5 - misma lógica que sendMessage() de arriba (cupo/rate limit
  // primero, esos SIGUEN pudiendo devolver un 403/JSON normal porque
  // corren antes de escribir cualquier header de streaming), pero la
  // respuesta de Claude se reenvía como Server-Sent Events a medida que
  // llega (docs/plan-asistente-ia-conversacional.md, sección 7: "streaming
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
    await this.assistantConversationService.assertNotRateLimited(user);

    const { conversationId, history } = await this.assistantConversationService.getRecentHistory(user);
    await this.assistantConversationService.appendMessage(conversationId, 'USER', dto.message);
    const intent = await this.assistantIntentRouterService.classify(dto.message);

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
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    let fullText = '';
    try {
      const chunks =
        intent === 'ayuda'
          ? this.assistantHelpService.answerStream(history, dto.message)
          : this.assistantOrchestratorService.chatStream(user, history, dto.message);
      for await (const chunk of chunks) {
        if (chunk.type === 'text') {
          fullText += chunk.text;
        }
        send(chunk.type, chunk);
      }
      const saved = await this.assistantConversationService.appendMessage(conversationId, 'ASSISTANT', fullText.trim());
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
