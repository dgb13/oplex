import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { ServerMetricsService } from './server-metrics.service.js';

// "Servidor" en el panel Admin - sólo lectura.
@Controller('admin/server')
@UseGuards(PlatformAdminGuard)
export class AdminServerController {
  constructor(private readonly serverMetrics: ServerMetricsService) {}

  @Get()
  snapshot() {
    return this.serverMetrics.snapshot();
  }

  @Get('history')
  history(@Query('range') range?: string) {
    return this.serverMetrics.history(range === '7d' ? '7d' : '24h');
  }
}
