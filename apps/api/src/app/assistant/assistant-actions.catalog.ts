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
 * Sólo figuran las acciones ya implementadas - "preparar factura" se suma
 * acá cuando tenga su ejecutor, nunca antes (no se muestra en la pantalla
 * algo que no hace nada).
 */
export type AssistantActionLevel = 'OFF' | 'DRAFT' | 'DIRECT';

export type AssistantActionId = 'recordatorio' | 'cliente' | 'cotizacion' | 'correo' | 'link';

// Mismo WRITE_ROLES que QuoteController (crear y enviar cotizaciones).
const QUOTE_WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;
// Mismo WRITE_ROLES que MercadoPagoPaymentLinksController.
const PAYMENT_LINK_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

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
  {
    id: 'cotizacion',
    kind: 'QUOTE_CREATE',
    label: 'Crear cotización',
    hint: 'Busca el cliente y los artículos, usa el precio de venta de cada uno y la deja numerada.',
    // Sin Directa: una cotización queda numerada con la serie de quien la
    // pide, mejor que alguien vea antes qué se va a armar.
    allowedLevels: ['OFF', 'DRAFT'],
    rule: null,
    capableRoles: QUOTE_WRITE_ROLES,
    moduleName: 'Cotizaciones',
    tool: {
      name: 'crear_cotizacion',
      description:
        'Propone armar una cotización para un cliente con artículos y cantidades. NO la crea: el sistema busca el cliente y los artículos, toma el precio de venta de cada uno y pide confirmación. Pasá el nombre del artículo como lo dijo la persona, sin la cantidad ni la unidad ("cemento", no "10 bolsas de cemento"). Si el sistema devuelve varias opciones, preguntale cuál. Sólo pedí enviarla por correo si la persona lo pidió.',
      input_schema: {
        type: 'object',
        properties: {
          cliente: { type: 'string', description: 'Nombre o CUIT del cliente.' },
          lineas: {
            type: 'array',
            description: 'Artículos y cantidades.',
            items: {
              type: 'object',
              properties: {
                articulo: { type: 'string', description: 'Nombre o SKU del artículo.' },
                cantidad: { type: 'number', description: 'Cantidad, mayor a cero.' },
              },
              required: ['articulo', 'cantidad'],
            },
          },
          enviarPorCorreo: { type: 'boolean', description: 'true si pidió que se la mande al cliente por correo.' },
          notas: { type: 'string', description: 'Observaciones para la cotización, si las dijo.' },
        },
        required: ['cliente', 'lineas'],
      },
    },
  },
  {
    id: 'correo',
    kind: 'QUOTE_EMAIL',
    label: 'Enviar una cotización por correo',
    hint: 'Manda una cotización ya armada, con su PDF, al correo del cliente.',
    allowedLevels: ['OFF', 'DRAFT'],
    rule: 'Sale a un cliente: siempre pide “SÍ”.',
    capableRoles: QUOTE_WRITE_ROLES,
    moduleName: 'Cotizaciones',
    tool: {
      name: 'enviar_cotizacion_por_correo',
      description:
        'Propone mandar por correo al cliente una cotización que ya existe, por su número. NO la manda: el sistema pide confirmación. Sale al correo cargado en la ficha del cliente.',
      input_schema: {
        type: 'object',
        properties: {
          numero: { type: 'string', description: 'Número de la cotización, ej. "MR-000045" o "45".' },
        },
        required: ['numero'],
      },
    },
  },
  {
    id: 'link',
    kind: 'PAYMENT_LINK',
    label: 'Mandar link de pago',
    hint: 'Link de Mercado Pago por el saldo de una factura, al correo del cliente.',
    allowedLevels: ['OFF', 'DRAFT'],
    // Decisión del usuario (2026-10-19): el link le llega al cliente para
    // que lo pague él. Por correo, porque el número de WhatsApp es el de
    // Oplex y no puede escribirle a terceros.
    rule: 'Sale a un cliente: siempre pide “SÍ”. Va por correo al email de la ficha del cliente.',
    capableRoles: PAYMENT_LINK_ROLES,
    moduleName: 'Mercado Pago',
    tool: {
      name: 'mandar_link_de_pago',
      description:
        'Propone mandarle al cliente, por correo, el link de Mercado Pago para pagar el saldo de una factura. NO lo manda: el sistema busca la factura y pide confirmación. Si hay varias facturas con ese número, preguntá cuál (letra, punto de venta o cliente).',
      input_schema: {
        type: 'object',
        properties: {
          factura: { type: 'string', description: 'Número de factura como lo dijo, ej. "120", "A 3-120" o "00003-00000120".' },
          cliente: { type: 'string', description: 'Nombre del cliente, si lo dijo (sirve para distinguir facturas).' },
        },
        required: ['factura'],
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
  cotizacion: 'OFF',
  correo: 'OFF',
  link: 'OFF',
};

// Roles que pueden pedirla, del mockup aprobado (OWNER/ADMIN siempre).
export const DEFAULT_ACTION_ROLES: Record<AssistantActionId, ConfigurableRole[]> = {
  recordatorio: ['SALES', 'PURCHASES', 'INVENTORY', 'ACCOUNTANT', 'VIEWER'],
  cliente: ['SALES'],
  cotizacion: ['SALES'],
  correo: ['SALES'],
  link: ['SALES'],
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
