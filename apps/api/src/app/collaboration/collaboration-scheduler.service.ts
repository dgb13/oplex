import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getTenantDb, notify, PrismaService, withTenantContext } from '@plexo/database';

const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;
const WEEKDAY = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' });
const DUE_FORMAT = {
  format: (d: Date) =>
    `${WEEKDAY.format(d)} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
};

/**
 * Barrido diario (8 AM) por empresa, mismo patrón que
 * ReceivablesSchedulerService (list_tenant_ids + una transacción por
 * empresa; si una falla, sigue con las demás):
 * - avisa las tareas pendientes que vencen hoy o mañana (o ya vencieron
 *   ayer), una sola vez por día;
 * - borra los avisos de más de 90 días.
 */
@Injectable()
export class CollaborationSchedulerService {
  private readonly logger = new Logger(CollaborationSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 8 * * *')
  async runDaily(): Promise<void> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          const reminded = await this.remindDueTasks(new Date());
          const purged = await this.purgeOldNotifications(new Date());
          if (reminded || purged) {
            this.logger.log(`Tenant ${tenantId}: ${reminded} recordatorio(s) de tareas, ${purged} aviso(s) viejos borrados`);
          }
        });
      } catch (err) {
        this.logger.error(`Tenant ${tenantId}: falló el barrido de avisos - ${(err as Error).message}`);
      }
    }
  }

  /** Tareas con vencimiento entre ayer y fin de mañana (UTC del día). */
  async remindDueTasks(now: Date): Promise<number> {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = new Date(today.getTime() - DAY_MS);
    const to = new Date(today.getTime() + 2 * DAY_MS);
    const tasks = await getTenantDb().calendarEvent.findMany({
      where: { kind: 'TASK', status: 'PENDING', assignedTo: { not: null }, startsAt: { gte: from, lt: to } },
    });
    let count = 0;
    for (const task of tasks) {
      const dayDiff = Math.floor((task.startsAt.getTime() - today.getTime()) / DAY_MS);
      const when = dayDiff < 0 ? 'venció ayer' : dayDiff === 0 ? 'vence hoy' : `vence mañana (${DUE_FORMAT.format(task.startsAt)})`;
      count += (
        await notify({
          recipientUserIds: [task.assignedTo],
          category: 'TASK',
          type: 'task.due_soon',
          message: `Tu tarea **${task.title}** ${when}`,
          link: task.linkType === 'production-order' && task.linkId ? `/production/orders/${task.linkId}` : '/agenda',
        })
      ).length;
    }
    return count;
  }

  async purgeOldNotifications(now: Date): Promise<number> {
    const { count } = await getTenantDb().notification.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * DAY_MS) } },
    });
    return count;
  }
}
