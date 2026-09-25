import { Prisma, tenantContextStorage } from '@plexo/database';
import { ProductionOrderService } from './production-order.service.js';
import type { BomService } from './bom.service.js';
import type { ProductionNumberingService } from './production-numbering.service.js';
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
  const numbering = { nextNumber: jest.fn().mockResolvedValue('OP-000001') };
  return new ProductionOrderService(
    bomService as unknown as BomService,
    planningService as unknown as ProductionPlanningService,
    numbering as unknown as ProductionNumberingService,
  );
}

describe('ProductionOrderService.create', () => {
  it('freezes bomId/bomVersion from the currently active recipe and numbers it against the creating user', async () => {
    const db = makeDb();
    const service = makeService({ db });

    await runAsTenant(db, () => service.create({ outputArticleVariantId: 'variant-prepizza', quantity: 4 }));

    expect(db.productionOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bomId: 'bom-1',
          bomVersion: 1,
          status: 'DRAFT',
          number: 'OP-000001',
          createdByUserId: 'user-1',
        }),
      }),
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
      'Sólo se puede confirmar una orden en borrador',
    );
  });
});

describe('ProductionOrderService.retryReservation', () => {
  function makeShortOrderDb(existingReservations: Record<string, unknown>[]) {
    return makeDb({
      productionOrder: {
        findUnique: jest.fn().mockResolvedValue(makeOrder({ status: 'PLANNED', isShortOnMaterials: true })),
        update: jest.fn((args) =>
          Promise.resolve({ ...makeOrder({ status: 'PLANNED', isShortOnMaterials: true }), ...args.data }),
        ),
      },
      stockReservation: {
        create: jest.fn((args) => Promise.resolve({ id: 'reservation-new', ...args.data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue(existingReservations),
      },
    });
  }

  it('only tops up the still-missing insumo, leaving the already-reserved one untouched', async () => {
    const db = makeShortOrderDb([
      {
        inputArticleVariantId: 'variant-harina',
        quantityReserved: new Prisma.Decimal(1000),
        warehouseId: 'warehouse-1',
      },
    ]);
    const service = makeService({
      db,
      bomLines: [
        { inputArticleVariantId: 'variant-harina', quantity: 250 },
        { inputArticleVariantId: 'variant-azucar', quantity: 100 },
      ],
      // harina ya está cubierta (1000 reservado = 250*4 requerido) - sólo
      // azúcar (100*4 = 400 requerido) todavía falta, y ahora hay 500.
      disponible: { 'variant-harina': 0, 'variant-azucar': 500 },
    });

    const order = await runAsTenant(db, () => service.retryReservation('order-1', 'warehouse-1'));

    expect(db.stockReservation.create).toHaveBeenCalledTimes(1);
    const call = (db.stockReservation.create as jest.Mock).mock.calls[0][0].data;
    expect(call.inputArticleVariantId).toBe('variant-azucar');
    expect(call.quantityReserved.toString()).toBe('400');
    expect(order.isShortOnMaterials).toBe(false);
  });

  it('still sets isShortOnMaterials when the top-up itself falls short', async () => {
    const db = makeShortOrderDb([]);
    const service = makeService({
      db,
      bomLines: [{ inputArticleVariantId: 'variant-azucar', quantity: 100 }],
      disponible: { 'variant-azucar': 50 },
    });

    const order = await runAsTenant(db, () => service.retryReservation('order-1', 'warehouse-1'));

    expect(order.isShortOnMaterials).toBe(true);
  });

  it('tops up correctly when the same insumo appears in more than one recipe line', async () => {
    // Receta: 2 huevos + 2 huevos por unidad, orden de 4 -> 8 + 8 = 16.
    // confirm() había reservado 8 (línea 1) + 4 (línea 2) = 12. Antes el
    // total reservado (12) se restaba contra CADA línea (8) y las dos
    // daban cubiertas - quedaba short=false con 12 de 16 reservados.
    const db = makeShortOrderDb([
      { inputArticleVariantId: 'variant-huevo', quantityReserved: new Prisma.Decimal(8), warehouseId: 'warehouse-1' },
      { inputArticleVariantId: 'variant-huevo', quantityReserved: new Prisma.Decimal(4), warehouseId: 'warehouse-1' },
    ]);
    const service = makeService({
      db,
      bomLines: [
        { inputArticleVariantId: 'variant-huevo', quantity: 2 },
        { inputArticleVariantId: 'variant-huevo', quantity: 2 },
      ],
      disponible: { 'variant-huevo': 10 },
    });

    const order = await runAsTenant(db, () => service.retryReservation('order-1', 'warehouse-1'));

    expect(db.stockReservation.create).toHaveBeenCalledTimes(1);
    expect((db.stockReservation.create as jest.Mock).mock.calls[0][0].data.quantityReserved.toString()).toBe('4');
    expect(order.isShortOnMaterials).toBe(false);
  });

  it('rejects retrying an order that is not PLANNED+isShortOnMaterials', async () => {
    const db = makeDb({
      productionOrder: { findUnique: jest.fn().mockResolvedValue(makeOrder({ status: 'PLANNED' })) },
    });
    const service = makeService({ db });

    await expect(runAsTenant(db, () => service.retryReservation('order-1', 'warehouse-1'))).rejects.toThrow(
      'planificada con insumos faltantes',
    );
  });

  it('rejects a different warehouse than the one already reserved against', async () => {
    const db = makeShortOrderDb([
      { inputArticleVariantId: 'variant-harina', quantityReserved: new Prisma.Decimal(1), warehouseId: 'warehouse-1' },
    ]);
    const service = makeService({ db });

    await expect(runAsTenant(db, () => service.retryReservation('order-1', 'warehouse-2'))).rejects.toThrow(
      'ya tiene insumos reservados en otro depósito',
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

    await expect(runAsTenant(db, () => service.cancel('order-1'))).rejects.toThrow('No se puede cancelar');
  });
});

describe('ProductionOrderService.getById', () => {
  it('includes reservations/consumptions/outputs/bom.lines', async () => {
    const findUnique = jest.fn().mockResolvedValue(makeOrder());
    const db = makeDb({ productionOrder: { findUnique } });
    const service = makeService({ db });

    await runAsTenant(db, () => service.getById('order-1'));

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      include: {
        reservations: true,
        consumptions: true,
        outputs: true,
        bom: { include: { lines: true } },
      },
    });
  });

  it('throws NotFoundException when the order does not exist', async () => {
    const db = makeDb({ productionOrder: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = makeService({ db });

    await expect(runAsTenant(db, () => service.getById('missing'))).rejects.toThrow('no encontrada');
  });
});

describe('ProductionOrderService.getCalendarEntries', () => {
  const FROM = new Date('2026-09-01');
  const TO = new Date('2026-09-30');

  function orderWithDates(overrides: Record<string, unknown>) {
    return {
      ...makeOrder(),
      status: 'DONE',
      outputArticleVariant: { article: { name: 'Cartelería vial' } },
      startedAt: null,
      finishedAt: null,
      ...overrides,
    };
  }

  it('emits one entry for startedAt and one for finishedAt when both are in range', async () => {
    const order = orderWithDates({
      startedAt: new Date('2026-09-16T10:00:00.000Z'),
      finishedAt: new Date('2026-09-19T15:00:00.000Z'),
    });
    const findMany = jest.fn().mockResolvedValue([order]);
    const db = makeDb({ productionOrder: { findMany } });
    const service = makeService({ db });

    const entries = await runAsTenant(db, () => service.getCalendarEntries(FROM, TO));

    expect(entries).toEqual([
      {
        id: 'order-1-start',
        source: 'prod',
        title: 'Cartelería vial',
        date: '2026-09-16T10:00:00.000Z',
        amount: null,
        flow: null,
        ref: 'Inicio de producción',
        editable: false,
        link: { module: 'production-order', id: 'order-1' },
      },
      {
        id: 'order-1-finish',
        source: 'prod',
        title: 'Cartelería vial',
        date: '2026-09-19T15:00:00.000Z',
        amount: null,
        flow: null,
        ref: 'Entrega de producción',
        editable: false,
        link: { module: 'production-order', id: 'order-1' },
      },
    ]);
  });

  it('queries only non-CANCELLED orders with a start or finish date in range', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = makeDb({ productionOrder: { findMany } });
    const service = makeService({ db });

    await runAsTenant(db, () => service.getCalendarEntries(FROM, TO));

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: { not: 'CANCELLED' },
        OR: [{ startedAt: { gte: FROM, lte: TO } }, { finishedAt: { gte: FROM, lte: TO } }],
      },
      include: { outputArticleVariant: { include: { article: true } } },
    });
  });
});
