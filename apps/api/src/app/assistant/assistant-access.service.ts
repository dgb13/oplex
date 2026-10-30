import { Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId, Prisma } from '@plexo/database';
import { hasAnyRole, type AuthenticatedUser } from '@plexo/types';
import {
  ASSISTANT_ACTIONS,
  DEFAULT_ACTION_LEVELS,
  DEFAULT_ACTION_ROLES,
  roleCanRequestAction,
  type AssistantActionId,
  type AssistantActionLevel,
} from './assistant-actions.catalog.js';
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

export type ActionLevels = Record<AssistantActionId, AssistantActionLevel>;
export type ActionRoles = Record<AssistantActionId, ConfigurableRole[]>;

export interface AssistantTenantConfigView {
  webEnabled: boolean;
  whatsappEnabled: boolean;
  salesOwnDataOnly: boolean;
  topicsByRole: TopicsByRole;
  actionLevels: ActionLevels;
  actionRoles: ActionRoles;
  maxQuoteAmountWhatsapp: number | null;
  maxActionsPerDay: number;
  confirmExpiryMinutes: number;
}

/** Lo que una persona puede consultar y pedir en ESTE turno. Se calcula en
 * el servidor en cada mensaje (nunca viene del cliente ni del modelo). */
export interface AssistantAccess {
  allowedTopics: Set<AssistantTopicId>;
  allowedTools: Set<string>;
  // Acción → nivel que rige para esta persona (sólo las que puede pedir y
  // no están apagadas).
  allowedActions: Map<AssistantActionId, Exclude<AssistantActionLevel, 'OFF'>>;
  scope: AssistantDataScope;
  webEnabled: boolean;
  whatsappEnabled: boolean;
  limits: { maxQuoteAmountWhatsapp: number | null; maxActionsPerDay: number; confirmExpiryMinutes: number };
}

interface ScreenCell {
  role: ConfigurableRole;
  enabled: boolean;
  capable: boolean;
  reason: string | null;
}

/** Para la pantalla: matriz de temas y lista de acciones, ya armadas, con el
 * motivo de cada celda que el rol no puede tener en el sistema. */
export interface AssistantConfigScreen {
  webEnabled: boolean;
  whatsappEnabled: boolean;
  salesOwnDataOnly: boolean;
  roles: ConfigurableRole[];
  topics: Array<{ id: AssistantTopicId; label: string; hint: string; cells: ScreenCell[] }>;
  actions: Array<{
    id: AssistantActionId;
    label: string;
    hint: string;
    rule: string | null;
    level: AssistantActionLevel;
    allowedLevels: AssistantActionLevel[];
    roles: ScreenCell[];
  }>;
  limits: AssistantAccess['limits'];
}

