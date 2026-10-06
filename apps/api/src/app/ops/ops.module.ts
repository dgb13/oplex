import { Module } from '@nestjs/common';
import { AdminServerController } from './admin-server.controller.js';
import { OffsiteStatusService } from './offsite-status.service.js';
import { ServerMetricsService } from './server-metrics.service.js';

/** Estado del servidor y de la copia a R2 para el panel de admin. Los avisos
 * por email viven en SchedulerModule (OpsAlertsService), que importa este. */
@Module({
  controllers: [AdminServerController],
  providers: [ServerMetricsService, OffsiteStatusService],
  exports: [ServerMetricsService, OffsiteStatusService],
})
export class OpsModule {}
