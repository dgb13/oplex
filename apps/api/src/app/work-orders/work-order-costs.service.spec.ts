import { Prisma, tenantContextStorage } from '@plexo/database';
import { WorkOrderCostsService } from './work-order-costs.service.js';

const d = (v: number) => new Prisma.Decimal(v);

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wo-1',
    invoiceId: null,
    quoteId: 'q-1',
    labor: [
      { id: 'l1', workerName: 'Lucas', hours: d(2.5), costPerHour: d(8000), note: null, workedAt: new Date() },
      { id: 'l2', workerName: 'Ayudante', hours: d(1), costPerHour: null, note: null, workedAt: new Date() },
    ],
    purchaseInvoices: [
      { id: 'p1', supplier: { name: 'Tornería' }, supplierInvoiceNumber: '0001-1', supplierInvoiceDate: new Date(), subtotal: d(20000) },
    ],
    ...overrides,
  };
}

describe('WorkOrderCostsService.costs', () => {
  it('uses the invoice net and the real cost of the parts it took out of stock (minus returns)', async () => {
    const db = {
      workOrder: { findUnique: jest.fn().mockResolvedValue(makeOrder()) },
      invoice: {
        findFirst: jest.fn().mockResolvedValue({ id: 'inv-1' }),
        findUnique: jest.fn().mockResolvedValue({ subtotal: d(132644.63) }),
      },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([
          { type: 'SALE_OUT', quantity: d(4.5), unitCost: d(7000) },
          { type: 'SALE_OUT', quantity: d(1), unitCost: d(20000) },
          { type: 'RETURN', quantity: d(0.5), unitCost: d(7000) },
        ]),
      },
    };

    const costs = await runInTenant(db, () => new WorkOrderCostsService().costs('wo-1'));

    expect(costs.income).toEqual({ amount: 132644.63, source: 'invoice' });
    // 4,5×7000 + 20000 − 0,5×7000
    expect(costs.parts).toEqual({ amount: 48000, source: 'invoice', missingCost: 0 });
    expect(costs.purchasesTotal).toBe(20000);
    expect(costs.laborHours).toBe(3.5);
    expect(costs.laborCost).toBe(20000);
    expect(costs.laborWithoutCost).toBe(1);
    expect(costs.totalCost).toBe(88000);
    expect(costs.margin).toBe(44644.63);
    expect(costs.marginPercent).toBe(33.7);
  });

  it('before invoicing, estimates from the quote with the current average cost (services have no stock cost)', async () => {
    const db = {
      workOrder: { findUnique: jest.fn().mockResolvedValue(makeOrder({ labor: [], purchaseInvoices: [] })) },
      invoice: { findFirst: jest.fn().mockResolvedValue(null) },
      quote: {
        findUnique: jest.fn().mockResolvedValue({
          lines: [
            { articleVariantId: 'oil', quantity: d(4), netAmount: d(40000), articleVariant: { article: { isService: false } } },
            { articleVariantId: 'labor', quantity: d(2), netAmount: d(50000), articleVariant: { article: { isService: true } } },
            { articleVariantId: 'nocost', quantity: d(1), netAmount: d(10000), articleVariant: { article: { isService: false } } },
          ],
        }),
      },
      stockLedger: {
        findMany: jest.fn(({ where }: { where: { articleVariantId: string } }) =>
          Promise.resolve(
            where.articleVariantId === 'oil'
              ? [
                  { quantity: d(10), avgUnitCost: d(6000) },
                  { quantity: d(10), avgUnitCost: d(8000) },
                ]
              : [],
          ),
        ),
      },
    };

    const costs = await runInTenant(db, () => new WorkOrderCostsService().costs('wo-1'));

    expect(costs.income).toEqual({ amount: 100000, source: 'quote' });
    expect(costs.parts).toEqual({ amount: 28000, source: 'estimate', missingCost: 1 });
    expect(costs.margin).toBe(72000);
  });
});
