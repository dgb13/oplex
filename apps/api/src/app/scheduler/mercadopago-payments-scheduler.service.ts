import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConnectorService } from '@plexo/connectors';
import { PrismaService, withTenantContext } from '@plexo/database';
import { MercadoPagoPaymentsSyncService } from '@plexo/mercadopago';

/**
 * Sección Mercado Pago, etapa 2: una vez por noche trae los pagos nuevos o
 * cambiados de cada empresa conectada (MercadoPagoPayment), así Movimientos
 * y el Resumen están al día aunque nadie toque "Actualizar movimientos".
 * Corre a las 4, después del refresh de tokens de las 3
 * (MercadoPagoRefreshSchedulerService). Mismo recorrido por tenant con
 * try/catch-continue que el resto de los schedulers.
 */
@Injectable()
export class MercadoPagoPaymentsSchedulerService {
  private readonly logger = new Logger(MercadoPagoPaymentsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorService: ConnectorService,
    private readonly paymentsSync: MercadoPagoPaymentsSyncService,
  ) {}

  @Cron('0 4 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async syncConnectedTenants(): Promise<void> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;

    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(
          this.prisma,
          tenantId,
          async () => {
            const connector = await this.connectorService.getConnector('MERCADO_PAGO');
            if (!connector || connector.status !== 'CONNECTED') {
              return;
            }
            await this.paymentsSync.sync();
          },
          undefined,
          undefined,
          120_000,
        );
      } catch (err) {
        this.logger.error(`Failed to sync Mercado Pago payments for tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
  }
}
