import { Prisma, tenantContextStorage } from '@plexo/database';
import { PurchaseInvoiceService } from './purchase-invoice.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makePurchaseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    supplierId: 'supplier-1',
    currencyId: 'currency-1',
    supplier: { active: true, name: 'Sidex', taxId: '30-12345678-9' },
    receipts: [
      {
        id: 'receipt-1',
        lines: [
          {
            id: 'rline-1',
            quantity: new Prisma.Decimal(120),
            purchaseOrderLine: { id: 'line-1', unitCost: new Prisma.Decimal(150) },
          },
          {
            id: 'rline-2',
            quantity: new Prisma.Decimal(5),
            purchaseOrderLine: { id: 'line-2', unitCost: new Prisma.Decimal(30) },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    purchaseOrder: { findUnique: jest.fn().mockResolvedValue(makePurchaseOrder()) },
    purchaseInvoiceReceipt: { findMany: jest.fn().mockResolvedValue([]) },
    supplierReturnLine: { groupBy: jest.fn().mockResolvedValue([]) },
    purchaseInvoice: {
      create: jest.fn((args) =>
        Promise.resolve({ id: 'pinv-1', ...args.data, taxLines: [], receiptLinks: [] }),
      ),
    },
    ...overrides,
  };
}

describe('PurchaseInvoiceService.create', () => {
  it('computes grniClearedAmount from the selected receipts (net of returns) and creates the invoice', async () => {
    const db = makeDb();
    const service = new PurchaseInvoiceService();

    // 120*150 + 5*30 = 18000 + 150 = 18150
    const result = await runAsUser(db, () =>
      service.create({
        purchaseOrderId: 'po-1',
        supplierInvoiceNumber: '0001-00012345',
        supplierInvoiceDate: '2026-07-29',
        subtotal: 18150,
        goodsReceiptIds: ['receipt-1'],
        taxLines: [{ type: 'IVA_CREDITO', concept: 'IVA 21%', amount: 3811.5, netAmount: 18150, taxRate: 21 }],
      }),
    );

    expect(result.grniClearedAmount.toNumber()).toBe(18150);
    expect(result.nonGrniAmount.toNumber()).toBe(0);
    expect(db.purchaseInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierId: 'supplier-1',
          supplierName: 'Sidex',
          supplierTaxId: '30-12345678-9',
          createdByUserId: 'user-1',
          taxLines: expect.objectContaining({
            createMany: expect.objectContaining({
              data: [{ type: 'IVA_CREDITO', concept: 'IVA 21%', amount: 3811.5, netAmount: 18150, taxRate: 21 }],
            }),
          }),
        }),
      }),
    );
  });

  it('rejects a goodsReceiptId that does not belong to the referenced order', async () => {
    const db = makeDb();
    const service = new PurchaseInvoiceService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          supplierInvoiceNumber: '0001-1',
          supplierInvoiceDate: '2026-07-29',
          subtotal: 100,
          goodsReceiptIds: ['not-a-receipt-of-this-order'],
        }),
      ),
    ).rejects.toThrow('do not belong to this purchase order');
  });

  it('rejects a receipt that was already invoiced', async () => {
    const db = makeDb({
      purchaseInvoiceReceipt: { findMany: jest.fn().mockResolvedValue([{ goodsReceiptId: 'receipt-1' }]) },
    });
    const service = new PurchaseInvoiceService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          supplierInvoiceNumber: '0001-1',
          supplierInvoiceDate: '2026-07-29',
          subtotal: 18150,
          goodsReceiptIds: ['receipt-1'],
        }),
      ),
    ).rejects.toThrow('already invoiced');
  });

  it('rejects when the subtotal is less than the accrued amount of the selected receipts', async () => {
    const db = makeDb();
    const service = new PurchaseInvoiceService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          supplierInvoiceNumber: '0001-1',
          supplierInvoiceDate: '2026-07-29',
          subtotal: 100,
          goodsReceiptIds: ['receipt-1'],
        }),
      ),
    ).rejects.toThrow('menor al monto acumulado');
  });

  it('nets out a partial supplier return before computing the accrued amount', async () => {
    const db = makeDb({
      supplierReturnLine: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ goodsReceiptLineId: 'rline-1', _sum: { quantity: new Prisma.Decimal(20) } }]),
      },
    });
    const service = new PurchaseInvoiceService();

    // (120-20)*150 + 5*30 = 15000 + 150 = 15150
    const result = await runAsUser(db, () =>
      service.create({
        purchaseOrderId: 'po-1',
        supplierInvoiceNumber: '0001-1',
        supplierInvoiceDate: '2026-07-29',
        subtotal: 15150,
        goodsReceiptIds: ['receipt-1'],
      }),
    );

    expect(result.grniClearedAmount.toNumber()).toBe(15150);
  });

  it('allows a purchase order with no linked receipts (pure-services invoice)', async () => {
    const db = makeDb();
    const service = new PurchaseInvoiceService();

    const result = await runAsUser(db, () =>
      service.create({
        purchaseOrderId: 'po-1',
        supplierInvoiceNumber: '0001-1',
        supplierInvoiceDate: '2026-07-29',
        subtotal: 1000,
      }),
    );

    expect(result.grniClearedAmount.toNumber()).toBe(0);
    expect(result.nonGrniAmount.toNumber()).toBe(1000);
  });

  it('creates a direct expense invoice (no purchaseOrderId) with grniClearedAmount 0 and the full subtotal as nonGrniAmount', async () => {
    const db = makeDb({
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'supplier-2', name: 'Ferretería Norte', taxId: '20-11111111-2', active: true }),
      },
    });
    const service = new PurchaseInvoiceService();

    const result = await runAsUser(db, () =>
      service.create({
        supplierId: 'supplier-2',
        currencyId: 'currency-1',
        supplierInvoiceNumber: '0001-99999999',
        supplierInvoiceDate: '2026-09-05',
        subtotal: 5000,
      }),
    );

    expect(result.grniClearedAmount.toNumber()).toBe(0);
    expect(result.nonGrniAmount.toNumber()).toBe(5000);
    expect(db.purchaseOrder.findUnique).not.toHaveBeenCalled();
    expect(db.purchaseInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purchaseOrderId: undefined,
          supplierId: 'supplier-2',
          supplierName: 'Ferretería Norte',
          supplierTaxId: '20-11111111-2',
          currencyId: 'currency-1',
        }),
      }),
    );
  });

  it('rejects a direct expense invoice missing supplierId/currencyId', async () => {
    const db = makeDb();
    const service = new PurchaseInvoiceService();

    await expect(
      runAsUser(db, () =>
        service.create({
          supplierInvoiceNumber: '0001-1',
          supplierInvoiceDate: '2026-09-05',
          subtotal: 1000,
        }),
      ),
    ).rejects.toThrow('supplierId and currencyId are required');
  });

  it('rejects a direct expense invoice for an inactive supplier', async () => {
    const db = makeDb({
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'supplier-2', name: 'X', taxId: null, active: false }) },
    });
    const service = new PurchaseInvoiceService();

    await expect(
      runAsUser(db, () =>
        service.create({
          supplierId: 'supplier-2',
          currencyId: 'currency-1',
          supplierInvoiceNumber: '0001-1',
          supplierInvoiceDate: '2026-09-05',
          subtotal: 1000,
        }),
      ),
    ).rejects.toThrow('inactive');
  });

  it('rejects a direct expense invoice for an unknown supplierId', async () => {
    const db = makeDb({ company: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new PurchaseInvoiceService();

    await expect(
      runAsUser(db, () =>
        service.create({
          supplierId: 'missing',
          currencyId: 'currency-1',
          supplierInvoiceNumber: '0001-1',
          supplierInvoiceDate: '2026-09-05',
          subtotal: 1000,
        }),
      ),
    ).rejects.toThrow('Supplier not found');
  });

  it('rejects goodsReceiptIds when there is no purchaseOrderId (no GRNI to clear)', async () => {
    const db = makeDb({
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'supplier-2', name: 'X', taxId: null, active: true }) },
    });
    const service = new PurchaseInvoiceService();

    await expect(
      runAsUser(db, () =>
        service.create({
          supplierId: 'supplier-2',
          currencyId: 'currency-1',
          supplierInvoiceNumber: '0001-1',
          supplierInvoiceDate: '2026-09-05',
          subtotal: 1000,
          goodsReceiptIds: ['receipt-1'],
        }),
      ),
    ).rejects.toThrow('requires a purchaseOrderId');
  });
});

