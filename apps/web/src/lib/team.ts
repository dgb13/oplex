import { api } from '@/lib/api';

export type TeamRole = 'OWNER' | 'ADMIN' | 'SALES' | 'PURCHASES' | 'INVENTORY' | 'ACCOUNTANT' | 'VIEWER';
export type TeamMemberStatus = 'ACTIVE' | 'SUSPENDED';

export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  roles: TeamRole[];
  status: TeamMemberStatus;
  mustChangePassword: boolean;
  createdAt: string;
  isExternalAccountant: boolean;
}

export interface InviteMemberInput {
  email: string;
  roles: TeamRole[];
}

export interface CreateMemberWithPasswordInput {
  email: string;
  name?: string;
  roles: TeamRole[];
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
  changeRoles: (id: string, roles: TeamRole[]) =>
    api.patch(`/users/${id}/roles`, { roles }).then((r) => r.data),
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

/** Varios roles por usuario (docs/planesdemodulos/plan-varios-roles-por-usuario.md):
 * se puede lo que permita cualquiera de los roles. Mismo criterio que
 * hasAnyRole de @plexo/types en la API. */
export function hasAnyRole(roles: readonly string[] | null | undefined, allowed: readonly string[]): boolean {
  return (roles ?? []).some((role) => allowed.includes(role));
}

/** Dueño/a o Admin: pueden todo. */
export function isOwnerOrAdmin(roles: readonly string[] | null | undefined): boolean {
  return hasAnyRole(roles, ['OWNER', 'ADMIN']);
}

/** Dueño/a, Admin y Solo lectura van solos (igual que normalizeRoles en la API). */
export const EXCLUSIVE_ROLES: readonly TeamRole[] = ['OWNER', 'ADMIN', 'VIEWER'];

/** "Ventas, Inventario". */
export function formatRoles(roles: readonly string[] | null | undefined): string {
  return (roles ?? []).map((role) => ROLE_LABELS[role as TeamRole] ?? role).join(', ');
}
