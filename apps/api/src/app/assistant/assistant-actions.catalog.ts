import type Anthropic from '@anthropic-ai/sdk';
import { COMPANY_ROLE_EDITORS } from '@plexo/companies';
import type { AssistantActionKind, UserRole } from '@plexo/database';
import type { ConfigurableRole } from './assistant-topics.js';

/**
 * Acciones del asistente (etapa 3 de
 * docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md). Regla
 * central: el modelo PROPONE con una herramienta; el servidor valida, arma
 * la vista previa y ejecuta (AssistantActionsService). Ninguna herramienta
 * de acción crea nada por su cuenta.
 *
 * Sólo figuran las acciones ya implementadas - las demás del mockup
 * (cotización, correo, link de pago, preparar factura) se suman acá cuando
 * tienen su ejecutor, nunca antes (no se muestra en la pantalla algo que no
 * hace nada).
 */
export type AssistantActionLevel = 'OFF' | 'DRAFT' | 'DIRECT';

export type AssistantActionId = 'recordatorio' | 'cliente';

export interface AssistantActionDef {
  id: AssistantActionId;
  kind: AssistantActionKind;
  label: string;
  hint: string;
  // Directa sólo para cosas internas que se pueden deshacer; lo que sale a
  // un cliente siempre pide "SÍ".
  allowedLevels: readonly AssistantActionLevel[];
  // Regla fija que se muestra debajo (ej. "nunca se emite en ARCA").
  rule: string | null;
  // Mismo permiso que el endpoint HTTP equivalente. null = cualquier rol.
  capableRoles: readonly UserRole[] | null;
  moduleName?: string;
  tool: Anthropic.Tool;
}

export const ASSISTANT_ACTIONS: AssistantActionDef[] = [
  {
    id: 'recordatorio',
    kind: 'REMINDER_CREATE',
    label: 'Agendar recordatorio o tarea',
    hint: 'En la Agenda de quien lo pide, o como tarea para alguien del equipo.',
    allowedLevels: ['OFF', 'DRAFT', 'DIRECT'],
    rule: null,
    // POST /calendar/events no tiene @Roles.
    capableRoles: null,
    tool: {
      name: 'crear_recordatorio',
      description:
        'Propone agendar un recordatorio en la Agenda de quien habla, o una tarea asignada a otra persona del equipo. NO lo crea: el sistema decide si hace falta que la persona confirme con "SÍ". Calculá la fecha a partir de la fecha de hoy del sistema. Si no dijo hora, no la inventes: dejala vacía (queda para todo el día).',
      input_schema: {
        type: 'object',
        properties: {
          titulo: { type: 'string', description: 'Qué hay que hacer, corto. Ej. "Llamar a Pérez".' },
          fecha: { type: 'string', description: 'Fecha, formato yyyy-mm-dd.' },
          hora: { type: 'string', description: 'Hora en Argentina, formato HH:mm (24 h). Vacío = todo el día.' },
          asignarA: {
            type: 'string',
            description: 'Nombre o email de la persona del equipo a quien se le asigna como tarea. Vacío = para quien lo pide.',
          },
        },
        required: ['titulo', 'fecha'],
      },
    },
  },
  {
    id: 'cliente',
    kind: 'CUSTOMER_CREATE',
    label: 'Cargar cliente nuevo',
    hint: 'Con nombre o CUIT y contacto; con CUIT, los datos fiscales salen de ARCA.',
    allowedLevels: ['OFF', 'DRAFT', 'DIRECT'],
    rule: null,
    capableRoles: COMPANY_ROLE_EDITORS.CUSTOMER,
    moduleName: 'Clientes',
    tool: {
      name: 'cargar_cliente',
      description:
        'Propone dar de alta un cliente nuevo. NO lo crea: el sistema decide si hace falta que la persona confirme con "SÍ". Con CUIT, la razón social, la condición frente al IVA y el domicilio fiscal salen del padrón de ARCA; sin CUIT hace falta el nombre. No inventes datos que la persona no dio.',
      input_schema: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre o razón social, si lo dijo.' },
          cuit: { type: 'string', description: 'CUIT, con o sin guiones, si lo dijo.' },
          email: { type: 'string', description: 'Email de contacto, si lo dijo.' },
          telefono: { type: 'string', description: 'Teléfono, si lo dijo.' },
        },
      },
    },
  },
];

// Lo que se ve si la empresa nunca tocó la pantalla: todo apagado salvo el
// recordatorio en Borrador (decisión del plan: nada que haga cosas se
// prende solo).
export const DEFAULT_ACTION_LEVELS: Record<AssistantActionId, AssistantActionLevel> = {
  recordatorio: 'DRAFT',
  cliente: 'OFF',
};

// Roles que pueden pedirla, del mockup aprobado (OWNER/ADMIN siempre).
export const DEFAULT_ACTION_ROLES: Record<AssistantActionId, ConfigurableRole[]> = {
  recordatorio: ['SALES', 'PURCHASES', 'INVENTORY', 'ACCOUNTANT', 'VIEWER'],
  cliente: ['SALES'],
};

export function actionById(id: string): AssistantActionDef | undefined {
  return ASSISTANT_ACTIONS.find((a) => a.id === id);
}

export function actionByKind(kind: AssistantActionKind): AssistantActionDef | undefined {
  return ASSISTANT_ACTIONS.find((a) => a.kind === kind);
}

export function actionByTool(toolName: string): AssistantActionDef | undefined {
  return ASSISTANT_ACTIONS.find((a) => a.tool.name === toolName);
}

export function roleCanRequestAction(role: UserRole, action: AssistantActionDef): boolean {
  return action.capableRoles === null || action.capableRoles.includes(role);
}
