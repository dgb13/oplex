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

export interface BackupSettings {
  frequencyHours: number;
  hour: number;
  keepLocal: number;
  keepOffsiteDays: number;
}

export interface DiskUsage {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
}

export interface OffsiteRun {
  at: string;
  ok: boolean;
  error: string | null;
  durationSec: number;
  dump: string;
  uploadedDumps: number;
  uploadedFiles: number;
  movedFiles: number;
}

export interface OffsiteStatus {
  configured: boolean;
  ok: boolean | null;
  error: string | null;
  finishedAt: string | null;
  durationSec: number | null;
  keepDays: number | null;
  lastSuccessAt: string | null;
  dumps: Array<{ name: string; sizeBytes: number; modifiedAt: string }> | null;
  files: { count: number; bytes: number } | null;
  deletedFiles: { count: number; bytes: number } | null;
  bucketBytes: number | null;
  runs: OffsiteRun[];
}

export interface OpsAlert {
  id: string;
  kind: string;
  subject: string;
  message: string;
  sentAt: string;
}

export interface BackupsOverview {
  settings: BackupSettings;
  offsite: OffsiteStatus;
  disk: DiskUsage;
  localBackupsBytes: number;
  databaseBytes: number | null;
  alerts: OpsAlert[];
  recipients: string[];
  thresholds: {
    diskPercent: number;
    r2AlertBytes: number;
    r2FreeTierBytes: number;
    cpuPercent: number;
    memoryPercent: number;
  };
}

export const adminBackupsApi = {
  list: (limit = 30) => api.get<DatabaseBackup[]>('/admin/backups', { params: { limit } }).then((r) => r.data),
  overview: () => api.get<BackupsOverview>('/admin/backups/overview').then((r) => r.data),
  updateSettings: (patch: Partial<BackupSettings>) =>
    api.patch<BackupSettings>('/admin/backups/settings', patch).then((r) => r.data),
};

export interface ServerSnapshot {
  takenAt: string;
  cpu: { percent: number; cores: number; load1: number; load5: number; load15: number };
  memory: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    usedPercent: number;
    swapTotalBytes: number;
    swapUsedBytes: number;
  };
  disk: DiskUsage;
  uptime: { serverSince: string; appSince: string };
  facts: {
    publicIp: string | null;
    location: string | null;
    os: string | null;
    kernel: string;
    hostname: string | null;
    version: string | null;
    databaseBytes: number | null;
    timeZone: string;
  };
}

export interface ServerMetricPoint {
  takenAt: string;
  cpuPercent: number;
  memPercent: number;
}

export const adminServerApi = {
  snapshot: () => api.get<ServerSnapshot>('/admin/server').then((r) => r.data),
  history: (range: '24h' | '7d') =>
    api.get<ServerMetricPoint[]>('/admin/server/history', { params: { range } }).then((r) => r.data),
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
  /** Sólo presente en el item 'whatsapp' - ver AdminSystemStatusService.getStatus. */
  linksCount?: number;
}

export interface LiveTokenCheckResult {
  valid: boolean;
  detail?: string;
}

export interface WhatsAppLinkSummary {
  phoneE164: string;
  userEmail: string;
  tenantName: string;
  linkedAt: string;
  messageCount: number;
  /** Consumo del cupo mensual del Asistente de IA del TENANT (no de este
   * número puntual) - ver el doc comment de WhatsAppLinkSummary del lado
   * del backend (AdminSystemStatusService). planQuota null = el plan no
   * incluye el Asistente de IA. */
  planName: string;
  planQuota: number | null;
  planUsed: number;
}

export const adminSystemStatusApi = {
  getStatus: () => api.get<SystemStatusItem[]>('/admin/system-status').then((r) => r.data),
  listWhatsAppLinks: () =>
    api.get<WhatsAppLinkSummary[]>('/admin/system-status/whatsapp/links').then((r) => r.data),
  // Chequeo en vivo, opt-in - ver el doc comment de
  // AdminSystemStatusService.verifyWhatsAppToken (apps/api) para por qué
  // esto no es parte de getStatus().
  verifyWhatsApp: () =>
    api.post<LiveTokenCheckResult>('/admin/system-status/whatsapp/verify').then((r) => r.data),
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
  annualDiscountPercent: string;
  isActive: boolean;
  slaMarkdown: string | null;
  slaUpdatedAt: string | null;
  aiInvoiceScanMonthlyQuota: number | null;
  aiAssistantMonthlyQueryQuota: number | null;
  // Módulo de Producción - on/off puro, sin cupo mensual.
  productionModuleEnabled: boolean;
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
  annualDiscountPercent?: number;
  isActive?: boolean;
  slaMarkdown?: string;
  // null = sacar al plan de "Carga de comprobantes IA" (no incluida).
  aiInvoiceScanMonthlyQuota?: number | null;
  // null = sacar al plan del Asistente de IA conversacional (no incluido).
  aiAssistantMonthlyQueryQuota?: number | null;
  // Módulo de Producción - on/off puro, sin cupo mensual.
  productionModuleEnabled?: boolean;
}

export type UpdatePlanInput = Partial<Omit<CreatePlanInput, 'key'>>;

// Conecta AdminPlansController (@plexo/subscriptions), ya funcional del lado
// del backend desde la sesión del SaaS Engine pero sin frontend hasta ahora.
export interface AiInvoiceScanSettings {
  aiInvoiceScanEnabled: boolean;
}

// "Escaneo IA" en Admin - kill-switch global, mismo GET+PATCH que
// adminMembershipSettingsApi (apps/web/src/lib/memberships.ts).
export const adminAiInvoiceScanApi = {
  getSettings: () => api.get<AiInvoiceScanSettings>('/admin/ai-invoice-scan-settings').then((r) => r.data),
  updateSettings: (enabled: boolean) =>
    api.patch<AiInvoiceScanSettings>('/admin/ai-invoice-scan-settings', { enabled }).then((r) => r.data),
};

