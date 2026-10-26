/**
 * Módulos que un negocio puede prender o apagar según su rubro (ver
 * BusinessTemplate en el schema y el plan
 * docs/planesdemodulos/plan-rubros-fichas-ordenes-trabajo.md).
 *
 * - available: existe hoy; apagarlo lo saca del menú (no borra datos).
 *   legacy: los que ya existían antes de los rubros - un negocio previo sin
 *   configurar los ve prendidos. Los módulos nuevos (Fichas...) sólo se ven
 *   si el negocio los prende o los trae su rubro.
 * - upcoming: está en el plan (etapas 3 a 5); un rubro lo puede traer
 *   prendido y queda guardado para cuando salga, pero todavía no se toca.
 * - later: "Más adelante", fuera de este plan.
 *
 * Artículos, Compras, Facturación y Clientes NO están acá a propósito: los
 * usa cualquier negocio (un estudio contable carga sus servicios como
 * artículos y registra facturas de compra por el IVA), así que no se apagan.
 *
 * Espejo de apps/web/src/lib/businessModules.ts - mismas claves.
 */
export const BUSINESS_MODULES = [
  { key: 'caja', status: 'available', legacy: true },
  { key: 'presupuestos', status: 'available', legacy: true },
  { key: 'cuentas-corrientes', status: 'available', legacy: true },
  { key: 'agenda', status: 'available', legacy: true },
  { key: 'tienda', status: 'available', legacy: true },
  { key: 'produccion', status: 'available', legacy: true },
  { key: 'fichas', status: 'available', legacy: false },
  { key: 'ordenes-trabajo', status: 'available', legacy: false },
  { key: 'costo-trabajo', status: 'upcoming' },
  { key: 'vencimientos', status: 'later' },
  { key: 'venta-peso', status: 'later' },
  { key: 'abonos', status: 'later' },
  { key: 'mesas', status: 'later' },
] as const;

export type BusinessModuleKey = (typeof BUSINESS_MODULES)[number]['key'];

export const BUSINESS_MODULE_KEYS: readonly string[] = BUSINESS_MODULES.map((m) => m.key);

/** Los que hoy se pueden prender/apagar desde Rubro y módulos. */
export const AVAILABLE_MODULE_KEYS: readonly string[] = BUSINESS_MODULES.filter((m) => m.status === 'available').map(
  (m) => m.key,
);

/** Lo que ve prendido un negocio previo a los rubros (modulesConfigured =
 * false): los módulos que ya existían, no los nuevos. */
export const LEGACY_MODULE_KEYS: readonly string[] = BUSINESS_MODULES.filter((m) => 'legacy' in m && m.legacy).map(
  (m) => m.key,
);

/** ¿El negocio usa este módulo? Misma regla que isModuleEnabled en la web. */
export function isBusinessModuleEnabled(
  settings: { modulesConfigured: boolean; enabledModules: string[] } | null | undefined,
  key: string,
): boolean {
  if (!settings?.modulesConfigured) return LEGACY_MODULE_KEYS.includes(key);
  return settings.enabledModules.includes(key);
}

/** Familias del catálogo, en el orden en que se muestran. */
export const BUSINESS_FAMILIES = [
  'Comercio',
  'Alimentos',
  'Moda y hogar',
  'Automotor',
  'Servicio técnico',
  'Producción y oficios',
  'Construcción e instalaciones',
  'Gastronomía',
  'Salud',
  'Belleza y bienestar',
  'Mascotas y agro',
  'Servicios profesionales',
  'Educación y deporte',
  'Alquileres, eventos y turismo',
  'Transporte',
  'Otro',
] as const;
