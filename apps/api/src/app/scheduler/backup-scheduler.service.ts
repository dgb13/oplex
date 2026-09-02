import { execFile } from 'node:child_process';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, type DatabaseBackup } from '@plexo/database';

const execFileAsync = promisify(execFile);

const KEEP_LAST_N = 5;

/**
 * Daily pg_dump of the whole database (schema-owner connection - DATABASE_URL,
 * never APP_DATABASE_URL: plexo_app is NOSUPERUSER/NOBYPASSRLS, so a dump
 * taken as that role outside any tenant context would see zero rows in
 * every RLS-protected table, see prisma.service.ts's docstring).
 *
 * pg_dump isn't installed anywhere yet - not on this dev machine's PATH, not
 * in docker/Dockerfile.api's runtime image, and there's no object storage
 * (S3 etc.) wired up for the output file either. Rather than block this
 * feature on provisioning that, BACKUP_STORAGE_DIR gates real execution:
 * unset, the cron still runs (so the DatabaseBackup history/rotation logic
 * is exercised and visible), it just records one clean FAILED row per day
 * explaining why instead of attempting pg_dump. Once ops sets
 * BACKUP_STORAGE_DIR (and installs pg_dump), this starts working with no
 * code change.
 *
 * execFile with an argv array (never exec with a shell string) - DATABASE_URL
 * can contain characters a shell would interpret, and this is exactly the
 * kind of command-injection surface that must never be built by string
 * concatenation.
 */
@Injectable()
export class BackupSchedulerService {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
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

      await this.rotateOldBackups();
    } catch (err) {
      await this.prisma.databaseBackup.update({
        where: { id: backup.id },
        data: { status: 'FAILED', completedAt: new Date(), errorMessage: (err as Error).message },
      });
      this.logger.error(`Backup falló: ${(err as Error).message}`);
    }
  }

  /** sizeBytes comes back from Prisma as a JS bigint (schema type BigInt) -
   * JSON.stringify() throws on bigint with no built-in override, so it must
   * be narrowed to a number before this ever reaches a controller response.
   * Safe here: a backup file would need to exceed ~9 petabytes to lose
   * precision as a JS number. */
  async list(limit = 30): Promise<Array<Omit<DatabaseBackup, 'sizeBytes'> & { sizeBytes: number | null }>> {
    const rows = await this.prisma.databaseBackup.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
    return rows.map((row) => ({ ...row, sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes) }));
  }

  /** FIFO: sólo cuenta backups COMPLETED (un FAILED no ocupa espacio en
   * disco, no hace falta rotarlo) - borra el archivo y la fila juntos, así
   * database_backups nunca apunta a un archivo que ya no existe. */
  private async rotateOldBackups(): Promise<void> {
    const completed = await this.prisma.databaseBackup.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });
    const toDelete = completed.slice(KEEP_LAST_N);

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
