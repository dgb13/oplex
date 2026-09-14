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
      update: jest.fn((args) => Promise.resolve({ id: args.where.id, ...args.data })),
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
    ).rejects.toThrow('shorter than the requested cut');
  });

  it('rejects cutting a piece that is not AVAILABLE', async () => {
    const piece = makePiece({ status: 'DEPLETED' });
    const db = makeDb({ stockPiece: { findUnique: jest.fn().mockResolvedValue(piece) } });
    const service = new StockPieceService();

    await expect(
      runAsTenant(db, () => service.cutPiece({ pieceId: 'piece-1', lengthToCut: 100, minUsableLength: 100 })),
    ).rejects.toThrow('not available');
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
