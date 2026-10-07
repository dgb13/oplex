import { Prisma, tenantContextStorage } from '@plexo/database';
import { GoodsReceiptService } from './goods-receipt.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeSentOrder(
  lines: { id: string; quantity: number; unitCost?: number; taxDefinition?: Record<string, unknown> | null }[],
  costsIncludeVat = false,
) {
  return {
    id: 'po-1',
    status: 'SENT',
    costsIncludeVat,
    lines: lines.map((l) => ({
      id: l.id,
      quantity: new Prisma.Decimal(l.quantity),
      unitCost: new Prisma.Decimal(l.unitCost ?? 150),
      articleVariant: { article: { taxDefinition: l.taxDefinition ?? null } },
    })),
  };
}

/** IVA 21% como lo devuelve Prisma (TaxDefinition). */
function makeIva21() {
  return { id: 'tax-iva-21', code: 'IVA_21', calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(21) };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    purchaseOrder: { findUnique: jest.fn().mockResolvedValue(makeSentOrder([{ id: 'line-1', quantity: 200 }])) },
    warehouse: { findUnique: jest.fn().mockResolvedValue({ id: 'warehouse-1' }) },
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    goodsReceiptLine: { findMany: jest.fn().mockResolvedValue([]) },
    // Nothing returned to the supplier yet, by default - only reached when
    // goodsReceiptLine.findMany above returns rows (see the empty-array
    // guard in getReturnedQuantitiesByGoodsReceiptLine).
    supplierReturnLine: { groupBy: jest.fn().mockResolvedValue([]) },
    // Sin condición frente al IVA cargada, por defecto: el costo real queda
    // igual al de la orden (comportamiento de antes, ver vat-cost.ts).
    tenantSettings: { findFirst: jest.fn().mockResolvedValue(null) },
    taxDefinition: { findMany: jest.fn().mockResolvedValue([]) },
    goodsReceipt: {
      create: jest.fn((args) =>
        Promise.resolve({
          id: 'receipt-1',
          ...args.data,
          lines: args.data.lines.createMany.data.map((l: { purchaseOrderLineId: string; quantity: Prisma.Decimal }, i: number) => ({
            id: `receipt-line-${i + 1}`,
            ...l,
            purchaseOrderLine: { id: l.purchaseOrderLineId, articleVariantId: 'variant-1', unitCost: new Prisma.Decimal(150) },
          })),
        }),
      ),
    },
    ...overrides,
  };
}

/** Shorthand for the "X already received on this line" mock shape -
 * getReceivedQuantitiesByLine reads real GoodsReceiptLine rows now (not a
 * groupBy), since it has to net out per-line returns before rolling up. */
function makeExistingReceiptLine(purchaseOrderLineId: string, quantity: number) {
  return { id: `existing-${purchaseOrderLineId}`, purchaseOrderLineId, quantity: new Prisma.Decimal(quantity) };
}

