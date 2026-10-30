import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/** Lo que una cuenta en sólo lectura todavía puede hacer, aparte de leer.
 * Sin argumento: siempre. Con una función: sólo si la request la cumple
 * (p. ej. desactivar un cliente, pero no editarlo). */
export const ALLOW_WHEN_READ_ONLY_KEY = 'allowWhenReadOnly';
export const AllowWhenReadOnly = (when: true | ((request: RequestWithUser) => boolean) = true) =>
  SetMetadata(ALLOW_WHEN_READ_ONLY_KEY, when);

/** Código que la web reconoce para mostrar el aviso con "Ver planes". */
export const SUBSCRIPTION_READ_ONLY_CODE = 'SUBSCRIPTION_READ_ONLY';

// Mismo valor que GUARDS_METADATA de @nestjs/common/constants (lo que guarda @UseGuards).
const GUARDS_METADATA = '__guards__';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const READ_ONLY_STATUSES = new Set(['EXPIRED', 'CANCELLED']);

/**
 * Sólo lectura de verdad (mockup aprobado 2026-10-15): con la suscripción
 * vencida (EXPIRED) o dada de baja, ninguna request que escribe pasa, salvo
 * las marcadas con @AllowWhenReadOnly (entrar, el perfil, pagar, desactivar
 * usuarios o clientes para entrar en Basic Gratis). Antes sólo frenaban los
 * assertCan* de SubscriptionService (facturar, altas, IA, Producción,
 * Tienda) y todo lo demás se podía seguir cargando.
 *
 * Va después de JwtAuthGuard (necesita request.user) y antes del
 * interceptor que abre la transacción del tenant, así que hace su propia
 * consulta corta. El backoffice (PlatformAdminGuard) y las rutas sin
 * usuario (públicas, webhooks) no pasan por acá.
 */
@Injectable()
export class SubscriptionReadOnlyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user?.tenantId || !WRITE_METHODS.has(request.method)) return true;

    const allow = this.reflector.getAllAndOverride<true | ((request: RequestWithUser) => boolean) | undefined>(
      ALLOW_WHEN_READ_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allow === true || (typeof allow === 'function' && allow(request))) return true;
    if (isPlatformAdminRoute(context)) return true;

    const subscription = await withTenantContext(
      this.prisma,
      user.tenantId,
      () => getTenantDb().tenantSubscription.findUnique({ where: { tenantId: user.tenantId }, select: { status: true } }),
      user.sub,
      user.roles,
    );
    if (subscription && READ_ONLY_STATUSES.has(subscription.status)) {
      throw new ForbiddenException({
        statusCode: 403,
        code: SUBSCRIPTION_READ_ONLY_CODE,
        message: 'Tu cuenta está en sólo lectura. Para volver a cargar, elegí un plan en Planes y facturación.',
      });
    }
    return true;
  }
}

function isPlatformAdminRoute(context: ExecutionContext): boolean {
  const guards = [
    ...((Reflect.getMetadata(GUARDS_METADATA, context.getClass()) as unknown[] | undefined) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, context.getHandler()) as unknown[] | undefined) ?? []),
  ];
  return guards.some((guard) => typeof guard === 'function' && guard.name === 'PlatformAdminGuard');
}
