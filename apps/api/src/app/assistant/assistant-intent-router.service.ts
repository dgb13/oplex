import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { AiEventsService } from '../ai-events/ai-events.service.js';
import { ASSISTANT_HELP_DEFAULT_MODEL } from './assistant-help.service.js';
import { ASSISTANT_ANTHROPIC_CLIENT } from './assistant-anthropic-client.token.js';

const MAX_TOKENS = 80;

// 'accion' (etapa 3): pide que el asistente HAGA algo (agendar, cargar un
// cliente...). Va al orquestador, igual que 'datos'; se separa sólo para no
// mandarlo a la ayuda ni bloquearlo por tema.
export type AssistantIntent = 'ayuda' | 'datos' | 'accion';

// Tema de una pregunta de datos, para negarla de entrada si la persona no
// tiene ese tema (AssistantAccessService). 'otro' = no encaja en ninguno:
// pasa al orquestador, que igual sólo recibe las herramientas permitidas.
const DATA_TOPICS = ['ventas', 'deudas', 'caja', 'stock', 'costos', 'compras', 'otro'] as const;
export type AssistantDataTopic = (typeof DATA_TOPICS)[number];

export interface AssistantClassification {
  intent: AssistantIntent;
  topic: AssistantDataTopic;
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: 'classify_intent',
  description:
    'Clasifica el mensaje del usuario de un ERP: "ayuda" si pregunta CÓMO USAR el sistema (dónde está algo, cómo se hace un paso), "datos" si pregunta por SUS PROPIOS datos de negocio (ventas, clientes, caja, cualquier número real del tenant), "accion" si le pide al asistente que HAGA algo por él (recordame, agendá, cargá un cliente, armá, mandá).',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['ayuda', 'datos', 'accion'] },
      topic: {
        type: 'string',
        enum: [...DATA_TOPICS],
        description:
          'Sólo para intent "datos" (para "ayuda" y "accion", "otro"): ventas (facturado, ventas por artículo o período), deudas (lo que deben los clientes, vencidas), caja (dinero en caja), stock (existencias, mínimos, precio de venta), costos (costo de compra, margen, remarca), compras (proveedores, deuda con proveedores, órdenes de compra), otro (ninguno de esos).',
      },
    },
    required: ['intent', 'topic'],
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

  async classify(message: string): Promise<AssistantClassification> {
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
      const input = toolUse?.input as { intent?: string; topic?: string } | undefined;
      const intent = input?.intent;
      const topic = DATA_TOPICS.find((t) => t === input?.topic) ?? 'otro';
      // Default a "datos" ante cualquier resultado inesperado (el modelo no
      // devolvió el enum esperado) - AssistantOrchestratorService ya sabe
      // responder con naturalidad "no tengo esa herramienta" si la
      // pregunta en realidad era de ayuda, mientras que lo inverso
      // (mandar una pregunta de datos reales al servicio de ayuda) la deja
      // sin poder contestar nada útil.
      // Mismo criterio para el tema: ante cualquier valor raro, 'otro' (no
      // bloquea; el filtro de herramientas sigue protegiendo los datos).
      if (intent === 'ayuda' || intent === 'accion') {
        return { intent, topic: 'otro' };
      }
      return { intent: 'datos', topic };
    } catch (err) {
      this.logger.error('Falló la clasificación de intención', err instanceof Error ? err.stack : err);
      await this.aiEvents?.record('ASSISTANT_HELP', false, err instanceof Error ? err.message : String(err));
      throw new ServiceUnavailableException('El asistente no está disponible en este momento. Probá de nuevo en un rato.');
    }
  }
}
