import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isOwnerOrAdmin, type AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import {
  MODULE_ACCESS_KEY,
  RequiredModuleAccess,
} from './module-access.decorator.js';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredModuleAccess>(
      MODULE_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user) {
      throw new ForbiddenException('No authenticated user on request');
    }

    if (isOwnerOrAdmin(user.roles)) {
      return true;
    }

    const grant = user.moduleAccess.find((m) => m.module === required.module);
    const allowed = required.level === 'write' ? grant?.canWrite : grant?.canRead;
    if (!allowed) {
      throw new ForbiddenException(
        `No ${required.level} access to module "${required.module}"`,
      );
    }
    return true;
  }
}
