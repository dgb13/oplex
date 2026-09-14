import { Prisma, tenantContextStorage } from '@plexo/database';
import { ProductionOrderService } from './production-order.service.js';
import type { BomService } from './bom.service.js';
import type { ProductionPlanningService } from './production-planning.service.js';

function runAsTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    outputArticleVariantId: 'variant-prepizza',
    bomId: 'bom-1',
    bomVersion: 1,
    quantity: new Prisma.Decimal(4),
    status: 'DRAFT',
    isShortOnMaterials: false,
    ...overrides,
  };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    productionOrder: {
      create: jest.fn((args) => Promise.resolve({ id: 'order-new', ...args.data })),
      findUnique: jest.fn().mockResolvedValue(makeOrder()),
      update: jest.fn((args) => Promise.resolve({ ...makeOrder(), ...args.data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    stockReservation: {
      create: jest.fn((args) => Promise.resolve({ id: 'reservation-new', ...args.data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    productionConsumption: { create: jest.fn((args) => Promise.resolve({ id: 'consumption-1', ...args.data })) },
    productionOutput: { create: jest.fn((args) => Promise.resolve({ id: 'output-1', ...args.data })) },
    ...overrides,
  };
}

function makeService(input: {
  db: Record<string, unknown>;
  bomLines?: { inputArticleVariantId: string; quantity: number; expectedWastePercent?: number }[];
  disponible?: Record<string, number>;
}) {
  const bomService = {
    getActiveBomOrThrow: jest.fn().mockResolvedValue({ id: 'bom-1', version: 1 }),
    getById: jest.fn().mockResolvedValue({
      id: 'bom-1',
      lines: (input.bomLines ?? []).map((l) => ({
        inputArticleVariantId: l.inputArticleVariantId,
        quantity: new Prisma.Decimal(l.quantity),
        expectedWastePercent: new Prisma.Decimal(l.expectedWastePercent ?? 0),
      })),
    }),
  };
  const planningService = {
    getDisponible: jest.fn(({ articleVariantId }: { articleVariantId: string }) =>
      Promise.resolve(new Prisma.Decimal(input.disponible?.[articleVariantId] ?? 0)),
    ),
  };
  return new ProductionOrderService(bomService as unknown as BomService, planningService as unknown as ProductionPlanningService);
}

describe('ProductionOrderService.create', () => {
  it('freezes bomId/bomVersion from the currently active recipe', async () => {
    const db = makeDb();
    const service = makeService({ db });

    await runAsTenant(db, () => service.create({ outputArticleVariantId: 'variant-prepizza', quantity: 4 }));

    expect(db.productionOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bomId: 'bom-1', bomVersion: 1, status: 'DRAFT' }) }),
    );
  });
});

describe('ProductionOrderService.confirm', () => {
  it('reserves the full requirement and clears isShortOnMaterials when there is enough disponible', async () => {
    const db = makeDb();
    const service = makeService({
      db,
      bomLines: [{ inputArticleVariantId: 'variant-harina', quantity: 250 }],
      disponible: { 'variant-harina': 2000 },
    });

    const order = await runAsTenant(db, () => service.confirm('order-1', 'warehouse-1'));

    // requerido = 250 * 4 (order.quantity) = 1000, disponible 2000 alcanza.
    expect(db.stockReservation.create).toHaveBeenCalledTimes(1);
    const reservedArg = (db.stockReservation.create as jest.Mock).mock.calls[0][0].data.quantityReserved;
    expect(reservedArg.toString()).toBe('1000');
    expect(order.status).toBe('PLANNED');
    expect(order.isShortOnMaterials).toBe(false);
  });

  it('reserves only what is available and sets isShortOnMaterials when it falls short', async () => {
    const db = makeDb();
    const service = makeService({
      db,
      bomLines: [{ inputArticleVariantId: 'variant-harina', quantity: 250 }],
      disponible: { 'variant-harina': 300 },
    });

    const order = await runAsTenant(db, () => service.confirm('order-1', 'warehouse-1'));

    const reservedArg = (db.stockReservation.create as jest.Mock).mock.calls[0][0].data.quantityReserved;
    expect(reservedArg.toString()).toBe('300');
    expect(order.isShortOnMaterials).toBe(true);
  });

  it('rejects confirming an order that is not DRAFT', async () => {
    const db = makeDb({
      productionOrder: {
        findUnique: jest.fn().mockResolvedValue(makeOrder({ status: 'PLANNED' })),
        update: jest.fn(),
      },
    });
    const service = makeService({ db });

    await expect(runAsTenant(db, () => service.confirm('order-1', 'warehouse-1'))).rejects.toThrow(
      'Only a DRAFT order can be confirmed',
    );
  });
});

describe('ProductionOrderService.cancel', () => {
  it('releases active reservations and cancels a PLANNED order', async () => {
    const db = makeDb({
      productionOrder: {
        findUnique: jest.fn().mockResolvedValue(makeOrder({ status: 'PLANNED' })),
        update: jest.fn((args) => Promise.resolve({ ...makeOrder({ status: 'PLANNED' }), ...args.data })),
      },
    });
    const service = makeService({ db });

    const order = await runAsTenant(db, () => service.cancel('order-1'));

    expect(db.stockReservation.updateMany).toHaveBeenCalledWith({
      where: { productionOrderId: 'order-1', status: 'ACTIVE' },
      data: { status: 'RELEASED' },
    });
    expect(order.status).toBe('CANCELLED');
  });

  it('rejects cancelling an order that is already DONE', async () => {
    const db = makeDb({
      productionOrder: { findUnique: jest.fn().mockResolvedValue(makeOrder({ status: 'DONE' })) },
    });
    const service = makeService({ db });

    await expect(runAsTenant(db, () => service.cancel('order-1'))).rejects.toThrow("can't be cancelled");
  });
});
