import { api } from '@/lib/api';

export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED';

export interface Plan {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  priceMonthly: string;
  maxUsers: number;
  maxClients: number;
  maxMonthlyInvoices: number;
  debitDiscountPercent: string;
  annualDiscountPercent: string;
  isActive: boolean;
  aiInvoiceScanMonthlyQuota: number | null;
  aiAssistantMonthlyQueryQuota: number | null;
  // Módulo de Producción - on/off puro, sin cupo mensual. Ver
  // SubscriptionService.assertCanUseProduction() en el backend.
  productionModuleEnabled: boolean;
}

export interface TenantSubscription {
  id: string;
  tenantId: string;
  planId: string;
  plan: Plan;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  paymentMethod: string | null;
  promoLabel: string | null;
  promoDiscountPercent: string | null;
  promoExpiresAt: string | null;
}

export interface PlanSla {
  key: string;
  name: string;
  slaMarkdown: string | null;
  slaUpdatedAt: string | null;
}

// Público - no requiere sesión (usado en el landing/onboarding además de
// dentro de la app, ver /settings/billing).
export const plansApi = {
  list: () => api.get<Plan[]>('/plans').then((r) => r.data),
  // Público, consumido por /sla/[planKey] - contenido editable desde
  // /admin/plans (campo "SLA"), no el catálogo comercial completo.
  getSla: (key: string) => api.get<PlanSla>(`/plans/${key}/sla`).then((r) => r.data),
};

export const subscriptionsApi = {
  getCurrent: () => api.get<TenantSubscription>('/subscriptions/me').then((r) => r.data),
};

/** Mismo cálculo que computeSubscriptionCharge en @plexo/subscriptions (el
 * backend es el que vale; esto es sólo para mostrar el importe antes de
 * pagar). Precios sin IVA: descuento y después IVA 21%. 12 meses = descuento
 * anual; débito automático mensual = descuento por débito; no se suman. */
export const SUBSCRIPTION_VAT_PERCENT = 21;
export const SUBSCRIPTION_MONTH_OPTIONS = [1, 3, 6, 12] as const;

export interface SubscriptionCharge {
  listPrice: number;
  discountPercent: number;
  discountAmount: number;
  netAmount: number;
  vatAmount: number;
  total: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function computeSubscriptionCharge(
  plan: Pick<Plan, 'priceMonthly' | 'debitDiscountPercent' | 'annualDiscountPercent'>,
  method: 'MP_DEBIT' | 'TRANSFER' | 'CASH' | 'OTHER',
  months: number,
): SubscriptionCharge {
  const listPrice = round2(Number(plan.priceMonthly) * months);
  const discountPercent =
    months === 12 ? Number(plan.annualDiscountPercent) : method === 'MP_DEBIT' && months === 1 ? Number(plan.debitDiscountPercent) : 0;
  const discountAmount = round2((listPrice * discountPercent) / 100);
  const netAmount = round2(listPrice - discountAmount);
  const vatAmount = round2((netAmount * SUBSCRIPTION_VAT_PERCENT) / 100);
  return { listPrice, discountPercent, discountAmount, netAmount, vatAmount, total: round2(netAmount + vatAmount) };
}

export function formatPesos(value: number | string): string {
  return `$ ${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
