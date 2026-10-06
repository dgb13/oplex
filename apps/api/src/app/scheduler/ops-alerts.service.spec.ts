import type { AuthEmailSender } from '@plexo/auth-email';
import type { PrismaService } from '@plexo/database';
import type { OffsiteStatus, OffsiteStatusService } from '../ops/offsite-status.service.js';
import type { ServerMetricsService } from '../ops/server-metrics.service.js';
import type { BackupSchedulerService } from './backup-scheduler.service.js';
import { OpsAlertsService } from './ops-alerts.service.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-10-20T05:00:00Z');

function offsiteStatus(patch: Partial<OffsiteStatus> = {}): OffsiteStatus {
  return {
    configured: true,
    ok: true,
    error: null,
    finishedAt: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
    durationSec: 12,
    keepDays: 30,
    lastSuccessAt: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
    dumps: [],
    files: { count: 10, bytes: 1000 },
    deletedFiles: { count: 0, bytes: 0 },
    bucketBytes: 1024 ** 3,
    runs: [],
    ...patch,
  };
}

function setup(opts: {
  latest?: { status: string; startedAt: Date; errorMessage?: string } | null;
  lastOk?: { startedAt: Date } | null;
  offsite?: OffsiteStatus;
  diskPercent?: number;
  samples?: Array<{ cpuPercent: number; memPercent: number }>;
  alreadySent?: boolean;
  frequencyHours?: number;
}) {
  const fresh = { status: 'COMPLETED', startedAt: new Date(NOW.getTime() - 6 * HOUR) };
  const databaseBackup = {
    findFirst: jest.fn(async ({ where }: { where?: { status?: string } }) =>
      where?.status ? (opts.lastOk === undefined ? fresh : opts.lastOk) : opts.latest === undefined ? fresh : opts.latest,
    ),
  };
  const opsAlert = {
    findFirst: jest.fn().mockResolvedValue(opts.alreadySent ? { id: 'a1' } : null),
    create: jest.fn().mockResolvedValue({}),
  };
  const prisma = { databaseBackup, opsAlert } as unknown as PrismaService;
  const backups = {
    getSettings: jest.fn().mockResolvedValue({
      frequencyHours: opts.frequencyHours ?? 24,
      hour: 23,
      keepLocal: 5,
      keepOffsiteDays: 30,
    }),
  } as unknown as BackupSchedulerService;
  const offsite = { read: jest.fn().mockResolvedValue(opts.offsite ?? offsiteStatus()) } as unknown as OffsiteStatusService;
  const pct = opts.diskPercent ?? 27;
  const metrics = {
    disk: jest.fn().mockResolvedValue({
      totalBytes: 80 * 1024 ** 3,
      usedBytes: (80 * 1024 ** 3 * pct) / 100,
      freeBytes: (80 * 1024 ** 3 * (100 - pct)) / 100,
      usedPercent: pct,
    }),
    latestSamples: jest.fn().mockResolvedValue(opts.samples ?? []),
  } as unknown as ServerMetricsService;
  const email = { sendLegalNotice: jest.fn().mockResolvedValue(undefined) } as unknown as AuthEmailSender;
  return { service: new OpsAlertsService(prisma, backups, offsite, metrics, email), opsAlert, email };
}

