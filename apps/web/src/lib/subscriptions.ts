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
  isActive: boolean;
  aiInvoiceScanMonthlyQuota: number | null;
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
