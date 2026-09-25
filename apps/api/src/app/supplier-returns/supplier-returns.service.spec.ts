import type { AccountingService } from '@plexo/accounting';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { SupplierReturnService } from '@plexo/purchases';
import type { StockPieceService } from '@plexo/production';
import { SupplierReturnsService } from './supplier-returns.service.js';

// @plexo/purchases' barrel also re-exports PdfGeneratorService, which pulls
// in @react-pdf/renderer (ESM-only) - apps/api's jest config has no
// transform for it. This test never touches the real SupplierReturnService
// (only mocks it), so an explicit factory avoids ever requiring the real
// module/its ESM chain at all - same fix as goods-receipts.service.spec.ts.
jest.mock('@plexo/purchases', () => ({ SupplierReturnService: jest.fn() }));

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

/** Not-yet-invoiced by default (findFirst resolves null) - matches every
 * existing test's assumption before the already-invoiced branch existed.
 * articleVariant defaults to DISCRETE (factor 1, no StockPiece handling) -
 * matches every existing test's assumption from before the LINEAL_1D
 * conversion existed; the LINEAL_1D-specific tests override it. */
function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    purchaseInvoiceReceipt: { findFirst: jest.fn().mockResolvedValue(null) },
    purchaseInvoice: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    articleVariant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        article: { measurementType: 'DISCRETE', purchaseSize: null, commercialLength: null },
      }),
    },
    // Sin movimiento PURCHASE_IN por defecto = cae al factor del artículo
    // actual (fallback) - los tests del factor "de la recepción" lo pisan.
    stockMovement: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
}

function makeStockPieceService(overrides: Record<string, unknown> = {}) {
  return { returnFullPieces: jest.fn().mockResolvedValue([]), ...overrides } as unknown as StockPieceService;
}

function makeSupplierReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'return-1',
    goodsReceiptId: 'receipt-1',
    goodsReceipt: { id: 'receipt-1', warehouseId: 'warehouse-1' },
    lines: [
      {
        id: 'return-line-1',
        goodsReceiptLineId: 'receipt-line-1',
        quantity: new Prisma.Decimal(2),
        goodsReceiptLine: {
          purchaseOrderLine: { articleVariantId: 'variant-1', unitCost: new Prisma.Decimal(150) },
        },
      },
    ],
    ...overrides,
  };
}

