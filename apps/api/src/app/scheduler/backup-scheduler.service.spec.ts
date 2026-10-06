import { execFile } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { PrismaService } from '@plexo/database';
import { BackupSchedulerService, cronExpressionForBackup, redactCredentials } from './backup-scheduler.service.js';

// jest hoists these above the imports above regardless of source position.
jest.mock('node:child_process', () => ({
  execFile: jest.fn((_file: string, _args: string[], callback: (err: Error | null) => void) => callback(null)),
}));
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 12_345 }),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

function makePrisma(settings: Partial<Record<string, number>> = {}) {
  const databaseBackup = {
    create: jest.fn().mockResolvedValue({ id: 'backup-1' }),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({}),
  };
  const row = {
    id: 'global',
    backupFrequencyHours: 24,
    backupHour: 23,
    backupKeepLocal: 5,
    backupKeepOffsiteDays: 30,
    ...settings,
  };
  const platformSettings = {
    findUnique: jest.fn().mockResolvedValue(row),
    create: jest.fn().mockResolvedValue(row),
    upsert: jest.fn(async ({ update }: { update: Record<string, number> }) => Object.assign(row, update)),
  };
  return {
    prisma: { databaseBackup, platformSettings } as unknown as PrismaService,
    databaseBackup,
    platformSettings,
  };
}

function makeRegistry() {
  const job = { setTime: jest.fn() };
  return {
    registry: { getCronJob: jest.fn().mockReturnValue(job), addCronJob: jest.fn() } as unknown as SchedulerRegistry,
    job,
  };
}

