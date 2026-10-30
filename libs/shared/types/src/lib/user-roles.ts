import type { UserRole } from './auth-user.js';

/**
 * Varios roles por usuario (docs/planesdemodulos/plan-varios-roles-por-usuario.md):
 * una persona puede lo que permita cualquiera de sus roles. Toda pregunta de
 * "¿puede?" pasa por acá - nunca comparar contra un único rol.
 */
export function hasAnyRole(roles: readonly UserRole[] | null | undefined, allowed: readonly UserRole[]): boolean {
  return (roles ?? []).some((role) => allowed.includes(role));
}

/** Dueño/a o Admin: ya pueden todo, por eso no se combinan con otros roles. */
export function isOwnerOrAdmin(roles: readonly UserRole[] | null | undefined): boolean {
  return hasAnyRole(roles, ['OWNER', 'ADMIN']);
}

/** Roles que van solos: Dueño/a y Admin porque ya pueden todo, Solo lectura
 * porque mezclado con otro rol dejaría de ser sólo lectura. */
export const EXCLUSIVE_ROLES: readonly UserRole[] = ['OWNER', 'ADMIN', 'VIEWER'];

/** Cómo se llama cada rol en pantalla y en los correos (igual que ROLE_LABELS
 * de la web, apps/web/src/lib/team.ts). */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Dueño/a',
  ADMIN: 'Admin',
  SALES: 'Ventas',
  PURCHASES: 'Compras',
  INVENTORY: 'Inventario',
  ACCOUNTANT: 'Contador/a',
  VIEWER: 'Solo lectura',
};

/** "Ventas, Inventario". */
export function formatRoles(roles: readonly UserRole[]): string {
  return roles.map((role) => USER_ROLE_LABELS[role]).join(', ');
}

/** Orden fijo para guardar y mostrar (el mismo del enum). */
const ROLE_ORDER: readonly UserRole[] = ['OWNER', 'ADMIN', 'SALES', 'PURCHASES', 'INVENTORY', 'ACCOUNTANT', 'VIEWER'];

export type RolesValidation = { ok: true; roles: UserRole[] } | { ok: false; error: string };

/**
 * Valida y ordena una lista de roles a guardar: no vacía, sin repetidos, y
 * un rol exclusivo (Dueño/a, Admin, Solo lectura) sólo puede ir solo.
 */
export function normalizeRoles(input: readonly UserRole[]): RolesValidation {
  const unique = ROLE_ORDER.filter((role) => input.includes(role));
  if (unique.length === 0) return { ok: false, error: 'Elegí al menos un rol' };
  const exclusive = unique.find((role) => EXCLUSIVE_ROLES.includes(role));
  if (exclusive && unique.length > 1) {
    return { ok: false, error: 'Dueño/a, Admin y Solo lectura no se combinan con otros roles' };
  }
  return { ok: true, roles: unique };
}
