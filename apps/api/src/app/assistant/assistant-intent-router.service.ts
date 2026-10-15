import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { AiEventsService } from '../ai-events/ai-events.service.js';
import { ASSISTANT_HELP_DEFAULT_MODEL } from './assistant-help.service.js';
import { ASSISTANT_ANTHROPIC_CLIENT } from './assistant-anthropic-client.token.js';

const MAX_TOKENS = 50;

export type AssistantIntent = 'ayuda' | 'datos';

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: 'classify_intent',
  description:
    'Clasifica la pregunta del usuario de un ERP: "ayuda" si es sobre CÓMO USAR el sistema (dónde está algo, cómo se hace un paso), "datos" si es sobre SUS PROPIOS datos de negocio (ventas, clientes, caja, cualquier número real del tenant).',
  input_schema: {
    type: 'object',
    properties: { intent: { type: 'string', enum: ['ayuda', 'datos'] } },
    required: ['intent'],
  },
};

/**
 * Detección automática de intención (docs/planesdemodulos/plan-asistente-ia-conversacional.md,
 * sección 9, Fase 2) - un tercer llamado a Claude, barato y forzado a tool
 * use (mismo patrón que EXTRACT_INVOICE_TOOL en @plexo/ai-invoice-scan),
 * antes de decidir si la pregunta va a AssistantHelpService (Haiku, sin
 * datos) o AssistantOrchestratorService (Sonnet, con tools). Evita
 * obligar al usuario a elegir un modo en el widget.
 */
@Injectable()
export class AssistantIntentRouterService {
  private readonly logger = new Logger(AssistantIntentRouterService.name);

  constructor(
    @Inject(ASSISTANT_ANTHROPIC_CLIENT) private readonly anthropic: Anthropic,
    @Optional() private readonly aiEvents?: AiEventsService,
  ) {}

  async classify(message: string): Promise<AssistantIntent> {
    try {
      const response = await this.anthropic.messages.create({
        model: process.env.ANTHROPIC_ASSISTANT_HELP_MODEL || ASSISTANT_HELP_DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: 'tool', name: CLASSIFY_TOOL.name },
        messages: [{ role: 'user', content: message }],
      });
      const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      );
      const intent = (toolUse?.input as { intent?: string } | undefined)?.intent;
      // Default a "datos" ante cualquier resultado inesperado (el modelo no
      // devolvió el enum esperado) - AssistantOrchestratorService ya sabe
      // responder con naturalidad "no tengo esa herramienta" si la
      // pregunta en realidad era de ayuda, mientras que lo inverso
      // (mandar una pregunta de datos reales al servicio de ayuda) la deja
      // sin poder contestar nada útil.
      return intent === 'ayuda' ? 'ayuda' : 'datos';
    } catch (err) {
      this.logger.error('Falló la clasificación de intención', err instanceof Error ? err.stack : err);
      await this.aiEvents?.record('ASSISTANT_HELP', false, err instanceof Error ? err.message : String(err));
      throw new ServiceUnavailableException('El asistente no está disponible en este momento. Probá de nuevo en un rato.');
    }
  }
}
