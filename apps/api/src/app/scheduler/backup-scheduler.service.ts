import { execFile } from 'node:child_process';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService, type DatabaseBackup } from '@plexo/database';
import { CronJob } from 'cron';

const execFileAsync = promisify(execFile);

const BACKUP_JOB_NAME = 'database-backup';
// Fila única de PlatformSettings - ver ese modelo en schema.prisma.
const PLATFORM_SETTINGS_ID = 'global';
// La hora que elige el admin es de Argentina, aunque el servidor esté en UTC.
export const BACKUP_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const BACKUP_FREQUENCIES_HOURS = [12, 24, 48, 168] as const;

export interface BackupSettings {
  frequencyHours: number;
  hour: number;
  keepLocal: number;
  keepOffsiteDays: number;
}

/** 12 h = dos corridas por día (a la hora elegida y 12 h después); el resto
 * corre una vez por día a esa hora y runScheduledBackup saltea los días que
 * no tocan (cada 2 días, semanal) - así no depende de un "cada 2 días" en el
 * día del mes, que se corre en los fines de mes. */
export function cronExpressionForBackup(frequencyHours: number, hour: number): string {
  if (frequencyHours === 12) {
    const [a, b] = [hour, (hour + 12) % 24].sort((x, y) => x - y);
    return `0 ${a},${b} * * *`;
  }
  return `0 ${hour} * * *`;
}

/** El error de execFile trae la línea de comando completa, con DATABASE_URL
 * y su contraseña: se tapa antes de guardarlo, mostrarlo en el panel o
 * mandarlo por email. */
export function redactCredentials(message: string): string {
  return message.replace(/(\w+:\/\/)[^@\s/]+@/g, '$1***@');
}

function backupCronJob(settings: BackupSettings, onTick: () => void): CronJob {
  return CronJob.from({
    cronTime: cronExpressionForBackup(settings.frequencyHours, settings.hour),
    onTick,
    timeZone: BACKUP_TIME_ZONE,
  });
}

/**
 * pg_dump de toda la base (conexión del dueño del schema - DATABASE_URL,
 * nunca APP_DATABASE_URL: plexo_app es NOSUPERUSER/NOBYPASSRLS, así que un
 * dump con ese rol fuera de un tenant vería cero filas en cada tabla con
 * RLS, ver el docstring de prisma.service.ts).
 *
 * Frecuencia, hora y cuántas copias guardar se configuran en /admin/backups
 * (PlatformSettings.backup*) - CronJob dinámico vía SchedulerRegistry, mismo
 * criterio que ExchangeRateSchedulerService: cambiar el horario no pide
 * reiniciar el proceso.
 *
 * Sin BACKUP_STORAGE_DIR igual corre y deja una fila FAILED explicando por
 * qué, así el historial muestra que falta configurarlo.
 *
 * La copia fuera del servidor (Cloudflare R2) la hace docker/offsite-backup.sh
 * desde el cron del host; lee de OFFSITE_DIR/config.json los días a guardar,
 * que escribe writeOffsiteConfig().
 *
 * execFile con un array de argumentos (nunca exec con un string de shell) -
 * DATABASE_URL puede tener caracteres que un shell interpretaría.
 */
