import { Injectable } from '@nestjs/common';
import { AssistantIntent, AssistantMessageRole, Prisma, PrismaService } from '@plexo/database';

const PLATFORM_SETTINGS_ID = 'global';

// Cuántos días hacia atrás mirar en el reporte de "preguntas sin
// responder" de Admin, y tope de filas para no traer un historial entero
// si nunca se revisó - mismo espíritu que METRICS_WINDOW_MS de
// AdminMercadoPagoController, un número fijo razonable en vez de un filtro
// configurable que nadie va a tocar por ahora.
const UNANSWERED_LOOKBACK_DAYS = 30;
const UNANSWERED_LIMIT = 200;

export interface UnansweredQuestion {
  id: string;
  tenantName: string;
  question: string | null;
  answer: string;
  createdAt: Date;
}

export interface AssistantSettings {
  assistantDisplayName: string | null;
  assistantRateLimitWindowMinutes: number;
  assistantRateLimitMaxMessages: number;
}

export interface UpdateAssistantSettingsInput {
  assistantDisplayName?: string | null;
  assistantRateLimitWindowMinutes?: number;
  assistantRateLimitMaxMessages?: number;
}

/**
 * Configuración de plataforma del asistente de IA - nombre mostrado +
 * rate limit (docs/plan-asistente-ia-conversacional.md, secciones 1 y
 * 8.2), ninguno de los dos hardcodeado en código. Mismo patrón
 * get-or-create defensivo que AiInvoiceScanService.getSettings - la
 * migración ya siembra la fila única vía el DEFAULT de las columnas.
 */
@Injectable()
export class AssistantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<AssistantSettings> {
    const existing = await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
    if (existing) {
      return existing;
    }
    return this.prisma.platformSettings.create({ data: { id: PLATFORM_SETTINGS_ID } });
  }

  async updateSettings(patch: UpdateAssistantSettingsInput): Promise<AssistantSettings> {
    return this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, ...patch },
      update: patch,
    });
  }

  /**
   * Preguntas que el asistente clasificó como "datos" (sobre el propio
   * negocio, no de ayuda) pero terminó respondiendo sin llamar a ninguna
   * herramienta - en la práctica, casi siempre el modelo diciendo en texto
   * libre "no tengo una herramienta para esto" (ver conversación con el
   * usuario que originó este reporte: preguntó un precio antes de que
   * `stock_articulo` lo devolviera). Sirve para priorizar qué agregar al
   * catálogo de AssistantToolsService sin tener que adivinar - cruce
   * cross-tenant a propósito (usa PrismaService, no getTenantDb()), mismo
   * patrón que AdminMercadoPagoController.listFailedWebhookEvents.
   */
  async getUnansweredQuestions(): Promise<UnansweredQuestion[]> {
    const since = new Date(Date.now() - UNANSWERED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const unanswered = await this.prisma.assistantMessage.findMany({
      where: {
        role: AssistantMessageRole.ASSISTANT,
        intent: AssistantIntent.DATOS,
        toolCalls: { equals: Prisma.DbNull },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: UNANSWERED_LIMIT,
      select: { id: true, tenantId: true, conversationId: true, content: true, createdAt: true },
    });
    if (unanswered.length === 0) {
      return [];
    }

    const tenantIds = [...new Set(unanswered.map((m) => m.tenantId))];
    const tenants = await this.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } });
    const tenantNameById = new Map(tenants.map((t) => [t.id, t.name]));

    return Promise.all(
      unanswered.map(async (m) => {
        // La pregunta real es el mensaje role=USER inmediatamente anterior
        // en la misma conversación - no está desnormalizada en esta fila a
        // propósito (ver comentario del enum AssistantIntent en el schema),
        // así que se busca aparte. N+1 aceptable: este reporte nunca corre
        // en un hot path, sólo cuando un SuperAdmin abre la pantalla.
        const question = await this.prisma.assistantMessage.findFirst({
          where: { conversationId: m.conversationId, role: AssistantMessageRole.USER, createdAt: { lt: m.createdAt } },
          orderBy: { createdAt: 'desc' },
          select: { content: true },
        });
        return {
          id: m.id,
          tenantName: tenantNameById.get(m.tenantId) ?? 'Tenant desconocido',
          question: question?.content ?? null,
          answer: m.content,
          createdAt: m.createdAt,
        };
      }),
    );
  }
}
