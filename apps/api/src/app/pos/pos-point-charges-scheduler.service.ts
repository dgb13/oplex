import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import { PosPointChargesService } from './pos-point-charges.service.js';

/**
 * Cobros con Point: cada 2 minutos, en las empresas con ventas con Point
 * todavía sin pago, trae de Mercado Pago los pagos de ese rango y empareja
 * (la venta pasa a "Confirmado" sola). También avisa en la campana las que
 * siguen sin pago a los 30 minutos. Mismo recorrido por tenant con
 * try/catch-continue que el resto de los schedulers.
 */
@Injectable()
export class PosPointChargesSchedulerService {
  private readonly logger = new Logger(PosPointChargesSchedulerService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pointCharges: PosPointChargesService,
  ) {}

  @Cron('*/2 * * * *')
  async matchOpenCharges(): Promise<void> {
    // Una vuelta lenta (MP tardando) no se pisa con la siguiente.
    if (this.running) return;
    this.running = true;
    try {
      const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
      for (const { id: tenantId } of tenants) {
        try {
          await withTenantContext(
            this.prisma,
            tenantId,
            async () => {
              const open = await getTenantDb().posPointCharge.count({
                where: { status: { in: ['PENDING', 'AMBIGUOUS'] }, soldAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60_000) } },
              });
              if (open > 0) await this.pointCharges.refresh();
            },
            undefined,
            undefined,
            60_000,
          );
        } catch (err) {
          this.logger.error(`Failed to match Point charges for tenant ${tenantId}: ${(err as Error).message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
