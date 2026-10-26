import { api } from '@/lib/api';

/** Fichas del cliente (vehículos, equipos, mascotas...). Espejo de
 * apps/api/src/app/customer-assets. */
export type AssetFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN';

export interface AssetFieldDef {
  key: string;
  label: string;
  type: AssetFieldType;
  required?: boolean;
  isIdentifier?: boolean;
  options?: string[];
  hidden?: boolean;
}

export const ASSET_FIELD_TYPE_LABELS: Record<AssetFieldType, string> = {
  TEXT: 'Texto',
  NUMBER: 'Número',
  DATE: 'Fecha',
  SELECT: 'Lista',
  BOOLEAN: 'Sí / No',
};

export interface CustomerAssetType {
  id: string;
  name: string;
  pluralName: string;
  notice: string | null;
  fields: AssetFieldDef[];
}

export type AssetValues = Record<string, string | number | boolean>;

export interface CustomerAsset {
  id: string;
  typeId: string;
  typeName: string;
  identifier: string;
  values: AssetValues;
  active: boolean;
  company: { id: string; name: string; phone: string | null };
  createdAt: string;
  updatedAt: string;
}

export const customerAssetsApi = {
  listTypes: () => api.get<CustomerAssetType[]>('/customer-assets/types').then((r) => r.data),
  createType: (name: string) => api.post<CustomerAssetType>('/customer-assets/types', { name }).then((r) => r.data),
  updateType: (id: string, input: Partial<Pick<CustomerAssetType, 'name' | 'pluralName' | 'notice' | 'fields'>>) =>
    api.patch<CustomerAssetType>(`/customer-assets/types/${id}`, input).then((r) => r.data),
  list: (params: { q?: string; typeId?: string; companyId?: string; includeInactive?: boolean } = {}) =>
    api
      .get<CustomerAsset[]>('/customer-assets', {
        params: {
          ...(params.q ? { q: params.q } : {}),
          ...(params.typeId ? { typeId: params.typeId } : {}),
          ...(params.companyId ? { companyId: params.companyId } : {}),
          ...(params.includeInactive ? { includeInactive: 'true' } : {}),
        },
      })
      .then((r) => r.data),
  get: (id: string) => api.get<CustomerAsset>(`/customer-assets/${id}`).then((r) => r.data),
  checkIdentifier: (typeId: string, identifier: string, excludeId?: string) =>
    api
      .get<CustomerAsset[]>('/customer-assets/check-identifier', {
        params: { typeId, identifier, ...(excludeId ? { excludeId } : {}) },
      })
      .then((r) => r.data),
  create: (input: { typeId: string; companyId: string; values: AssetValues }) =>
    api.post<CustomerAsset>('/customer-assets', input).then((r) => r.data),
  update: (id: string, input: { values?: AssetValues; companyId?: string; active?: boolean }) =>
    api.patch<CustomerAsset>(`/customer-assets/${id}`, input).then((r) => r.data),
};

/** Valor de un campo para mostrar ("98.500", "Sí", "01/03/2027"). */
export function formatAssetValue(field: AssetFieldDef, value: string | number | boolean | undefined): string {
  if (value === undefined || value === '') return '';
  switch (field.type) {
    case 'NUMBER': {
      // Separador de miles sólo desde 10.000: un año (2017) no lleva punto,
      // los kilómetros (98.500) sí.
      const n = Number(value);
      return Math.abs(n) >= 10000 ? n.toLocaleString('es-AR') : String(n).replace('.', ',');
    }
    case 'BOOLEAN':
      return value === true ? 'Sí' : 'No';
    case 'DATE': {
      const [y, m, d] = String(value).split('-');
      return d && m && y ? `${d}/${m}/${y}` : String(value);
    }
    default:
      return String(value);
  }
}

/** Resumen de una ficha para listas: los primeros datos cargados que no son
 * el principal ("Volkswagen · Gol Trend · 2017"). */
export function assetSummary(type: CustomerAssetType | undefined, asset: CustomerAsset, max = 3): string {
  if (!type) return '';
  return type.fields
    .filter((f) => !f.isIdentifier && !f.hidden && f.type !== 'BOOLEAN')
    .map((f) => formatAssetValue(f, asset.values[f.key]))
    .filter(Boolean)
    .slice(0, max)
    .join(' · ');
}

/** "Patente" -> "patente", "N° de serie / IMEI" -> "n° de serie / IMEI":
 * para usar un nombre de campo dentro de una frase sin romper las siglas. */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
