import { api } from '@/lib/api';

/** Importador de proveedores y clientes (ver CompanyImportService en el backend). */

export type CompanyImportField =
  | 'name'
  | 'taxId'
  | 'taxCondition'
  | 'address'
  | 'phone'
  | 'email'
  | 'website'
  | 'grossIncome'
  | 'industry'
  | 'creditLimit'
  | 'contact'
  | 'contactJob'
  | 'contactEmail'
  | 'contactPhone';
export type CompanyImportFieldOrSkip = CompanyImportField | 'skip';
export type CompanyImportRole = 'CUSTOMER' | 'SUPPLIER';

export const COMPANY_FIELD_OPTIONS: { value: CompanyImportFieldOrSkip; label: string }[] = [
  { value: 'name', label: 'Razón social *' },
  { value: 'taxId', label: 'CUIT' },
  { value: 'taxCondition', label: 'Condición de IVA' },
  { value: 'address', label: 'Domicilio fiscal' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'email', label: 'Email' },
  { value: 'website', label: 'Web' },
  { value: 'grossIncome', label: 'Nº de Ingresos Brutos' },
  { value: 'industry', label: 'Rubro' },
  { value: 'creditLimit', label: 'Límite de crédito (clientes)' },
  { value: 'contact', label: 'Contacto: nombre' },
  { value: 'contactJob', label: 'Contacto: cargo' },
  { value: 'contactEmail', label: 'Contacto: email' },
  { value: 'contactPhone', label: 'Contacto: celular / WhatsApp' },
  { value: 'skip', label: 'No importar' },
];

/** Igual que NO_CONDITION en el backend: la condición de IVA queda vacía. */
export const NO_CONDITION = '__none__';

export interface CompanyImportAnalysis {
  importId: string;
  fileName: string;
  headerRow: number;
  rowCount: number;
  columns: { index: number; header: string; samples: string[]; suggested: CompanyImportFieldOrSkip }[];
}

export interface CompanyImportOptions {
  mapping: CompanyImportFieldOrSkip[];
  roles: CompanyImportRole[];
  onExisting: 'fill' | 'replace' | 'skip';
  verifyArca: boolean;
  conditionValues?: Record<string, string>;
}

export type CompanyRowStatus = 'new' | 'update' | 'skip' | 'error';

export interface CompanyPlanRow {
  rowNumber: number;
  status: CompanyRowStatus;
  messages: string[];
  warnings: string[];
  notes: string[];
  name: string;
  taxId: string | null;
  taxCondition: string | null;
  contact: { firstName: string; lastName: string | null } | null;
  mergedInto: number | null;
}

export interface CompanyImportPreview {
  counts: Record<CompanyRowStatus, number>;
  rows: CompanyPlanRow[];
  conditionValues: { key: string; raw: string; count: number; resolved: string | null }[];
  conditionOptions: string[];
  contacts: number;
  rolesAdded: number;
  missingRequired: string[];
  arca: { total: number; done: number; unavailable: string | null } | null;
}

export interface CompanyImportStatus {
  importId: string;
  state: 'running' | 'done' | 'failed';
  phase: 'arca' | 'saving';
  arcaDone: number;
  arcaTotal: number;
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  contacts: number;
  arcaVerified: number;
  arcaNameMismatch: number;
  error: string | null;
}

function saveBlob(data: Blob, fileName: string) {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export const companyImportApi = {
  analyze: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<CompanyImportAnalysis>('/companies/import', form).then((r) => r.data);
  },
  preview: (importId: string, options: CompanyImportOptions) =>
    api.post<CompanyImportPreview>(`/companies/import/${importId}/preview`, options).then((r) => r.data),
  start: (importId: string, options: CompanyImportOptions) =>
    api.post<CompanyImportStatus>(`/companies/import/${importId}/start`, options).then((r) => r.data),
  status: (importId: string) => api.get<CompanyImportStatus>(`/companies/import/${importId}/status`).then((r) => r.data),
  downloadErrors: async (importId: string, options: CompanyImportOptions) => {
    const res = await api.post(`/companies/import/${importId}/errors`, options, { responseType: 'blob' });
    saveBlob(res.data, 'empresas-con-error.xlsx');
  },
  downloadTemplate: async () => {
    const res = await api.get('/companies/import/template', { responseType: 'blob' });
    saveBlob(res.data, 'plantilla-empresas.xlsx');
  },
  exportCompanies: async (role?: CompanyImportRole) => {
    const res = await api.get('/companies/import/export', { params: role ? { role } : {}, responseType: 'blob' });
    saveBlob(res.data, role === 'CUSTOMER' ? 'clientes.xlsx' : role === 'SUPPLIER' ? 'proveedores.xlsx' : 'empresas.xlsx');
  },
};
