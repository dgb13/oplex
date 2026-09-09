import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '@plexo/auth';
import { LongRunningTransaction } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';
import type { AuthenticatedUser } from '@plexo/types';
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
}
