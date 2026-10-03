import { computeTotals, type TicketLine } from '../../app/pos/sell/types';
import { computeSalesTotals, type SalesLine } from './salesDocument';

// Los totales que ve el usuario tienen que dar lo mismo que factura el
// backend: en la Caja, PosService rechaza el cobro si el total pagado no
// coincide con el de la factura.

const ticketLine: TicketLine = {
  articleVariantId: 'v-1',
  articleName: 'Agua mineral',
  variantLabel: null,
  sku: 'AGUA',
  unitPrice: 100,
  quantity: 2,
  taxRate: 21,
  taxKind: 'GRAVADO',
  stock: 10,
};

describe('computeTotals (Caja)', () => {
  it('Responsable Inscripto: suma el IVA del artículo', () => {
    expect(computeTotals([ticketLine])).toEqual({ subtotal: 200, taxTotal: 42, total: 242 });
  });

  it('Monotributo/Exento (Factura C): sin IVA, el precio es el final', () => {
    expect(computeTotals([ticketLine], true)).toEqual({ subtotal: 200, taxTotal: 0, total: 200 });
  });
});

describe('computeSalesTotals (Facturación / Cotizaciones)', () => {
  const lines: SalesLine[] = [
    { key: 'a', articleVariantId: 'v-1', quantity: 2, unitPrice: 100, taxKind: 'GRAVADO', taxRate: 21 },
    { key: 'b', articleVariantId: 'v-2', quantity: 1, unitPrice: 50, taxKind: 'EXENTO', taxRate: 0 },
  ];

  it('con IVA: neto gravado, exento e IVA por alícuota', () => {
    const totals = computeSalesTotals(lines, false);
    expect(totals.netTaxed).toBe(200);
    expect(totals.netExempt).toBe(50);
    expect(totals.vatByRate).toEqual([{ rate: 21, amount: 42 }]);
    expect(totals.total).toBe(292);
  });

  it('Factura C: todo es subtotal, sin IVA ni exento', () => {
    const totals = computeSalesTotals(lines, false, undefined, true);
    expect(totals.netTaxed).toBe(250);
    expect(totals.netExempt).toBe(0);
    expect(totals.vatByRate).toEqual([]);
    expect(totals.total).toBe(250);
  });

  it('Factura C: "precios con IVA incluido" no desglosa nada (el precio ya es el final)', () => {
    expect(computeSalesTotals(lines, true, undefined, true).total).toBe(250);
  });
});
