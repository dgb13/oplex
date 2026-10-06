import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AUTH_EMAIL_SENDER, type AuthEmailSender } from '@plexo/auth-email';
import { PrismaService } from '@plexo/database';
import { OffsiteStatusService } from '../ops/offsite-status.service.js';
import { ServerMetricsService } from '../ops/server-metrics.service.js';
import { BACKUP_TIME_ZONE, BackupSchedulerService, redactCredentials } from './backup-scheduler.service.js';

export const DISK_ALERT_PERCENT = 80;
export const R2_ALERT_BYTES = 8 * 1024 ** 3;
export const R2_FREE_TIER_BYTES = 10 * 1024 ** 3;
export const CPU_ALERT_PERCENT = 80;
export const MEMORY_ALERT_PERCENT = 85;
// 6 mediciones de 5 min seguidas por encima = media hora exigido.
const BUSY_SAMPLES = 6;
const HOUR = 3_600_000;

export type OpsAlertKind =
  | 'backup-failed'
  | 'backup-stale'
  | 'offsite-failed'
  | 'offsite-stale'
  | 'disk-high'
  | 'r2-near-limit'
  | 'server-busy';

export interface OpsAlertDraft {
  kind: OpsAlertKind;
  subject: string;
  message: string;
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
}

function arDate(d: Date | string): string {
  return new Date(d).toLocaleString('es-AR', {
    timeZone: BACKUP_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * Avisos por email a los admins de la plataforma (PLATFORM_ADMIN_EMAILS):
 * - todos los días a la 01:00 de Argentina revisa backups, R2, disco y el
 *   espacio usado en R2;
 * - cada 5 minutos, si el procesador o la memoria estuvieron altos media hora
 *   seguida.
 * Cada tipo de aviso se manda como mucho una vez cada 20 h (server-busy, cada
 * 6 h) y queda en ops_alerts, que el panel muestra.
 *
 * Usa el mismo remitente que los emails de cuenta (AuthEmailSender, texto
 * plano). Si el servidor entero se cae esto no avisa: para eso está el
 * vigilante externo (docs/DEPLOY.md).
 */
@Injectable()
export class OpsAlertsService {
  private readonly logger = new Logger(OpsAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly backups: BackupSchedulerService,
    private readonly offsite: OffsiteStatusService,
    private readonly serverMetrics: ServerMetricsService,
    @Inject(AUTH_EMAIL_SENDER) private readonly email: AuthEmailSender,
  ) {}

  @Cron('0 1 * * *', { timeZone: BACKUP_TIME_ZONE })
  async runDailyCheck(): Promise<void> {
    try {
      for (const alert of await this.dailyChecks()) {
        await this.send(alert, 20 * HOUR);
      }
    } catch (err) {
      this.logger.error(`Chequeo diario de avisos falló: ${(err as Error).message}`);
    }
  }

  // 2 minutos después de cada medición del servidor (ver ServerMetricsService).
  @Cron('2-59/5 * * * *')
  async runBusyCheck(): Promise<void> {
    try {
      const alert = await this.busyCheck();
      if (alert) await this.send(alert, 6 * HOUR);
    } catch (err) {
      this.logger.error(`Chequeo de carga del servidor falló: ${(err as Error).message}`);
    }
  }

  async dailyChecks(now = new Date()): Promise<OpsAlertDraft[]> {
    const alerts: OpsAlertDraft[] = [];
    const settings = await this.backups.getSettings();
    // Margen: la frecuencia elegida + 2 h, nunca menos de 26 h.
    const staleMs = Math.max(26, settings.frequencyHours + 2) * HOUR;

    const latest = await this.prisma.databaseBackup.findFirst({ orderBy: { startedAt: 'desc' } });
    const lastOk = await this.prisma.databaseBackup.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { startedAt: 'desc' },
    });
    if (latest?.status === 'FAILED') {
      alerts.push({
        kind: 'backup-failed',
        subject: 'Oplex: falló la copia de la base',
        message: `La copia de la base del ${arDate(latest.startedAt)} terminó con error: ${latest.errorMessage ? redactCredentials(latest.errorMessage) : 'sin detalle'}.${
          lastOk ? ` Última copia buena: ${arDate(lastOk.startedAt)}.` : ''
        }`,
      });
    } else if (!lastOk || now.getTime() - lastOk.startedAt.getTime() > staleMs) {
      alerts.push({
        kind: 'backup-stale',
        subject: 'Oplex: la copia de la base no se está haciendo',
        message: lastOk
          ? `La última copia buena de la base es del ${arDate(lastOk.startedAt)}.`
          : 'Todavía no hay ninguna copia buena de la base.',
      });
    }

    const offsite = await this.offsite.read();
    if (process.env['OFFSITE_DIR']) {
      if (offsite.configured && offsite.ok === false) {
        alerts.push({
          kind: 'offsite-failed',
          subject: 'Oplex: falló la copia externa (R2)',
          message: `La subida a Cloudflare R2 del ${arDate(offsite.finishedAt ?? now)} terminó con error: ${offsite.error ?? 'sin detalle'}.${
            offsite.lastSuccessAt ? ` Última subida buena: ${arDate(offsite.lastSuccessAt)}.` : ''
          } La copia de la base sigue guardándose en el servidor.`,
        });
      } else if (!offsite.lastSuccessAt || now.getTime() - new Date(offsite.lastSuccessAt).getTime() > staleMs) {
        alerts.push({
          kind: 'offsite-stale',
          subject: 'Oplex: la copia externa (R2) no está corriendo',
          message: offsite.lastSuccessAt
            ? `La última subida a Cloudflare R2 fue el ${arDate(offsite.lastSuccessAt)}. No hay error porque no arrancó: revisá la tarea programada del servidor (crontab de root).`
            : 'La subida a Cloudflare R2 nunca terminó bien en este servidor. Revisá la tarea programada (crontab de root) y docs/DEPLOY.md.',
        });
      }
      if (offsite.bucketBytes !== null && offsite.bucketBytes > R2_ALERT_BYTES) {
        alerts.push({
          kind: 'r2-near-limit',
          subject: 'Oplex: R2 cerca de dejar la capa gratis',
          message: `Las copias en Cloudflare R2 ocupan ${gb(offsite.bucketBytes)} (la capa gratis llega a 10 GB). Pasado ese límite Cloudflare cobra por el excedente.`,
        });
      }
    }

    const disk = await this.serverMetrics.disk();
    if (disk.usedPercent >= DISK_ALERT_PERCENT) {
      alerts.push({
        kind: 'disk-high',
        subject: `Oplex: disco del servidor al ${disk.usedPercent} %`,
        message: `Quedan ${gb(disk.freeBytes)} libres de ${gb(disk.totalBytes)} en el servidor. Si se llena, Oplex deja de guardar fotos, PDFs y la copia de la base. Opciones: ampliar el disco en Vultr o liberar espacio.`,
      });
    }
    return alerts;
  }

  async busyCheck(): Promise<OpsAlertDraft | null> {
    const samples = await this.serverMetrics.latestSamples(BUSY_SAMPLES);
    if (samples.length < BUSY_SAMPLES) return null;
    const cpuBusy = samples.every((s) => s.cpuPercent >= CPU_ALERT_PERCENT);
    const memBusy = samples.every((s) => s.memPercent >= MEMORY_ALERT_PERCENT);
    if (!cpuBusy && !memBusy) return null;
    const last = samples[0];
    const parts = [
      cpuBusy ? `procesador al ${Math.round(last.cpuPercent)} %` : null,
      memBusy ? `memoria al ${Math.round(last.memPercent)} %` : null,
    ].filter(Boolean);
    return {
      kind: 'server-busy',
      subject: 'Oplex: el servidor está exigido',
      message: `Hace al menos media hora que el servidor está con ${parts.join(' y ')}. Si sigue así, conviene revisar Errores y Actividad en el panel, o pasar a un plan más grande en Vultr.`,
    };
  }

  async recent(limit = 10) {
    return this.prisma.opsAlert.findMany({ orderBy: { sentAt: 'desc' }, take: limit });
  }

  private async send(alert: OpsAlertDraft, minGapMs: number): Promise<void> {
    const previous = await this.prisma.opsAlert.findFirst({
      where: { kind: alert.kind, sentAt: { gte: new Date(Date.now() - minGapMs) } },
    });
    if (previous) return;

    const recipients = (process.env['PLATFORM_ADMIN_EMAILS'] ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    const link = process.env['FRONTEND_URL'] ? `\n\nVer en el panel: ${process.env['FRONTEND_URL']}/admin/backups` : '';
    for (const to of recipients) {
      await this.email.sendLegalNotice({ to, subject: alert.subject, text: `${alert.message}${link}` });
    }
    if (recipients.length === 0) {
      this.logger.warn(`Aviso sin destinatarios (PLATFORM_ADMIN_EMAILS vacío): ${alert.subject}`);
    }
    await this.prisma.opsAlert.create({ data: alert });
  }
}
