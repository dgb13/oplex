import { Injectable } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext, type SystemErrorLog } from '@plexo/database';

export interface CreateSystemErrorLogInput {
  statusCode: number;
  message: string;
  stack?: string;
  path: string;
  method: string;
  tenantId?: string;
  userId?: string;
}

/**
 * Global, no getTenantDb() - same reasoning as Plan (see SubscriptionService):
 * many 500s (a broken JWT, a request before any tenant context exists)
 * happen with no tenant to scope to, so this can't depend on one existing.
 */
@Injectable()
export class SystemErrorLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: CreateSystemErrorLogInput): Promise<void> {
    await this.prisma.systemErrorLog.create({ data: input });
  }

  async list(params: {
    limit?: number;
    tenantId?: string;
    statusCodeMin?: number;
    from?: Date;
    to?: Date;
  } = {}): Promise<SystemErrorLogWithNames[]> {
    const { limit = 100, tenantId, statusCodeMin, from, to } = params;
    const rows = await this.prisma.systemErrorLog.findMany({
      where: {
        ...(tenantId && { tenantId }),
        ...(statusCodeMin && { statusCode: { gte: statusCodeMin } }),
        ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Empresa y usuario de cada error, para no mostrar sólo el id. Tenant y
    // User tienen RLS: se leen dentro del contexto de cada empresa (mismo
    // patrón que AdminAuditService). Si una empresa ya no existe, queda el id.
    const names = new Map<string, { tenantName: string; users: Map<string, { name: string | null; email: string }> }>();
    for (const id of new Set(rows.map((row) => row.tenantId).filter((x): x is string => !!x))) {
      const userIds = [...new Set(rows.filter((row) => row.tenantId === id && row.userId).map((row) => row.userId as string))];
      try {
        names.set(
          id,
          await withTenantContext(this.prisma, id, async () => {
            const db = getTenantDb();
            const [tenant, users] = await Promise.all([
              db.tenant.findUniqueOrThrow({ where: { id }, select: { name: true } }),
              userIds.length
                ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
                : [],
            ]);
            return { tenantName: tenant.name, users: new Map(users.map((u) => [u.id, { name: u.name, email: u.email }])) };
          }),
        );
      } catch {
        // Empresa borrada: se muestra el id.
      }
    }

    return rows.map((row) => {
      const tenant = row.tenantId ? names.get(row.tenantId) : undefined;
      const user = row.userId ? tenant?.users.get(row.userId) : undefined;
      return {
        ...row,
        tenantName: tenant?.tenantName ?? null,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
      };
    });
  }
}

export type SystemErrorLogWithNames = SystemErrorLog & {
  tenantName: string | null;
  userName: string | null;
  userEmail: string | null;
};
