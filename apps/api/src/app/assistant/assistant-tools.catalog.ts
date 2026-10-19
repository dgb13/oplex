import type Anthropic from '@anthropic-ai/sdk';
import type { AuthenticatedUser } from '@plexo/types';
import type { AssistantAccess } from './assistant-access.service.js';
import { ASSISTANT_ACTIONS } from './assistant-actions.catalog.js';
import type { AssistantToolsService, VentasPorArticuloParams } from './assistant-tools.service.js';
import { topicForTool } from './assistant-topics.js';

/**
 * Catálogo de herramientas ofrecido a Claude (docs/planesdemodulos/plan-asistente-ia-conversacional.md,
 * sección 5.1) - un `Tool` de Anthropic por método de AssistantToolsService.
 * A propósito, ninguna herramienta define `tenantId` ni `userId` en su
 * `input_schema`: esos valores nunca los provee el modelo, siempre vienen
 * del `AuthenticatedUser` de la request (ver `execute` más abajo).
 */
export const ASSISTANT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'ventas_por_articulo',
    description:
      'Devuelve el ranking de artículos más vendidos (cantidad e importe) en un rango de fechas, neteando notas de crédito. Usar para preguntas como "qué se vendió más" o "ventas del último mes por producto".',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'Fecha de inicio del rango, formato ISO yyyy-mm-dd. Opcional.' },
        hasta: { type: 'string', description: 'Fecha de fin del rango, formato ISO yyyy-mm-dd. Opcional.' },
        limite: { type: 'integer', description: 'Máximo de artículos a devolver, ordenados por importe descendente. Opcional.' },
      },
    },
  },
  {
    name: 'deuda_por_cliente',
    description:
      'Devuelve la antigüedad de saldos (aging) de Cuentas a Cobrar: cuánto debe cada cliente y hace cuánto. Usar para preguntas como "qué clientes me deben" o "quién está vencido".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'saldo_caja',
    description:
      'Devuelve la posición de caja consolidada en vivo: cajas abiertas con su total esperado, y el resumen de las cerradas hoy. Usar para preguntas como "cuánto tengo en caja ahora".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'stock_articulo',
    description:
      'Busca artículos por nombre o SKU (coincidencia parcial) y devuelve, por cada variante encontrada, el precio de venta, el stock total disponible y el stock mínimo configurado. Usar para preguntas como "tenemos parlantes", "cuánto stock queda de X", "está bajo mínimo tal producto" o "cuánto sale/cuesta X".',
    input_schema: {
      type: 'object',
      properties: {
        nombreOSku: { type: 'string', description: 'Texto a buscar en el nombre o SKU del artículo, ej. "parlante".' },
      },
      required: ['nombreOSku'],
    },
  },
  {
    name: 'costo_articulo',
    description:
      'Busca artículos por nombre o SKU (coincidencia parcial, hasta 5) y devuelve, por variante, el precio de venta, el último costo de compra (con su fecha), el costo promedio ponderado, la ganancia por unidad y la remarca sobre el costo en %. Usar para preguntas como "cuánto me cuesta X", "qué margen le saco a X" o "a cuánto lo compré". Si ultimoCosto es null, todavía no hay ninguna compra registrada de esa variante: decilo, no lo estimes.',
    input_schema: {
      type: 'object',
      properties: {
        nombreOSku: { type: 'string', description: 'Texto a buscar en el nombre o SKU del artículo, ej. "cemento".' },
      },
      required: ['nombreOSku'],
    },
  },
  {
    name: 'compras_resumen',
    description:
      'Devuelve la deuda con proveedores (antigüedad de saldos de Cuentas a Pagar, los 15 mayores y cuántos proveedores tienen deuda) y las órdenes de compra enviadas que todavía tienen mercadería pendiente de recibir, con lo que falta de cada artículo. Usar para preguntas como "cuánto le debemos a los proveedores", "a quién le debo" o "qué compras faltan llegar".',
    input_schema: { type: 'object', properties: {} },
  },
];

// Etiqueta liviana en español que el widget muestra mientras la
// herramienta corre (docs/planesdemodulos/plan-asistente-ia-conversacional.md, sección 7:
// "mostrar de forma liviana 'consultando ventas…'"), en vez del nombre
// técnico de la tool. Un fallback genérico cubre cualquier tool nueva que
// se agregue al catálogo sin agregarla acá.
export const ASSISTANT_TOOL_LABELS: Record<string, string> = {
  ventas_por_articulo: 'Consultando ventas…',
  deuda_por_cliente: 'Consultando cuentas a cobrar…',
  saldo_caja: 'Consultando caja…',
  stock_articulo: 'Consultando stock…',
  costo_articulo: 'Consultando costos…',
  compras_resumen: 'Consultando compras…',
  crear_recordatorio: 'Preparando el recordatorio…',
  cargar_cliente: 'Preparando el alta del cliente…',
  crear_cotizacion: 'Armando la cotización…',
  enviar_cotizacion_por_correo: 'Preparando el envío…',
  mandar_link_de_pago: 'Buscando la factura…',
  preparar_factura: 'Preparando la factura…',
};

