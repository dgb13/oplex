import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { DOCUMENTS_DEFAULT_MODEL } from '@plexo/ai-invoice-scan';
import { getTenantDb, PrismaService, withTenantContext, type Prisma } from '@plexo/database';
import { ARTICLE_IMPORT_DEFAULT_MODEL } from '@plexo/inventory';
import type { AiFeature } from '../ai-events/ai-events.service.js';
import { ASSISTANT_HELP_DEFAULT_MODEL } from '../assistant/assistant-help.service.js';
import { ASSISTANT_DEFAULT_MODEL } from '../assistant/assistant-orchestrator.service.js';

type KeyGroup = 'assistant' | 'documents';

const PLATFORM_SETTINGS_ID = 'global';

const KEYS: Record<KeyGroup, { label: string; envVar: string; usedBy: string }> = {
  assistant: {
    label: 'Asistente de chat',
    envVar: 'ANTHROPIC_ASSISTANT_API_KEY',
    usedBy: 'el chat del asistente (web y WhatsApp) y sus respuestas de ayuda',
  },
  documents: {
    label: 'Lectura de documentos',
    envVar: 'ANTHROPIC_API_KEY',
    usedBy: 'leer la Constancia de Inscripción, Carga con IA (compras) y la clasificación al importar artículos',
  },
};

// Cada función de IA de Oplex, con la clave y el modelo que usa de verdad
// (misma variable y mismo default que el código que la llama).
const FEATURES: { key: AiFeature; label: string; group: KeyGroup; modelVar: string; defaultModel: string }[] = [
  { key: 'ASSISTANT_CHAT', label: 'Asistente (chat)', group: 'assistant', modelVar: 'ANTHROPIC_ASSISTANT_MODEL', defaultModel: ASSISTANT_DEFAULT_MODEL },
  {
    key: 'ASSISTANT_HELP',
    label: 'Asistente (ayuda y derivación)',
    group: 'assistant',
    modelVar: 'ANTHROPIC_ASSISTANT_HELP_MODEL',
    defaultModel: ASSISTANT_HELP_DEFAULT_MODEL,
  },
  { key: 'CONSTANCIA', label: 'Constancia de Inscripción', group: 'documents', modelVar: 'ANTHROPIC_MODEL', defaultModel: DOCUMENTS_DEFAULT_MODEL },
  { key: 'INVOICE_SCAN', label: 'Carga con IA (compras)', group: 'documents', modelVar: 'ANTHROPIC_MODEL', defaultModel: DOCUMENTS_DEFAULT_MODEL },
  {
    key: 'ARTICLE_IMPORT',
    label: 'Importar artículos (categorías)',
    group: 'documents',
    modelVar: 'ANTHROPIC_IMPORT_MODEL',
    defaultModel: ARTICLE_IMPORT_DEFAULT_MODEL,
  },
];

const FEATURE_LABEL = Object.fromEntries(FEATURES.map((f) => [f.key, f.label])) as Record<AiFeature, string>;

export type AiTestCode = 'OK' | 'NO_KEY' | 'INVALID_KEY' | 'NO_PERMISSION' | 'MODEL_NOT_FOUND' | 'NETWORK' | 'ERROR';

export interface AiTestResult {
  code: AiTestCode;
  message: string;
}

export interface AiStatus {
  keys: { group: KeyGroup; label: string; envVar: string; usedBy: string; configured: boolean }[];
  features: {
    key: AiFeature;
    label: string;
    group: KeyGroup;
    model: string;
    lastTest: AiTestResult | null;
    usage: string | null;
  }[];
  lastTestAt: string | null;
  lastFailure: { at: string; feature: string; tenantName: string | null; reason: string | null } | null;
}

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function modelOf(feature: (typeof FEATURES)[number]): string {
  return process.env[feature.modelVar]?.trim() || feature.defaultModel;
}

function monthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * /admin → Configuración del sistema → Inteligencia artificial (Anthropic).
 * Las dos claves (chat y lectura de documentos, separadas a propósito para
 * ver el gasto por separado), qué función usa cada una y con qué modelo, el
 * uso del mes y la última falla (AiEventsService). "Probar" usa
 * models.retrieve: confirma clave y modelo sin generar texto, sin costo.
 */
