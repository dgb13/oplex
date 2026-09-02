import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PriceIndexService, type SyncResult } from '@plexo/accounting';
import { PrismaService } from '@plexo/database';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';

const PRICE_INDEX_SYNC_JOB_NAME = 'price-index-sync';
// Fila única de PlatformSettings - ver ese modelo en schema.prisma.
const PLATFORM_SETTINGS_ID = 'global';

function cronExpressionForHour(hour: number): string {
  return `0 ${hour} * * *`;
}

export interface PriceIndexSyncSettings {
  ipcSyncEnabled: boolean;
  ipcSyncHour: number;
}

/**
 * Sweep diario configurable desde Admin → Índices de Inflación (horario +
 * on/off, ver AdminPriceIndexSyncController) - mismo molde que
 * ExchangeRateSchedulerService (SchedulerRegistry + CronJob dinámico, no
 * @Cron estático, porque el horario tiene que poder cambiar en caliente).
 *
 * A diferencia de la cotización BNA, el IPC es un único dato NACIONAL (no
 * por tenant) - PriceIndexEntry es una tabla global (ver schema.prisma), así
 * que este sweep no necesita ningún loop de tenants ni withTenantContext,
 * sólo llama a PriceIndexService.syncFromSource() una vez.
 */
@Injectable()
export class PriceIndexSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(PriceIndexSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceIndexService: PriceIndexService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    const settings = await this.getSettings();
    const job = new CronJob(cronExpressionForHour(settings.ipcSyncHour), () => {
      void this.runScheduledSync();
    });
    this.schedulerRegistry.addCronJob(PRICE_INDEX_SYNC_JOB_NAME, job);
    job.start();
  }

  /** Get-or-create defensivo - la migración ya siembra la única fila, esto
   * es sólo una red de seguridad si algún día se resetea la tabla a mano. */
  async getSettings(): Promise<PriceIndexSyncSettings> {
    const existing = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.platformSettings.create({ data: { id: PLATFORM_SETTINGS_ID } });
  }

  /** "Índices de Inflación" en Admin - togglear on/off y/o cambiar el
   * horario. Cambiar el horario reprograma el CronJob ya registrado en
   * caliente (setTime), no hace falta reiniciar el proceso. */
  async updateSettings(patch: { enabled?: boolean; hour?: number }): Promise<PriceIndexSyncSettings> {
    if (patch.hour !== undefined && (patch.hour < 0 || patch.hour > 23)) {
      throw new BadRequestException('La hora debe estar entre 0 y 23');
    }
    const updated = await this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: {
        id: PLATFORM_SETTINGS_ID,
        ...(patch.enabled !== undefined ? { ipcSyncEnabled: patch.enabled } : {}),
        ...(patch.hour !== undefined ? { ipcSyncHour: patch.hour } : {}),
      },
      update: {
        ...(patch.enabled !== undefined ? { ipcSyncEnabled: patch.enabled } : {}),
        ...(patch.hour !== undefined ? { ipcSyncHour: patch.hour } : {}),
      },
    });
    if (patch.hour !== undefined) {
      this.schedulerRegistry
        .getCronJob(PRICE_INDEX_SYNC_JOB_NAME)
        .setTime(new CronTime(cronExpressionForHour(patch.hour)));
    }
    return updated;
  }

  /** Wrapper del tick automático - respeta el toggle on/off. syncNow() en
   * sí NO lo revisa, para que "Sincronizar ahora" (disparo manual explícito)
   * siempre corra sin importar si el sweep automático está deshabilitado. */
  private async runScheduledSync(): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.ipcSyncEnabled) {
      this.logger.log('Sync de índices de inflación deshabilitado, se salta el sweep programado');
      return;
    }
    try {
      const result = await this.syncNow();
      this.logger.log(`Índices de inflación sincronizados: ${result.synced} nuevos, ${result.skippedManual} omitidos (ya corregidos a mano)`);
    } catch (err) {
      // A diferencia de "Sincronizar ahora" (que sí debe propagar el error
      // al botón), el tick automático no tiene a quién devolvérselo - se
      // loguea y se espera al próximo tick, nunca una unhandled rejection.
      this.logger.error(`Scheduled price index sync failed: ${(err as Error).message}`);
    }
  }

  /** "Sincronizar ahora" en Admin, y el tick automático (vía
   * runScheduledSync). */
  syncNow(): Promise<SyncResult> {
    return this.priceIndexService.syncFromSource();
  }
}
