import { tenantContextStorage } from '@plexo/database';
import { QuoteNumberingService } from './quote-numbering.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('QuoteNumberingService.nextNumber', () => {
  it('formats quote numbers as PREFIX-000NNN using the pre-increment value', async () => {
    const update = jest.fn().mockResolvedValue({ quoteNextNumber: 5, quotePrefix: 'PRE' });
    const findFirst = jest.fn().mockResolvedValue(null);
    const db = { user: { update }, quote: { findFirst } };
    const service = new QuoteNumberingService();

    const number = await runAsUser(db, () => service.nextNumber());

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { quoteNextNumber: { increment: 1 } },
      select: { quoteNextNumber: true, quotePrefix: true },
    });
    expect(findFirst).toHaveBeenCalledWith({ where: { number: 'PRE-000004' }, select: { id: true } });
    expect(number).toBe('PRE-000004');
  });

  it("jumps past another user's quotes when they share the prefix", async () => {
    // Second user on the default "PRE": their counter says 1, but another
    // user already issued PRE-000001..PRE-000003.
    let counter = 1;
    const update = jest.fn().mockImplementation(({ data }) => {
      counter = typeof data.quoteNextNumber === 'number' ? data.quoteNextNumber : counter + 1;
      return Promise.resolve({ quoteNextNumber: counter, quotePrefix: 'PRE' });
    });
    const issued = ['PRE-000001', 'PRE-000002', 'PRE-000003', 'OTRO-000009'];
    const findFirst = jest
      .fn()
      .mockImplementation(({ where }) => Promise.resolve(issued.includes(where.number) ? { id: 'q' } : null));
    const findMany = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(issued.filter((n) => n.startsWith(where.number.startsWith)).map((number) => ({ number }))),
    );
    const db = { user: { update }, quote: { findFirst, findMany } };
    const service = new QuoteNumberingService();

    const number = await runAsUser(db, () => service.nextNumber());

    expect(number).toBe('PRE-000004');
    expect(findMany).toHaveBeenCalledWith({ where: { number: { startsWith: 'PRE-' } }, select: { number: true } });
    expect(counter).toBe(5);
  });

  it('rejects when there is no authenticated user in context', async () => {
    const db = { user: { update: jest.fn() } };
    const service = new QuoteNumberingService();

    await expect(
      tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () => service.nextNumber()),
    ).rejects.toThrow('An authenticated user is required');
  });
});
