import type { ArticleAttachmentsService } from './article-attachments.service.js';
import type { ArticleImageService } from './article-image.service.js';
import type { ArticleImportService } from './article-import.service.js';
import { InventoryController } from './inventory.controller.js';
import type { InventoryService } from './inventory.service.js';

describe('InventoryController.recordMovement', () => {
  function makeController(inventoryService: Partial<InventoryService> = {}) {
    return new InventoryController(
      inventoryService as InventoryService,
      {} as ArticleImportService,
      {} as ArticleImageService,
      {} as ArticleAttachmentsService,
    );
  }

  it('rejects purchaseOrderId on this endpoint - only GoodsReceiptsService may set it, in-process, never via HTTP', () => {
    const recordMovement = jest.fn();
    const controller = makeController({ recordMovement });

    expect(() =>
      controller.recordMovement({
        warehouseId: 'w-1',
        articleVariantId: 'v-1',
        type: 'PURCHASE_IN',
        quantity: 600,
        unitCost: 100,
        purchaseOrderId: 'po-1',
      }),
    ).toThrow('Recibir mercadería');
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('rejects goodsReceiptLineId on this endpoint too', () => {
    const recordMovement = jest.fn();
    const controller = makeController({ recordMovement });

    expect(() =>
      controller.recordMovement({
        warehouseId: 'w-1',
        articleVariantId: 'v-1',
        type: 'PURCHASE_IN',
        quantity: 1,
        unitCost: 1,
        goodsReceiptLineId: 'grl-1',
      }),
    ).toThrow('Recibir mercadería');
    expect(recordMovement).not.toHaveBeenCalled();
  });

  it('delegates a normal manual movement straight through', () => {
    const recordMovement = jest.fn().mockReturnValue('ok');
    const controller = makeController({ recordMovement });
    const dto = { warehouseId: 'w-1', articleVariantId: 'v-1', type: 'ADJUSTMENT' as const, quantity: 5 };

    const result = controller.recordMovement(dto);

    expect(recordMovement).toHaveBeenCalledWith(dto, { blockManualLineal1D: true });
    expect(result).toBe('ok');
  });
});
