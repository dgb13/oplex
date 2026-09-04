import type { QueryClient } from '@tanstack/react-query';

const HOME_TOKEN_KEY = 'membershipHomeToken';
const TOKEN_KEY = 'token';
const TENANT_ID_KEY = 'tenantId';
const EXPIRES_AT_KEY = 'membershipExpiresAt';
const CLIENT_NAME_KEY = 'membershipClientName';

interface RouterLike {
  push: (href: string) => void;
}

/** Deliberadamente independiente de lib/impersonation.ts (claves propias,
 * no reusa `adminToken`/`impersonationExpiresAt`): son dos conceptos
 * distintos - un SuperAdmin operando como cualquier usuario de cualquier
 * tenant (impersonate) vs. un contador con su PROPIA identidad entrando a
 * un cliente de su cartera vía una membership ACCEPTED (activate) - ver
 * docs/plan_modulo_contadores.txt, punto 2. Mismo mecanismo de swap de
 * token, pero nunca deben pisarse entre sí si algún día coinciden (ej. un
 * SuperAdmin que también es OWNER de un estudio contable). */
export function isMembershipSession(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem(HOME_TOKEN_KEY);
}

export function membershipClientName(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(CLIENT_NAME_KEY) : null;
}

/** Llamado desde /accountants tras POST /memberships/:id/activate. */
export function startMembershipSession(
  queryClient: QueryClient,
  router: RouterLike,
  accessToken: string,
  expiresAt: string,
  clientTenantName: string,
): void {
  const currentToken = localStorage.getItem(TOKEN_KEY);
  if (currentToken) {
    localStorage.setItem(HOME_TOKEN_KEY, currentToken);
  }
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(EXPIRES_AT_KEY, expiresAt);
  localStorage.setItem(CLIENT_NAME_KEY, clientTenantName);
  localStorage.removeItem(TENANT_ID_KEY);
  queryClient.clear();
  router.push('/dashboard');
}

/** Restaura el token del estudio y vuelve a /accountants - usado por el
 * botón "Volver a mi cartera" y, vía api.ts, por un 401 (sesión de
 * membership vencida). */
export function endMembershipSession(queryClient: QueryClient, router: RouterLike): void {
  const homeToken = localStorage.getItem(HOME_TOKEN_KEY);
  if (homeToken) {
    localStorage.setItem(TOKEN_KEY, homeToken);
  }
  localStorage.removeItem(HOME_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem(CLIENT_NAME_KEY);
  queryClient.clear();
  router.push('/accountants');
}