describe('GoodsReceiptService.create', () => {
  it('avisa a quien creó la orden de compra cuando la recibe otra persona', async () => {
    const notificationCreate = jest.fn((args) => Promise.resolve({ id: 'n-1', ...args.data }));
    const db = makeDb({
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue({
          ...makeSentOrder([{ id: 'line-1', quantity: 200 }, { id: 'line-2', quantity: 5 }]),
          number: 'OC-000118',
          supplierId: 'supplier-1',
          createdByUserId: 'buyer-1',
        }),
      },
      company: { findUnique: jest.fn().mockResolvedValue({ name: 'Maderera del Sur' }) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Juan Pérez', email: 'juan@x.com' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'buyer-1', mutedNotificationTypes: [] }]),
      },
      notification: { create: notificationCreate },
    });

    await runAsUser(db, () =>
      new GoodsReceiptService().create({
        purchaseOrderId: 'po-1',
        warehouseId: 'warehouse-1',
        lines: [{ purchaseOrderLineId: 'line-1', quantity: 200 }],
      }),
    );

    expect(notificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 'buyer-1',
        actorUserId: 'user-1',
        category: 'PURCHASES',
        type: 'purchases.goods_received',
        message: expect.stringContaining('**OC-000118** · Maderera del Sur · 1 de 2 ítems. **Juan Pérez** registró el remito.'),
      }),
    });
  });

  it('creates a receipt for the full ordered quantity against a SENT order', async () => {
    const db = makeDb();
    const service = new GoodsReceiptService();

    const receipt = await runAsUser(db, () =>
      service.create({
        purchaseOrderId: 'po-1',
        warehouseId: 'warehouse-1',
        lines: [{ purchaseOrderLineId: 'line-1', quantity: 200 }],
      }),
    );

    expect(receipt.id).toBe('receipt-1');
    expect(db.goodsReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          receivedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('allows a second partial receipt that exactly completes what is pending', async () => {
    const db = makeDb({
      // 120 already received - only 80 left of the 200 ordered.
      goodsReceiptLine: { findMany: jest.fn().mockResolvedValue([makeExistingReceiptLine('line-1', 120)]) },
    });
    const service = new GoodsReceiptService();

    await runAsUser(db, () =>
      service.create({
        purchaseOrderId: 'po-1',
        warehouseId: 'warehouse-1',
        lines: [{ purchaseOrderLineId: 'line-1', quantity: 80 }],
      }),
    );

    expect(db.goodsReceipt.create).toHaveBeenCalled();
  });

  it('rejects a receipt that would exceed what is still pending, with the remaining amount in the message', async () => {
    const db = makeDb({
      goodsReceiptLine: { findMany: jest.fn().mockResolvedValue([makeExistingReceiptLine('line-1', 120)]) },
    });
    const service = new GoodsReceiptService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          lines: [{ purchaseOrderLineId: 'line-1', quantity: 81 }],
        }),
      ),
    ).rejects.toThrow('only 80 left to receive');
    expect(db.goodsReceipt.create).not.toHaveBeenCalled();
  });

  it('counts a supplier return against the same receipt line back toward pending (received net of returned)', async () => {
    const db = makeDb({
      // 200 received on line-1, but 50 of it was returned to the supplier -
      // net received is 150, so 50 should still be receivable.
      goodsReceiptLine: { findMany: jest.fn().mockResolvedValue([makeExistingReceiptLine('line-1', 200)]) },
      supplierReturnLine: {
        groupBy: jest.fn().mockResolvedValue([
          { goodsReceiptLineId: 'existing-line-1', _sum: { quantity: new Prisma.Decimal(50) } },
        ]),
      },
    });
    const service = new GoodsReceiptService();

    await runAsUser(db, () =>
      service.create({
        purchaseOrderId: 'po-1',
        warehouseId: 'warehouse-1',
        lines: [{ purchaseOrderLineId: 'line-1', quantity: 50 }],
      }),
    );

    expect(db.goodsReceipt.create).toHaveBeenCalled();
  });

  it('rejects receiving against an order that is not SENT', async () => {
    const db = makeDb({
      purchaseOrder: { findUnique: jest.fn().mockResolvedValue({ ...makeSentOrder([{ id: 'line-1', quantity: 200 }]), status: 'DRAFT' }) },
    });
    const service = new GoodsReceiptService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          lines: [{ purchaseOrderLineId: 'line-1', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('Only a SENT purchase order');
  });

  it('rejects two lines in the SAME request for the same purchaseOrderLineId that together exceed what is pending', async () => {
    const db = makeDb();
    const service = new GoodsReceiptService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          // 200 ordered, nothing received yet - each individual line (150)
          // is under the cap, but together they're 300, over it. Both used
          // to read the same stale "already received" snapshot and pass
          // independently.
          lines: [
            { purchaseOrderLineId: 'line-1', quantity: 150 },
            { purchaseOrderLineId: 'line-1', quantity: 150 },
          ],
        }),
      ),
    ).rejects.toThrow('only 50 left to receive');
    expect(db.goodsReceipt.create).not.toHaveBeenCalled();
  });

  it('rejects a line that does not belong to the referenced order', async () => {
    const db = makeDb();
    const service = new GoodsReceiptService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          lines: [{ purchaseOrderLineId: 'not-a-line-of-this-order', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('does not belong to this order');
  });

  describe('costo real por línea del remito (unitCost)', () => {
    async function createdUnitCost(condition: string | null, costsIncludeVat: boolean) {
      const db = makeDb({
        purchaseOrder: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              makeSentOrder([{ id: 'line-1', quantity: 200, unitCost: 121, taxDefinition: makeIva21() }], costsIncludeVat),
            ),
        },
        tenantSettings: {
          findFirst: jest.fn().mockResolvedValue(condition ? { ownTaxCondition: condition } : null),
        },
        taxDefinition: { findMany: jest.fn().mockResolvedValue([makeIva21()]) },
      });

      await runAsUser(db, () =>
        new GoodsReceiptService().create({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          lines: [{ purchaseOrderLineId: 'line-1', quantity: 200 }],
        }),
      );

      const createArgs = (db.goodsReceipt.create as jest.Mock).mock.calls[0][0];
      return createArgs.data.lines.createMany.data[0].unitCost as Prisma.Decimal;
    }

    it('Monotributo con costos sin IVA en la orden: le suma el IVA del artículo (121 × 1,21)', async () => {
      expect((await createdUnitCost('MONOTRIBUTO', false)).toFixed(2)).toBe('146.41');
    });

    it('Responsable Inscripto con costos con IVA en la orden: se lo saca (121 / 1,21)', async () => {
      expect((await createdUnitCost('RESPONSABLE_INSCRIPTO', true)).toFixed(2)).toBe('100.00');
    });

    it('sin condición cargada: guarda el costo de la orden tal cual', async () => {
      expect((await createdUnitCost(null, false)).toFixed(2)).toBe('121.00');
      expect((await createdUnitCost(null, true)).toFixed(2)).toBe('121.00');
    });
  });
});
