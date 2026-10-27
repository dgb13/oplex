import { api } from '@/lib/api';
import type { VehicleKind } from '@/lib/customerAssets';

/** /admin › Marcas y modelos. Espejo de apps/api/src/app/vehicle-catalog. */
export interface AdminVehicleBrand {
  id: string;
  vehicleKind: VehicleKind;
  name: string;
  active: boolean;
  reviewed: boolean;
  models: { id: string; name: string; active: boolean; reviewed: boolean }[];
}

export interface VehicleSuggestion {
  id: string;
  vehicleKind: VehicleKind;
  field: 'BRAND' | 'MODEL';
  brandName: string | null;
  /** La marca de la lista a la que pertenece el modelo (null: también está
   * escrita a mano, hay que sumarla primero). */
  brandId: string | null;
  text: string;
  tenants: number;
  updatedAt: string;
}

type ItemPatch = { name?: string; active?: boolean; reviewed?: boolean };

export const adminVehicleCatalogApi = {
  list: async (kind: VehicleKind) =>
    (await api.get<AdminVehicleBrand[]>('/admin/vehicle-catalog', { params: { kind } })).data,
  createBrand: async (kind: VehicleKind, name: string) => (await api.post('/admin/vehicle-catalog/brands', { kind, name })).data,
  updateBrand: async (id: string, patch: ItemPatch) => (await api.patch(`/admin/vehicle-catalog/brands/${id}`, patch)).data,
  createModel: async (brandId: string, name: string) =>
    (await api.post(`/admin/vehicle-catalog/brands/${brandId}/models`, { name })).data,
  updateModel: async (id: string, patch: ItemPatch) => (await api.patch(`/admin/vehicle-catalog/models/${id}`, patch)).data,
  suggestions: async () => (await api.get<VehicleSuggestion[]>('/admin/vehicle-catalog/suggestions')).data,
  addSuggestion: async (id: string) => (await api.post(`/admin/vehicle-catalog/suggestions/${id}/add`)).data,
  mergeSuggestion: async (id: string, targetId: string) =>
    (await api.post(`/admin/vehicle-catalog/suggestions/${id}/merge`, { targetId })).data,
  discardSuggestion: async (id: string) => (await api.post(`/admin/vehicle-catalog/suggestions/${id}/discard`)).data,
};
