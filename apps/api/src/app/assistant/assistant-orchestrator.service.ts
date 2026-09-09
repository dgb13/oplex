import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { AuthenticatedUser } from '@plexo/types';
import { ASSISTANT_ANTHROPIC_CLIENT } from './assistant-anthropic-client.token.js';
import type { HistoryMessage } from './assistant-conversation.service.js';
import { ASSISTANT_TOOLS, executeAssistantTool, labelForTool } from './assistant-tools.catalog.js';
import { AssistantToolsService } from './assistant-tools.service.js';
import type { AssistantStreamChunk } from './assistant-stream.types.js';

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

  /** Variante sin streaming, usada por el endpoint JSON de siempre
   * (`POST /assistant/message`) - simplemente drena chatStream() y
   * concatena el texto, sin exponerle el detalle de eventos al caller. */
  async chat(user: AuthenticatedUser, history: HistoryMessage[], userMessage: string): Promise<string> {
    let text = '';
    for await (const chunk of this.chatStream(user, history, userMessage)) {
      if (chunk.type === 'text') {
        text += chunk.text;
      }
    }
    return text.trim();
  }

  /** Streaming token a token (docs/plan-asistente-ia-conversacional.md,
   * sección 7) - usado por `POST /assistant/message/stream`. Emite un
   * evento `tool_start` liviano por cada herramienta invocada y va
   * emitiendo `text` a medida que Claude lo genera, incluida cualquier
   * vuelta que termine en tool_use (a diferencia de la vieja `chat()`
   * no-streaming, que descartaba ese texto intermedio): en la práctica,
   * con este system prompt tool-forced, Claude casi nunca antepone texto
   * a un tool_use, así que mostrarlo en vivo es una mejora, no una
   * regresión de UX. */
  async *chatStream(
    user: AuthenticatedUser,
    history: HistoryMessage[],
    userMessage: string,
  ): AsyncGenerator<AssistantStreamChunk> {
    // El historial persistido (Fase 3) sólo tiene el texto final de cada
    // turno pasado, nunca los tool_use/tool_result intermedios de una
    // vuelta ya cerrada - si esta pregunta nueva necesita ese dato de
    // nuevo, la herramienta se vuelve a llamar.
    const messages: Anthropic.Messages.MessageParam[] = [
      ...history.map((h): Anthropic.Messages.MessageParam => ({ role: h.role, content: h.content })),
      { role: 'user', content: userMessage },
    ];

    for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
      let stopReason: string | null = null;
      const toolUses: { id: string; name: string; inputJson: string }[] = [];
      let openToolUse: { id: string; name: string; inputJson: string } | null = null;

      try {
        const stream = this.callClaudeStream(messages);
        for await (const event of stream) {
          if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
            openToolUse = { id: event.content_block.id, name: event.content_block.name, inputJson: '' };
            toolUses.push(openToolUse);
            yield { type: 'tool_start', tool: openToolUse.name, label: labelForTool(openToolUse.name) };
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              yield { type: 'text', text: event.delta.text };
            } else if (event.delta.type === 'input_json_delta' && openToolUse) {
              openToolUse.inputJson += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            openToolUse = null;
          } else if (event.type === 'message_delta') {
            stopReason = event.delta.stop_reason ?? stopReason;
          }
        }
      } catch (err) {
        this.logger.error('Falló la llamada a Claude', err instanceof Error ? err.stack : err);
        throw new ServiceUnavailableException('El asistente no está disponible en este momento. Probá de nuevo en un rato.');
      }

      if (stopReason !== 'tool_use') {
        return;
      }

      // Reconstruido a mano a partir de los eventos ya vistos arriba, en
      // vez de `stream.finalMessage()` (la reconstrucción automática del
      // SDK): encontrado en vivo contra Claude real que claude-sonnet-5
      // devuelve bloques `thinking` en las vueltas de tool use, y esta
      // versión del SDK (0.35.0, anterior a que ese tipo de bloque
      // existiera - su propio ContentBlock sólo conoce TextBlock|ToolUseBlock)
      // los arma mal en finalMessage(), produciendo un `thinking` incompleto
      // que la API rechaza con 400 apenas se lo reenvía en el turno
      // siguiente. Sólo hace falta tool_use acá (el texto de esta vuelta ya
      // se emitió arriba y de todos modos nunca se re-envía).
      messages.push({
        role: 'assistant',
        content: toolUses.map(
          (t): Anthropic.Messages.ToolUseBlockParam => ({
            type: 'tool_use',
            id: t.id,
            name: t.name,
            input: t.inputJson ? JSON.parse(t.inputJson) : {},
          }),
        ),
      });
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const t of toolUses) {
        const input = t.inputJson ? JSON.parse(t.inputJson) : {};
        const result = await executeAssistantTool(this.assistantToolsService, user, t.name, input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: t.id,
          content: result.content,
          is_error: result.isError,
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    this.logger.warn(`Tenant ${user.tenantId}: tope de ${MAX_TOOL_CALL_ROUNDS} vueltas de tool use alcanzado sin respuesta final`);
    yield { type: 'text', text: 'No pude terminar de procesar tu consulta - probá reformularla de forma más simple.' };
  }

  private callClaudeStream(messages: Anthropic.Messages.MessageParam[]) {
    return this.anthropic.messages.stream({
      model: process.env.ANTHROPIC_ASSISTANT_MODEL ?? DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(),
      tools: ASSISTANT_TOOLS,
      messages,
    });
  }
}
