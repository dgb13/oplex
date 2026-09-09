import type Anthropic from '@anthropic-ai/sdk';
import type { AuthenticatedUser } from '@plexo/types';
import type { AssistantToolsService, VentasPorArticuloParams } from './assistant-tools.service.js';

/**
 * Catálogo de herramientas ofrecido a Claude (docs/plan-asistente-ia-conversacional.md,
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
      'Busca artículos por nombre o SKU (coincidencia parcial) y devuelve, por cada variante encontrada, el stock total disponible y el stock mínimo configurado. Usar para preguntas como "tenemos parlantes", "cuánto stock queda de X" o "está bajo mínimo tal producto".',
    input_schema: {
      type: 'object',
      properties: {
        nombreOSku: { type: 'string', description: 'Texto a buscar en el nombre o SKU del artículo, ej. "parlante".' },
      },
      required: ['nombreOSku'],
    },
  },
];

// Etiqueta liviana en español que el widget muestra mientras la
// herramienta corre (docs/plan-asistente-ia-conversacional.md, sección 7:
// "mostrar de forma liviana 'consultando ventas…'"), en vez del nombre
// técnico de la tool. Un fallback genérico cubre cualquier tool nueva que
// se agregue al catálogo sin agregarla acá.
export const ASSISTANT_TOOL_LABELS: Record<string, string> = {
  ventas_por_articulo: 'Consultando ventas…',
  deuda_por_cliente: 'Consultando cuentas a cobrar…',
  saldo_caja: 'Consultando caja…',
  stock_articulo: 'Consultando stock…',
};

export function labelForTool(toolName: string): string {
  return ASSISTANT_TOOL_LABELS[toolName] ?? 'Consultando…';
}

export interface ToolExecutionResult {
  content: string;
  isError: boolean;
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
  toolName: string,
  input: unknown,
): Promise<ToolExecutionResult> {
  try {
    const result = await dispatch(toolsService, user, toolName, input);
    return { content: JSON.stringify(result), isError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido ejecutando la herramienta';
    return { content: message, isError: true };
  }
}

function dispatch(
  toolsService: AssistantToolsService,
  user: AuthenticatedUser,
  toolName: string,
  input: unknown,
): Promise<unknown> {
  switch (toolName) {
    case 'ventas_por_articulo':
      return toolsService.ventasPorArticulo(user, (input ?? {}) as VentasPorArticuloParams);
    case 'deuda_por_cliente':
      return toolsService.deudaPorCliente(user);
    case 'saldo_caja':
      return toolsService.saldoCaja(user);
    case 'stock_articulo':
      return toolsService.stockArticulo(user, (input as { nombreOSku?: string } | undefined)?.nombreOSku ?? '');
    default:
      throw new Error(`Herramienta desconocida: "${toolName}"`);
  }
}
