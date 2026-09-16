import { BadRequestException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { InventoryService } from './inventory.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run(
    { tenantId: 'tenant-1', userId: 'user-1', tx: db as never },
    fn,
  );
}

function makeEventEmitter(): EventEmitter2 {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

// Every outbound movement (delta < 0, type !== ADJUSTMENT) now sums ACTIVE
// StockReservations to compute "disponible" (see recordMovement, Fase 2 of
// the Producción plan) - no reservation ever created in these tests, so this
// mock always returns 0, preserving today's behavior exactly.
function noReservations() {
  return { aggregate: jest.fn().mockResolvedValue({ _sum: { quantityReserved: null } }) };
}

describe('InventoryService.createWarehouse', () => {
  it('scopes the new warehouse to the current tenant', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'wh-1', name: 'Depósito central', location: null });
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant({ warehouse: { create } }, () =>
      service.createWarehouse({ name: 'Depósito central' }),
    );

    expect(create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', name: 'Depósito central', location: undefined },
    });
    expect(result).toEqual({ id: 'wh-1', name: 'Depósito central', location: null });
  });
});

describe('InventoryService.recordMovement', () => {
  it('decrements the ledger and records the movement for a SALE_OUT with enough stock', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: 'movement-1' });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(15), avgUnitCost: new Prisma.Decimal(50) });
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(
      {
        $queryRaw: jest.fn().mockResolvedValue([]),
        stockLedger: { updateMany, findUnique },
        stockMovement: { create },
        stockReservation: noReservations(),
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'SALE_OUT',
          quantity: 5,
        }),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { warehouseId: 'wh-1', articleVariantId: 'variant-1', quantity: { gte: 5 } },
      data: { quantity: { increment: -5 } },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        warehouseId: 'wh-1',
        articleVariantId: 'variant-1',
        type: 'SALE_OUT',
        quantity: 5,
      }),
    });
    expect(result).toEqual({ id: 'movement-1' });
  });

  it('stamps the SALE_OUT movement with the ledger avg cost without changing it', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: 'movement-1' });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(15), avgUnitCost: new Prisma.Decimal(50) });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        $queryRaw: jest.fn().mockResolvedValue([]),
        stockLedger: { updateMany, findUnique },
        stockMovement: { create },
        stockReservation: noReservations(),
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'SALE_OUT',
          quantity: 5,
        }),
    );

    const created = create.mock.calls[0][0].data;
    expect(created.unitCost).toBeInstanceOf(Prisma.Decimal);
    expect((created.unitCost as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(50);
    // The average itself is never written to on an outbound movement - only
    // `updateMany` touches quantity, `avgUnitCost` is left alone.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { increment: -5 } } }),
    );
  });

  it('stamps a SUPPLIER_RETURN with the ledger avg cost without changing it, same as an outbound sale', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: 'movement-1' });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(15), avgUnitCost: new Prisma.Decimal(50) });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        $queryRaw: jest.fn().mockResolvedValue([]),
        stockLedger: { updateMany, findUnique },
        stockMovement: { create },
        stockReservation: noReservations(),
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'SUPPLIER_RETURN',
          quantity: 2,
          goodsReceiptLineId: 'receipt-line-1',
        }),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { warehouseId: 'wh-1', articleVariantId: 'variant-1', quantity: { gte: 2 } },
      data: { quantity: { increment: -2 } },
    });
    const created = create.mock.calls[0][0].data;
    expect((created.unitCost as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(50);
  });

  it('rejects a SALE_OUT when the atomic decrement matches zero rows (insufficient stock)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const create = jest.fn();
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant(
        {
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockLedger: { updateMany, findUnique },
          stockMovement: { create },
          stockReservation: noReservations(),
        },
        () =>
          service.recordMovement({
            warehouseId: 'wh-1',
            articleVariantId: 'variant-1',
            type: 'SALE_OUT',
            quantity: 999,
          }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a SALE_OUT that would dip into reserved stock, even though there is enough físico', async () => {
    // 15 físico, 12 reservados for a production order -> only 3 disponible.
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn();
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(15), avgUnitCost: new Prisma.Decimal(50) });
    const aggregate = jest.fn().mockResolvedValue({ _sum: { quantityReserved: new Prisma.Decimal(12) } });
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant(
        {
          $queryRaw: jest.fn().mockResolvedValue([]),
          stockLedger: { updateMany, findUnique },
          stockMovement: { create },
          stockReservation: { aggregate },
        },
        () =>
          service.recordMovement({
            warehouseId: 'wh-1',
            articleVariantId: 'variant-1',
            type: 'SALE_OUT',
            quantity: 5,
          }),
      ),
    ).rejects.toThrow(/reserved for production/);

    // Rejected before ever touching the ledger or writing a movement - the
    // whole point of checking disponible BEFORE the atomic decrement.
    expect(updateMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('allows a SALE_OUT that fits within disponible (físico minus what is reserved elsewhere)', async () => {
    // 15 físico, 12 reservados -> 3 disponible, selling exactly 3 fits.
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: 'movement-9' });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(15), avgUnitCost: new Prisma.Decimal(50) });
    const aggregate = jest.fn().mockResolvedValue({ _sum: { quantityReserved: new Prisma.Decimal(12) } });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        $queryRaw: jest.fn().mockResolvedValue([]),
        stockLedger: { updateMany, findUnique },
        stockMovement: { create },
        stockReservation: { aggregate },
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'SALE_OUT',
          quantity: 3,
        }),
    );

    expect(aggregate).toHaveBeenCalledWith({
      where: { warehouseId: 'wh-1', inputArticleVariantId: 'variant-1', status: 'ACTIVE' },
      _sum: { quantityReserved: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { warehouseId: 'wh-1', articleVariantId: 'variant-1', quantity: { gte: 3 } },
      data: { quantity: { increment: -3 } },
    });
  });

  it('does not consult reservations for an ADJUSTMENT (physical-count correction, not gated by what is reserved on paper)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(11) });
    const create = jest.fn().mockResolvedValue({ id: 'movement-adj-2' });
    const aggregate = jest.fn();
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        $queryRaw: jest.fn().mockResolvedValue([]),
        stockLedger: { updateMany, findUnique },
        stockMovement: { create },
        stockReservation: { aggregate },
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'ADJUSTMENT',
          quantity: -4,
        }),
    );

    expect(aggregate).not.toHaveBeenCalled();
  });

  it('rejects a PURCHASE_IN with no unitCost', async () => {
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({}, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 20,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts the ledger for a PURCHASE_IN without checking existing stock', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-2' });
    const findUnique = jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(20), avgUnitCost: null });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ unitPrice: new Prisma.Decimal(150) });
    const priceHistoryCreate = jest.fn().mockResolvedValue({});
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        $queryRaw: jest.fn().mockResolvedValue([]),
        stockLedger: { upsert, findUnique },
        stockMovement: { create },
        articleVariant: { findUniqueOrThrow },
        priceHistory: { create: priceHistoryCreate },
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 20,
          unitCost: 100,
        }),
    );

    const call = upsert.mock.calls[0][0];
    expect(call.create.quantity).toBe(20);
    expect(call.update).toEqual({
      quantity: { increment: 20 },
      avgUnitCost: expect.any(Prisma.Decimal),
    });
    expect((call.update.avgUnitCost as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(100);
  });

  it('re-weights the average cost when purchasing on top of existing costed stock', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-3' });
    // 10 units @ 100 already in stock; buying 10 more @ 200 -> avg should be 150.
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(10), avgUnitCost: new Prisma.Decimal(100) });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ unitPrice: new Prisma.Decimal(150) });
    const priceHistoryCreate = jest.fn().mockResolvedValue({});
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        $queryRaw: jest.fn().mockResolvedValue([]),
        stockLedger: { upsert, findUnique },
        stockMovement: { create },
        articleVariant: { findUniqueOrThrow },
        priceHistory: { create: priceHistoryCreate },
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 10,
          unitCost: 200,
        }),
    );

    const call = upsert.mock.calls[0][0];
    expect((call.update.avgUnitCost as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(150);
  });

  it('locks the ledger row before reading it for a costed movement, so two concurrent PURCHASE_INs cannot both read the same stale average', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-3b' });
    const queryRaw = jest.fn().mockResolvedValue([]);
    const findUnique = jest.fn().mockImplementation(() => {
      // The lock must be taken BEFORE the read it protects, not after.
      expect(queryRaw).toHaveBeenCalledTimes(1);
      return Promise.resolve({ quantity: new Prisma.Decimal(10), avgUnitCost: new Prisma.Decimal(100) });
    });
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ unitPrice: new Prisma.Decimal(150) });
    const priceHistoryCreate = jest.fn().mockResolvedValue({});
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        $queryRaw: queryRaw,
        stockLedger: { upsert, findUnique },
        stockMovement: { create },
        articleVariant: { findUniqueOrThrow },
        priceHistory: { create: priceHistoryCreate },
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 10,
          unitCost: 200,
        }),
    );

    // Two findUnique calls total: the priorLedger read this test cares about
    // (locked, asserted above), plus an unrelated later read that only
    // fetches the post-write quantity for the stock.updated socket event.
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('does not lock/read the ledger for an ADJUSTMENT (quantity-only, never averages cost)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(4) });
    const queryRaw = jest.fn().mockResolvedValue([]);
    const create = jest.fn().mockResolvedValue({ id: 'movement-adj' });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      { $queryRaw: queryRaw, stockLedger: { updateMany, findUnique }, stockMovement: { create } },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'ADJUSTMENT',
          quantity: -4,
        }),
    );

    // The lock/priorLedger read is skipped entirely for ADJUSTMENT - the one
    // findUnique call that does happen is the unrelated post-write read for
    // the stock.updated socket event (see the test above).
    expect(queryRaw).not.toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('writes a PriceHistory row snapshotting the selling price and the purchase cost', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-5' });
    const findUnique = jest.fn().mockResolvedValue(null);
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ unitPrice: new Prisma.Decimal(199.99) });
    const priceHistoryCreate = jest.fn().mockResolvedValue({});
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        $queryRaw: jest.fn().mockResolvedValue([]),
        stockLedger: { upsert, findUnique },
        stockMovement: { create },
        articleVariant: { findUniqueOrThrow },
        priceHistory: { create: priceHistoryCreate },
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 5,
          unitCost: 80,
        }),
    );

    expect(priceHistoryCreate).toHaveBeenCalledWith({
      data: {
        tenantId: 'tenant-1',
        articleVariantId: 'variant-1',
        unitPrice: new Prisma.Decimal(199.99),
        costPrice: 80,
        changedById: 'user-1',
        purchaseOrderId: null,
      },
    });
  });

  it('does not write a PriceHistory row for an ADJUSTMENT (quantity-only, no cost)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(8), avgUnitCost: new Prisma.Decimal(50) });
    const create = jest.fn().mockResolvedValue({ id: 'movement-6' });
    const priceHistoryCreate = jest.fn();
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        stockLedger: { updateMany, findUnique },
        stockMovement: { create },
        priceHistory: { create: priceHistoryCreate },
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'ADJUSTMENT',
          quantity: -2,
        }),
    );

    expect(priceHistoryCreate).not.toHaveBeenCalled();
  });

  it('links a PURCHASE_IN to a real Orden de Compra, stamping sourceType/sourceId and the PriceHistory FK', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-7' });
    const findUnique = jest.fn().mockResolvedValue(null);
    const findUniqueOrThrow = jest.fn().mockResolvedValue({ unitPrice: new Prisma.Decimal(50) });
    const priceHistoryCreate = jest.fn().mockResolvedValue({});
    const purchaseOrderFindUnique = jest.fn().mockResolvedValue({
      status: 'SENT',
      lines: [{ articleVariantId: 'variant-1' }],
    });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      {
        $queryRaw: jest.fn().mockResolvedValue([]),
        stockLedger: { upsert, findUnique },
        stockMovement: { create },
        articleVariant: { findUniqueOrThrow },
        priceHistory: { create: priceHistoryCreate },
        purchaseOrder: { findUnique: purchaseOrderFindUnique },
      },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 5,
          unitCost: 40,
          purchaseOrderId: 'po-1',
        }),
    );

    expect(purchaseOrderFindUnique).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      include: { lines: { select: { articleVariantId: true } } },
    });
    expect(create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ sourceType: 'PURCHASE_ORDER', sourceId: 'po-1' }),
    );
    expect(priceHistoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ purchaseOrderId: 'po-1' }) }),
    );
  });

  it('rejects purchaseOrderId on a movement type other than PURCHASE_IN', async () => {
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({}, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PRODUCTION_IN',
          quantity: 5,
          unitCost: 40,
          purchaseOrderId: 'po-1',
        }),
      ),
    ).rejects.toThrow('purchaseOrderId is only valid for PURCHASE_IN');
  });

  it('rejects a purchaseOrderId that does not exist', async () => {
    const purchaseOrderFindUnique = jest.fn().mockResolvedValue(null);
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({ purchaseOrder: { findUnique: purchaseOrderFindUnique } }, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 5,
          unitCost: 40,
          purchaseOrderId: 'po-missing',
        }),
      ),
    ).rejects.toThrow('Purchase order not found');
  });

  it('rejects a cancelled purchase order', async () => {
    const purchaseOrderFindUnique = jest.fn().mockResolvedValue({
      status: 'CANCELLED',
      lines: [{ articleVariantId: 'variant-1' }],
    });
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({ purchaseOrder: { findUnique: purchaseOrderFindUnique } }, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 5,
          unitCost: 40,
          purchaseOrderId: 'po-1',
        }),
      ),
    ).rejects.toThrow('cancelled');
  });

  it('rejects a purchase order with no line for the given article variant', async () => {
    const purchaseOrderFindUnique = jest.fn().mockResolvedValue({
      status: 'SENT',
      lines: [{ articleVariantId: 'some-other-variant' }],
    });
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({ purchaseOrder: { findUnique: purchaseOrderFindUnique } }, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 5,
          unitCost: 40,
          purchaseOrderId: 'po-1',
        }),
      ),
    ).rejects.toThrow('no line for that article variant');
  });

  it('leaves the average untouched for a RETURN posted without a unitCost', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-4' });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(10), avgUnitCost: new Prisma.Decimal(100) });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      { $queryRaw: jest.fn().mockResolvedValue([]), stockLedger: { upsert, findUnique }, stockMovement: { create } },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'RETURN',
          quantity: 3,
        }),
    );

    const call = upsert.mock.calls[0][0];
    expect(call.update).toEqual({ quantity: { increment: 3 } });
    expect(create.mock.calls[0][0].data.unitCost).toBeNull();
  });

  it('rejects a zero-quantity ADJUSTMENT before touching the database', async () => {
    const service = new InventoryService(makeEventEmitter());
    const updateMany = jest.fn();

    await expect(
      runInTenant({ stockLedger: { updateMany } }, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'ADJUSTMENT',
          quantity: 0,
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a non-positive quantity for PURCHASE_IN/SALE_OUT/RETURN', async () => {
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({}, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: -1,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('InventoryService.getPriceHistory', () => {
  it('maps rows newest-first, resolving the linked purchase order number when present', async () => {
    const effectiveAt1 = new Date('2026-07-01');
    const effectiveAt2 = new Date('2026-07-10');
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'ph-2',
        unitPrice: new Prisma.Decimal(150),
        costPrice: new Prisma.Decimal(80),
        effectiveAt: effectiveAt2,
        changedById: 'user-1',
        purchaseOrderId: 'po-1',
        purchaseOrder: { number: 'OC-000007' },
      },
      {
        id: 'ph-1',
        unitPrice: new Prisma.Decimal(150),
        costPrice: null,
        effectiveAt: effectiveAt1,
        changedById: 'user-1',
        purchaseOrderId: null,
        purchaseOrder: null,
      },
    ]);
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant({ priceHistory: { findMany } }, () =>
      service.getPriceHistory('variant-1'),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { articleVariantId: 'variant-1' },
      include: { purchaseOrder: { select: { number: true } } },
      orderBy: { effectiveAt: 'desc' },
    });
    expect(result).toEqual([
      {
        id: 'ph-2',
        unitPrice: new Prisma.Decimal(150),
        costPrice: new Prisma.Decimal(80),
        effectiveAt: effectiveAt2,
        changedById: 'user-1',
        purchaseOrderId: 'po-1',
        purchaseOrderNumber: 'OC-000007',
      },
      {
        id: 'ph-1',
        unitPrice: new Prisma.Decimal(150),
        costPrice: null,
        effectiveAt: effectiveAt1,
        changedById: 'user-1',
        purchaseOrderId: null,
        purchaseOrderNumber: null,
      },
    ]);
  });
});

describe('InventoryService.getConsolidatedStock', () => {
  it('sums stock across warehouses', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { quantity: new Prisma.Decimal(42) } });
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant({ stockLedger: { aggregate } }, () =>
      service.getConsolidatedStock('variant-1'),
    );

    expect(result.toNumber()).toBe(42);
  });

  it('returns zero when there is no ledger row at all', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { quantity: null } });
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant({ stockLedger: { aggregate } }, () =>
      service.getConsolidatedStock('variant-1'),
    );

    expect(result.toNumber()).toBe(0);
  });
});

