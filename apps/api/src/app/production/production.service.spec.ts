import { Prisma, tenantContextStorage } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { BomService, ProductionOrderService, StockPieceService } from '@plexo/production';
import { ProductionService } from './production.service.js';

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
    status: 'PLANNED',
    isShortOnMaterials: false,
    ...overrides,
  };
}

function makeReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reservation-1',
    productionOrderId: 'order-1',
    inputArticleVariantId: 'variant-harina',
    warehouseId: 'warehouse-1',
    quantityReserved: new Prisma.Decimal(1000),
    stockPieceId: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('ProductionService.completeOrder', () => {
  it('records one PRODUCTION_OUT/consumption per DISCRETE-or-similar reservation, then one PRODUCTION_IN output for the primary product', async () => {
    const order = makeOrder();
    const reservation = makeReservation();
    const db = {
      articleVariant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ article: { measurementType: 'DISCRETE', minUsableLength: null } }),
      },
    };
    const orderService = {
      assertCompletable: jest.fn().mockResolvedValue(order),
      getActiveReservations: jest.fn().mockResolvedValue([reservation]),
      recordConsumption: jest.fn().mockResolvedValue({}),
      recordOutput: jest.fn().mockResolvedValue({}),
      finishOrder: jest.fn().mockResolvedValue({ ...order, status: 'DONE' }),
    };
    const bomService = { getById: jest.fn().mockResolvedValue({ id: 'bom-1', byproducts: [] }) };
    const stockPieceService = {};
    const inventoryService = {
      recordMovement: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(2) }),
    };

    const service = new ProductionService(
      orderService as unknown as ProductionOrderService,
      stockPieceService as unknown as StockPieceService,
      bomService as unknown as BomService,
      inventoryService as unknown as InventoryService,
    );

    const result = await runAsTenant(db, () => service.completeOrder('order-1'));

    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PRODUCTION_OUT', articleVariantId: 'variant-harina', quantity: 1000 }),
    );
    // cost = unitCost(2) * quantityReserved(1000) = 2000
    expect(orderService.recordConsumption).toHaveBeenCalledWith(
      expect.objectContaining({ cost: expect.objectContaining({ toString: expect.any(Function) }) }),
    );
    const consumptionCost = (orderService.recordConsumption as jest.Mock).mock.calls[0][0].cost;
    expect(consumptionCost.toString()).toBe('2000');

    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PRODUCTION_IN', articleVariantId: 'variant-prepizza', quantity: 4 }),
    );
    const outputCall = (orderService.recordOutput as jest.Mock).mock.calls[0][0];
    expect(outputCall.isPrimary).toBe(true);
    expect(outputCall.cost.toString()).toBe('2000');
    expect(result.status).toBe('DONE');
  });

  it('cuts across two stock pieces for a 1D input when a single piece does not cover the whole reservation', async () => {
    const order = makeOrder();
    const reservation = makeReservation({ inputArticleVariantId: 'variant-cable', quantityReserved: new Prisma.Decimal(900) });
    const db = {
      articleVariant: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ article: { measurementType: 'LINEAL_1D', minUsableLength: new Prisma.Decimal(100) } }),
      },
    };
    const pieceA = { id: 'piece-a', currentLength: new Prisma.Decimal(600), unitCost: new Prisma.Decimal(3) };
    const pieceB = { id: 'piece-b', currentLength: new Prisma.Decimal(500), unitCost: new Prisma.Decimal(4) };
    const orderService = {
      assertCompletable: jest.fn().mockResolvedValue(order),
      getActiveReservations: jest.fn().mockResolvedValue([reservation]),
      recordConsumption: jest.fn().mockResolvedValue({}),
      recordOutput: jest.fn().mockResolvedValue({}),
      finishOrder: jest.fn().mockResolvedValue({ ...order, status: 'DONE' }),
    };
    const bomService = { getById: jest.fn().mockResolvedValue({ id: 'bom-1', byproducts: [] }) };
    // No single AVAILABLE piece has >= 900mm (findBestFitPiece returns
    // null both times) - primero se agota pieceA entera (600), después
    // queda 300 y pieceB sí alcanza para eso.
    const stockPieceService = {
      findBestFitPiece: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(pieceB),
      findLargestPiece: jest.fn().mockResolvedValueOnce(pieceA),
      cutPiece: jest
        .fn()
        .mockResolvedValueOnce({ consumedFrom: { ...pieceA, status: 'DEPLETED' }, offcut: null })
        .mockResolvedValueOnce({ consumedFrom: { ...pieceB, status: 'DEPLETED' }, offcut: null }),
    };
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({ unitCost: null }) };

    const service = new ProductionService(
      orderService as unknown as ProductionOrderService,
      stockPieceService as unknown as StockPieceService,
      bomService as unknown as BomService,
      inventoryService as unknown as InventoryService,
    );

    await runAsTenant(db, () => service.completeOrder('order-1'));

    expect(stockPieceService.cutPiece).toHaveBeenCalledTimes(2);
    expect(stockPieceService.cutPiece).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ pieceId: 'piece-a', lengthToCut: expect.objectContaining({ toString: expect.any(Function) }) }),
    );
    expect((stockPieceService.cutPiece as jest.Mock).mock.calls[0][0].lengthToCut.toString()).toBe('600');
    expect((stockPieceService.cutPiece as jest.Mock).mock.calls[1][0].lengthToCut.toString()).toBe('300');
    expect(orderService.recordConsumption).toHaveBeenCalledTimes(2);
    // Espeja StockLedger una sola vez, por el total reservado (900), no
    // una vez por pieza cortada.
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PRODUCTION_OUT', articleVariantId: 'variant-cable', quantity: 900 }),
    );
  });

  it('splits output cost between declared byproducts and the primary product', async () => {
    const order = makeOrder({ quantity: new Prisma.Decimal(1) });
    const reservation = makeReservation();
    const db = {
      articleVariant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ article: { measurementType: 'DISCRETE', minUsableLength: null } }),
      },
    };
    const orderService = {
      assertCompletable: jest.fn().mockResolvedValue(order),
      getActiveReservations: jest.fn().mockResolvedValue([reservation]),
      recordConsumption: jest.fn().mockResolvedValue({}),
      recordOutput: jest.fn().mockResolvedValue({}),
      finishOrder: jest.fn().mockResolvedValue({ ...order, status: 'DONE' }),
    };
    const bomService = {
      getById: jest.fn().mockResolvedValue({
        id: 'bom-1',
        byproducts: [{ outputArticleVariantId: 'variant-subproducto', quantity: new Prisma.Decimal(2), costSharePercent: new Prisma.Decimal(20) }],
      }),
    };
    const stockPieceService = {};
    // costo total consumido = unitCost(10) * 1000 = 10000
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(10) }) };

    const service = new ProductionService(
      orderService as unknown as ProductionOrderService,
      stockPieceService as unknown as StockPieceService,
      bomService as unknown as BomService,
      inventoryService as unknown as InventoryService,
    );

    await runAsTenant(db, () => service.completeOrder('order-1'));

    const outputCalls = (orderService.recordOutput as jest.Mock).mock.calls;
    const byproductOutput = outputCalls.find((c) => c[0].isPrimary === false)[0];
    const primaryOutput = outputCalls.find((c) => c[0].isPrimary === true)[0];

    // 20% de 10000 = 2000 para el subproducto, el resto (8000) al principal.
    expect(byproductOutput.cost.toString()).toBe('2000');
    expect(primaryOutput.cost.toString()).toBe('8000');
    expect(byproductOutput.quantityProduced.toString()).toBe('2');
  });

  it('rejects completing an order with no active reservation', async () => {
    const order = makeOrder();
    const db = { articleVariant: { findUniqueOrThrow: jest.fn() } };
    const orderService = {
      assertCompletable: jest.fn().mockResolvedValue(order),
      getActiveReservations: jest.fn().mockResolvedValue([]),
    };
    const service = new ProductionService(
      orderService as unknown as ProductionOrderService,
      {} as StockPieceService,
      {} as BomService,
      {} as InventoryService,
    );

    await expect(runAsTenant(db, () => service.completeOrder('order-1'))).rejects.toThrow(
      'no active reservation',
    );
  });
});