describe('OpsAlertsService.dailyChecks', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env['OFFSITE_DIR'] = '/offsite';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('no avisa nada cuando todo está al día', async () => {
    const { service } = setup({});
    expect(await service.dailyChecks(NOW)).toEqual([]);
  });

  it('avisa si la última copia de la base falló', async () => {
    const { service } = setup({
      latest: { status: 'FAILED', startedAt: new Date(NOW.getTime() - 6 * HOUR), errorMessage: 'pg_dump: sin conexión' },
    });
    const alerts = await service.dailyChecks(NOW);
    expect(alerts.map((a) => a.kind)).toEqual(['backup-failed']);
    expect(alerts[0].message).toContain('pg_dump: sin conexión');
  });

  it('avisa si la copia de la base no se hace hace más de 26 h', async () => {
    const old = { status: 'COMPLETED', startedAt: new Date(NOW.getTime() - 30 * HOUR) };
    const { service } = setup({ latest: old, lastOk: old });
    expect((await service.dailyChecks(NOW)).map((a) => a.kind)).toEqual(['backup-stale']);
  });

  it('con "cada 2 días", 30 h sin copia es normal', async () => {
    const old = { status: 'COMPLETED', startedAt: new Date(NOW.getTime() - 30 * HOUR) };
    const { service } = setup({ latest: old, lastOk: old, frequencyHours: 48 });
    expect(await service.dailyChecks(NOW)).toEqual([]);
  });

  it('avisa si la subida a R2 falló, con el error', async () => {
    const { service } = setup({ offsite: offsiteStatus({ ok: false, error: 'AccessDenied (403)' }) });
    const alerts = await service.dailyChecks(NOW);
    expect(alerts.map((a) => a.kind)).toEqual(['offsite-failed']);
    expect(alerts[0].message).toContain('AccessDenied (403)');
  });

  it('avisa si la subida a R2 no corre hace días (sin error)', async () => {
    const twoDaysAgo = new Date(NOW.getTime() - 48 * HOUR).toISOString();
    const { service } = setup({ offsite: offsiteStatus({ lastSuccessAt: twoDaysAgo, finishedAt: twoDaysAgo }) });
    expect((await service.dailyChecks(NOW)).map((a) => a.kind)).toEqual(['offsite-stale']);
  });

  it('avisa por disco al 80 % y por R2 de más de 8 GB', async () => {
    const { service } = setup({ diskPercent: 86, offsite: offsiteStatus({ bucketBytes: 9 * 1024 ** 3 }) });
    expect((await service.dailyChecks(NOW)).map((a) => a.kind).sort()).toEqual(['disk-high', 'r2-near-limit']);
  });

  it('sin OFFSITE_DIR (desarrollo) no avisa por R2', async () => {
    delete process.env['OFFSITE_DIR'];
    const { service } = setup({ offsite: offsiteStatus({ ok: false, error: 'x' }) });
    expect(await service.dailyChecks(NOW)).toEqual([]);
  });
});

describe('OpsAlertsService.busyCheck', () => {
  it('avisa con media hora seguida de procesador alto', async () => {
    const { service } = setup({ samples: Array.from({ length: 6 }, () => ({ cpuPercent: 91, memPercent: 50 })) });
    const alert = await service.busyCheck();
    expect(alert?.kind).toBe('server-busy');
    expect(alert?.message).toContain('procesador al 91 %');
  });

  it('un pico suelto no alcanza', async () => {
    const samples = Array.from({ length: 6 }, (_, i) => ({ cpuPercent: i === 0 ? 95 : 20, memPercent: 50 }));
    const { service } = setup({ samples });
    expect(await service.busyCheck()).toBeNull();
  });
});

describe('OpsAlertsService - envío', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('manda el aviso a cada admin y lo registra', async () => {
    process.env['PLATFORM_ADMIN_EMAILS'] = 'a@x.com, b@x.com';
    process.env['OFFSITE_DIR'] = '/offsite';
    const { service, email, opsAlert } = setup({ diskPercent: 90 });

    await service.runDailyCheck();

    expect(email.sendLegalNotice).toHaveBeenCalledTimes(2);
    expect(email.sendLegalNotice).toHaveBeenCalledWith(expect.objectContaining({ to: 'b@x.com' }));
    expect(opsAlert.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'disk-high' }) });
  });

  it('no repite un aviso que ya salió en las últimas horas', async () => {
    process.env['PLATFORM_ADMIN_EMAILS'] = 'a@x.com';
    const { service, email, opsAlert } = setup({ diskPercent: 90, alreadySent: true });

    await service.runDailyCheck();

    expect(email.sendLegalNotice).not.toHaveBeenCalled();
    expect(opsAlert.create).not.toHaveBeenCalled();
  });
});