@Injectable()
export class BackupSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    const settings = await this.getSettings();
    const job = backupCronJob(settings, () => {
      void this.runScheduledBackup();
    });
    this.schedulerRegistry.addCronJob(BACKUP_JOB_NAME, job);
    job.start();
    await this.writeOffsiteConfig(settings);
  }

  async getSettings(): Promise<BackupSettings> {
    const row =
      (await this.prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } })) ??
      (await this.prisma.platformSettings.create({ data: { id: PLATFORM_SETTINGS_ID } }));
    return {
      frequencyHours: row.backupFrequencyHours,
      hour: row.backupHour,
      keepLocal: row.backupKeepLocal,
      keepOffsiteDays: row.backupKeepOffsiteDays,
    };
  }

  async updateSettings(patch: Partial<BackupSettings>): Promise<BackupSettings> {
    if (
      patch.frequencyHours !== undefined &&
      !(BACKUP_FREQUENCIES_HOURS as readonly number[]).includes(patch.frequencyHours)
    ) {
      throw new BadRequestException('La frecuencia debe ser 12, 24, 48 o 168 horas');
    }
    const data = {
      ...(patch.frequencyHours !== undefined ? { backupFrequencyHours: patch.frequencyHours } : {}),
      ...(patch.hour !== undefined ? { backupHour: patch.hour } : {}),
      ...(patch.keepLocal !== undefined ? { backupKeepLocal: patch.keepLocal } : {}),
      ...(patch.keepOffsiteDays !== undefined ? { backupKeepOffsiteDays: patch.keepOffsiteDays } : {}),
    };
    await this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, ...data },
      update: data,
    });
    const settings = await this.getSettings();
    // Se toma el cronTime de un job armado con la zona horaria: un CronTime
    // suelto quedaría en la hora del servidor (UTC).
    this.schedulerRegistry
      .getCronJob(BACKUP_JOB_NAME)
      .setTime(backupCronJob(settings, () => undefined).cronTime);
    await this.writeOffsiteConfig(settings);
    return settings;
  }

  /** Tick automático: con frecuencia de más de un día, saltea si la última
   * copia buena es más nueva que la frecuencia (con 2 h de margen). */
  async runScheduledBackup(): Promise<void> {
    const { frequencyHours } = await this.getSettings();
    if (frequencyHours > 24) {
      const last = await this.prisma.databaseBackup.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { startedAt: 'desc' },
      });
      const minAgeMs = (frequencyHours - 2) * 3_600_000;
      if (last && Date.now() - last.startedAt.getTime() < minAgeMs) {
        return;
      }
    }
    await this.runDailyBackup();
  }

  async runDailyBackup(): Promise<void> {
    const backup = await this.prisma.databaseBackup.create({ data: { status: 'PENDING' } });

    const storageDir = process.env['BACKUP_STORAGE_DIR'];
    const databaseUrl = process.env['DATABASE_URL'];

    if (!storageDir || !databaseUrl) {
      await this.prisma.databaseBackup.update({
        where: { id: backup.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage:
            'BACKUP_STORAGE_DIR no configurado - backup automático deshabilitado hasta que se provisione almacenamiento y pg_dump.',
        },
      });
      this.logger.warn('Backup automático omitido: BACKUP_STORAGE_DIR no configurado.');
      return;
    }

    const fileName = `plexo-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
    const filePath = join(storageDir, fileName);

    try {
      await mkdir(storageDir, { recursive: true });
      // -F c: formato custom de pg_dump (comprimido, restaurable con pg_restore).
      // El "?schema=public" de DATABASE_URL es una extensión propia de
      // Prisma, no un parámetro real de libpq - pg_dump lo rechaza con
      // "parámetro de URI no válido" si se lo pasamos tal cual (confirmado
      // corriendo esto a mano). Se descarta antes de pasarlo a pg_dump, que
      // igual vuelca todos los schemas por default.
      await execFileAsync('pg_dump', [
        '--dbname',
        databaseUrl.split('?')[0],
        '--format',
        'custom',
        '--file',
        filePath,
      ]);
      const { size } = await stat(filePath);

      await this.prisma.databaseBackup.update({
        where: { id: backup.id },
        data: { status: 'COMPLETED', completedAt: new Date(), filePath, sizeBytes: BigInt(size) },
      });
      this.logger.log(`Backup completado: ${filePath} (${size} bytes)`);

      const { keepLocal } = await this.getSettings();
      await this.rotateOldBackups(keepLocal);
    } catch (err) {
      await this.prisma.databaseBackup.update({
        where: { id: backup.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: redactCredentials((err as Error).message) },
      });
      this.logger.error(`Backup falló: ${redactCredentials((err as Error).message)}`);
    }
  }

  /** sizeBytes comes back from Prisma as a JS bigint (schema type BigInt) -
   * JSON.stringify() throws on bigint with no built-in override, so it must
   * be narrowed to a number before this ever reaches a controller response.
   * Safe here: a backup file would need to exceed ~9 petabytes to lose
   * precision as a JS number. */
  async list(limit = 30): Promise<Array<Omit<DatabaseBackup, 'sizeBytes'> & { sizeBytes: number | null }>> {
    const rows = await this.prisma.databaseBackup.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
    // redactCredentials también acá: filas viejas guardadas antes de taparlo.
    return rows.map((row) => ({
      ...row,
      errorMessage: row.errorMessage ? redactCredentials(row.errorMessage) : row.errorMessage,
      sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    }));
  }

  /** Lo que ocupan las copias en el disco del servidor (para /admin/backups). */
  async localBackupsBytes(): Promise<number> {
    const dir = process.env['BACKUP_STORAGE_DIR'];
    if (!dir) return 0;
    try {
      const names = (await readdir(dir)).filter((name) => name.endsWith('.dump'));
      const sizes = await Promise.all(names.map(async (name) => (await stat(join(dir, name))).size));
      return sizes.reduce((sum, size) => sum + size, 0);
    } catch {
      return 0;
    }
  }

  /** Para docker/offsite-backup.sh. Sin OFFSITE_DIR (desarrollo) no hace
   * nada; si falla se loguea - el script usa 30 días por defecto. */
  private async writeOffsiteConfig(settings: BackupSettings): Promise<void> {
    const dir = process.env['OFFSITE_DIR'];
    if (!dir) return;
    try {
      await writeFile(join(dir, 'config.json'), JSON.stringify({ keepDays: settings.keepOffsiteDays }));
    } catch (err) {
      this.logger.warn(`No se pudo escribir ${dir}/config.json: ${(err as Error).message}`);
    }
  }

  /** FIFO: sólo cuenta backups COMPLETED (un FAILED no ocupa espacio en
   * disco, no hace falta rotarlo) - borra el archivo y la fila juntos, así
   * database_backups nunca apunta a un archivo que ya no existe. */
  private async rotateOldBackups(keep: number): Promise<void> {
    const completed = await this.prisma.databaseBackup.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });
    const toDelete = completed.slice(keep);

    for (const backup of toDelete) {
      try {
        if (backup.filePath) {
          await unlink(backup.filePath);
        }
        await this.prisma.databaseBackup.delete({ where: { id: backup.id } });
      } catch (err) {
        this.logger.error(`Failed to rotate backup ${backup.id}: ${(err as Error).message}`);
      }
    }
  }
}
