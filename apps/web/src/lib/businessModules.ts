import { api } from '@/lib/api';

/**
 * Módulos que un negocio prende o apaga según su rubro. Espejo de
 * apps/api/src/app/business-templates/business-modules.ts (mismas claves).
 * Artículos, Compras, Facturación y Clientes no están: los usa cualquier
 * negocio, así que no se apagan.
 */
export type BusinessModuleStatus = 'available' | 'upcoming' | 'later';

export interface BusinessModuleDef {
  key: string;
  label: string;
  description: string;
  status: BusinessModuleStatus;
  /** Requiere un plan que lo incluya (ver Plan.productionModuleEnabled / storefrontEnabled). */
  plan?: 'production' | 'storefront';
  /** Ya existía antes de los rubros: un negocio previo sin configurar lo ve
   * prendido. Los nuevos (Fichas...) sólo si el negocio los prende. */
  legacy?: boolean;
}

export const BUSINESS_MODULES: BusinessModuleDef[] = [
  { key: 'caja', label: 'Caja y mostrador', description: 'Ventas rápidas, turnos de caja y cobro con QR.', status: 'available', legacy: true },
  { key: 'presupuestos', label: 'Cotizaciones', description: 'Presupuestos con PDF y envío por WhatsApp o email.', status: 'available', legacy: true },
  { key: 'cuentas-corrientes', label: 'Cuentas a cobrar', description: 'Saldos de clientes, vencimientos y cobranzas.', status: 'available', legacy: true },
  { key: 'agenda', label: 'Agenda y turnos', description: 'Calendario del equipo, turnos y tareas.', status: 'available', legacy: true },
  { key: 'tienda', label: 'Tienda online', description: 'Tu catálogo publicado en la web.', status: 'available', plan: 'storefront', legacy: true },
  { key: 'produccion', label: 'Producción y recetas', description: 'Recetas, órdenes de producción y consumos.', status: 'available', plan: 'production', legacy: true },
  { key: 'fichas', label: 'Fichas del cliente', description: 'Vehículos, equipos, mascotas… con su historial.', status: 'available' },
  { key: 'ordenes-trabajo', label: 'Órdenes de trabajo', description: 'Trabajos con estados, responsable y aviso al cliente.', status: 'available' },
  { key: 'costo-trabajo', label: 'Costo por trabajo', description: 'Repuestos, terceros y horas de cada trabajo, y su margen.', status: 'available' },
  { key: 'vencimientos', label: 'Lotes y vencimientos', description: 'Control de fechas de vencimiento.', status: 'later' },
  { key: 'venta-peso', label: 'Venta por peso', description: 'Precio por kilo y etiquetas de balanza.', status: 'later' },
  { key: 'abonos', label: 'Abonos y cuotas', description: 'Cobros mensuales recurrentes.', status: 'later' },
  { key: 'mesas', label: 'Mesas y comandas', description: 'Salón, mozos y cocina.', status: 'later' },
];

export const BUSINESS_MODULE_LABELS: Record<string, string> = Object.fromEntries(
  BUSINESS_MODULES.map((m) => [m.key, m.label]),
);

export interface BusinessProfile {
  template: {
    key: string;
    name: string;
    family: string;
    iconKey: string;
    version: number;
    notice: string | null;
    modules: string[];
  } | null;
  appliedVersion: number | null;
  pending: boolean;
  modulesConfigured: boolean;
  enabledModules: string[];
}

/** ¿Se ve este módulo? Un negocio sin configurar (los previos a los rubros)
 * ve los módulos que ya existían, como antes; los nuevos no. Mientras carga
 * el perfil, igual. Misma regla que isBusinessModuleEnabled en el API. */
export function isModuleEnabled(profile: BusinessProfile | undefined, key: string): boolean {
  if (!profile || !profile.modulesConfigured) return Boolean(BUSINESS_MODULES.find((m) => m.key === key)?.legacy);
  return profile.enabledModules.includes(key);
}

export interface TemplateAssetField {
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN' | 'VEHICLE_BRAND' | 'VEHICLE_MODEL';
  required?: boolean;
  isIdentifier?: boolean;
  options?: string[];
  vehicleKind?: 'AUTO' | 'MOTO';
}