@Injectable()
export class AdminAiStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /** Para la lista de Configuración del sistema (y el aviso del menú). */
  summary(): { configured: boolean; detail?: string } {
    const missing = (Object.keys(KEYS) as KeyGroup[]).filter((g) => !hasEnv(KEYS[g].envVar));
    if (missing.length === 0) return { configured: true };
    return {
      configured: false,
      detail: `Falta ${missing.map((g) => `${KEYS[g].envVar} (${KEYS[g].label.toLowerCase()})`).join(' y ')}`,
    };
  }

  async getStatus(): Promise<AiStatus> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID }, select: { aiLastTestAt: true, aiLastTestResults: true } });
    const tests = (settings?.aiLastTestResults ?? {}) as Partial<Record<AiFeature, AiTestResult>>;
    const usage = await this.monthUsage();
    const lastFailure = await this.lastFailure();

    return {
      keys: (Object.keys(KEYS) as KeyGroup[]).map((group) => ({ group, ...KEYS[group], configured: hasEnv(KEYS[group].envVar) })),
      features: FEATURES.map((f) => ({
        key: f.key,
        label: f.label,
        group: f.group,
        model: modelOf(f),
        lastTest: tests[f.key] ?? null,
        usage: usage[f.key] ?? null,
      })),
      lastTestAt: settings?.aiLastTestAt?.toISOString() ?? null,
      lastFailure,
    };
  }

  async test(): Promise<AiStatus> {
    const results: Partial<Record<AiFeature, AiTestResult>> = {};
    // Una consulta por clave + modelo (Constancia y Carga con IA comparten las dos).
    const cache = new Map<string, Promise<AiTestResult>>();
    for (const f of FEATURES) {
      const apiKey = process.env[KEYS[f.group].envVar]?.trim();
      if (!apiKey) {
        results[f.key] = { code: 'NO_KEY', message: 'Sin clave' };
        continue;
      }
      const model = modelOf(f);
      const cacheKey = `${f.group}:${model}`;
      if (!cache.has(cacheKey)) cache.set(cacheKey, this.checkModel(apiKey, model));
      results[f.key] = await cache.get(cacheKey);
    }
    const data = { aiLastTestAt: new Date(), aiLastTestResults: results as Prisma.InputJsonValue };
    await this.prisma.platformSettings.upsert({ where: { id: PLATFORM_SETTINGS_ID }, create: { id: PLATFORM_SETTINGS_ID, ...data }, update: data });
    return this.getStatus();
  }

  private async checkModel(apiKey: string, model: string): Promise<AiTestResult> {
    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 15_000 });
    try {
      await client.models.retrieve(model);
      return { code: 'OK', message: 'OK' };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return { code: 'INVALID_KEY', message: 'Anthropic rechazó la clave' };
      if (err instanceof Anthropic.PermissionDeniedError) return { code: 'NO_PERMISSION', message: 'La clave no tiene permiso' };
      if (err instanceof Anthropic.NotFoundError) return { code: 'MODEL_NOT_FOUND', message: `El modelo ${model} no existe` };
      if (err instanceof Anthropic.APIConnectionError) return { code: 'NETWORK', message: 'Sin conexión con Anthropic' };
      return { code: 'ERROR', message: (err as Error).message };
    }
  }

  /** Lo que Oplex registra de cada función en el mes en curso; null = no lo registra. */
  private async monthUsage(): Promise<Partial<Record<AiFeature, string>>> {
    const since = monthStart();
    const [constanciaOk, constanciaFailed] = await Promise.all([
      this.prisma.aiFeatureEvent.count({ where: { feature: 'CONSTANCIA', ok: true, createdAt: { gte: since } } }),
      this.prisma.aiFeatureEvent.count({ where: { feature: 'CONSTANCIA', ok: false, createdAt: { gte: since } } }),
    ]);
    // Mensajes y comprobantes viven en tablas con RLS por tenant: mismo
    // recorrido por list_tenant_ids() que AdminSystemStatusService.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    let chatMessages = 0;
    let scans = 0;
    for (const { id } of rows) {
      const [messages, attempts] = await withTenantContext(this.prisma, id, () =>
        Promise.all([
          getTenantDb().assistantMessage.count({ where: { role: 'USER', createdAt: { gte: since } } }),
          getTenantDb().aiInvoiceScanAttempt.count({ where: { status: 'SUCCESS', createdAt: { gte: since } } }),
        ]),
      );
      chatMessages += messages;
      scans += attempts;
    }
    const total = constanciaOk + constanciaFailed;
    return {
      ASSISTANT_CHAT: `${chatMessages} ${chatMessages === 1 ? 'mensaje' : 'mensajes'}`,
      CONSTANCIA: `${total} ${total === 1 ? 'lectura' : 'lecturas'}${constanciaFailed ? ` (${constanciaFailed} ${constanciaFailed === 1 ? 'fallida' : 'fallidas'})` : ''}`,
      INVOICE_SCAN: `${scans} ${scans === 1 ? 'comprobante' : 'comprobantes'}`,
    };
  }

  private async lastFailure(): Promise<AiStatus['lastFailure']> {
    const event = await this.prisma.aiFeatureEvent.findFirst({ where: { ok: false }, orderBy: { createdAt: 'desc' } });
    if (!event) return null;
    let tenantName: string | null = null;
    if (event.tenantId) {
      const tenantId = event.tenantId;
      tenantName = await withTenantContext(this.prisma, tenantId, () =>
        getTenantDb().tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      )
        .then((t) => t?.name ?? null)
        .catch(() => null);
    }
    return {
      at: event.createdAt.toISOString(),
      feature: FEATURE_LABEL[event.feature as AiFeature] ?? event.feature,
      tenantName,
      reason: event.reason,
    };
  }
}