export interface AssistantSettings {
  assistantDisplayName: string | null;
  assistantRateLimitWindowMinutes: number;
  assistantRateLimitMaxMessages: number;
}

export interface UpdateAssistantSettingsInput {
  assistantDisplayName?: string | null;
  assistantRateLimitWindowMinutes?: number;
  assistantRateLimitMaxMessages?: number;
}

export interface UnansweredQuestion {
  id: string;
  tenantName: string;
  question: string | null;
  answer: string;
  createdAt: string;
}

// Nombre + rate limit del Asistente de IA conversacional - configurable
// sin deploy (ver docs/planesdemodulos/plan-asistente-ia-conversacional.md, secciones 1 y
// 8.2), mismo GET+PATCH que adminAiInvoiceScanApi de arriba.
export const adminAssistantApi = {
  getSettings: () => api.get<AssistantSettings>('/admin/assistant-settings').then((r) => r.data),
  updateSettings: (patch: UpdateAssistantSettingsInput) =>
    api.patch<AssistantSettings>('/admin/assistant-settings', patch).then((r) => r.data),
  // Preguntas de "datos" que el asistente respondió sin llamar a ninguna
  // herramienta - señal de qué agregar al catálogo, ver
  // AssistantSettingsService.getUnansweredQuestions().
  getUnansweredQuestions: () => api.get<UnansweredQuestion[]>('/admin/assistant-settings/unanswered-questions').then((r) => r.data),
};

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

// Padrón de ARCA con el certificado de Oplex - ver ArcaPadronService (API).
export interface ArcaPadronStatus {
  configured: boolean;
  env: 'HOMOLOGACION' | 'PRODUCCION';
  certAlias: string | null;
  cuit: string | null;
  certExpiresAt: string | null;
  ticketExpiresAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckMessage: string | null;
  queriesThisMonth: number;
}

export interface ArcaPadronTestResult {
  ok: boolean;
  message: string;
  ms: number;
  person: {
    name: string;
    taxConditionLabel: string | null;
    fiscalAddress: string | null;
  } | null;
}

export const adminArcaPadronApi = {
  getStatus: () => api.get<ArcaPadronStatus>('/admin/arca-padron').then((r) => r.data),
  test: (cuit: string) => api.post<ArcaPadronTestResult>('/admin/arca-padron/test', { cuit }).then((r) => r.data),
  uploadCertificate: (certPem: string, keyPem: string) =>
    api.post<ArcaPadronStatus>('/admin/arca-padron/certificate', { certPem, keyPem }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Suscripciones (cobro de planes) - ver SubscriptionBillingService.

export type SubscriptionStatusValue = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED';
export type SubscriptionPaymentMethodValue = 'MP_DEBIT' | 'TRANSFER' | 'CASH' | 'OTHER';
export type SubscriptionPaymentStatusValue = 'PENDING' | 'PAID' | 'REJECTED' | 'REFUNDED';

export interface SubscriptionPaymentRow {
  id: string;
  method: SubscriptionPaymentMethodValue;
  status: SubscriptionPaymentStatusValue;
  months: number;
  periodStart: string;
  periodEnd: string;
  listPrice: string;
  discountAmount: string;
  netAmount: string;
  vatAmount: string;
  total: string;
  reference: string | null;
  receiptUrl: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  plan: { key: string; name: string };
}

export interface TenantSubscriptionRow {
  tenantId: string;
  tenantName: string;
  planKey: string;
  planName: string;
  status: SubscriptionStatusValue;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  paymentMethod: SubscriptionPaymentMethodValue | null;
  pendingPayment: SubscriptionPaymentRow | null;
}

export interface RecordSubscriptionPaymentInput {
  planKey: string;
  months: number;
  method: 'TRANSFER' | 'CASH' | 'OTHER';
  reference?: string;
  total?: number;
}

export const adminSubscriptionsApi = {
  list: () => api.get<TenantSubscriptionRow[]>('/admin/subscriptions').then((r) => r.data),
  payments: (tenantId: string) =>
    api.get<SubscriptionPaymentRow[]>(`/admin/subscriptions/${tenantId}/payments`).then((r) => r.data),
  recordPayment: (tenantId: string, dto: RecordSubscriptionPaymentInput) =>
    api.post(`/admin/subscriptions/${tenantId}/payments`, dto).then((r) => r.data),
  confirm: (tenantId: string, paymentId: string) =>
    api.post(`/admin/subscriptions/${tenantId}/payments/${paymentId}/confirm`).then((r) => r.data),
  reject: (tenantId: string, paymentId: string) =>
    api.post(`/admin/subscriptions/${tenantId}/payments/${paymentId}/reject`).then((r) => r.data),
  extendTrial: (tenantId: string, days: number) =>
    api.post(`/admin/subscriptions/${tenantId}/extend-trial`, { days }).then((r) => r.data),
  changePlan: (tenantId: string, planKey: string) =>
    api.post(`/admin/subscriptions/${tenantId}/plan`, { planKey }).then((r) => r.data),
};

export interface OplexBankDetailsInput {
  holder: string | null;
  cuit: string | null;
  bankName: string | null;
  cbu: string | null;
  alias: string | null;
}

export const adminOplexBankApi = {
  get: () => api.get<OplexBankDetailsInput>('/admin/subscriptions/oplex-bank').then((r) => r.data),
  update: (dto: OplexBankDetailsInput) =>
    api.patch<OplexBankDetailsInput>('/admin/subscriptions/oplex-bank', dto).then((r) => r.data),
};
