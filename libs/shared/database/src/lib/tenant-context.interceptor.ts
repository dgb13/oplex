import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { from, lastValueFrom, Observable } from 'rxjs';
import { LONG_RUNNING_TRANSACTION_KEY } from './long-running-transaction.decorator.js';
import { PrismaService } from './prisma.service.js';
import { withTenantContext } from './tenant-context.js';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/**
 * Opens one Postgres transaction per request, sets `app.tenant_id` on it via
 * set_config() (RLS policies read that), and runs the rest of the request
 * pipeline inside tenantContextStorage so getTenantDb()/getTenantId() work
 * anywhere downstream without REQUEST-scoped providers.
 *
 * Must run after whatever guard populates request.user (Nest always runs
 * Guards before Interceptors, so ordering is safe regardless of provider
 * registration order).
 *
 * Trade-off: this holds a pooled connection open for the full request
 * lifetime, not just the DB calls within it. Fine for an MVP; if a route
 * ends up doing slow non-DB work (external APIs, etc.) inside the request,
 * revisit before it starts starving the pool under load.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const tenantId = request.user?.tenantId;

    if (!tenantId) {
      return next.handle();
    }

    const timeoutMs = this.reflector.getAllAndOverride<number | undefined>(
      LONG_RUNNING_TRANSACTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    return from(
      withTenantContext(
        this.prisma,
        tenantId,
        () => lastValueFrom(next.handle(), { defaultValue: undefined }),
        request.user?.sub,
        request.user?.role,
        timeoutMs,
      ),
    );
  }
}
