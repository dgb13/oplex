import { api } from '@/lib/api';

export type TenantStatus = 'ACTIVE' | 'SUSPENDED';

export interface TenantSummary {
  id: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
  activeUsers: number;
  invoicesThisMonth: number;
  planKey: string | null;
  subscriptionStatus: string | null;
}

export interface TenantUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export interface ImpersonateResult {
  accessToken: string;
  expiresAt: string;
}

export const adminTenantsApi = {
  list: () => api.get<TenantSummary[]>('/admin/tenants').then((r) => r.data),
  listUsers: (tenantId: string) =>
    api.get<TenantUserSummary[]>(`/admin/tenants/${tenantId}/users`).then((r) => r.data),
  updateStatus: (tenantId: string, status: TenantStatus) =>
    api.patch(`/admin/tenants/${tenantId}/status`, { status }).then((r) => r.data),
  impersonate: (tenantId: string, userId: string) =>
    api.post<ImpersonateResult>(`/admin/tenants/${tenantId}/impersonate`, { userId }).then((r) => r.data),
};

export interface AdminActivityEntry {
  id: string;
  occurredAt: string;
  tenantId: string;
  tenantName: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  ip: string | null;
  outcome: string;
  errorMessage: string | null;
}

export interface AdminActivityPage {
  items: AdminActivityEntry[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ListActivityParams {
  page?: number;
  pageSize?: number;
  tenantId?: string;
  from?: string;
  to?: string;
}

export const adminAuditApi = {
  list: (params: ListActivityParams = {}) =>
    api.get<AdminActivityPage>('/admin/audit', { params }).then((r) => r.data),
};

export interface SystemErrorLog {
  id: string;
  statusCode: number;
  message: string;
  stack: string | null;
  path: string;
  method: string;
  tenantId: string | null;
  userId: string | null;
  createdAt: string;
}

export interface ListErrorsParams {
  limit?: number;
  tenantId?: string;
  statusCodeMin?: number;
  from?: string;
  to?: string;
}

export const adminErrorsApi = {
  list: (params: ListErrorsParams = {}) =>
    api.get<SystemErrorLog[]>('/admin/errors', { params }).then((r) => r.data),
};

export type BackupStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface DatabaseBackup {
  id: string;
  status: BackupStatus;
  filePath: string | null;
  sizeBytes: number | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export const adminBackupsApi = {
  list: (limit = 30) => api.get<DatabaseBackup[]>('/admin/backups', { params: { limit } }).then((r) => r.data),
};

export interface MercadoPagoMetrics {
  paymentIntentsByStatus: Record<string, number>;
  connectorsByStatus: Record<string, number>;
  webhooks: {
    totalLast7Days: number;
    invalidSignatureLast7Days: number;
    invalidSignatureRate: number;
    avgProcessingLatencyMs: number | null;
  };
}

export interface MercadoPagoWebhookEvent {
  id: string;
  externalId: string;
  type: string;
  signatureOk: boolean;
  processed: boolean;
  tenantId: string | null;
  receivedAt: string;
  processedAt: string | null;
  error: string | null;
}

export const adminMercadoPagoApi = {
  getMetrics: () => api.get<MercadoPagoMetrics>('/admin/mercadopago/metrics').then((r) => r.data),
  listFailedWebhookEvents: (limit = 100) =>
    api
      .get<MercadoPagoWebhookEvent[]>('/admin/mercadopago/webhook-events', { params: { limit } })
      .then((r) => r.data),
};

export interface SystemStatusItem {
  key: string;
  label: string;
  configured: boolean;
  detail?: string;
}

export const adminSystemStatusApi = {
  getStatus: () => api.get<SystemStatusItem[]>('/admin/system-status').then((r) => r.data),
};

export interface AdminPlan {
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
}

export interface CreatePlanInput {
  key: string;
  name: string;
  sortOrder?: number;
  priceMonthly: number;
  maxUsers: number;
  maxClients: number;
  maxMonthlyInvoices: number;
  debitDiscountPercent?: number;
  isActive?: boolean;
}

export type UpdatePlanInput = Partial<Omit<CreatePlanInput, 'key'>>;

// Conecta AdminPlansController (@plexo/subscriptions), ya funcional del lado
// del backend desde la sesión del SaaS Engine pero sin frontend hasta ahora.
export const adminPlansApi = {
  listAll: () => api.get<AdminPlan[]>('/admin/plans').then((r) => r.data),
  create: (dto: CreatePlanInput) => api.post<AdminPlan>('/admin/plans', dto).then((r) => r.data),
  update: (id: string, dto: UpdatePlanInput) => api.patch<AdminPlan>(`/admin/plans/${id}`, dto).then((r) => r.data),
};

export interface BnaSyncSettings {
  bnaSyncEnabled: boolean;
  bnaSyncHour: number;
}

export interface BnaSyncResult {
  synced: number;
  skipped: number;
}

// Cotización oficial USD sincronizada una sola vez para toda la plataforma
// (no por tenant, ver ExchangeRateSchedulerService) - horario/on-off vive
// acá en Admin, no en Preferencias de cada tenant.
export const adminBnaSyncApi = {
  getSettings: () => api.get<BnaSyncSettings>('/admin/bna-sync').then((r) => r.data),
  updateSettings: (dto: Partial<{ enabled: boolean; hour: number }>) =>
    api.patch<BnaSyncSettings>('/admin/bna-sync', dto).then((r) => r.data),
  syncNow: () => api.post<BnaSyncResult>('/admin/bna-sync/sync-now').then((r) => r.data),
};

export interface PriceIndexSyncSettings {
  ipcSyncEnabled: boolean;
  ipcSyncHour: number;
}

export interface PriceIndexSyncResult {
  synced: number;
  skippedManual: number;
}

export type PriceIndexSource = 'API_ARGENTINADATOS' | 'MANUAL';

export interface PriceIndexEntry {
  id: string;
  period: string;
  monthlyVariationPct: string;
  indexValue: string;
  source: PriceIndexSource;
  updatedAt: string;
}

// Índice de inflación (IPC) sincronizado una sola vez para toda la
// plataforma (no por tenant, ver PriceIndexSchedulerService - es un único
// dato nacional) - horario/on-off vive acá en Admin, mismo criterio que
// Cotizaciones USD arriba.
export const adminPriceIndexSyncApi = {
  getSettings: () => api.get<PriceIndexSyncSettings>('/admin/price-index-sync').then((r) => r.data),
  updateSettings: (dto: Partial<{ enabled: boolean; hour: number }>) =>
    api.patch<PriceIndexSyncSettings>('/admin/price-index-sync', dto).then((r) => r.data),
  syncNow: () => api.post<PriceIndexSyncResult>('/admin/price-index-sync/sync-now').then((r) => r.data),
  listPeriods: () => api.get<PriceIndexEntry[]>('/admin/price-index-sync/periods').then((r) => r.data),
  upsertPeriod: (period: string, variationPct: number) =>
    api.post<PriceIndexEntry>('/admin/price-index-sync/periods', { period, variationPct }).then((r) => r.data),
};