// Nombre corto de cada herramienta para el detalle del Historial de
// Preferencias › Asistente ("Herramientas: deuda por cliente") - distinto
// del de arriba, que es un gerundio para mientras corre.
export const ASSISTANT_TOOL_TITLES: Record<string, string> = {
  ventas_por_articulo: 'ventas por artículo',
  deuda_por_cliente: 'deuda por cliente',
  saldo_caja: 'saldo de caja',
  stock_articulo: 'stock y precio de artículos',
  costo_articulo: 'costo y remarca de artículos',
  compras_resumen: 'compras y deuda con proveedores',
  crear_recordatorio: 'agendar recordatorio',
  cargar_cliente: 'cargar cliente',
  crear_cotizacion: 'crear cotización',
  enviar_cotizacion_por_correo: 'enviar cotización por correo',
  mandar_link_de_pago: 'mandar link de pago',
  preparar_factura: 'preparar factura',
};

export function labelForTool(toolName: string): string {
  return ASSISTANT_TOOL_LABELS[toolName] ?? 'Consultando…';
}

export interface ToolExecutionResult {
  content: string;
  isError: boolean;
  // El objeto devuelto por el Service ANTES de stringificarlo para el
  // tool_result de Claude - el orquestador lo reenvía tal cual al frontend
  // como evento `tool_result` (docs/planesdemodulos/plan-asistente-ia-conversacional.md,
  // sección 5.3: tabla/mini-gráfico embebido) para no tener que
  // parsear de nuevo el JSON del lado del cliente. `undefined` en error.
  raw?: unknown;
}

/**
 * Ejecuta una tool call por nombre - la ÚNICA superficie por la que el
 * orquestador (Fase 1) le pide datos reales al Service de negocio. Nunca
 * ejecuta código arbitrario ni SQL: es un switch cerrado sobre el catálogo
 * de arriba, cada rama delega en un método ya existente y probado de
 * AssistantToolsService (que a su vez ya valida rol/moduleAccess). Un
 * `ForbiddenException` de esa validación se atrapa acá y se devuelve como
 * `tool_result` con `isError: true` - Claude lo puede explicar en lenguaje
 * natural al usuario en vez de que la request entera reviente con un 500.
 */
export async function executeAssistantTool(
  toolsService: AssistantToolsService,
  user: AuthenticatedUser,
  access: AssistantAccess,
  toolName: string,
  input: unknown,
): Promise<ToolExecutionResult> {
  // El orquestador ya le ofrece al modelo sólo las herramientas permitidas
  // (toolsForAccess) - esto es la segunda capa, por si alguna vez llega
  // igual un tool_use de una que no estaba en la lista.
  if (!access.allowedTools.has(toolName)) {
    const topic = topicForTool(toolName);
    return {
      content: `Sin permiso para consultar "${topic?.label ?? toolName}" con el rol de esta persona en esta empresa.`,
      isError: true,
    };
  }
  try {
    const result = await dispatch(toolsService, user, access, toolName, input);
    return { content: JSON.stringify(result), isError: false, raw: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido ejecutando la herramienta';
    return { content: message, isError: true };
  }
}

function dispatch(
  toolsService: AssistantToolsService,
  user: AuthenticatedUser,
  access: AssistantAccess,
  toolName: string,
  input: unknown,
): Promise<unknown> {
  switch (toolName) {
    case 'ventas_por_articulo':
      return toolsService.ventasPorArticulo(user, (input ?? {}) as VentasPorArticuloParams, access.scope);
    case 'deuda_por_cliente':
      return toolsService.deudaPorCliente(user, access.scope);
    case 'saldo_caja':
      return toolsService.saldoCaja(user);
    case 'stock_articulo':
      return toolsService.stockArticulo(user, (input as { nombreOSku?: string } | undefined)?.nombreOSku ?? '');
    case 'costo_articulo':
      return toolsService.costoArticulo(user, (input as { nombreOSku?: string } | undefined)?.nombreOSku ?? '');
    case 'compras_resumen':
      return toolsService.comprasResumen(user);
    default:
      throw new Error(`Herramienta desconocida: "${toolName}"`);
  }
}

/** Las herramientas que se le ofrecen al modelo en este turno: sólo las de
 * los temas que la persona tiene permitidos, más las acciones que puede
 * pedir (que no ejecutan nada: proponen, ver AssistantActionsService). */
export function toolsForAccess(access: AssistantAccess): Anthropic.Tool[] {
  return [...ASSISTANT_TOOLS, ...ASSISTANT_ACTIONS.map((action) => action.tool)].filter((tool) =>
    access.allowedTools.has(tool.name),
  );
}
