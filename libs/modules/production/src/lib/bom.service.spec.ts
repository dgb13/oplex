import { NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { BomService, normalizeBomLine } from './bom.service.js';

function runAsTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    billOfMaterials: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn((args) =>
        Promise.resolve({
          id: 'bom-new',
          ...args.data,
          lines: args.data.lines.createMany.data,
          byproducts: args.data.byproducts?.createMany.data ?? [],
        }),
      ),
    },
    // create() marca el Article como isManufactured al final - ver el
    // comentario en BomService.create.
    articleVariant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ articleId: 'article-output' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    article: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  };
}

describe('BomService.create', () => {
  it('creates the first version (v1, active) when there is no prior recipe', async () => {
    const db = makeDb();
    const service = new BomService();

    const bom = await runAsTenant(db, () =>
      service.create({
        outputArticleVariantId: 'variant-output',
        name: 'Prepizza 30cm',
        lines: [{ inputArticleVariantId: 'variant-harina', quantity: 250 }],
      }),
    );

    expect(bom.version).toBe(1);
    expect(bom.isActive).toBe(true);
    expect(db.billOfMaterials.update).not.toHaveBeenCalled();
  });

  it('marks the output article as isManufactured (skipped in Prisma if already true)', async () => {
    const db = makeDb();
    const service = new BomService();

    await runAsTenant(db, () =>
      service.create({
        outputArticleVariantId: 'variant-output',
        name: 'Prepizza 30cm',
        lines: [{ inputArticleVariantId: 'variant-harina', quantity: 250 }],
      }),
    );

    expect(db.articleVariant.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'variant-output' },
      select: { articleId: true },
    });
    expect(db.article.updateMany).toHaveBeenCalledWith({
      where: { id: 'article-output', isManufactured: false },
      data: { isManufactured: true },
    });
  });

  it('deactivates the previous active version and bumps the version number', async () => {
    const db = makeDb({
      billOfMaterials: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bom-old', version: 2, isActive: true }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn((args) =>
          Promise.resolve({ id: 'bom-new', ...args.data, lines: [], byproducts: [] }),
        ),
      },
    });
    const service = new BomService();

    const bom = await runAsTenant(db, () =>
      service.create({
        outputArticleVariantId: 'variant-output',
        name: 'Prepizza 30cm (receta nueva)',
        lines: [{ inputArticleVariantId: 'variant-harina', quantity: 260 }],
      }),
    );

    expect(db.billOfMaterials.update).toHaveBeenCalledWith({
      where: { id: 'bom-old' },
      data: { isActive: false },
    });
    expect(bom.version).toBe(3);
  });

  it('rejects when byproduct cost shares sum over 100%', async () => {
    const db = makeDb();
    const service = new BomService();

    await expect(
      runAsTenant(db, () =>
        service.create({
          outputArticleVariantId: 'variant-output',
          name: 'Con subproductos',
          lines: [{ inputArticleVariantId: 'variant-insumo', quantity: 1 }],
          byproducts: [
            { outputArticleVariantId: 'variant-sub-1', quantity: 1, costSharePercent: 60 },
            { outputArticleVariantId: 'variant-sub-2', quantity: 1, costSharePercent: 50 },
          ],
        }),
      ),
    ).rejects.toThrow('no puede superar 100');
  });

  it('rejects a recipe that uses its own output as an input', async () => {
    const db = makeDb();
    const service = new BomService();

    await expect(
      runAsTenant(db, () =>
        service.create({
          outputArticleVariantId: 'variant-output',
          name: 'Autorreferencia',
          lines: [{ inputArticleVariantId: 'variant-output', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('propio producto como insumo');
  });

  it('rejects a byproduct that is the recipe output itself', async () => {
    const db = makeDb();
    const service = new BomService();

    await expect(
      runAsTenant(db, () =>
        service.create({
          outputArticleVariantId: 'variant-output',
          name: 'Subproducto = producto',
          lines: [{ inputArticleVariantId: 'variant-insumo', quantity: 1 }],
          byproducts: [{ outputArticleVariantId: 'variant-output', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('mismo producto');
  });
});

describe('BomService.getActiveBomOrThrow', () => {
  it('throws NotFoundException when the article has no active recipe', async () => {
    const db = makeDb();
    const service = new BomService();

    await expect(runAsTenant(db, () => service.getActiveBomOrThrow('variant-x'))).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('normalizeBomLine', () => {
  const line = { inputArticleVariantId: 'v', quantity: 1 };

  it('1D: la cantidad es largo × cortes, aunque se haya cargado otra', () => {
    expect(normalizeBomLine({ ...line, length: 1200, cutsCount: 2 }, 'LINEAL_1D')).toMatchObject({
      quantity: 2400,
      length: 1200,
      cutsCount: 2,
    });
  });

  it('1D sin largo: la cantidad es el largo de un corte', () => {
    expect(normalizeBomLine({ ...line, quantity: 800 }, 'LINEAL_1D')).toMatchObject({
      quantity: 800,
      length: 800,
      cutsCount: 1,
    });
  });

  it('2D: la cantidad es largo × ancho × piezas, en m²', () => {
    expect(normalizeBomLine({ ...line, length: 1200, width: 600 }, 'SURFACE_2D').quantity).toBe(0.72);
    expect(normalizeBomLine({ ...line, length: 80, width: 80, cutsCount: 4 }, 'SURFACE_2D').quantity).toBe(0.026);
  });

  it('unidades y gr/ml: descarta largo, ancho y cortes', () => {
    expect(normalizeBomLine({ ...line, quantity: 200, cutsCount: 1, length: 5 }, 'CONTINUOUS')).toEqual({
      ...line,
      quantity: 200,
      length: undefined,
      width: undefined,
      cutsCount: undefined,
    });
  });
});

describe('BomService.create - insumos por medida', () => {
  it('guarda la cantidad calculada con las medidas del insumo', async () => {
    const db = makeDb();
    db.articleVariant.findMany.mockResolvedValue([{ id: 'variant-tubo', article: { measurementType: 'LINEAL_1D' } }]);
    const service = new BomService();

    await runAsTenant(db, () =>
      service.create({
        outputArticleVariantId: 'variant-output',
        name: 'Marco',
        lines: [{ inputArticleVariantId: 'variant-tubo', quantity: 1, length: 1200, cutsCount: 2 }],
      }),
    );

    const created = db.billOfMaterials.create.mock.calls[0][0].data.lines.createMany.data;
    expect(created[0]).toMatchObject({ quantity: 2400, length: 1200, cutsCount: 2 });
  });
});

describe('BomService.averageCosts', () => {
  it('weights the average cost by stock across warehouses and returns null without cost', async () => {
    const db = makeDb({
      stockLedger: {
        findMany: jest.fn().mockResolvedValue([
          { articleVariantId: 'harina', quantity: '300', avgUnitCost: '0.8' },
          { articleVariantId: 'harina', quantity: '100', avgUnitCost: '1.2' },
          { articleVariantId: 'sal', quantity: '0', avgUnitCost: '1' },
          { articleVariantId: 'agua', quantity: '50', avgUnitCost: null },
        ]),
      },
    });
    const service = new BomService();

    const costs = await runAsTenant(db, () => service.averageCosts(['harina', 'sal', 'agua']));

    expect(costs['harina']).toBeCloseTo(0.9);
    expect(costs['sal']).toBe(1);
    expect(costs['agua']).toBeNull();
  });
});
