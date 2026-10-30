import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { isBusinessModuleEnabled } from './business-modules.js';

const MODULE_KEY = 'business-module';

/** Marca un controller como parte de un módulo de rubro (ver business-modules.ts). */
export const BusinessModule = (key: string) => SetMetadata(MODULE_KEY, key);

/**
 * Corta el API de los módulos NUEVOS (Fichas, Órdenes de trabajo...) si el
 * negocio no los usa. Los módulos que ya existían no lo llevan: apagarlos
 * sólo los saca del menú (ver plan-rubros-fichas-ordenes-trabajo.md, sección 4).
 * Los guards corren antes que TenantContextInterceptor, así que abre su
 * propio contexto, igual que SubscriptionReadOnlyGuard.
 */
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<string | undefined>(MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (!key) return true;
    const user = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthenticatedUser }>().user;
    if (!user?.tenantId) return true;
    const settings = await withTenantContext(
      this.prisma,
      user.tenantId,
      () => getTenantDb().tenantSettings.findUnique({ where: { tenantId: user.tenantId } }),
      user.sub,
      user.roles,
    );
    if (!isBusinessModuleEnabled(settings, key)) {
      throw new ForbiddenException('Este módulo está apagado. Se prende en tu menú de usuario → Rubro y módulos.');
    }
    return true;
  }
}
