import type { AccountingService } from '@plexo/accounting';
import { Prisma } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { GoodsReceiptService } from '@plexo/purchases';
import { GoodsReceiptsService } from './goods-receipts.service.js';

// @plexo/purchases' barrel also re-exports PdfGeneratorService, which pulls
// in @react-pdf/renderer (ESM-only) - apps/api's jest config has no
// transform for it (unlike libs/modules/purchases' own jest config, which
// needed one for the same reason). This test never touches the real
// GoodsReceiptService (only mocks it), so an explicit factory avoids ever
// requiring the real module/its ESM chain at all.
jest.mock('@plexo/purchases', () => ({ GoodsReceiptService: jest.fn() }));

// DISCRETE (measurementType default) por defecto en los dos helpers de
// abajo - factor=1, comportamiento idéntico al que había antes de la Fase
// 3 (conversión de unidad de compra) salvo que se pase measurementType/
// purchaseSize explícitos.
function discreteArticle() {
  return { measurementType: 'DISCRETE' as const, purchaseSize: null };
}

function makeReceipt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'receipt-1',
    purchaseOrderId: 'po-1',
    warehouseId: 'warehouse-1',
    receivedAt: new Date('2026-07-15'),
    lines: [
      {
        id: 'receipt-line-1',
        quantity: new Prisma.Decimal(120),
        purchaseOrderLine: {
          id: 'line-1',
          articleVariantId: 'variant-1',
          unitCost: new Prisma.Decimal(150),
          articleVariant: { article: discreteArticle() },
        },
      },
      {
        id: 'receipt-line-2',
        quantity: new Prisma.Decimal(5),
        purchaseOrderLine: {
          id: 'line-2',
          articleVariantId: 'variant-2',
          unitCost: new Prisma.Decimal(30),
          articleVariant: { article: discreteArticle() },
        },
      },
    ],
    ...overrides,
  };
}

describe('GoodsReceiptsService.createReceipt', () => {
  it('creates the receipt, then records one PURCHASE_IN per line at the cost already fixed on the order (not asked again)', async () => {
    const receipt = makeReceipt();
    const goodsReceiptService = { create: jest.fn().mockResolvedValue(receipt) } as unknown as GoodsReceiptService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      postGoodsReceiptAccrual: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new GoodsReceiptsService(goodsReceiptService, inventoryService, accountingService);
    const dto = {
      purchaseOrderId: 'po-1',
      warehouseId: 'warehouse-1',
      lines: [
        { purchaseOrderLineId: 'line-1', quantity: 120 },
        { purchaseOrderLineId: 'line-2', quantity: 5 },
      ],
    };

    const result = await service.createReceipt(dto);

    expect(goodsReceiptService.create).toHaveBeenCalledWith(dto);
    expect(inventoryService.recordMovement).toHaveBeenNthCalledWith(1, {
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-1',
      type: 'PURCHASE_IN',
      quantity: 120,
      unitCost: 150,
      purchaseOrderId: 'po-1',
      goodsReceiptLineId: 'receipt-line-1',
    });
    expect(inventoryService.recordMovement).toHaveBeenNthCalledWith(2, {
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-2',
      type: 'PURCHASE_IN',
      quantity: 5,
      unitCost: 30,
      purchaseOrderId: 'po-1',
      goodsReceiptLineId: 'receipt-line-2',
    });
    // 120*150 + 5*30 = 18000 + 150 = 18150
    const accrualArg = (accountingService.postGoodsReceiptAccrual as jest.Mock).mock.calls[0][0];
    expect(accrualArg.goodsReceiptId).toBe('receipt-1');
    expect((accrualArg.amount as Prisma.Decimal).toNumber()).toBe(18150);
    // The remito's own date, not "now" - a receipt logged today for goods
    // that arrived last week must land in last week's P&L.
    expect(accrualArg.date).toEqual(new Date('2026-07-15'));
    expect(result).toBe(receipt);
  });

  it('propagates a recordMovement failure without swallowing it (the enclosing tx rolls back the receipt too)', async () => {
    const receipt = makeReceipt();
    const goodsReceiptService = { create: jest.fn().mockResolvedValue(receipt) } as unknown as GoodsReceiptService;
    const failure = new Error('Insufficient stock in this warehouse');
    const inventoryService = { recordMovement: jest.fn().mockRejectedValue(failure) } as unknown as InventoryService;
    const accountingService = {
      postGoodsReceiptAccrual: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new GoodsReceiptsService(goodsReceiptService, inventoryService, accountingService);

    await expect(
      service.createReceipt({
        purchaseOrderId: 'po-1',
        warehouseId: 'warehouse-1',
        lines: [{ purchaseOrderLineId: 'line-1', quantity: 120 }],
      }),
    ).rejects.toThrow(failure);
    expect(accountingService.postGoodsReceiptAccrual).not.toHaveBeenCalled();
  });

  it('converts purchase units to stock units for a CONTINUOUS article with purchaseSize configured (2 bolsas de 35kg -> 70.000gr)', async () => {
    const receipt = makeReceipt({
      lines: [
        {
          id: 'receipt-line-1',
          quantity: new Prisma.Decimal(2), // 2 bolsas pedidas/recibidas
          purchaseOrderLine: {
            id: 'line-1',
            articleVariantId: 'variant-1',
            unitCost: new Prisma.Decimal(50000), // $/bolsa
            articleVariant: {
              article: { measurementType: 'CONTINUOUS', purchaseSize: new Prisma.Decimal(35000) },
            },
          },
        },
      ],
    });
    const goodsReceiptService = { create: jest.fn().mockResolvedValue(receipt) } as unknown as GoodsReceiptService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      postGoodsReceiptAccrual: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new GoodsReceiptsService(goodsReceiptService, inventoryService, accountingService);

    await service.createReceipt({
      purchaseOrderId: 'po-1',
      warehouseId: 'warehouse-1',
      lines: [{ purchaseOrderLineId: 'line-1', quantity: 2 }],
    });

    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        // Stock se mueve en la unidad base (gramos), no en "bolsas".
        quantity: 70000,
        // $/bolsa -> $/gramo.
        unitCost: 50000 / 35000,
      }),
    );
    // El accrual (lo que se le debe al proveedor) sigue en unidad de
    // compra - la conversión es sólo de la unidad de stock que entra.
    const accrualArg = (accountingService.postGoodsReceiptAccrual as jest.Mock).mock.calls[0][0];
    expect((accrualArg.amount as Prisma.Decimal).toNumber()).toBe(100000); // 2 * 50000
  });

  it('does not convert a CONTINUOUS article that has no purchaseSize configured yet (factor 1, same as today)', async () => {
    const receipt = makeReceipt({
      lines: [
        {
          id: 'receipt-line-1',
          quantity: new Prisma.Decimal(10),
          purchaseOrderLine: {
            id: 'line-1',
            articleVariantId: 'variant-1',
            unitCost: new Prisma.Decimal(5),
            articleVariant: { article: { measurementType: 'CONTINUOUS', purchaseSize: null } },
          },
        },
      ],
    });
    const goodsReceiptService = { create: jest.fn().mockResolvedValue(receipt) } as unknown as GoodsReceiptService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      postGoodsReceiptAccrual: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new GoodsReceiptsService(goodsReceiptService, inventoryService, accountingService);

    await service.createReceipt({
      purchaseOrderId: 'po-1',
      warehouseId: 'warehouse-1',
      lines: [{ purchaseOrderLineId: 'line-1', quantity: 10 }],
    });

    expect(inventoryService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 10, unitCost: 5 }),
    );
  });
});
