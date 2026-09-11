import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { isPlatformAdminEmail } from '@plexo/auth';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';
import type { AuthenticatedUser, ModuleAccessClaim } from '@plexo/types';
import {
  AssistantConversationService,
  type HistoryMessage,
} from '../assistant/assistant-conversation.service.js';
import { AssistantHelpService } from '../assistant/assistant-help.service.js';
import { AssistantIntentRouterService, type AssistantIntent } from '../assistant/assistant-intent-router.service.js';
import { AssistantOrchestratorService } from '../assistant/assistant-orchestrator.service.js';
import { normalizePhone, WhatsAppLinkService, type WhatsAppLinkConfirmOutcome } from '../whatsapp/whatsapp-link.service.js';
import { WhatsAppCloudApiClient } from '../whatsapp/whatsapp-cloud-api.client.js';
import { verifyWhatsAppWebhookSignature } from './whatsapp-webhook-signature.util.js';

// Mensaje fijo de la sección 3.3 del plan: nunca insinúa si el número
// pertenece o no a algún tenant existente (anti-enumeración).
const NOT_LINKED_MESSAGE =
  'Este número no está vinculado a ninguna cuenta de Oplex. Ingresá a la app → Perfil → WhatsApp para generar un código y vincularlo.';

// Timeout largo del mismo motivo que ASSISTANT_MESSAGE_TIMEOUT_MS en
// AssistantController: una vuelta con tool use puede hacer varias llamadas
// reales a Claude antes de responder.
const ASSISTANT_MESSAGE_TIMEOUT_MS = 60_000;

interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
}

export interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WhatsAppIncomingMessage[];
      };
    }>;
  }>;
}

interface PhoneLookupRow {
  tenant_id: string;
  user_id: string;
}

const CONFIRM_OUTCOME_MESSAGE: Record<WhatsAppLinkConfirmOutcome, string> = {
  ok: '✅ Tu WhatsApp quedó vinculado a tu cuenta de Oplex. Ya podés preguntarme lo que necesites.',
  invalid: 'Código incorrecto o vencido. Generá uno nuevo desde Perfil → WhatsApp en la app de Oplex.',
  'too-many-attempts':
    'Superaste el máximo de intentos para este código. Generá uno nuevo desde Perfil → WhatsApp en la app de Oplex.',
  'not-found': NOT_LINKED_MESSAGE,
};

/**
 * Fase 5b (docs/plan-asistente-ia-conversacional.md, sección 6.3) -
 * composition root del webhook real de WhatsApp Cloud API: verifica firma,
 * resuelve identidad por teléfono (find_whatsapp_link_by_phone/
 * find_whatsapp_link_requests_by_phone, ver la migración
 * 20260930010000_whatsapp_cloud_api_fase5b) y delega en el MISMO pipeline
 * que ya usa el canal web (AssistantConversationService/
 * AssistantIntentRouterService/AssistantHelpService/
 * AssistantOrchestratorService) - a propósito, sección 3.1 del plan: "a
 * partir de ahí, el resto del pipeline no distingue de qué canal vino la
 * pregunta".
 */
