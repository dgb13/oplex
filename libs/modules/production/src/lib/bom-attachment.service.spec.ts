import { unlink, writeFile } from 'node:fs/promises';
import { tenantContextStorage } from '@plexo/database';
import { BomAttachmentService } from './bom-attachment.service.js';

jest.mock('node:fs', () => ({ mkdirSync: jest.fn() }));
jest.mock('node:fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

function runInTenant<T>(db: Record<string, unknown>, fn: () => T, userId = 'user-1'): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId, tx: db as never }, fn);
}

function runWithoutUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, fn);
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    billOfMaterials: {
      findUnique: jest.fn().mockResolvedValue({ id: 'bom-1' }),
    },
    bomAttachment: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 'att-1', fileUrl: '/uploads/bom/old-file.pdf' }),
      create: jest.fn((args) => Promise.resolve({ id: 'att-new', ...args.data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
  };
}

describe('BomAttachmentService.list', () => {
  it('lists attachments for a bom, newest first', async () => {
    const db = makeDb();
    const service = new BomAttachmentService();

    await runInTenant(db, () => service.list('bom-1'));

    expect(db.bomAttachment.findMany).toHaveBeenCalledWith({
      where: { bomId: 'bom-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('BomAttachmentService.upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a PDF, writes the file and creates the row', async () => {
    const db = makeDb();
    const service = new BomAttachmentService();

    const result = await runInTenant(db, () =>
      service.upload('bom-1', 'application/pdf', 'plano.pdf', Buffer.from('x')),
    );

    expect(writeFile).toHaveBeenCalled();
    const createArgs = (db.bomAttachment.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      tenantId: 'tenant-1',
      bomId: 'bom-1',
      fileType: 'PDF',
      fileName: 'plano.pdf',
      fileSizeBytes: 1,
      uploadedByUserId: 'user-1',
    });
    expect(createArgs.data.fileUrl).toMatch(/^\/uploads\/bom\/.+\.pdf$/);
    expect(result.fileType).toBe('PDF');
  });

  it('accepts a ZIP even when the browser sends a generic octet-stream mimetype', async () => {
    const db = makeDb();
    const service = new BomAttachmentService();

    await runInTenant(db, () =>
      service.upload('bom-1', 'application/octet-stream', 'planos.zip', Buffer.from('x')),
    );

    const createArgs = (db.bomAttachment.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.fileType).toBe('ZIP');
    expect(createArgs.data.fileUrl).toMatch(/^\/uploads\/bom\/.+\.zip$/);
  });

  it('rejects a file that is neither PDF nor ZIP', async () => {
    const db = makeDb();
    const service = new BomAttachmentService();

    await expect(
      runInTenant(db, () => service.upload('bom-1', 'image/png', 'foto.png', Buffer.from('x'))),
    ).rejects.toThrow('Only PDF or ZIP files are allowed');
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects a ZIP-mimetype file whose name does not end in .zip', async () => {
    const db = makeDb();
    const service = new BomAttachmentService();

    await expect(
      runInTenant(db, () => service.upload('bom-1', 'application/zip', 'planos.rar', Buffer.from('x'))),
    ).rejects.toThrow('Only PDF or ZIP files are allowed');
  });

  it('rejects a PDF larger than 10MB', async () => {
    const db = makeDb();
    const service = new BomAttachmentService();
    const bigBuffer = Buffer.alloc(11 * 1024 * 1024);

    await expect(
      runInTenant(db, () => service.upload('bom-1', 'application/pdf', 'plano.pdf', bigBuffer)),
    ).rejects.toThrow('smaller than');
  });

  it('rejects when the BOM does not exist', async () => {
    const db = makeDb({ billOfMaterials: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new BomAttachmentService();

    await expect(
      runInTenant(db, () => service.upload('bom-missing', 'application/pdf', 'plano.pdf', Buffer.from('x'))),
    ).rejects.toThrow('not found');
  });

  it('rejects when there is no authenticated user', async () => {
    const db = makeDb();
    const service = new BomAttachmentService();

    await expect(
      runWithoutUser(db, () => service.upload('bom-1', 'application/pdf', 'plano.pdf', Buffer.from('x'))),
    ).rejects.toThrow('authenticated user');
  });
});

describe('BomAttachmentService.remove', () => {
  it('deletes the row and unlinks the file on disk', async () => {
    const db = makeDb();
    const service = new BomAttachmentService();

    await runInTenant(db, () => service.remove('att-1'));

    expect(db.bomAttachment.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('old-file.pdf'));
  });

  it('throws NotFoundException when the attachment does not exist', async () => {
    const db = makeDb({ bomAttachment: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new BomAttachmentService();

    await expect(runInTenant(db, () => service.remove('missing'))).rejects.toThrow('not found');
  });
});
