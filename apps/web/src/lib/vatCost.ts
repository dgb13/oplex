import { api } from '@/lib/api';
import { tenantSettingsApi, type TenantTaxCondition } from '@/lib/tenantSettings';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/**
 * "Costo real" (mismo cálculo que realUnitCost en
 * libs/shared/database/src/lib/vat-cost.ts, que es el que guarda la API):
 * Responsable Inscripto recupera el IVA -> costo sin IVA; Monotributo y
 * Exento no -> costo con IVA; sin condición cargada -> tal cual.
 */
export function vatRecoverable(condition: TenantTaxCondition | null | undefined): boolean | null {
  if (!condition) return null;
  return condition === 'RESPONSABLE_INSCRIPTO';
}

export function realUnitCost(
  amount: number,
  includesVat: boolean,
  vatRatePercent: number,
  condition: TenantTaxCondition | null | undefined,
): number {
  const recoverable = vatRecoverable(condition);
  const factor = 1 + vatRatePercent / 100;
  if (recoverable === null || factor === 1) return amount;
  if (recoverable) return includesVat ? amount / factor : amount;
  return includesVat ? amount : amount * factor;
}

/** La condición frente al IVA del tenant (misma query que el resto de la app). */
export function useTaxCondition(): { condition: TenantTaxCondition | null; loaded: boolean } {
  const { data, isSuccess } = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  return { condition: data?.ownTaxCondition ?? null, loaded: isSuccess };
}

export interface TaxOption {
  id: string;
  code: string;
  name: string;
  calculationType: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FORMULA' | 'EXENTO' | 'NO_GRAVADO';
  rate: string | null;
}

export function taxOptionRate(option: TaxOption | undefined | null): number {
  return option?.calculationType === 'PERCENTAGE' && option.rate ? Number(option.rate) : 0;
}

/** Alícuotas vigentes (GET /inventory/tax-options). */
export function useTaxOptions() {
  return useQuery({
    queryKey: ['inventory-tax-options'],
    queryFn: () => api.get<TaxOption[]>('/inventory/tax-options').then((r) => r.data),
  });
}

const MODE_KEY = 'oplex.costIncludesVat';

/** "sin IVA / con IVA" arranca en sin IVA (así pasan las listas los
 * proveedores) y recuerda lo último que eligió esta persona en este
 * navegador. */
export function useCostIncludesVat(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(false);
  useEffect(() => {
    try {
      setValue(localStorage.getItem(MODE_KEY) === '1');
    } catch {
      // Sin acceso a localStorage: queda "sin IVA".
    }
  }, []);
  const update = (next: boolean) => {
    setValue(next);
    try {
      localStorage.setItem(MODE_KEY, next ? '1' : '0');
    } catch {
      // Ignorado a propósito: recordar la elección es sólo una comodidad.
    }
  };
  return [value, update];
}

export const CONDITION_WORD: Record<TenantTaxCondition, string> = {
  RESPONSABLE_INSCRIPTO: 'Responsable Inscripto',
  MONOTRIBUTO: 'monotributista',
  EXENTO: 'exento',
};

export function formatMoney(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