@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppLinkService: WhatsAppLinkService,
    private readonly cloudApiClient: WhatsAppCloudApiClient,
    private readonly subscriptionService: SubscriptionService,
    private readonly assistantConversationService: AssistantConversationService,
    private readonly assistantIntentRouterService: AssistantIntentRouterService,
    private readonly assistantHelpService: AssistantHelpService,
    private readonly assistantOrchestratorService: AssistantOrchestratorService,
  ) {}

  verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
    const secret = process.env['WHATSAPP_APP_SECRET'];
    return Boolean(secret) && verifyWhatsAppWebhookSignature(rawBody, signatureHeader, secret as string);
  }

  logProcessingError(err: unknown): void {
    this.logger.error('Falló el procesamiento de un mensaje de WhatsApp', err instanceof Error ? err.stack : err);
  }

  /** Meta manda un `entry`/`changes` por cada evento, no sólo por mensajes
   * de texto (también hay `statuses` de entrega/lectura bajo la misma URL) -
   * `value.messages` viene ausente en esos otros casos, así que no hay nada
   * que procesar. Un fallo en un mensaje no debe tirar abajo el resto del
   * batch (Meta puede agrupar varios en un mismo POST). */
  async processIncoming(body: WhatsAppWebhookBody): Promise<void> {
    const messages =
      body.entry?.flatMap((entry) => entry.changes?.flatMap((change) => change.value?.messages ?? []) ?? []) ?? [];

    for (const message of messages) {
      await this.handleMessage(message).catch((err: unknown) => this.logProcessingError(err));
    }
  }

  private async handleMessage(message: WhatsAppIncomingMessage): Promise<void> {
    const phoneE164 = normalizePhone(message.from);

    if (message.type !== 'text' || !message.text?.body) {
      await this.cloudApiClient.sendText(phoneE164, 'Por ahora sólo puedo leer mensajes de texto por WhatsApp.');
      return;
    }
    const text = message.text.body.trim();

    const linkRows = await this.prisma.$queryRaw<PhoneLookupRow[]>`
      SELECT tenant_id, user_id FROM find_whatsapp_link_by_phone(${phoneE164})
    `;
    if (linkRows.length > 0) {
      await this.handleAssistantMessage(linkRows[0], phoneE164, text);
      return;
    }

    await this.handleUnlinkedMessage(phoneE164, text);
  }

  /** Un número sin vincular: la única acción posible es confirmar un código
   * pendiente. `phoneE164` no es único en whatsapp_link_requests (dos
   * tenants distintos podrían tener un pending con el mismo número), así que
   * se prueba contra cada candidato hasta que uno confirme. */
  private async handleUnlinkedMessage(phoneE164: string, text: string): Promise<void> {
    const candidates = await this.prisma.$queryRaw<PhoneLookupRow[]>`
      SELECT tenant_id, user_id FROM find_whatsapp_link_requests_by_phone(${phoneE164})
    `;

    let outcome: WhatsAppLinkConfirmOutcome = 'not-found';
    for (const candidate of candidates) {
      outcome = await this.whatsAppLinkService.confirmCode(candidate.tenant_id, candidate.user_id, phoneE164, text);
      if (outcome === 'ok') {
        break;
      }
    }

    await this.cloudApiClient.sendText(phoneE164, CONFIRM_OUTCOME_MESSAGE[outcome]);
  }

  private async handleAssistantMessage(link: PhoneLookupRow, phoneE164: string, text: string): Promise<void> {
    await withTenantContext(
      this.prisma,
      link.tenant_id,
      async () => {
        const db = getTenantDb();
        const [user, tenant] = await Promise.all([
          db.user.findUnique({ where: { id: link.user_id } }),
          db.tenant.findUnique({ where: { id: link.tenant_id } }),
        ]);
        // No debería pasar (el link ya existe), pero un webhook nunca debe
        // asumir que una fila resuelta hace un instante sigue existiendo.
        if (!user || !tenant) {
          return;
        }
        // Mismo criterio que login() (auth.service.ts): un usuario/tenant
        // suspendido no opera - a diferencia del canal web (un JWT ya
        // emitido es una foto fija que sólo expira con el tiempo), acá NO
        // hay expiración natural, así que este chequeo corre en CADA
        // mensaje, no sólo al vincular.
        if (tenant.status === 'SUSPENDED') {
          await this.cloudApiClient.sendText(phoneE164, 'La cuenta de Oplex vinculada a este WhatsApp está suspendida.');
          return;
        }
        if (user.status === 'SUSPENDED') {
          await this.cloudApiClient.sendText(phoneE164, 'Tu usuario de Oplex fue suspendido - contactate con el administrador de tu cuenta.');
          return;
        }
        if (user.mustChangePassword) {
          await this.cloudApiClient.sendText(
            phoneE164,
            'Iniciá sesión en la app de Oplex para terminar de configurar tu cuenta antes de usar el asistente por WhatsApp.',
          );
          return;
        }

        const moduleAccess = await db.userModuleAccess.findMany({ where: { userId: user.id } });
        const identity: AuthenticatedUser = {
          sub: user.id,
          tenantId: link.tenant_id,
          email: user.email,
          role: user.role,
          moduleAccess: moduleAccess.map(
            (grant): ModuleAccessClaim => ({ module: grant.module, canRead: grant.canRead, canWrite: grant.canWrite }),
          ),
          mustChangePassword: user.mustChangePassword,
          isPlatformAdmin: isPlatformAdminEmail(user.email),
        };

        await this.answerAndReply(identity, phoneE164, text);
      },
      link.user_id,
      undefined,
      ASSISTANT_MESSAGE_TIMEOUT_MS,
    );
  }

  /** Mismo cuerpo que AssistantController.sendMessage (sin streaming - por
   * WhatsApp la respuesta sale entera de una, sección 5.3 del plan: "sólo
   * texto, sin componentes"). ForbiddenException (cupo mensual agotado, rate
   * limit) es la única que se muestra tal cual - cualquier otro error es
   * genérico, mismo mensaje que ya usa sendMessageStream para no filtrar
   * detalles internos. */
  private async answerAndReply(identity: AuthenticatedUser, phoneE164: string, text: string): Promise<void> {
    try {
      await this.subscriptionService.assertCanUseAssistant();
      await this.assistantConversationService.assertNotRateLimited(identity);

      const { conversationId, history } = await this.assistantConversationService.getRecentHistory(identity);
      await this.assistantConversationService.appendMessage(conversationId, 'USER', text);

      const intent = await this.assistantIntentRouterService.classify(text);
      const reply = await this.answer(identity, intent, history, text);

      await this.assistantConversationService.appendMessage(conversationId, 'ASSISTANT', reply);
      await this.cloudApiClient.sendText(phoneE164, reply);
    } catch (err) {
      if (err instanceof ForbiddenException) {
        await this.cloudApiClient.sendText(phoneE164, err.message);
        return;
      }
      this.logger.error('Falló el asistente vía WhatsApp', err instanceof Error ? err.stack : err);
      await this.cloudApiClient.sendText(phoneE164, 'El asistente no está disponible en este momento. Probá de nuevo en un rato.');
    }
  }

  private answer(identity: AuthenticatedUser, intent: AssistantIntent, history: HistoryMessage[], text: string): Promise<string> {
    return intent === 'ayuda'
      ? this.assistantHelpService.answer(history, text)
      : this.assistantOrchestratorService.chat(identity, history, text);
  }
}
