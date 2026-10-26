/**
 * Módulos que un negocio puede prender o apagar según su rubro (ver
 * BusinessTemplate en el schema y el plan
 * docs/planesdemodulos/plan-rubros-fichas-ordenes-trabajo.md).
 *
 * - available: existe hoy; apagarlo lo saca del menú (no corta el API ni
 *   borra datos).
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
  { key: 'caja', status: 'available' },
  { key: 'presupuestos', status: 'available' },
  { key: 'cuentas-corrientes', status: 'available' },
  { key: 'agenda', status: 'available' },
  { key: 'tienda', status: 'available' },
  { key: 'produccion', status: 'available' },
  { key: 'fichas', status: 'upcoming' },
  { key: 'ordenes-trabajo', status: 'upcoming' },
  { key: 'costo-trabajo', status: 'upcoming' },
  { key: 'vencimientos', status: 'later' },
  { key: 'venta-peso', status: 'later' },
  { key: 'abonos', status: 'later' },
  { key: 'mesas', status: 'later' },
] as const;

export type BusinessModuleKey = (typeof BUSINESS_MODULES)[number]['key'];

export const BUSINESS_MODULE_KEYS: readonly string[] = BUSINESS_MODULES.map((m) => m.key);

/** Los que hoy se pueden prender/apagar desde Configuración → Módulos. */
export const AVAILABLE_MODULE_KEYS: readonly string[] = BUSINESS_MODULES.filter((m) => m.status === 'available').map(
  (m) => m.key,
);

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