describe('InventoryService.listReorderSuggestions', () => {
  function makeMinimum(overrides: {
    warehouseId: string;
    articleVariantId: string;
    minimumQuantity: number;
    sku: string;
    articleName: string;
    preferredSupplier?: { id: string; name: string } | null;
    autoReplenish?: boolean;
  }) {
    return {
      warehouseId: overrides.warehouseId,
      articleVariantId: overrides.articleVariantId,
      minimumQuantity: new Prisma.Decimal(overrides.minimumQuantity),
      autoReplenish: overrides.autoReplenish ?? false,
      warehouse: { name: 'Depósito Central' },
      articleVariant: {
        sku: overrides.sku,
        color: null,
        size: null,
        brand: null,
        article: {
          name: overrides.articleName,
          imageUrl: null,
          preferredSupplierId: overrides.preferredSupplier?.id ?? null,
          preferredSupplier: overrides.preferredSupplier
            ? { name: overrides.preferredSupplier.name }
            : null,
        },
      },
    };
  }

  it('only returns pairs where current stock is below the configured minimum', async () => {
    const findManyMinimums = jest.fn().mockResolvedValue([
      makeMinimum({
        warehouseId: 'wh-1',
        articleVariantId: 'v-1',
        minimumQuantity: 10,
        sku: 'SKU-1',
        articleName: 'Artículo 1',
        preferredSupplier: { id: 'supplier-1', name: 'Proveedor 1' },
      }),
      makeMinimum({
        warehouseId: 'wh-1',
        articleVariantId: 'v-2',
        minimumQuantity: 5,
        sku: 'SKU-2',
        articleName: 'Artículo 2',
      }),
    ]);
    const findManyLedger = jest.fn().mockResolvedValue([
      { warehouseId: 'wh-1', articleVariantId: 'v-1', quantity: new Prisma.Decimal(3) },
      { warehouseId: 'wh-1', articleVariantId: 'v-2', quantity: new Prisma.Decimal(50) },
    ]);
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(
      {
        minimumStock: { findMany: findManyMinimums },
        stockLedger: { findMany: findManyLedger },
      },
      () => service.listReorderSuggestions(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      warehouseId: 'wh-1',
      warehouseName: 'Depósito Central',
      articleVariantId: 'v-1',
      sku: 'SKU-1',
      articleName: 'Artículo 1',
      preferredSupplierId: 'supplier-1',
      preferredSupplierName: 'Proveedor 1',
      minimumQuantity: 10,
      currentQuantity: 3,
      suggestedQuantity: 7,
    });
  });

  it('returns an empty list without querying the ledger when there are no minimums configured', async () => {
    const findManyMinimums = jest.fn().mockResolvedValue([]);
    const findManyLedger = jest.fn();
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(
      {
        minimumStock: { findMany: findManyMinimums },
        stockLedger: { findMany: findManyLedger },
      },
      () => service.listReorderSuggestions(),
    );

    expect(result).toEqual([]);
    expect(findManyLedger).not.toHaveBeenCalled();
  });
});

