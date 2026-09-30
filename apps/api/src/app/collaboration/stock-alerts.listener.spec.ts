import { Prisma, tenantContextStorage } from '@plexo/database';
import { StockAlertsListener } from './stock-alerts.listener.js';

function makeDb(minimum: number | null) {
  return {
    minimumStock: {
      findUnique: jest.fn().mockResolvedValue(minimum === null ? null : { minimumQuantity: new Prisma.Decimal(minimum) }),
    },
    articleVariant: { findUnique: jest.fn().mockResolvedValue({ article: { name: 'Tornillo 6×40' } }) },
    warehouse: { findUnique: jest.fn().mockResolvedValue({ name: 'Depósito Central' }) },
    user: {
      findMany: jest
        .fn()
        // 1º userIdsWithRoles, 2º notify (destinatarios activos)
        .mockResolvedValueOnce([{ id: 'buyer-1' }])
        .mockResolvedValueOnce([{ id: 'buyer-1', mutedNotificationTypes: [] }]),
    },
    notification: { create: jest.fn((args) => Promise.resolve({ id: 'n-1', ...args.data })) },
  };
}

function run(db: ReturnType<typeof makeDb>, previousQuantity: string, newQuantity: string) {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'seller-1', tx: db as never }, () =>
    new StockAlertsListener().onStockDecreased({
      tenantId: 'tenant-1',
      warehouseId: 'wh-1',
      articleVariantId: 'variant-1',
      previousQuantity,
      newQuantity,
    }),
  );
}

describe('StockAlertsListener', () => {
  it('avisa cuando el stock CRUZA el mínimo', async () => {
    const db = makeDb(100);
    await run(db, '120', '32');

    expect(db.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 'buyer-1',
        category: 'STOCK',
        type: 'stock.below_minimum',
        message: '**Tornillo 6×40** quedó bajo el mínimo en Depósito Central: 32 (mínimo 100)',
      }),
    });
  });

  it('no vuelve a avisar mientras ya estaba bajo el mínimo', async () => {
    const db = makeDb(100);
    await run(db, '40', '32');
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it('no hace nada si el artículo no tiene mínimo configurado', async () => {
    const db = makeDb(null);
    await run(db, '120', '32');
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});
