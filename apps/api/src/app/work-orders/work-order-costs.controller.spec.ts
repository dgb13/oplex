import { forRole } from './work-order-costs.controller.js';

const costs = {
  income: { source: 'invoice', amount: 100000 },
  parts: { source: 'invoice', amount: 30000, missingCost: 0 },
  purchases: [{ id: 'p1', supplier: 'Tornería', number: '0001-1', date: '2026-10-20', amount: 20000 }],
  purchasesTotal: 20000,
  labor: [{ id: 'l1', workerName: 'Lucas', hours: 2.5, costPerHour: 8000, note: null, workedAt: '2026-10-20' }],
  laborHours: 2.5,
  laborCost: 20000,
  laborWithoutCost: 0,
  totalCost: 70000,
  margin: 30000,
  marginPercent: 30,
} as unknown as Parameters<typeof forRole>[0];

describe('forRole (costo de las órdenes)', () => {
  it('dueño, admin y contador ven todo', () => {
    for (const role of ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const) {
      expect(forRole(costs, { role })).toBe(costs);
    }
  });

  it('ventas ve sólo las horas, sin importes', () => {
    const r = forRole(costs, { role: 'SALES' });
    expect(r).toMatchObject({ income: null, parts: null, purchases: [], purchasesTotal: 0, margin: null, hidden: true });
    expect(r.labor[0].costPerHour).toBeNull();
  });

  it('compras ve las compras de la orden pero no el ingreso ni el margen', () => {
    const r = forRole(costs, { role: 'PURCHASES' });
    expect(r.purchases).toHaveLength(1);
    expect(r.purchasesTotal).toBe(20000);
    expect(r).toMatchObject({ income: null, parts: null, laborCost: 0, totalCost: 0, margin: null, marginPercent: null });
    expect(r.labor[0].costPerHour).toBeNull();
  });
});
