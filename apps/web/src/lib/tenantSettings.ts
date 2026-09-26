import { api } from '@/lib/api';

export type EmailSenderMode = 'SHARED' | 'CUSTOM_DOMAIN';
export type ReminderTone = 'FRIENDLY' | 'NEUTRAL' | 'FIRM';
export type AfipEnvironment = 'HOMOLOGACION' | 'PRODUCCION';
export type TenantTaxCondition = 'RESPONSABLE_INSCRIPTO' | 'MONOTRIBUTO' | 'EXENTO';

export interface TenantSettings {
  arReminderIntervalDays: number | null;
  emailSenderMode: EmailSenderMode;
  emailFromName: string | null;
  emailFromLocalPart: string | null;
  emailCustomDomain: string | null;
  domainStatus: string | null;
  reminderTone: ReminderTone;
  reminderCcEmail: string | null;
  withholdingAgentIncomeTax: boolean;
  withholdingAgentVat: boolean;
  withholdingAgentGrossIncome: boolean;
  afipEnv: AfipEnvironment;
  afipConfigured: boolean;
  afipCertExpiresAt: string | null;
  // Nombre ("nombre simbólico" en WSASS) del certificado cargado.
  afipCertAlias: string | null;
  // Clave generada por Oplex esperando el certificado de ARCA.
  afipHasPendingKey: boolean;
  afipPendingCsr: string | null;
  afipPendingAlias: string | null;
  // Último "Probar conexión con ARCA".
  afipLastCheckAt: string | null;
  afipLastCheckOk: boolean | null;
  afipLastCheckMessage: string | null;
  ownTaxCondition: TenantTaxCondition | null;
  fiscalAddress: string | null;
  grossIncomeNumber: string | null;
  activityStartDate: string | null;
  defaultMarkupPercent: number | null;
  tenantTaxId: string | null;
}

export interface ReminderStatus {
  recurringEnabled: boolean;
  arReminderIntervalDays: number | null;
  nextCronRunAt: string;
}

export interface ReminderSweepResult {
  becomingOverdue: number;
  recurring: number;
}

export interface DomainRecord {
  record: string;
  name: string;
  value: string;
  type: string;
  ttl: string;
  status: string;
}

export interface DomainRegistrationResult {
  status: string;
  records: DomainRecord[];
}

export const tenantSettingsApi = {
  get: () => api.get<TenantSettings>('/tenant-settings').then((r) => r.data),
  update: (
    dto: Partial<{
      arReminderIntervalDays: number | null;
      emailSenderMode: EmailSenderMode;
      emailFromName: string;
      emailFromLocalPart: string;
      reminderTone: ReminderTone;
      reminderCcEmail: string | null;
      withholdingAgentIncomeTax: boolean;
      withholdingAgentVat: boolean;
      withholdingAgentGrossIncome: boolean;
      ownTaxCondition: TenantTaxCondition | null;
      fiscalAddress: string | null;
      grossIncomeNumber: string | null;
      activityStartDate: string | null;
      defaultMarkupPercent: number | null;
    }>,
  ) => api.patch<TenantSettings>('/tenant-settings', dto).then((r) => r.data),
};

export const tenantInfoApi = {
  update: (taxId: string) =>
    api.patch<TenantSettings>('/tenant-settings/tenant-info', { taxId }).then((r) => r.data),
};

export type AfipFileKind = 'CERTIFICATE' | 'CSR' | 'PRIVATE_KEY' | 'UNKNOWN';

export interface AfipFileInspection {
  kind: AfipFileKind;
  certificate: {
    alias: string | null;
    cuit: string | null;
    issuer: string | null;
    env: AfipEnvironment;
    expiresAt: string;
    cuitMatches: boolean | null;
    matchesPendingKey: boolean | null;
  } | null;
}

export interface ArcaCheckResult {
  ok: boolean;
  problem: 'NOT_CONFIGURED' | 'NOT_AUTHORIZED' | 'CERTIFICATE' | 'NETWORK' | 'OTHER' | null;
  message: string;
  pointOfSale: number | null;
  documentLetter: string | null;
  lastNumber: number | null;
  checkedAt: string;
}

export const afipCertificateApi = {
  // keyPem opcional: sin ella se usa la clave que generó Oplex (paso 2).
  // env opcional: se deduce del certificado.
  upload: (dto: { certPem: string; keyPem?: string; env?: AfipEnvironment }) =>
    api.post<TenantSettings>('/tenant-settings/afip-certificate', dto).then((r) => r.data),
  generateCsr: (alias?: string) =>
    api.post<TenantSettings>('/tenant-settings/afip-certificate/generate-csr', { alias }).then((r) => r.data),
  inspect: (text: string) =>
    api.post<AfipFileInspection>('/tenant-settings/afip-certificate/inspect', { text }).then((r) => r.data),
  check: () => api.post<ArcaCheckResult>('/invoicing/arca/check').then((r) => r.data),
  remove: () =>
    api.delete<TenantSettings>('/tenant-settings/afip-certificate').then((r) => r.data),
};

export const emailDomainApi = {
  register: (domain: string) =>
    api.post<DomainRegistrationResult>('/tenant-settings/email-domain', { domain }).then((r) => r.data),
  verify: () =>
    api.post<DomainRegistrationResult>('/tenant-settings/email-domain/verify').then((r) => r.data),
};

export const remindersApi = {
  getStatus: () => api.get<ReminderStatus>('/receivables/reminders/status').then((r) => r.data),
  runNow: () => api.post<ReminderSweepResult>('/receivables/reminders/run-now').then((r) => r.data),
  reset: () => api.post<{ reset: number }>('/receivables/reminders/reset').then((r) => r.data),
};