describe('InventoryService.updateArticle', () => {
  function makeSupplier(overrides: Partial<{ active: boolean; roles: { role: string }[] }> = {}) {
    return {
      id: 'supplier-1',
      active: overrides.active ?? true,
      roles: overrides.roles ?? [{ role: 'SUPPLIER' }],
    };
  }

  it('sets the preferred supplier once it validates as an active SUPPLIER company', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier()) },
      article: { update: jest.fn((args) => Promise.resolve({ id: 'article-1', ...args.data })) },
    };
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(db, () => service.updateArticle('article-1', { preferredSupplierId: 'supplier-1' }));

    expect(db.company.findUnique).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      include: { roles: true },
    });
    expect(db.article.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preferredSupplierId: 'supplier-1' }) }),
    );
  });

  it('rejects a company that is not flagged as a supplier', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier({ roles: [{ role: 'CUSTOMER' }] })) },
    };
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant(db, () => service.updateArticle('article-1', { preferredSupplierId: 'supplier-1' })),
    ).rejects.toThrow('not flagged as a supplier');
  });

  it('rejects an inactive supplier', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier({ active: false })) },
    };
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant(db, () => service.updateArticle('article-1', { preferredSupplierId: 'supplier-1' })),
    ).rejects.toThrow('inactive');
  });

  it('clears the preferred supplier when given null, with no validation lookup', async () => {
    const db = {
      company: { findUnique: jest.fn() },
      article: { update: jest.fn((args) => Promise.resolve({ id: 'article-1', ...args.data })) },
    };
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(db, () =>
      service.updateArticle('article-1', { preferredSupplierId: null }),
    );

    expect(db.company.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ preferredSupplierId: null }));
  });

  it('leaves the preferred supplier untouched when the field is omitted', async () => {
    const db = {
      company: { findUnique: jest.fn() },
      article: { update: jest.fn((args) => Promise.resolve({ id: 'article-1', ...args.data })) },
    };
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(db, () => service.updateArticle('article-1', { isPublished: true }));

    expect(db.company.findUnique).not.toHaveBeenCalled();
    expect(db.article.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preferredSupplierId: undefined }) }),
    );
  });
});

