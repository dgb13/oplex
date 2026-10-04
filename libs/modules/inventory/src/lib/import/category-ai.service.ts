import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';

// Token de DI: en los tests se reemplaza el cliente entero (nunca pegarle a
// la API real desde un test), igual que ANTHROPIC_CLIENT en ai-invoice-scan.
export const IMPORT_ANTHROPIC_CLIENT = Symbol('IMPORT_ANTHROPIC_CLIENT');

const DEFAULT_MODEL = 'claude-opus-5-5';
const BATCH_SIZE = 300;
export const MAX_AI_ARTICLES = 3000;

const TOOL: Anthropic.Messages.Tool = {
  name: 'assign_categories',
  description: 'Devuelve la categoría elegida para cada artículo, en el mismo orden en que se recibieron.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            n: { type: 'integer', description: 'Número del artículo en la lista' },
            category: { type: 'string', description: 'Categoría, con mayúscula inicial' },
          },
          required: ['n', 'category'],
        },
      },
    },
    required: ['items'],
  },
};

const SYSTEM = `Clasificás artículos de comercios argentinos (ferreterías, corralones, aberturas, metalúrgicas, librerías, almacenes, etc.) en categorías para su sistema de gestión.

Reglas:
- Si alguna de las categorías existentes le queda bien al artículo, usala escrita exactamente igual.
- Si ninguna sirve, proponé una nueva: corta (una a tres palabras), genérica, en plural cuando corresponda ("Tornillos", "Caños de PVC", "Pinturas").
- Apuntá a pocas categorías útiles: artículos parecidos van juntos; no armes una categoría por artículo.
- Respondé siempre con la herramienta assign_categories, un ítem por cada artículo de la lista.`;

export interface CategoryArticle {
  sku: string;
  name: string;
}

/** Sugiere categorías para artículos que vienen sin categoría en el archivo
 * que se importa. Incluido en todos los planes (decisión del usuario,
 * 2026-10-04): el usuario revisa y acepta antes de importar. */
@Injectable()
export class CategoryAiService {
  private readonly logger = new Logger(CategoryAiService.name);

  constructor(@Inject(IMPORT_ANTHROPIC_CLIENT) private readonly anthropic: Anthropic | null) {}

  /** sku (en minúscula) -> categoría sugerida. */
  async suggest(articles: CategoryArticle[], existingCategories: string[]): Promise<Record<string, string>> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException('La sugerencia con IA no está configurada en este servidor.');
    }
    const known = [...existingCategories];
    const result: Record<string, string> = {};
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE);
      const answer = await this.classify(this.anthropic, batch, known);
      for (const { n, category } of answer) {
        const article = batch[n - 1];
        const clean = category.trim().slice(0, 60);
        if (!article || !clean) continue;
        // Misma categoría escrita distinto ("tornillos" / "Tornillos") se unifica.
        const same = known.find((c) => c.toLowerCase() === clean.toLowerCase());
        if (!same) known.push(clean);
        result[article.sku.toLowerCase()] = same ?? clean;
      }
    }
    return result;
  }

  private async classify(anthropic: Anthropic, batch: CategoryArticle[], categories: string[]): Promise<{ n: number; category: string }[]> {
    const list = batch.map((a, index) => `${index + 1}. ${a.name}`).join('\n');
    const existing = categories.length ? categories.join(', ') : '(todavía no hay)';
    try {
      // output_config no está tipado en la versión del SDK del repo (0.35).
      const params = {
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: 16000,
        output_config: { effort: 'low' },
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: `Categorías existentes: ${existing}\n\nArtículos:\n${list}`,
          },
        ],
      } as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming;
      const response = await anthropic.messages.create(params);
      const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      );
      const items = (toolUse?.input as { items?: unknown } | undefined)?.items;
      if (!Array.isArray(items)) throw new Error(`Respuesta sin categorías (stop_reason ${response.stop_reason})`);
      return items.filter(
        (item): item is { n: number; category: string } =>
          typeof item?.n === 'number' && typeof item?.category === 'string',
      );
    } catch (error) {
      this.logger.warn(`Sugerencia de categorías falló: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('No se pudieron sugerir categorías en este momento. Probá de nuevo en un rato.');
    }
  }
}