describe('PurchaseInvoiceService.recordPayment', () => {
  it('rejects when the payment amount exceeds the balance due', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      purchaseInvoice: { findUnique: jest.fn().mockResolvedValue({ id: 'pinv-1', balanceDue: new Prisma.Decimal(100) }) },
    };
    const service = new PurchaseInvoiceService();

    await expect(
      runAsUser(db, () => service.recordPayment('pinv-1', { amount: 150, method: 'Efectivo' })),
    ).rejects.toThrow('exceeds the invoice balance due');
  });

  it('locks the invoice row before reading its balance, same recipe as the other read-check-write flows', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      purchaseInvoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pinv-1', balanceDue: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      supplierPayment: { create: jest.fn().mockResolvedValue({ id: 'pay-1', amount: new Prisma.Decimal(100) }) },
    };
    const service = new PurchaseInvoiceService();

    await runAsUser(db, () => service.recordPayment('pinv-1', { amount: 100, method: 'Efectivo' }));

    expect(db.$queryRaw).toHaveBeenCalled();
  });

  it('marks the invoice PAID when the payment covers the full balance', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      purchaseInvoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pinv-1', balanceDue: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      supplierPayment: { create: jest.fn().mockResolvedValue({ id: 'pay-1', amount: new Prisma.Decimal(100) }) },
    };
    const service = new PurchaseInvoiceService();

    await runAsUser(db, () => service.recordPayment('pinv-1', { amount: 100, method: 'Efectivo' }));

    const updateArgs = (db.purchaseInvoice.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.status).toBe('PAID');
    expect(updateArgs.data.balanceDue.toNumber()).toBe(0);
  });

  it('marks the invoice PARTIALLY_PAID when the payment is partial', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      purchaseInvoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pinv-1', balanceDue: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      supplierPayment: { create: jest.fn().mockResolvedValue({ id: 'pay-1', amount: new Prisma.Decimal(40) }) },
    };
    const service = new PurchaseInvoiceService();

    await runAsUser(db, () => service.recordPayment('pinv-1', { amount: 40, method: 'Efectivo' }));

    const updateArgs = (db.purchaseInvoice.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.status).toBe('PARTIALLY_PAID');
    expect(updateArgs.data.balanceDue.toNumber()).toBe(60);
  });

  it('rejects when cash + withheld together exceed the balance due, even if cash alone would fit', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      purchaseInvoice: { findUnique: jest.fn().mockResolvedValue({ id: 'pinv-1', balanceDue: new Prisma.Decimal(100) }) },
    };
    const service = new PurchaseInvoiceService();

    await expect(
      runAsUser(db, () =>
        service.recordPayment('pinv-1', {
          amount: 80,
          method: 'Efectivo',
          withholdings: [{ taxType: 'INCOME_TAX', concept: 'Ganancias', amount: 30 }],
        }),
      ),
    ).rejects.toThrow('exceeds the invoice balance due');
  });

  it('reduces balanceDue by cash + withheld together and persists the withholding snapshot', async () => {
    const db = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      purchaseInvoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'pinv-1', balanceDue: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      supplierPayment: {
        create: jest.fn((args) =>
          Promise.resolve({
            id: 'pay-1',
            amount: args.data.amount,
            withholdings: args.data.withholdings.createMany.data,
          }),
        ),
      },
    };
    const service = new PurchaseInvoiceService();

    const payment = await runAsUser(db, () =>
      service.recordPayment('pinv-1', {
        amount: 70,
        method: 'Transferencia',
        withholdings: [
          { taxType: 'INCOME_TAX', concept: 'Retención Ganancias', amount: 20 },
          { taxType: 'GROSS_INCOME', jurisdiction: 'CABA', concept: 'Retención IIBB CABA', amount: 10 },
        ],
      }),
    );

    const updateArgs = (db.purchaseInvoice.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.balanceDue.toNumber()).toBe(0);
    expect(updateArgs.data.status).toBe('PAID');
    expect((payment as { withholdings: unknown[] }).withholdings).toHaveLength(2);
  });
});
