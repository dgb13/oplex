import { NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { BomService } from './bom.service.js';

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
