import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser, UserRole } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { USER_ROLES_LOADER, type UserRolesLoader } from './user-roles-loader.js';

/** Tokens emitidos antes de varios roles por usuario traen `role` (uno solo):
 * siguen valiendo hasta vencer. */
type TokenPayload = Omit<AuthenticatedUser, 'roles'> & { roles?: UserRole[]; role?: UserRole };

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/**
 * Verifies the bearer token and attaches its payload to request.user.
 * Deliberately not Passport-based: one strategy (JWT), one guard, no need
 * for the extra abstraction layer. Runs before RolesGuard/ModuleAccessGuard
 * (Nest always runs global guards in provider registration order).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    @Optional() @Inject(USER_ROLES_LOADER) private readonly rolesLoader?: UserRolesLoader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);
    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const { role, ...rest } = payload;
    const tokenRoles = payload.roles ?? (role ? [role] : []);
    const roles = this.rolesLoader ? await this.rolesLoader.load(payload.tenantId, payload.sub) : tokenRoles;
    if (!roles || roles.length === 0) {
      // Borrado o suspendido después de iniciar sesión.
      throw new UnauthorizedException('Tu usuario ya no está activo en esta empresa');
    }
    request.user = { ...rest, roles };
    return true;
  }
}
