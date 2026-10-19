import { Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId, type Prisma, type UserRole } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import type { AssistantDataScope } from './assistant-tools.service.js';
import {
  ASSISTANT_TOPICS,
  CONFIGURABLE_ROLES,
  DEFAULT_TOPICS_BY_ROLE,
  FULL_ACCESS_ROLES,
  roleCanHaveTopic,
  topicById,
  type AssistantTopicId,
  type ConfigurableRole,
  type TopicsByRole,
} from './assistant-topics.js';

export interface AssistantTenantConfigView {
  webEnabled: boolean;
  whatsappEnabled: boolean;
  salesOwnDataOnly: boolean;
  topicsByRole: TopicsByRole;
}

/** Lo que una persona puede consultar en ESTE turno. Se calcula en el
 * servidor en cada mensaje (nunca viene del cliente ni del modelo). */
export interface AssistantAccess {
  allowedTopics: Set<AssistantTopicId>;
  allowedTools: Set<string>;
  scope: AssistantDataScope;
  webEnabled: boolean;
  whatsappEnabled: boolean;
}

/** Para la pantalla: una celda por tema × rol, con el motivo si el rol no
 * puede tener ese tema en el sistema (ver AssistantTopic.capableRoles). */
export interface AssistantConfigScreen extends Omit<AssistantTenantConfigView, 'topicsByRole'> {
  roles: ConfigurableRole[];
  topics: Array<{
    id: AssistantTopicId;
    label: string;
    hint: string;
    cells: Array<{ role: ConfigurableRole; enabled: boolean; capable: boolean; reason: string | null }>;
  }>;
}

export interface UpdateAssistantConfigInput {
  webEnabled?: boolean;
  whatsappEnabled?: boolean;
  salesOwnDataOnly?: boolean;
  topicsByRole?: Partial<Record<string, string[]>>;
}

// Texto para la celda que no se puede prender - usa los nombres de rol que
// ya muestra Equipo (apps/web/src/lib/team.ts).
const ROLE_NAMES: Record<ConfigurableRole, string> = {
  SALES: 'Ventas',
  PURCHASES: 'Compras',
  INVENTORY: 'Inventario',
  ACCOUNTANT: 'Contador/a',
  VIEWER: 'Solo lectura',
};

/** Deja sólo temas y roles conocidos, y saca lo que el rol no puede tener
 * en el sistema - así un JSON viejo o editado a mano nunca da más permiso.
 * Un tema que no figura toma su default (temas nuevos que se sumen después
 * arrancan como dice DEFAULT_TOPICS_BY_ROLE, no apagados en silencio). */
export function normalizeTopicsByRole(raw: unknown): TopicsByRole {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const result = {} as TopicsByRole;
  for (const topic of ASSISTANT_TOPICS) {
    const value = source[topic.id];
    const roles = Array.isArray(value) ? value : DEFAULT_TOPICS_BY_ROLE[topic.id];
    result[topic.id] = CONFIGURABLE_ROLES.filter((role) => roles.includes(role) && roleCanHaveTopic(role, topic));
  }
  return result;
}

/**
 * Temas por rol + canales del asistente (etapa 2 de
 * docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md). Una fila
 * por tenant en AssistantTenantConfig; sin fila valen los defaults de
 * DEFAULT_TOPICS_BY_ROLE (lo mismo que se ve en la pantalla).
 *
 * Esto decide qué herramientas RECIBE el modelo. Cada herramienta sigue
 * validando además el permiso real del rol/módulo por su cuenta
 * (AssistantToolsService) - la empresa puede quitar, nunca agregar.
 */
@Injectable()
export class AssistantAccessService {
  async getConfig(): Promise<AssistantTenantConfigView> {
    const row = await getTenantDb().assistantTenantConfig.findUnique({ where: { tenantId: getTenantId() } });
    return {
      webEnabled: row?.webEnabled ?? true,
      whatsappEnabled: row?.whatsappEnabled ?? true,
      salesOwnDataOnly: row?.salesOwnDataOnly ?? true,
      topicsByRole: normalizeTopicsByRole(row?.topicsByRole),
    };
  }