export interface UpdateAssistantConfigInput {
  webEnabled?: boolean;
  whatsappEnabled?: boolean;
  salesOwnDataOnly?: boolean;
  topicsByRole?: Partial<Record<string, string[]>>;
  actionLevels?: Partial<Record<string, string>>;
  actionRoles?: Partial<Record<string, string[]>>;
  maxQuoteAmountWhatsapp?: number | null;
  maxActionsPerDay?: number;
  confirmExpiryMinutes?: number;
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

function asObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Deja sólo temas y roles conocidos, y saca lo que el rol no puede tener
 * en el sistema - así un JSON viejo o editado a mano nunca da más permiso.
 * Un tema que no figura toma su default (temas nuevos que se sumen después
 * arrancan como dice DEFAULT_TOPICS_BY_ROLE, no apagados en silencio). */
export function normalizeTopicsByRole(raw: unknown): TopicsByRole {
  const source = asObject(raw);
  const result = {} as TopicsByRole;
  for (const topic of ASSISTANT_TOPICS) {
    const value = source[topic.id];
    const roles = Array.isArray(value) ? value : DEFAULT_TOPICS_BY_ROLE[topic.id];
    result[topic.id] = CONFIGURABLE_ROLES.filter((role) => roles.includes(role) && roleCanHaveTopic(role, topic));
  }
  return result;
}

/** Mismo criterio para acciones: un nivel que la acción no admite (ej.
 * Directa en algo que sale a un cliente) cae a su default. */
export function normalizeActionLevels(raw: unknown): ActionLevels {
  const source = asObject(raw);
  const result = {} as ActionLevels;
  for (const action of ASSISTANT_ACTIONS) {
    const value = source[action.id];
    result[action.id] = action.allowedLevels.includes(value as AssistantActionLevel)
      ? (value as AssistantActionLevel)
      : DEFAULT_ACTION_LEVELS[action.id];
  }
  return result;
}

export function normalizeActionRoles(raw: unknown): ActionRoles {
  const source = asObject(raw);
  const result = {} as ActionRoles;
  for (const action of ASSISTANT_ACTIONS) {
    const value = source[action.id];
    const roles = Array.isArray(value) ? value : DEFAULT_ACTION_ROLES[action.id];
    result[action.id] = CONFIGURABLE_ROLES.filter((role) => roles.includes(role) && roleCanRequestAction(role, action));
  }
  return result;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Temas por rol, canales y acciones del asistente (etapas 2 y 3 de
 * docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md). Una fila
 * por tenant en AssistantTenantConfig; sin fila valen los defaults (lo
 * mismo que se ve en la pantalla).
 *
 * Esto decide qué herramientas RECIBE el modelo. Cada herramienta (y cada
 * ejecución de una acción) sigue validando además el permiso real del
 * rol/módulo por su cuenta - la empresa puede quitar, nunca agregar.
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
      actionLevels: normalizeActionLevels(row?.actionLevels),
      actionRoles: normalizeActionRoles(row?.actionRoles),
      maxQuoteAmountWhatsapp: row?.maxQuoteAmountWhatsapp != null ? Number(row.maxQuoteAmountWhatsapp) : null,
      maxActionsPerDay: row?.maxActionsPerDay ?? 40,
      confirmExpiryMinutes: row?.confirmExpiryMinutes ?? 10,
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
      actions: ASSISTANT_ACTIONS.map((action) => ({
        id: action.id,
        label: action.label,
        hint: action.hint,
        rule: action.rule,
        level: config.actionLevels[action.id],
        allowedLevels: [...action.allowedLevels],
        roles: CONFIGURABLE_ROLES.map((role) => {
          const capable = roleCanRequestAction(role, action);
          return {
            role,
            enabled: config.actionRoles[action.id].includes(role),
            capable,
            reason: capable ? null : `El rol ${ROLE_NAMES[role]} no puede hacer esto en ${action.moduleName ?? 'Oplex'}.`,
          };
        }),
      })),
      limits: {
        maxQuoteAmountWhatsapp: config.maxQuoteAmountWhatsapp,
        maxActionsPerDay: config.maxActionsPerDay,
        confirmExpiryMinutes: config.confirmExpiryMinutes,
      },
    };
  }

  async updateConfig(input: UpdateAssistantConfigInput): Promise<AssistantConfigScreen> {
    const current = await this.getConfig();
    const topicsByRole = input.topicsByRole
      ? normalizeTopicsByRole({ ...current.topicsByRole, ...input.topicsByRole })
      : current.topicsByRole;
    const actionLevels = input.actionLevels
      ? normalizeActionLevels({ ...current.actionLevels, ...input.actionLevels })
      : current.actionLevels;
    const actionRoles = input.actionRoles
      ? normalizeActionRoles({ ...current.actionRoles, ...input.actionRoles })
      : current.actionRoles;
    const maxQuote = input.maxQuoteAmountWhatsapp !== undefined ? input.maxQuoteAmountWhatsapp : current.maxQuoteAmountWhatsapp;
    const data = {
      webEnabled: input.webEnabled ?? current.webEnabled,
      whatsappEnabled: input.whatsappEnabled ?? current.whatsappEnabled,
      salesOwnDataOnly: input.salesOwnDataOnly ?? current.salesOwnDataOnly,
      topicsByRole: topicsByRole as unknown as Prisma.InputJsonValue,
      actionLevels: actionLevels as unknown as Prisma.InputJsonValue,
      actionRoles: actionRoles as unknown as Prisma.InputJsonValue,
      maxQuoteAmountWhatsapp: maxQuote != null && maxQuote > 0 ? new Prisma.Decimal(maxQuote) : null,
      maxActionsPerDay: clampInt(input.maxActionsPerDay ?? current.maxActionsPerDay, 1, 1000),
      confirmExpiryMinutes: clampInt(input.confirmExpiryMinutes ?? current.confirmExpiryMinutes, 1, 120),
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

/** Varios roles por usuario: un tema o una acción se habilita si lo habilita
 * cualquiera de sus roles (la misma unión que RolesGuard). */
export function accessFromConfig(config: AssistantTenantConfigView, user: Pick<AuthenticatedUser, 'sub' | 'roles'>): AssistantAccess {
  const roles = user.roles;
  const fullAccess = hasAnyRole(roles, FULL_ACCESS_ROLES);
  const allowedTopics = new Set<AssistantTopicId>(
    ASSISTANT_TOPICS.filter(
      (topic) => fullAccess || roles.some((role) => config.topicsByRole[topic.id].includes(role as ConfigurableRole)),
    ).map((topic) => topic.id),
  );
  const allowedActions = new Map<AssistantActionId, Exclude<AssistantActionLevel, 'OFF'>>();
  for (const action of ASSISTANT_ACTIONS) {
    const level = config.actionLevels[action.id];
    const canRequest = roles.some(
      (role) =>
        (fullAccess || config.actionRoles[action.id].includes(role as ConfigurableRole)) && roleCanRequestAction(role, action),
    );
    if (level !== 'OFF' && canRequest) {
      allowedActions.set(action.id, level);
    }
  }
  const allowedTools = new Set([
    ...ASSISTANT_TOPICS.filter((topic) => allowedTopics.has(topic.id)).flatMap((topic) => topic.tools),
    ...ASSISTANT_ACTIONS.filter((action) => allowedActions.has(action.id)).map((action) => action.tool.name),
  ]);
  return {
    allowedTopics,
    allowedTools,
    allowedActions,
    // Ventas + otro rol (no Dueño/Admin) sigue viendo sólo lo suyo (decisión
    // del plan de varios roles, 2026-10-30).
    scope: !fullAccess && roles.includes('SALES') && config.salesOwnDataOnly ? { onlyIssuedBy: user.sub } : {},
    webEnabled: config.webEnabled,
    whatsappEnabled: config.whatsappEnabled,
    limits: {
      maxQuoteAmountWhatsapp: config.maxQuoteAmountWhatsapp,
      maxActionsPerDay: config.maxActionsPerDay,
      confirmExpiryMinutes: config.confirmExpiryMinutes,
    },
  };
}

/** Qué tema negar de entrada, según lo que detectó el clasificador. null =
 * seguir normalmente. 'otro' nunca bloquea: el clasificador puede
 * equivocarse, y si la pregunta igual cae en un tema apagado, el modelo no
 * tiene la herramienta para responderla (toolsForAccess). Un pedido de
 * acción tampoco se bloquea acá: lo decide la acción misma (nivel y rol). */
export function blockedTopicFor(
  access: AssistantAccess,
  classification: { intent: 'ayuda' | 'datos' | 'accion'; topic: AssistantTopicId | 'otro' },
): AssistantTopicId | null {
  if (classification.intent === 'accion') {
    return null;
  }
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
