import { api } from '@/lib/api';

export type MembershipDirection = 'CLIENT_INVITED' | 'ACCOUNTANT_REQUESTED';
export type MembershipStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';

// "Mi cartera" (lado estudio): homeTenantId = mi tenant, sin importar en
// qué tenant cliente vive cada fila - ver GET /memberships.
export interface StudioMembershipSummary {
  id: string;
  clientTenantId: string;
  clientTenantName: string;
  direction: MembershipDirection;
  status: MembershipStatus;
  inviteeIdentifier: string | null;
  createdAt: string;
  respondedAt: string | null;
  // Vacío = visible para todo el estudio (default) - ver reparto de
  // cartera, docs/plan_modulo_contadores.txt Fase 2 punto 4.
  assignedStudioUserIds: string[];
}

// "Mis contadores" (lado cliente): tenantId = mi tenant - ver
// GET /memberships/as-client.
export interface ClientMembershipSummary {
  id: string;
  homeTenantId: string;
  homeTenantName: string;
  direction: MembershipDirection;
  status: MembershipStatus;
  inviteeIdentifier: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export interface PortfolioDeadlineSummary {
  id: string;
  kind: string;
  dueDate: string;
  description: string;
}

export interface PortfolioClientSummary {
  membershipId: string;
  clientTenantId: string;
  clientTenantName: string;
  ownTaxCondition: string | null;
  invoicesThisMonth: number;
  upcomingDeadlines: PortfolioDeadlineSummary[];
}

export interface ActivateMembershipResult {
  accessToken: string;
  expiresAt: string;
}

export const membershipsApi = {
  listMine: () => api.get<StudioMembershipSummary[]>('/memberships').then((r) => r.data),
  listAsClient: () => api.get<ClientMembershipSummary[]>('/memberships/as-client').then((r) => r.data),
  getPortfolio: () => api.get<PortfolioClientSummary[]>('/memberships/portfolio').then((r) => r.data),
  activate: (id: string) => api.post<ActivateMembershipResult>(`/memberships/${id}/activate`).then((r) => r.data),
  invite: (identifier: string) =>
    api.post<StudioMembershipSummary>('/memberships/invite', { identifier }).then((r) => r.data),
  request: (identifier: string) =>
    api.post<StudioMembershipSummary>('/memberships/request', { identifier }).then((r) => r.data),
  respond: (id: string, decision: 'ACCEPTED' | 'DECLINED') =>
    api.post<StudioMembershipSummary>(`/memberships/${id}/respond`, { decision }).then((r) => r.data),
  revoke: (id: string) => api.post<StudioMembershipSummary>(`/memberships/${id}/revoke`).then((r) => r.data),
  setAssignments: (id: string, studioUserIds: string[]) =>
    api.put<void>(`/memberships/${id}/assignments`, { studioUserIds }).then((r) => r.data),
};

// --- Vencimientos impositivos (carga manual, ver TaxDeadlineService) ---

export type TaxDeadlineKind = 'IVA' | 'MONOTRIBUTO' | 'IIBB' | 'GANANCIAS' | 'OTRO';
export type TaxDeadlineStatus = 'PENDING' | 'DONE';

export const TAX_DEADLINE_KIND_LABELS: Record<TaxDeadlineKind, string> = {
  IVA: 'IVA',
  MONOTRIBUTO: 'Monotributo',
  IIBB: 'IIBB',
  GANANCIAS: 'Ganancias',
  OTRO: 'Otro',
};

export interface TaxDeadline {
  id: string;
  kind: TaxDeadlineKind;
  dueDate: string;
  description: string;
  status: TaxDeadlineStatus;
  createdByUserId: string;
  createdAt: string;
}

export interface CreateTaxDeadlineInput {
  kind: TaxDeadlineKind;
  dueDate: string;
  description: string;
}

export const taxDeadlinesApi = {
  list: (status?: TaxDeadlineStatus) =>
    api.get<TaxDeadline[]>('/taxes/deadlines', { params: { status } }).then((r) => r.data),
  create: (dto: CreateTaxDeadlineInput) => api.post<TaxDeadline>('/taxes/deadlines', dto).then((r) => r.data),
  markDone: (id: string) => api.post<TaxDeadline>(`/taxes/deadlines/${id}/done`).then((r) => r.data),
};

// --- Config de SuperAdmin: duración de la sesión de membership ---

export interface MembershipSettings {
  membershipSessionDurationHours: number;
}

export const adminMembershipSettingsApi = {
  getSettings: () => api.get<MembershipSettings>('/admin/membership-settings').then((r) => r.data),
  updateSettings: (hours: number) =>
    api.patch<MembershipSettings>('/admin/membership-settings', { membershipSessionDurationHours: hours }).then((r) => r.data),
};
