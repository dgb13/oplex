import { Global, Injectable, Module } from '@nestjs/common';
import { USER_ROLES_LOADER, type UserRolesLoader } from '@plexo/auth';
import { getTenantDb, PrismaService, withTenantContext, type UserRole } from '@plexo/database';

// Cuánto vale lo leído: un cambio de rol hecho en otra instancia de la API
// tarda como mucho esto en aplicarse (en la misma, al instante: invalidate).
const CACHE_TTL_MS = 10_000;

/**
 * Roles actuales de quien hace el pedido, para JwtAuthGuard (ver
 * UserRolesLoader): así cambiar los roles de alguien en Configuración ›
 * Equipo, o suspenderlo, se aplica en el momento y no recién cuando vuelve a
 * iniciar sesión (decisión del plan de varios roles, 2026-10-30). Una
 * consulta por usuario cada CACHE_TTL_MS como mucho.
 */
@Injectable()
export class CurrentUserRolesService implements UserRolesLoader {
  private readonly cache = new Map<string, { roles: UserRole[] | null; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async load(tenantId: string, userId: string): Promise<UserRole[] | null> {
    const key = `${tenantId}:${userId}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.roles;

    const user = await withTenantContext(this.prisma, tenantId, () =>
      getTenantDb().user.findFirst({ where: { id: userId, tenantId }, select: { roles: true, status: true } }),
    );
    const roles = user && user.status === 'ACTIVE' && user.roles.length > 0 ? user.roles : null;
    this.cache.set(key, { roles, expiresAt: Date.now() + CACHE_TTL_MS });
    return roles;
  }

  /** Después de cambiarle los roles o el estado a alguien. */
  invalidate(tenantId: string, userId: string): void {
    this.cache.delete(`${tenantId}:${userId}`);
  }
}

@Global()
@Module({
  providers: [CurrentUserRolesService, { provide: USER_ROLES_LOADER, useExisting: CurrentUserRolesService }],
  exports: [CurrentUserRolesService, USER_ROLES_LOADER],
})
export class CurrentUserRolesModule {}
