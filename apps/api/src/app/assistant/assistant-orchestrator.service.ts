import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { AuthenticatedUser } from '@plexo/types';
import { ASSISTANT_ANTHROPIC_CLIENT } from './assistant-anthropic-client.token.js';
import type { HistoryMessage } from './assistant-conversation.service.js';
import { ASSISTANT_TOOLS, executeAssistantTool } from './assistant-tools.catalog.js';
import { AssistantToolsService } from './assistant-tools.service.js';

const DEFAULT_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;

// Tope duro de vueltas del loop de tool use por turno (docs/plan-asistente-ia-conversacional.md,
// sección 3.5 y 8.2) - acota el costo/latencia máximo de una sola pregunta
// mal encaminada, sin depender de que el modelo decida parar solo.
const MAX_TOOL_CALL_ROUNDS = 4;

// Función, no constante: sin esto Claude no tiene forma de saber qué es
// "este mes"/"este año" en preguntas relativas - encontrado en vivo
// (probando "qué se vendió más este año" contestaba desde el 1/1/2025,
// asumiendo un "hoy" propio en vez del real).
function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Sos el asistente de IA de Oplex, un ERP para pymes argentinas. Hoy es ${today}. Respondés preguntas del usuario sobre SUS PROPIOS datos de negocio (ventas, cuentas a cobrar, caja) usando exclusivamente las herramientas disponibles - nunca inventes ni calcules un número que no haya salido de una herramienta, citalo tal cual te lo devolvió. Para preguntas con fechas relativas ("este mes", "este año", "últimos 3 meses") calculá el rango vos mismo a partir de la fecha de hoy de arriba, nunca asumas otro año. Si una herramienta te devuelve un error de permiso, explicáselo al usuario en una frase, sin tecnicismos. Respondé siempre en español rioplatense, corto y directo - esto no es un chat de charla libre, es una consulta de datos de negocio.`;
}

/**
 * Orquestador del asistente - Fase 1
 * (docs/plan-asistente-ia-conversacional.md, sección 5): recibe un mensaje
 * de un turno único (todavía sin historial persistente, ver sección 9 del
 * plan), llama a Claude con tool use, ejecuta las herramientas que pida
 * contra AssistantToolsService (que ya valida tenant/rol - este service
 * nunca toca datos directo) y devuelve la respuesta final en texto.
 */
@Injectable()
export class AssistantOrchestratorService {
  private readonly logger = new Logger(AssistantOrchestratorService.name);

  constructor(
    @Inject(ASSISTANT_ANTHROPIC_CLIENT) private readonly anthropic: Anthropic,
    private readonly assistantToolsService: AssistantToolsService,
  ) {}

  async chat(user: AuthenticatedUser, history: HistoryMessage[], userMessage: string): Promise<string> {
    // El historial persistido (Fase 3) sólo tiene el texto final de cada
    // turno pasado, nunca los tool_use/tool_result intermedios de una
    // vuelta ya cerrada - si esta pregunta nueva necesita ese dato de
    // nuevo, la herramienta se vuelve a llamar.
    const messages: Anthropic.Messages.MessageParam[] = [
      ...history.map((h): Anthropic.Messages.MessageParam => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage },
    ];

    for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
      const response = await this.callClaude(messages);

      if (response.stop_reason !== 'tool_use') {
        return this.extractText(response);
      }

      messages.push({ role: 'assistant', content: response.content });
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') {
          continue;
        }
        const result = await executeAssistantTool(this.assistantToolsService, user, block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError,
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    this.logger.warn(`Tenant ${user.tenantId}: tope de ${MAX_TOOL_CALL_ROUNDS} vueltas de tool use alcanzado sin respuesta final`);
    return 'No pude terminar de procesar tu consulta - probá reformularla de forma más simple.';
  }

  private async callClaude(messages: Anthropic.Messages.MessageParam[]): Promise<Anthropic.Messages.Message> {
    try {
      return await this.anthropic.messages.create({
        model: process.env.ANTHROPIC_ASSISTANT_MODEL ?? DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(),
        tools: ASSISTANT_TOOLS,
        messages,
      });
    } catch (err) {
      this.logger.error('Falló la llamada a Claude', err instanceof Error ? err.stack : err);
      throw new ServiceUnavailableException('El asistente no está disponible en este momento. Probá de nuevo en un rato.');
    }
  }

  private extractText(response: Anthropic.Messages.Message): string {
    return response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }
}