describe('SupplierReturnsService.createReturn', () => {
  it('creates the return, then records a SUPPLIER_RETURN per line with no unitCost (the ledger stamps its own average)', async () => {
    const supplierReturn = makeSupplierReturn();
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
      reverseSupplierReturnAgainstPayable: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new SupplierReturnsService(
      supplierReturnService,
      inventoryService,
      accountingService,
      makeStockPieceService(),
    );
    const dto = {
      goodsReceiptId: 'receipt-1',
      reason: 'tapa en mal estado',
      lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
    };

    const result = await runInTenant(makeDb(), () => service.createReturn(dto));

    expect(supplierReturnService.create).toHaveBeenCalledWith(dto);
    expect(inventoryService.recordMovement).toHaveBeenCalledWith({
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-1',
      type: 'SUPPLIER_RETURN',
      quantity: 2,
      goodsReceiptLineId: 'receipt-line-1',
      sourceType: 'SUPPLIER_RETURN',
      sourceId: 'return-1',
    });
    // 2 * 150 = 300
    const reversalArg = (accountingService.reverseSupplierReturnAccrual as jest.Mock).mock.calls[0][0];
    expect(reversalArg.supplierReturnId).toBe('return-1');
    expect((reversalArg.amount as Prisma.Decimal).toNumber()).toBe(300);
    expect(accountingService.reverseSupplierReturnAgainstPayable).not.toHaveBeenCalled();
    expect(result).toBe(supplierReturn);
  });

  it('propagates a recordMovement failure without swallowing it (the enclosing tx rolls back the return too)', async () => {
    const supplierReturn = makeSupplierReturn();
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const failure = new Error('Insufficient stock in this warehouse');
    const inventoryService = { recordMovement: jest.fn().mockRejectedValue(failure) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
      reverseSupplierReturnAgainstPayable: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new SupplierReturnsService(
      supplierReturnService,
      inventoryService,
      accountingService,
      makeStockPieceService(),
    );

    await expect(
      runInTenant(makeDb(), () =>
        service.createReturn({
          goodsReceiptId: 'receipt-1',
          reason: 'defectuoso',
          lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
        }),
      ),
    ).rejects.toThrow(failure);
    expect(accountingService.reverseSupplierReturnAccrual).not.toHaveBeenCalled();
    expect(accountingService.reverseSupplierReturnAgainstPayable).not.toHaveBeenCalled();
  });

  it('when the underlying remito was already invoiced, credits Proveedores (not GRNI) and brings down that invoice balanceDue', async () => {
    const supplierReturn = makeSupplierReturn();
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
      reverseSupplierReturnAgainstPayable: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new SupplierReturnsService(
      supplierReturnService,
      inventoryService,
      accountingService,
      makeStockPieceService(),
    );
    const db = makeDb({
      purchaseInvoiceReceipt: {
        findFirst: jest.fn().mockResolvedValue({ purchaseInvoiceId: 'invoice-1' }),
      },
      purchaseInvoice: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          balanceDue: new Prisma.Decimal(1000),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    await runInTenant(db, () =>
      service.createReturn({
        goodsReceiptId: 'receipt-1',
        reason: 'defectuoso',
        lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
      }),
    );

    expect(accountingService.reverseSupplierReturnAccrual).not.toHaveBeenCalled();
    const reversalArg = (accountingService.reverseSupplierReturnAgainstPayable as jest.Mock).mock.calls[0][0];
    expect(reversalArg.supplierReturnId).toBe('return-1');
    expect((reversalArg.amount as Prisma.Decimal).toNumber()).toBe(300);
    // 1000 - 300 = 700, still owed something -> PARTIALLY_PAID
    const updateArg = (db.purchaseInvoice.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: 'invoice-1' });
    expect((updateArg.data.balanceDue as Prisma.Decimal).toNumber()).toBe(700);
    expect(updateArg.data.status).toBe('PARTIALLY_PAID');
  });

  it('zeroes the invoice balance and marks it PAID when the return covers exactly what was left owed', async () => {
    const supplierReturn = makeSupplierReturn();
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
      reverseSupplierReturnAgainstPayable: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new SupplierReturnsService(
      supplierReturnService,
      inventoryService,
      accountingService,
      makeStockPieceService(),
    );
    const db = makeDb({
      purchaseInvoiceReceipt: {
        findFirst: jest.fn().mockResolvedValue({ purchaseInvoiceId: 'invoice-1' }),
      },
      purchaseInvoice: {
        // Exactly the 2 * 150 = 300 this return reverses.
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(300) }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    await runInTenant(db, () =>
      service.createReturn({
        goodsReceiptId: 'receipt-1',
        reason: 'defectuoso',
        lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
      }),
    );

    const updateArg = (db.purchaseInvoice.update as jest.Mock).mock.calls[0][0];
    expect((updateArg.data.balanceDue as Prisma.Decimal).toNumber()).toBe(0);
    expect(updateArg.data.status).toBe('PAID');
  });

  it('rejects a return whose reversal amount exceeds what is left owed on the already-invoiced remito', async () => {
    const supplierReturn = makeSupplierReturn();
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
      reverseSupplierReturnAgainstPayable: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new SupplierReturnsService(
      supplierReturnService,
      inventoryService,
      accountingService,
      makeStockPieceService(),
    );
    const db = makeDb({
      purchaseInvoiceReceipt: {
        findFirst: jest.fn().mockResolvedValue({ purchaseInvoiceId: 'invoice-1' }),
      },
      purchaseInvoice: {
        // Return reverses 300, but only 100 is left owed (already paid down a lot).
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
    });

    await expect(
      runInTenant(db, () =>
        service.createReturn({
          goodsReceiptId: 'receipt-1',
          reason: 'defectuoso',
          lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
        }),
      ),
    ).rejects.toThrow(/supera el saldo pendiente/);
    expect(db.purchaseInvoice.update).not.toHaveBeenCalled();
    expect(accountingService.reverseSupplierReturnAgainstPayable).not.toHaveBeenCalled();
  });

  it('LINEAL_1D: converts the returned line quantity (barras) to stock units (mm) via commercialLength, same factor as GoodsReceiptsService.createReceipt', async () => {
    const supplierReturn = makeSupplierReturn();
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
      reverseSupplierReturnAgainstPayable: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const stockPieceService = makeStockPieceService();
    const service = new SupplierReturnsService(
      supplierReturnService,
      inventoryService,
      accountingService,
      stockPieceService,
    );
    const db = makeDb({
      articleVariant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          article: { measurementType: 'LINEAL_1D', purchaseSize: null, commercialLength: new Prisma.Decimal(2000) },
        }),
      },
    });

    await runInTenant(db, () =>
      service.createReturn({
        goodsReceiptId: 'receipt-1',
        reason: 'barras de más',
        // 2 barras devueltas (misma unidad que PurchaseOrderLine.quantity).
        lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
      }),
    );

    // 2 barras * 2000mm = 4000mm - no 2, que hubiera dejado el ledger
    // descontado de menos contra lo que sumó la recepción original.
    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 4000 }),
    );
    expect(stockPieceService.returnFullPieces).toHaveBeenCalledWith({
      articleVariantId: 'variant-1',
      warehouseId: 'warehouse-1',
      count: 2,
      length: new Prisma.Decimal(2000),
    });
  });

  it('LINEAL_1D: uses the factor the receipt was booked with, not a commercialLength edited afterwards', async () => {
    const supplierReturn = makeSupplierReturn({
      lines: [
        {
          id: 'return-line-1',
          goodsReceiptLineId: 'receipt-line-1',
          quantity: new Prisma.Decimal(2),
          goodsReceiptLine: {
            quantity: new Prisma.Decimal(5),
            purchaseOrderLine: { articleVariantId: 'variant-1', unitCost: new Prisma.Decimal(150) },
          },
        },
      ],
    });
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
      reverseSupplierReturnAgainstPayable: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const stockPieceService = makeStockPieceService();
    const service = new SupplierReturnsService(
      supplierReturnService,
      inventoryService,
      accountingService,
      stockPieceService,
    );
    const db = makeDb({
      articleVariant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          // Largo comercial corregido a 5800 después de recibir...
          article: { measurementType: 'LINEAL_1D', purchaseSize: null, commercialLength: new Prisma.Decimal(5800) },
        }),
      },
      // ...pero el remito entró 5 barras de 6000mm = 30000mm.
      stockMovement: { findFirst: jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(30000) }) },
    });

    await runInTenant(db, () =>
      service.createReturn({
        goodsReceiptId: 'receipt-1',
        reason: 'barras de más',
        lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
      }),
    );

    expect(inventoryService.recordMovement).toHaveBeenCalledWith(expect.objectContaining({ quantity: 12000 }));
    expect(stockPieceService.returnFullPieces).toHaveBeenCalledWith({
      articleVariantId: 'variant-1',
      warehouseId: 'warehouse-1',
      count: 2,
      length: new Prisma.Decimal(6000),
    });
  });

  it('LINEAL_1D received before commercialLength was set (factor 1): no StockPiece to return', async () => {
    const supplierReturn = makeSupplierReturn({
      lines: [
        {
          id: 'return-line-1',
          goodsReceiptLineId: 'receipt-line-1',
          quantity: new Prisma.Decimal(2),
          goodsReceiptLine: {
            quantity: new Prisma.Decimal(5),
            purchaseOrderLine: { articleVariantId: 'variant-1', unitCost: new Prisma.Decimal(150) },
          },
        },
      ],
    });
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
      reverseSupplierReturnAgainstPayable: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const stockPieceService = makeStockPieceService();
    const service = new SupplierReturnsService(
      supplierReturnService,
      inventoryService,
      accountingService,
      stockPieceService,
    );
    const db = makeDb({
      articleVariant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          article: { measurementType: 'LINEAL_1D', purchaseSize: null, commercialLength: new Prisma.Decimal(6000) },
        }),
      },
      stockMovement: { findFirst: jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(5) }) },
    });

    await runInTenant(db, () =>
      service.createReturn({
        goodsReceiptId: 'receipt-1',
        reason: 'barras de más',
        lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
      }),
    );

    expect(inventoryService.recordMovement).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }));
    expect(stockPieceService.returnFullPieces).not.toHaveBeenCalled();
  });

  it('non-1D articles never touch StockPieceService', async () => {
    const supplierReturn = makeSupplierReturn();
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
      reverseSupplierReturnAgainstPayable: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const stockPieceService = makeStockPieceService();
    const service = new SupplierReturnsService(
      supplierReturnService,
      inventoryService,
      accountingService,
      stockPieceService,
    );

    await runInTenant(makeDb(), () =>
      service.createReturn({
        goodsReceiptId: 'receipt-1',
        reason: 'defectuoso',
        lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
      }),
    );

    expect(stockPieceService.returnFullPieces).not.toHaveBeenCalled();
  });
});
