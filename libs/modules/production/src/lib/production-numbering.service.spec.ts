import { tenantContextStorage } from '@plexo/database';
import { ProductionNumberingService } from './production-numbering.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('ProductionNumberingService.nextNumber', () => {
  it('formats numbers as PREFIX-000NNN using the pre-increment value', async () => {
    const update = jest.fn().mockResolvedValue({ productionOrderNextNumber: 5, productionOrderPrefix: 'OP' });
    const db = { user: { update } };
    const service = new ProductionNumberingService();

    const number = await runAsUser(db, () => service.nextNumber());

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { productionOrderNextNumber: { increment: 1 } },
      select: { productionOrderNextNumber: true, productionOrderPrefix: true },
    });
    // update() returned the POST-increment value (5) - the number assigned
    // to this order is the one just consumed, i.e. one less.
    expect(number).toBe('OP-000004');
  });

  it('rejects when there is no authenticated user in context', async () => {
    const db = { user: { update: jest.fn() } };
    const service = new ProductionNumberingService();

    await expect(
      tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () => service.nextNumber()),
    ).rejects.toThrow('An authenticated user is required');
  });
});
