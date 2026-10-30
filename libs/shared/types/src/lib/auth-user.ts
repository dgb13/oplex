export type UserRole =
  | 'OWNER'
  | 'ADMIN'
  | 'SALES'
  | 'PURCHASES'
  | 'INVENTORY'
  | 'ACCOUNTANT'
  | 'VIEWER';

export interface ModuleAccessClaim {
  module: string;
  canRead: boolean;
  canWrite: boolean;
}

/**
 * Shape of the JWT payload / `request.user`, once the auth module verifies
 * the token. moduleAccess is only populated for restricted roles (e.g.
 * ACCOUNTANT) — OWNER/ADMIN bypass it entirely, see ModuleAccessGuard.
 */
export interface AuthenticatedUser {
  sub: string;
  tenantId: string;
  email: string;
  // Varios roles por usuario: preguntar siempre con hasAnyRole (user-roles.ts).
  // JwtAuthGuard los relee de la base en cada pedido (con un caché corto),
  // así un cambio de rol se aplica sin volver a iniciar sesión.
  roles: UserRole[];
  moduleAccess: ModuleAccessClaim[];
  // True for a user invited with a temporary password (see
  // UsersService.inviteUser) who hasn't changed it yet - MustChangePasswordGuard
  // blocks everything except the routes marked @AllowWhenPasswordChangeRequired().
  mustChangePassword: boolean;
  // Only present on a short-lived impersonation token (see
  // AuthService.impersonate) - purely informational, no guard reads this.
  // The frontend uses it to know whose identity is "really" behind the
  // active session (see ImpersonationBanner).
  impersonatedBy?: { id: string; email: string };
  // Not a UserRole, not a separate account - purely an email allowlist check
  // (see isPlatformAdminEmail/PLATFORM_ADMIN_EMAILS), stamped onto the token
  // once at issuance so the frontend can decide where to redirect after
  // login without a second round-trip. No guard reads this off the JWT;
  // PlatformAdminGuard re-checks the email server-side on every request.
  // Optional (like impersonatedBy) so existing mock AuthenticatedUser
  // literals in tests across the codebase don't all need updating.
  isPlatformAdmin?: boolean;
}