  async getConfigScreen(): Promise<AssistantConfigScreen> {
    const config = await this.getConfig();
    return {
      webEnabled: config.webEnabled,
      whatsappEnabled: config.whatsappEnabled,
      salesOwnDataOnly: config.salesOwnDataOnly,
      roles: [...CONFIGURABLE_ROLES],
      topics: ASSISTANT_TOPICS.map((topic) => ({
        id: topic.id,
        label: topic.label,
        hint: topic.hint,
        cells: CONFIGURABLE_ROLES.map((role) => {
          const capable = roleCanHaveTopic(role, topic);
          return {
            role,
            enabled: config.topicsByRole[topic.id].includes(role),
            capable,
            reason: capable ? null : `El rol ${ROLE_NAMES[role]} no tiene acceso a ${topic.moduleName ?? topic.label} en Oplex.`,
          };
        }),
      })),
    };
  }

  async updateConfig(input: UpdateAssistantConfigInput): Promise<AssistantConfigScreen> {
    const current = await this.getConfig();
    const topicsByRole = input.topicsByRole
      ? normalizeTopicsByRole({ ...current.topicsByRole, ...input.topicsByRole })
      : current.topicsByRole;
    const data = {
      webEnabled: input.webEnabled ?? current.webEnabled,
      whatsappEnabled: input.whatsappEnabled ?? current.whatsappEnabled,
      salesOwnDataOnly: input.salesOwnDataOnly ?? current.salesOwnDataOnly,
      topicsByRole: topicsByRole as unknown as Prisma.InputJsonValue,
    };
    const tenantId = getTenantId();
    await getTenantDb().assistantTenantConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return this.getConfigScreen();
  }

  async resolve(user: AuthenticatedUser): Promise<AssistantAccess> {
    const config = await this.getConfig();
    return accessFromConfig(config, user);
  }
}

export function accessFromConfig(config: AssistantTenantConfigView, user: Pick<AuthenticatedUser, 'sub' | 'role'>): AssistantAccess {
  const fullAccess = FULL_ACCESS_ROLES.includes(user.role as UserRole);
  const allowedTopics = new Set<AssistantTopicId>(
    ASSISTANT_TOPICS.filter(
      (topic) => fullAccess || config.topicsByRole[topic.id].includes(user.role as ConfigurableRole),
    ).map((topic) => topic.id),
  );
  const allowedTools = new Set(
    ASSISTANT_TOPICS.filter((topic) => allowedTopics.has(topic.id)).flatMap((topic) => topic.tools),
  );
  return {
    allowedTopics,
    allowedTools,
    scope: user.role === 'SALES' && config.salesOwnDataOnly ? { onlyIssuedBy: user.sub } : {},
    webEnabled: config.webEnabled,
    whatsappEnabled: config.whatsappEnabled,
  };
}

/** Qué tema negar de entrada, según lo que detectó el clasificador. null =
 * seguir normalmente. 'otro' nunca bloquea: el clasificador puede
 * equivocarse, y si la pregunta igual cae en un tema apagado, el modelo no
 * tiene la herramienta para responderla (toolsForAccess). */
export function blockedTopicFor(
  access: AssistantAccess,
  classification: { intent: 'ayuda' | 'datos'; topic: AssistantTopicId | 'otro' },
): AssistantTopicId | null {
  if (classification.intent === 'ayuda') {
    return access.allowedTopics.has('ayuda') ? null : 'ayuda';
  }
  if (classification.topic === 'otro') {
    return null;
  }
  return access.allowedTopics.has(classification.topic) ? null : classification.topic;
}

export const WEB_DISABLED_MESSAGE =
  'El asistente en la web está desactivado en tu empresa. Lo puede prender el Dueño o un administrador en Preferencias › Asistente.';
export const WHATSAPP_DISABLED_MESSAGE =
  'El asistente por WhatsApp está desactivado en tu empresa. Lo puede prender el Dueño o un administrador en Preferencias › Asistente.';

/** Respuesta fija para una consulta de un tema que la persona no tiene -
 * sin pasar por el modelo (no gasta, no puede filtrar nada). */
export function blockedTopicReply(topicId: AssistantTopicId): string {
  const topic = topicById(topicId);
  return `No tenés permiso para consultar ${topic ? `"${topic.label}"` : 'eso'} con el asistente. Si lo necesitás, pedíselo al Dueño o a un administrador de tu empresa.`;
}