describe('InventoryService.getStockValueByCategory', () => {
  function makeRow(quantity: number, avgUnitCost: number | null, categoryId: string | null, categoryName?: string) {
    return {
      quantity: new Prisma.Decimal(quantity),
      avgUnitCost: avgUnitCost === null ? null : new Prisma.Decimal(avgUnitCost),
      articleVariant: {
        article: {
          categoryId,
          category: categoryId ? { name: categoryName ?? 'Unknown' } : null,
        },
      },
    };
  }

  it('sums quantity times avg unit cost per category, sorted desc', async () => {
    const db = {
      stockLedger: {
        findMany: jest.fn().mockResolvedValue([
          makeRow(10, 5, 'cat-1', 'Insumo panadería'),
          makeRow(4, 2.5, 'cat-1', 'Insumo panadería'),
          makeRow(100, 1, 'cat-2', 'Electricidad'),
        ]),
      },
    };
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(db, () => service.getStockValueByCategory());

    expect(db.stockLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { quantity: { gt: 0 }, avgUnitCost: { not: null } } }),
    );
    expect(result).toEqual([
      { categoryId: 'cat-2', categoryName: 'Electricidad', totalValue: new Prisma.Decimal(100) },
      { categoryId: 'cat-1', categoryName: 'Insumo panadería', totalValue: new Prisma.Decimal(60) },
    ]);
  });

  it('groups articles with no category under "Sin categoría"', async () => {
    const db = {
      stockLedger: { findMany: jest.fn().mockResolvedValue([makeRow(2, 10, null)]) },
    };
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(db, () => service.getStockValueByCategory());

    expect(result).toEqual([
      { categoryId: null, categoryName: 'Sin categoría', totalValue: new Prisma.Decimal(20) },
    ]);
  });

  it('returns an empty list when nothing has a costed stock ledger row', async () => {
    const db = { stockLedger: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(db, () => service.getStockValueByCategory());

    expect(result).toEqual([]);
  });
});