export interface TemplateStatus {
  name: string;
  final?: boolean;
  notifiesCustomer?: boolean;
  // La orden pasa sola acá cuando el cliente acepta o rechaza el presupuesto.
  quoteOutcome?: 'ACCEPTED' | 'REJECTED';
}

export interface BusinessTemplateConfig {
  modules: string[];
  suggestedCategories: string[];
  defaultWarranty?: string;
  notice?: string;
  assetType?: { name: string; notice?: string; fields: TemplateAssetField[] };
  workOrder?: { docName: string; statuses: TemplateStatus[] };
}

/** "Hay novedades para tu rubro": lo nuevo de la plantilla (etapa 6). */
export type TemplateUpdateItem =
  | { id: string; kind: 'module'; key: string }
  | { id: string; kind: 'category'; name: string }
  | { id: string; kind: 'assetField'; typeName: string; field: TemplateAssetField }
  | {
      id: string;
      kind: 'fieldType';
      typeName: string;
      key: string;
      label: string;
      type: TemplateAssetField['type'];
      vehicleKind?: 'AUTO' | 'MOTO';
    }
  | {
      id: string;
      kind: 'status';
      name: string;
      after: string | null;
      final: boolean;
      notifiesCustomer: boolean;
      quoteOutcome?: 'ACCEPTED' | 'REJECTED';
    }
  | { id: string; kind: 'statusQuote'; name: string; quoteOutcome: 'ACCEPTED' | 'REJECTED' };

export interface TemplateUpdates {
  templateName: string;
  fromVersion: number;
  toVersion: number;
  items: TemplateUpdateItem[];
}

export interface BusinessTemplate {
  id: string;
  key: string;
  name: string;
  family: string;
  iconKey: string;
  sortOrder: number;
  isActive: boolean;
  version: number;
  config: BusinessTemplateConfig;
  updatedAt: string;
}

export interface BusinessTemplateRequest {
  id: string;
  tenantId: string | null;
  tenantName: string | null;
  text: string;
  status: 'NEW' | 'DONE' | 'DISCARDED';
  createdAt: string;
}

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
];

export const businessProfileApi = {
  get: () => api.get<BusinessProfile>('/business-profile').then((r) => r.data),
  choose: (key: string) =>
    api.post<BusinessProfile & { createdCategories: string[] }>('/business-profile/choose', { key }).then((r) => r.data),
  skip: () => api.post<BusinessProfile>('/business-profile/skip').then((r) => r.data),
  updateModules: (enabledModules: string[]) =>
    api.patch<BusinessProfile>('/business-profile/modules', { enabledModules }).then((r) => r.data),
  listTemplates: () => api.get<BusinessTemplate[]>('/business-templates').then((r) => r.data),
  requestTemplate: (text: string) => api.post('/business-templates/requests', { text }).then((r) => r.data),
  pendingUpdates: () => api.get<TemplateUpdates | null>('/business-profile/updates').then((r) => r.data || null),
  applyUpdates: (ids: string[]) =>
    api.post<{ applied: number }>('/business-profile/updates/apply', { ids }).then((r) => r.data),
  dismissUpdates: () => api.post('/business-profile/updates/dismiss').then((r) => r.data),
};

export interface BusinessTemplateInput {
  name: string;
  family: string;
  iconKey: string;
  isActive?: boolean;
  config: {
    modules: string[];
    suggestedCategories: string[];
    defaultWarranty?: string;
    notice?: string;
    // undefined = sin cambios; null = el rubro deja de traer ficha / órdenes.
    assetType?: BusinessTemplateConfig['assetType'] | null;
    workOrder?: BusinessTemplateConfig['workOrder'] | null;
  };
}

export const adminBusinessTemplatesApi = {
  list: () => api.get<BusinessTemplate[]>('/admin/business-templates').then((r) => r.data),
  create: (input: BusinessTemplateInput) =>
    api.post<BusinessTemplate>('/admin/business-templates', input).then((r) => r.data),
  update: (id: string, input: Partial<BusinessTemplateInput>) =>
    api.patch<BusinessTemplate>(`/admin/business-templates/${id}`, input).then((r) => r.data),
  listRequests: () => api.get<BusinessTemplateRequest[]>('/admin/business-templates/requests').then((r) => r.data),
  updateRequest: (id: string, status: BusinessTemplateRequest['status']) =>
    api.patch(`/admin/business-templates/requests/${id}`, { status }).then((r) => r.data),
};
