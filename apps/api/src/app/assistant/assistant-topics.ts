import type { UserRole } from '@plexo/database';
import { PAYABLES_READ_ROLES, POS_READ_ROLES, RECEIVABLES_READ_ROLES } from './assistant-tools.service.js';

/**
 * Temas del asistente para "Temas por rol" de Preferencias › Asistente (etapa
 * 2 de docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md). Cada
 * tema agrupa herramientas del catálogo (ASSISTANT_TOOLS) - si un rol no
 * tiene el tema, el asistente ni siquiera recibe esas herramientas.
 *
 * `capableRoles`: qué roles PUEDEN tener el tema - el mismo permiso que ya
 * exige la herramienta (o el endpoint HTTP que envuelve). La empresa puede
 * apagar un tema, nunca dar más permiso que el que el rol tiene en el resto
 * del sistema. null = cualquier rol.
 */
export interface AssistantTopic {
  id: AssistantTopicId;
  label: string;
  hint: string;
  tools: string[];
  capableRoles: readonly UserRole[] | null;
  // Para explicar en la pantalla por qué una celda no se puede prender.
  moduleName?: string;
}

export type AssistantTopicId = 'ventas' | 'deudas' | 'caja' | 'stock' | 'costos' | 'compras' | 'ayuda';

export const ASSISTANT_TOPICS: AssistantTopic[] = [
  {
    id: 'ventas',
    label: 'Ventas y facturación',
    hint: 'Ventas por artículo o período',
    tools: ['ventas_por_articulo'],
    // Además, la herramienta exige acceso de lectura al módulo de reportes
    // de ventas de ESA persona (moduleAccess, no el rol) - eso se sigue
    // validando en cada consulta.
    capableRoles: null,
  },
  {
    id: 'deudas',
    label: 'Deudas de clientes',
    hint: 'Saldos y facturas vencidas',
    tools: ['deuda_por_cliente'],
    capableRoles: RECEIVABLES_READ_ROLES,
    moduleName: 'Cuentas a cobrar',
  },
  {
    id: 'caja',
    label: 'Caja',
    hint: 'Cajas abiertas y cerradas hoy',
    tools: ['saldo_caja'],
    capableRoles: POS_READ_ROLES,
    moduleName: 'Caja',
  },
  {
    id: 'stock',
    label: 'Stock y precios',
    hint: 'Existencias, mínimos y precio de venta',
    tools: ['stock_articulo'],
    capableRoles: null,
  },
  {
    id: 'costos',
    label: 'Costos y márgenes',
    hint: 'Costo de compra y remarca',
    tools: ['costo_articulo'],
    capableRoles: null,
  },
  {
    id: 'compras',
    label: 'Compras y proveedores',
    hint: 'Órdenes pendientes y deuda con proveedores',
    tools: ['compras_resumen'],
    capableRoles: PAYABLES_READ_ROLES,
    moduleName: 'Cuentas a pagar',
  },
  {
    id: 'ayuda',
    label: 'Ayuda de uso de Oplex',
    hint: 'Cómo se hace cada cosa en el sistema',
    tools: [],
    capableRoles: null,
  },
];

// Columnas de la matriz. OWNER/ADMIN no figuran: siempre tienen todo.
export const CONFIGURABLE_ROLES = ['SALES', 'PURCHASES', 'INVENTORY', 'ACCOUNTANT', 'VIEWER'] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export const FULL_ACCESS_ROLES: readonly UserRole[] = ['OWNER', 'ADMIN'];

export type TopicsByRole = Record<AssistantTopicId, ConfigurableRole[]>;

// Lo que se ve prendido si la empresa nunca tocó la pantalla - el mockup
// aprobado (2026-10-18), salvo Caja para Contador/a, que el sistema hoy no
// le permite (ver capableRoles), y con Solo lectura sólo en Ayuda.
export const DEFAULT_TOPICS_BY_ROLE: TopicsByRole = {
  ventas: ['SALES', 'ACCOUNTANT'],
  deudas: ['SALES', 'ACCOUNTANT'],
  caja: [],
  stock: ['SALES', 'PURCHASES', 'INVENTORY'],
  costos: ['PURCHASES', 'ACCOUNTANT'],
  compras: ['PURCHASES', 'INVENTORY', 'ACCOUNTANT'],
  ayuda: ['SALES', 'PURCHASES', 'INVENTORY', 'ACCOUNTANT', 'VIEWER'],
};

export function topicById(id: string): AssistantTopic | undefined {
  return ASSISTANT_TOPICS.find((t) => t.id === id);
}

export function topicForTool(toolName: string): AssistantTopic | undefined {
  return ASSISTANT_TOPICS.find((t) => t.tools.includes(toolName));
}

export function roleCanHaveTopic(role: UserRole, topic: AssistantTopic): boolean {
  return topic.capableRoles === null || topic.capableRoles.includes(role);
}
