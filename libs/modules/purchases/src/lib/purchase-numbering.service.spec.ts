import { tenantContextStorage } from '@plexo/database';
import { PurchaseNumberingService } from './purchase-numbering.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('PurchaseNumberingService.nextNumber', () => {
  it('formats quoteRequest numbers as PREFIX-000NNN using the pre-increment value', async () => {
    const update = jest.fn().mockResolvedValue({ quoteRequestNextNumber: 8, quoteRequestPrefix: 'PED' });
    const db = { user: { update }, quoteRequest: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new PurchaseNumberingService();

    const number = await runAsUser(db, () => service.nextNumber('quoteRequest'));

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { quoteRequestNextNumber: { increment: 1 } },
      select: { quoteRequestNextNumber: true, quoteRequestPrefix: true },
    });
    // update() returned the POST-increment value (8) - the number assigned
    // to this document is the one just consumed, i.e. one less.
    expect(number).toBe('PED-000007');
  });

  it('formats purchaseOrder numbers with the purchaseOrder-specific prefix/counter', async () => {
    const update = jest.fn().mockResolvedValue({ purchaseOrderNextNumber: 2, purchaseOrderPrefix: 'OC' });
    const db = { user: { update }, purchaseOrder: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new PurchaseNumberingService();

    const number = await runAsUser(db, () => service.nextNumber('purchaseOrder'));

    expect(number).toBe('OC-000001');
  });

  it('rejects when there is no authenticated user in context', async () => {
    const db = { user: { update: jest.fn() } };
    const service = new PurchaseNumberingService();

    await expect(
      tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () =>
        service.nextNumber('quoteRequest'),
      ),
    ).rejects.toThrow('An authenticated user is required');
  });
});
