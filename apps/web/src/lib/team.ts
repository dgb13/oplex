import { api } from '@/lib/api';

export type TeamRole = 'OWNER' | 'ADMIN' | 'SALES' | 'PURCHASES' | 'INVENTORY' | 'ACCOUNTANT' | 'VIEWER';
export type TeamMemberStatus = 'ACTIVE' | 'SUSPENDED';

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: TeamRole;
  status: TeamMemberStatus;
  mustChangePassword: boolean;
  createdAt: string;
  isExternalAccountant: boolean;
}

export interface InviteMemberInput {
  email: string;
  role: TeamRole;
}

export interface CreateMemberWithPasswordInput {
  email: string;
  name?: string;
  role: TeamRole;
}

export interface CreatedMemberWithPassword {
  id: string;
  email: string;
  tempPassword: string;
}

export interface AcceptInvitationInput {
  tenantId: string;
  token: string;
  name: string;
  password: string;
}

export const teamApi = {
  list: () => api.get<TeamMember[]>('/users').then((r) => r.data),
  invite: (dto: InviteMemberInput) => api.post<{ ok: true }>('/users/invitations', dto).then((r) => r.data),
  createWithPassword: (dto: CreateMemberWithPasswordInput) =>
    api.post<CreatedMemberWithPassword>('/users', dto).then((r) => r.data),
  changeRole: (id: string, role: TeamRole) =>
    api.patch(`/users/${id}/role`, { role }).then((r) => r.data),
  toggleStatus: (id: string, status: TeamMemberStatus) =>
    api.patch(`/users/${id}/status`, { status }).then((r) => r.data),
  resetPassword: (id: string) => api.post<{ ok: true }>(`/users/${id}/reset-password`).then((r) => r.data),
  acceptInvitation: (dto: AcceptInvitationInput) =>
    api.post<{ ok: true }>('/users/invitations/accept', dto).then((r) => r.data),
};

export const ROLE_LABELS: Record<TeamRole, string> = {
  OWNER: 'Dueño/a',
  ADMIN: 'Admin',
  SALES: 'Ventas',
  PURCHASES: 'Compras',
  INVENTORY: 'Inventario',
  ACCOUNTANT: 'Contador/a',
  VIEWER: 'Solo lectura',
};

// El selector de invitación no ofrece OWNER (se transfiere, no se asigna
// de nuevo) - mismo criterio que el resto de la UI, que nunca deja crear un
// segundo dueño desde un formulario.
export const INVITABLE_ROLES: TeamRole[] = ['ADMIN', 'SALES', 'PURCHASES', 'INVENTORY', 'ACCOUNTANT', 'VIEWER'];
