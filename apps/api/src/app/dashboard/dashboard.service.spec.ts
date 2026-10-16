import { Prisma } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import { DashboardService } from './dashboard.service.js';

const findMany = jest.fn();

jest.mock('@plexo/database', () => ({
  ...jest.requireActual('@plexo/database'),
  getTenantDb: () => ({ warehouse: { findMany: jest.fn().mockResolvedValue([]) }, invoice: { findMany } }),
}));

const d = (n: number) => new Prisma.Decimal(n);

function invoice(id: string, total: number, creditNotes: number[], status = 'PAID') {
  return {
    id,
    customerName: 'Cliente',
    total: d(total),
    balanceDue: d(0),
    status,
    issueDate: new Date(),
    documentLetter: 'C',
    number: `0003-0000000${id}`,
    creditNotes: creditNotes.map((cn) => ({ total: d(cn) })),
  };
}

describe('DashboardService.getSnapshot', () => {
  const inventoryService = { listReorderSuggestions: jest.fn().mockResolvedValue([]) } as unknown as InventoryService;

  it('una factura anulada con nota de crédito no cuenta como venta ni cobro y se ve "Anulada"', async () => {
    // Factura de 15000 anulada por NC + una de 1000 con NC parcial de 400.
    const invoices = [invoice('1', 15000, [15000]), invoice('2', 1000, [400], 'ISSUED')];
    findMany.mockResolvedValue(invoices);

    const snapshot = await new DashboardService(inventoryService).getSnapshot();

    expect(snapshot.recentInvoices.map((i) => i.status)).toEqual(['CREDITED', 'ISSUED']);
    expect(snapshot.todaySummary).toEqual({ invoiceCount: 1, total: 600, paidCount: 0 });
    expect(snapshot.salesLast7Days.reduce((s, day) => s + day.total, 0)).toBe(600);
    expect(snapshot.salesLast7Days.reduce((s, day) => s + day.count, 0)).toBe(1);
  });

  it('agrupa por día argentino: una factura de las 23 hs va en ese día, no en el siguiente', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-16T02:00:00Z') }); // 15/10 23:00 en Argentina
    try {
      findMany.mockResolvedValue([{ ...invoice('1', 500, []), issueDate: new Date('2026-10-16T02:00:00Z') }]);

      const snapshot = await new DashboardService(inventoryService).getSnapshot();

      expect(snapshot.salesLast7Days.map((day) => day.date)).toEqual([
        '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15',
      ]);
      expect(snapshot.salesLast7Days.at(-1)).toEqual({ date: '2026-10-15', total: 500, count: 1 });
      // "Hoy" arranca a las 00:00 de Argentina (03:00 UTC).
      expect(findMany.mock.calls.some(([args]) => args?.where?.issueDate?.gte?.toISOString() === '2026-10-15T03:00:00.000Z')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