describe('BackupSchedulerService.runDailyBackup', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it('records a clean FAILED row without invoking pg_dump when BACKUP_STORAGE_DIR is unset', async () => {
    delete process.env['BACKUP_STORAGE_DIR'];
    process.env['DATABASE_URL'] = 'postgresql://admin:pw@localhost:5432/plexo';
    const { prisma, databaseBackup } = makePrisma();
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    await service.runDailyBackup();

    expect(execFile).not.toHaveBeenCalled();
    expect(databaseBackup.update).toHaveBeenCalledWith({
      where: { id: 'backup-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });

  it('runs pg_dump via execFile and records COMPLETED with the file size when configured', async () => {
    process.env['BACKUP_STORAGE_DIR'] = 'C:/tmp/backups';
    process.env['DATABASE_URL'] = 'postgresql://admin:pw@localhost:5432/plexo';
    const { prisma, databaseBackup } = makePrisma();
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    await service.runDailyBackup();

    expect(execFile).toHaveBeenCalledWith(
      'pg_dump',
      expect.arrayContaining(['--dbname', process.env['DATABASE_URL']]),
      expect.any(Function),
    );
    expect(databaseBackup.update).toHaveBeenCalledWith({
      where: { id: 'backup-1' },
      data: expect.objectContaining({ status: 'COMPLETED', sizeBytes: BigInt(12_345) }),
    });
  });

  it('strips the ?schema=... query string before handing DATABASE_URL to pg_dump - it rejects it as an invalid URI parameter', async () => {
    process.env['BACKUP_STORAGE_DIR'] = 'C:/tmp/backups';
    process.env['DATABASE_URL'] = 'postgresql://admin:pw@localhost:5432/plexo?schema=public';
    const { prisma } = makePrisma();
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    await service.runDailyBackup();

    expect(execFile).toHaveBeenCalledWith(
      'pg_dump',
      expect.arrayContaining(['--dbname', 'postgresql://admin:pw@localhost:5432/plexo']),
      expect.any(Function),
    );
  });

  it('rotates FIFO, keeping only the 5 most recent COMPLETED backups', async () => {
    process.env['BACKUP_STORAGE_DIR'] = 'C:/tmp/backups';
    process.env['DATABASE_URL'] = 'postgresql://admin:pw@localhost:5432/plexo';
    const { prisma, databaseBackup } = makePrisma();
    const oldBackups = Array.from({ length: 7 }, (_, i) => ({
      id: `old-${i}`,
      filePath: `C:/tmp/backups/old-${i}.dump`,
    }));
    databaseBackup.findMany.mockResolvedValue(oldBackups);
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    await service.runDailyBackup();

    expect(databaseBackup.delete).toHaveBeenCalledTimes(2);
    expect(unlink).toHaveBeenCalledWith('C:/tmp/backups/old-5.dump');
    expect(unlink).toHaveBeenCalledWith('C:/tmp/backups/old-6.dump');
  });
});

describe('BackupSchedulerService.list', () => {
  it('narrows sizeBytes from bigint to number for JSON-safe responses', async () => {
    const { prisma, databaseBackup } = makePrisma();
    databaseBackup.findMany.mockResolvedValue([
      { id: 'b1', status: 'COMPLETED', sizeBytes: BigInt(999) },
      { id: 'b2', status: 'FAILED', sizeBytes: null },
    ]);
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    const result = await service.list();

    expect(result).toEqual([
      { id: 'b1', status: 'COMPLETED', sizeBytes: 999 },
      { id: 'b2', status: 'FAILED', sizeBytes: null },
    ].map((r) => expect.objectContaining(r)));
  });
});

describe('BackupSchedulerService - programación configurable', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  it('arma la expresión cron: dos corridas por día con 12 h, una sola con el resto', () => {
    expect(cronExpressionForBackup(12, 23)).toBe('0 11,23 * * *');
    expect(cronExpressionForBackup(12, 2)).toBe('0 2,14 * * *');
    expect(cronExpressionForBackup(24, 23)).toBe('0 23 * * *');
    expect(cronExpressionForBackup(48, 3)).toBe('0 3 * * *');
  });

  it('con "cada 2 días" saltea si la última copia buena tiene menos de 46 h', async () => {
    delete process.env['BACKUP_STORAGE_DIR'];
    const { prisma, databaseBackup } = makePrisma({ backupFrequencyHours: 48 });
    databaseBackup.findFirst.mockResolvedValue({ startedAt: new Date(Date.now() - 24 * 3_600_000) });
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    await service.runScheduledBackup();

    expect(databaseBackup.create).not.toHaveBeenCalled();
  });

  it('con "cada 2 días" corre si la última copia buena tiene 47 h', async () => {
    delete process.env['BACKUP_STORAGE_DIR'];
    const { prisma, databaseBackup } = makePrisma({ backupFrequencyHours: 48 });
    databaseBackup.findFirst.mockResolvedValue({ startedAt: new Date(Date.now() - 47 * 3_600_000) });
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    await service.runScheduledBackup();

    expect(databaseBackup.create).toHaveBeenCalled();
  });

  it('respeta cuántas copias guardar en el servidor', async () => {
    process.env['BACKUP_STORAGE_DIR'] = 'C:/tmp/backups';
    process.env['DATABASE_URL'] = 'postgresql://admin:pw@localhost:5432/plexo';
    const { prisma, databaseBackup } = makePrisma({ backupKeepLocal: 3 });
    databaseBackup.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `b-${i}`, filePath: `C:/tmp/backups/b-${i}.dump` })),
    );
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    await service.runDailyBackup();

    expect(databaseBackup.delete).toHaveBeenCalledTimes(2);
  });

  it('rechaza una frecuencia que no está en la lista', async () => {
    const { prisma } = makePrisma();
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    await expect(service.updateSettings({ frequencyHours: 36 })).rejects.toThrow('12, 24, 48 o 168');
  });

  it('al cambiar la hora reprograma el job sin reiniciar', async () => {
    const { prisma } = makePrisma();
    const { registry, job } = makeRegistry();
    const service = new BackupSchedulerService(prisma, registry);

    const result = await service.updateSettings({ hour: 1, keepOffsiteDays: 60 });

    expect(result).toEqual({ frequencyHours: 24, hour: 1, keepLocal: 5, keepOffsiteDays: 60 });
    expect(job.setTime).toHaveBeenCalledTimes(1);
  });
});

describe('redactCredentials', () => {
  it('tapa usuario y contraseña de la URL de la base que trae el error de pg_dump', () => {
    const msg =
      'Command failed: pg_dump --dbname postgresql://postgres:s3cr3t@postgres:5432/plexo --format custom --file /backups/x.dump';
    expect(redactCredentials(msg)).toBe(
      'Command failed: pg_dump --dbname postgresql://***@postgres:5432/plexo --format custom --file /backups/x.dump',
    );
  });

  it('el listado tapa también las filas viejas', async () => {
    const { prisma, databaseBackup } = makePrisma();
    databaseBackup.findMany.mockResolvedValue([
      { id: 'b1', status: 'FAILED', sizeBytes: null, errorMessage: 'pg_dump postgresql://postgres:pw@localhost/plexo' },
    ]);
    const service = new BackupSchedulerService(prisma, makeRegistry().registry);

    const [row] = await service.list();

    expect(row.errorMessage).toBe('pg_dump postgresql://***@localhost/plexo');
  });
});
