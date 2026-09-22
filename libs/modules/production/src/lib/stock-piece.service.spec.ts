import { Prisma, tenantContextStorage } from '@plexo/database';
import { StockPieceService } from './stock-piece.service.js';

function runAsTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makePiece(overrides: Record<string, unknown> = {}) {
  return {
    id: 'piece-1',
    articleVariantId: 'variant-cable',
    warehouseId: 'warehouse-1',
    originalLength: new Prisma.Decimal(2000),
    currentLength: new Prisma.Decimal(2000),
    status: 'AVAILABLE',
    sourceType: 'FULL_STOCK',
    parentPieceId: null,
    unitCost: new Prisma.Decimal(5),
    ...overrides,
  };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    stockPiece: {
      create: jest.fn((args) => Promise.resolve({ id: 'piece-new', ...args.data })),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { currentLength: null } }),
    },
    ...overrides,
  };
}

describe('StockPieceService.cutPiece', () => {
  it('depletes the piece and creates no offcut on an exact cut', async () => {
    const piece = makePiece();
    const db = makeDb({
      stockPiece: {
        findUnique: jest.fn().mockResolvedValue(piece),
        update: jest.fn((args) => Promise.resolve({ ...piece, ...args.data })),
        create: jest.fn(),
      },
    });
    const service = new StockPieceService();

    const result = await runAsTenant(db, () =>
      service.cutPiece({ pieceId: 'piece-1', lengthToCut: 2000, minUsableLength: 100 }),
    );

    expect(result.consumedFrom.status).toBe('DEPLETED');
    expect(result.offcut).toBeNull();
    expect(db.stockPiece.create).not.toHaveBeenCalled();
  });

  it('creates an AVAILABLE offcut when the remainder is above minUsableLength', async () => {
    const piece = makePiece({ currentLength: new Prisma.Decimal(2000) });
    const db = makeDb({
      stockPiece: {
        findUnique: jest.fn().mockResolvedValue(piece),
        update: jest.fn((args) => Promise.resolve({ ...piece, ...args.data })),
        create: jest.fn((args) => Promise.resolve({ id: 'offcut-1', ...args.data })),
      },
    });
    const service = new StockPieceService();

    const result = await runAsTenant(db, () =>
      service.cutPiece({ pieceId: 'piece-1', lengthToCut: 900, minUsableLength: 100 }),
    );

    expect(result.offcut).not.toBeNull();
    expect(result.offcut?.status).toBe('AVAILABLE');
    expect(result.offcut?.currentLength.toString()).toBe('1100');
    // El costo por mm se hereda tal cual, nunca se recalcula.
    expect(result.offcut?.unitCost.toString()).toBe('5');
  });

  it('marks the offcut SCRAP when the remainder is below minUsableLength', async () => {
    const piece = makePiece({ currentLength: new Prisma.Decimal(1000) });
    const db = makeDb({
      stockPiece: {
        findUnique: jest.fn().mockResolvedValue(piece),
        update: jest.fn((args) => Promise.resolve({ ...piece, ...args.data })),
        create: jest.fn((args) => Promise.resolve({ id: 'offcut-1', ...args.data })),
      },
    });
    const service = new StockPieceService();

    const result = await runAsTenant(db, () =>
      service.cutPiece({ pieceId: 'piece-1', lengthToCut: 950, minUsableLength: 100 }),
    );

    expect(result.offcut?.status).toBe('SCRAP');
    expect(result.offcut?.currentLength.toString()).toBe('50');
  });

  it('rejects cutting more than the piece has left', async () => {
    const piece = makePiece({ currentLength: new Prisma.Decimal(500) });
    const db = makeDb({ stockPiece: { findUnique: jest.fn().mockResolvedValue(piece) } });
    const service = new StockPieceService();

    await expect(
      runAsTenant(db, () => service.cutPiece({ pieceId: 'piece-1', lengthToCut: 600, minUsableLength: 100 })),
    ).rejects.toThrow('más corta que el corte solicitado');
  });

  it('rejects cutting a piece that is not AVAILABLE', async () => {
    const piece = makePiece({ status: 'DEPLETED' });
    const db = makeDb({ stockPiece: { findUnique: jest.fn().mockResolvedValue(piece) } });
    const service = new StockPieceService();

    await expect(
      runAsTenant(db, () => service.cutPiece({ pieceId: 'piece-1', lengthToCut: 100, minUsableLength: 100 })),
    ).rejects.toThrow('no está disponible');
  });
});

describe('StockPieceService.returnFullPieces', () => {
  it('depletes the N newest intact pieces (LIFO)', async () => {
    const older = makePiece({ id: 'piece-old', createdAt: new Date('2026-09-14') });
    const newer1 = makePiece({ id: 'piece-new-1', createdAt: new Date('2026-09-22T10:00:00Z') });
    const newer2 = makePiece({ id: 'piece-new-2', createdAt: new Date('2026-09-22T10:00:01Z') });
    // findMany already comes back ordered newest-first (orderBy createdAt desc, as the service requests).
    const findMany = jest.fn().mockResolvedValue([newer2, newer1, older]);
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const db = makeDb({ stockPiece: { findMany, updateMany } });
    const service = new StockPieceService();

    const result = await runAsTenant(db, () =>
      service.returnFullPieces({ articleVariantId: 'variant-cable', warehouseId: 'warehouse-1', count: 2 }),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        articleVariantId: 'variant-cable',
        warehouseId: 'warehouse-1',
        status: 'AVAILABLE',
        sourceType: 'FULL_STOCK',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['piece-new-2', 'piece-new-1'] } },
      data: { status: 'DEPLETED', currentLength: 0 },
    });
    expect(result.map((p) => p.id)).toEqual(['piece-new-2', 'piece-new-1']);
  });

  it('ignores pieces that were already cut (currentLength != originalLength) even if AVAILABLE', async () => {
    const cut = makePiece({ id: 'piece-cut', currentLength: new Prisma.Decimal(500) });
    const intact = makePiece({ id: 'piece-intact' });
    const db = makeDb({ stockPiece: { findMany: jest.fn().mockResolvedValue([intact, cut]) } });
    const service = new StockPieceService();

    await expect(
      runAsTenant(db, () =>
        service.returnFullPieces({ articleVariantId: 'variant-cable', warehouseId: 'warehouse-1', count: 2 }),
      ),
    ).rejects.toThrow('Sólo hay 1 pieza(s) entera(s) sin cortar disponibles para devolver - se pidieron 2.');
  });

  it('rejects returning more than what is intact, without touching any row', async () => {
    const db = makeDb({
      stockPiece: { findMany: jest.fn().mockResolvedValue([makePiece()]), updateMany: jest.fn() },
    });
    const service = new StockPieceService();

    await expect(
      runAsTenant(db, () =>
        service.returnFullPieces({ articleVariantId: 'variant-cable', warehouseId: 'warehouse-1', count: 5 }),
      ),
    ).rejects.toThrow('se pidieron 5');
    expect(db.stockPiece.updateMany).not.toHaveBeenCalled();
  });
});

describe('StockPieceService.listByArticleVariant', () => {
  it('lists every piece of the article regardless of status, newest first', async () => {
    const findMany = jest.fn().mockResolvedValue([makePiece({ status: 'DEPLETED' }), makePiece()]);
    const db = makeDb({ stockPiece: { findMany } });
    const service = new StockPieceService();

    const result = await runAsTenant(db, () =>
      service.listByArticleVariant({ articleVariantId: 'variant-cable', warehouseId: 'warehouse-1' }),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { articleVariantId: 'variant-cable', warehouseId: 'warehouse-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(2);
  });
});
