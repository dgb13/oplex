import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { OffsiteStatusService } from '../ops/offsite-status.service.js';
import { ServerMetricsService } from '../ops/server-metrics.service.js';
import { BackupSchedulerService } from './backup-scheduler.service.js';
import { UpdateBackupSettingsDto } from './dto/update-backup-settings.dto.js';
import {
  CPU_ALERT_PERCENT,
  DISK_ALERT_PERCENT,
  MEMORY_ALERT_PERCENT,
  OpsAlertsService,
  R2_ALERT_BYTES,
  R2_FREE_TIER_BYTES,
} from './ops-alerts.service.js';

// Sin endpoint de "Restaurar backup" a propósito (ver PROGRESS.md): un
// restore pisa TODOS los tenants de la plataforma a la vez, no algo para un
// botón de un click. El paso a paso está en docs/DEPLOY.md.
@Controller('admin/backups')
@UseGuards(PlatformAdminGuard)
export class AdminBackupsController {
  constructor(
    private readonly backupSchedulerService: BackupSchedulerService,
    private readonly offsiteStatus: OffsiteStatusService,
    private readonly serverMetrics: ServerMetricsService,
    private readonly opsAlerts: OpsAlertsService,
  ) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.backupSchedulerService.list(Math.min(Number(limit) || 30, 100));
  }

  /** Todo lo que muestra /admin/backups arriba de la tabla. */
  @Get('overview')
  async overview() {
    const [settings, offsite, disk, localBytes, alerts, databaseBytes] = await Promise.all([
      this.backupSchedulerService.getSettings(),
      this.offsiteStatus.read(),
      this.serverMetrics.disk(),
      this.backupSchedulerService.localBackupsBytes(),
      this.opsAlerts.recent(10),
      this.serverMetrics.databaseBytes(),
    ]);
    return {
      settings,
      offsite,
      disk,
      localBackupsBytes: localBytes,
      databaseBytes,
      alerts,
      recipients: (process.env['PLATFORM_ADMIN_EMAILS'] ?? '')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
      thresholds: {
        diskPercent: DISK_ALERT_PERCENT,
        r2AlertBytes: R2_ALERT_BYTES,
        r2FreeTierBytes: R2_FREE_TIER_BYTES,
        cpuPercent: CPU_ALERT_PERCENT,
        memoryPercent: MEMORY_ALERT_PERCENT,
      },
    };
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateBackupSettingsDto) {
    return this.backupSchedulerService.updateSettings(dto);
  }
}
