import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { ASSISTANT_ANTHROPIC_CLIENT } from './assistant-anthropic-client.token.js';
import type { HistoryMessage } from './assistant-conversation.service.js';

const DEFAULT_HELP_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 512;

// Repo-root relative, no relativo a este archivo - mismo supuesto que
// `.env`/las migraciones de Prisma, válidos porque `nx serve`/`nx build`
// siempre corren con cwd = raíz del workspace en este proyecto.
const HELP_DOCS_DIR = join(process.cwd(), 'docs', 'ayuda');

/** Contexto fijo, no RAG (docs/plan-asistente-ia-conversacional.md, sección 4):
 * el corpus completo entra cómodo en un system prompt cacheado, así que no
 * hace falta vectorizar/recuperar chunks para la cantidad de artículos que
 * hay hoy. Se lee una sola vez al arrancar el proceso - un artículo nuevo
 * requiere reiniciar la API para verse reflejado, aceptable para v1. */
function loadHelpCorpus(): string {
  const files = readdirSync(HELP_DOCS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();
  return files.map((f) => readFileSync(join(HELP_DOCS_DIR, f), 'utf-8')).join('\n\n---\n\n');
}

/**
 * Capacidad 1 - Chat de ayuda (docs/plan-asistente-ia-conversacional.md,
 * sección 4): Q&A sobre CÓMO USAR el sistema, nunca sobre datos de negocio
 * del tenant (para eso está AssistantOrchestratorService). Modelo Haiku
 * 4.5 a propósito - tarea barata de lectura de texto estático, sin tool
 * use. El corpus va como bloque de `system` separado con
 * `cache_control: ephemeral` para que Anthropic lo cachee entre preguntas
 * (no cambia de una llamada a otra).
 */
@Injectable()
export class AssistantHelpService {
  private readonly logger = new Logger(AssistantHelpService.name);
  private readonly corpus = loadHelpCorpus();

  constructor(@Inject(ASSISTANT_ANTHROPIC_CLIENT) private readonly anthropic: Anthropic) {}

  async answer(history: HistoryMessage[], question: string): Promise<string> {
    try {
      const response = await this.anthropic.messages.create({
        model: process.env.ANTHROPIC_ASSISTANT_HELP_MODEL ?? DEFAULT_HELP_MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: 'text',
            text: `Sos el asistente de ayuda de Oplex, un ERP para pymes argentinas. Respondés preguntas sobre CÓMO USAR el sistema, basándote EXCLUSIVAMENTE en la documentación de abajo - si la pregunta no está cubierta ahí, decilo honestamente en vez de inventar un flujo que no conocés, y sugerí de qué sección del menú podría tratarse. Respondé en español rioplatense, corto y con pasos concretos cuando aplique (ej. "Ventas → Facturación → Nueva factura"). No respondas preguntas sobre los datos de negocio del propio tenant (ventas, caja, deudas) - para eso existe otra herramienta, no vos.\n\n${this.corpus}`,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [...history.map((h): Anthropic.Messages.MessageParam => ({ role: h.role, content: h.content })), { role: 'user', content: question }],
      });
      return response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
    } catch (err) {
      this.logger.error('Falló la llamada a Claude (ayuda)', err instanceof Error ? err.stack : err);
      throw new ServiceUnavailableException('El asistente no está disponible en este momento. Probá de nuevo en un rato.');
    }
  }
}
