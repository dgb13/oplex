import type { UserRole } from '@plexo/types';

/**
 * Lo implementa apps/api (tiene la base): devuelve los roles actuales de un
 * usuario activo, o null si ya no existe o está suspendido. Con él,
 * JwtAuthGuard pisa los roles del token en cada pedido y un cambio de rol se
 * aplica sin volver a iniciar sesión. Sin él (tests, otras apps) quedan los
 * roles del token.
 */
export interface UserRolesLoader {
  load(tenantId: string, userId: string): Promise<UserRole[] | null>;
}

export const USER_ROLES_LOADER = Symbol('USER_ROLES_LOADER');
