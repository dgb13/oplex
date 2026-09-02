import { execFile } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import type { PrismaService } from '@plexo/database';
import { BackupSchedulerService } from './backup-scheduler.service.js';

// jest hoists these above the imports above regardless of source position.
jest.mock('node:child_process', () => ({
  execFile: jest.fn((_file: string, _args: string[], callback: (err: Error | null) => void) => callback(null)),
}));
jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 12_345 }),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

function makePrisma() {
  const databaseBackup = {
    create: jest.fn().mockResolvedValue({ id: 'backup-1' }),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({}),
  };
  return { prisma: { databaseBackup } as unknown as PrismaService, databaseBackup };
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
    const service = new BackupSchedulerService(prisma);

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
    const service = new BackupSchedulerService(prisma);

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
    const service = new BackupSchedulerService(prisma);

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
    const service = new BackupSchedulerService(prisma);

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
    const service = new BackupSchedulerService(prisma);

    const result = await service.list();

    expect(result).toEqual([
      { id: 'b1', status: 'COMPLETED', sizeBytes: 999 },
      { id: 'b2', status: 'FAILED', sizeBytes: null },
    ]);
  });
});
