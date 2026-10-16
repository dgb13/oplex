import { getTenantDb } from '@plexo/database';

/**
 * Textos de los asientos automáticos. Antes llevaban el id interno del
 * comprobante ("Venta - comprobante 6b3eb197-…"), que no le dice nada a un
 * contador; ahora el número y la contraparte. Si la búsqueda falla, queda el
 * texto viejo: el asiento no se puede frenar por una descripción.
 */

function voucher(letter: string | null, pointOfSale: string | null, number: string | null): string {
  if (!number) return 'sin número';
  const prefix = letter ? `${letter} ` : '';
  return pointOfSale ? `${prefix}${pointOfSale}-${number}` : `${prefix}${number}`;
}

async function orFallback(build: () => Promise<string | null>, fallback: string): Promise<string> {
  try {
    return (await build()) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saleDescription(invoiceId: string): Promise<string> {
  return orFallback(async () => {
    const inv = await getTenantDb().invoice.findUnique({
      where: { id: invoiceId },
      select: { documentLetter: true, pointOfSale: true, number: true, customerName: true },
    });
    return inv && `Venta - Factura ${voucher(inv.documentLetter, inv.pointOfSale, inv.number)} - ${inv.customerName}`;
  }, `Venta - comprobante ${invoiceId}`);
}

export function creditNoteDescription(creditNoteId: string, invoiceId: string): Promise<string> {
  return orFallback(async () => {
    const cn = await getTenantDb().creditNote.findUnique({
      where: { id: creditNoteId },
      select: {
        documentLetter: true,
        pointOfSale: true,
        number: true,
        invoice: { select: { documentLetter: true, pointOfSale: true, number: true, customerName: true } },
      },
    });
    if (!cn) return null;
    const inv = cn.invoice;
    return `Nota de crédito ${voucher(cn.documentLetter, cn.pointOfSale, cn.number)} (anula Factura ${voucher(inv.documentLetter, inv.pointOfSale, inv.number)}) - ${inv.customerName}`;
  }, `Nota de crédito - comprobante ${invoiceId}`);
}

export function goodsReceiptDescription(goodsReceiptId: string): Promise<string> {
  return orFallback(async () => {
    const gr = await getTenantDb().goodsReceipt.findUnique({
      where: { id: goodsReceiptId },
      select: { supplierDocNumber: true, purchaseOrder: { select: { number: true, supplier: { select: { name: true } } } } },
    });
    if (!gr) return null;
    const remito = gr.supplierDocNumber ? ` (remito ${gr.supplierDocNumber})` : '';
    return `Recepción de mercadería - ${gr.purchaseOrder.number}${remito} - ${gr.purchaseOrder.supplier.name}`;
  }, `Recepción de mercadería - remito ${goodsReceiptId}`);
}

export function purchaseInvoiceDescription(purchaseInvoiceId: string): Promise<string> {
  return orFallback(async () => {
    const pi = await getTenantDb().purchaseInvoice.findUnique({
      where: { id: purchaseInvoiceId },
      select: { documentLetter: true, pointOfSale: true, number: true, supplierName: true },
    });
    return pi && `Factura de compra ${voucher(pi.documentLetter, pi.pointOfSale, pi.number)} - ${pi.supplierName}`;
  }, `Factura de compra - comprobante ${purchaseInvoiceId}`);
}

export function purchaseCreditNoteDescription(purchaseCreditNoteId: string): Promise<string> {
  return orFallback(async () => {
    const pcn = await getTenantDb().purchaseCreditNote.findUnique({
      where: { id: purchaseCreditNoteId },
      select: { documentLetter: true, pointOfSale: true, number: true, supplierName: true },
    });
    return pcn && `Nota de crédito de compra ${voucher(pcn.documentLetter, pcn.pointOfSale, pcn.number)} - ${pcn.supplierName}`;
  }, `Nota de crédito de compra - comprobante ${purchaseCreditNoteId}`);
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
// El id con la palabra que lo precedía: "comprobante <id>", "turno <id>"...
const ID_REF = new RegExp(`(?:(?:comprobante|remito|turno|orden|línea de extracto|cuenta) )?${UUID.source}`);

type LinkedEntry = {
  description: string;
  invoiceId: string | null;
  creditNoteId: string | null;
  goodsReceiptId: string | null;
  supplierReturnId: string | null;
  purchaseInvoiceId: string | null;
  purchaseCreditNoteId: string | null;
  supplierPaymentId: string | null;
  receiptId: string | null;
  checkId: string | null;
  bankStatementLineId: string | null;
  inflationAdjustmentId: string | null;
  cashSessionId: string | null;
  productionOrderId: string | null;
};

type SaleRef = { documentLetter: string; pointOfSale: string; number: string; customerName: string };
type PurchaseRef = { documentLetter: string | null; pointOfSale: string | null; number: string | null; supplierName: string };
type OrderRef = { number: string; supplier: { name: string } };

const dayFormat = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'America/Argentina/Buenos_Aires',
});

function idsOf(entries: LinkedEntry[], key: keyof LinkedEntry): string[] {
  return [...new Set(entries.map((e) => e[key]).filter((v): v is string => typeof v === 'string'))];
}

function byId<R extends { id: string }>(rows: R[]): Map<string, R> {
  return new Map(rows.map((r) => [r.id, r]));
}

const sale = (i: SaleRef) => `Factura ${voucher(i.documentLetter, i.pointOfSale, i.number)} - ${i.customerName}`;
const purchase = (p: PurchaseRef) => `${voucher(p.documentLetter, p.pointOfSale, p.number)} - ${p.supplierName}`;
const order = (o: OrderRef) => `${o.number} - ${o.supplier.name}`;

/**
 * Los asientos ya registrados no se pueden modificar (trigger
 * journal_entry_lock), así que los que guardaron el id interno del
 * comprobante se muestran con el número y la contraparte, armados al leer.
 * Sólo toca descripciones con un id; las demás quedan como están.
 */
export async function withReadableDescriptions<T extends LinkedEntry>(entries: T[]): Promise<T[]> {
  const pending = entries.filter((e) => UUID.test(e.description));
  if (pending.length === 0) return entries;
  const db = getTenantDb();
  const saleSelect = { documentLetter: true, pointOfSale: true, number: true, customerName: true } as const;
  const purchaseSelect = { documentLetter: true, pointOfSale: true, number: true, supplierName: true } as const;
  const orderSelect = { number: true, supplier: { select: { name: true } } } as const;
  const [invoices, creditNotes, receipts, goodsReceipts, supplierReturns, purchaseInvoices, purchaseCreditNotes] =
    await Promise.all([
      db.invoice.findMany({ where: { id: { in: idsOf(pending, 'invoiceId') } }, select: { id: true, ...saleSelect } }),
      db.creditNote.findMany({
        where: { id: { in: idsOf(pending, 'creditNoteId') } },
        select: { id: true, documentLetter: true, pointOfSale: true, number: true, invoice: { select: saleSelect } },
      }),
      db.receipt.findMany({
        where: { id: { in: idsOf(pending, 'receiptId') } },
        select: { id: true, invoice: { select: saleSelect } },
      }),
      db.goodsReceipt.findMany({
        where: { id: { in: idsOf(pending, 'goodsReceiptId') } },
        select: { id: true, supplierDocNumber: true, purchaseOrder: { select: orderSelect } },
      }),
      db.supplierReturn.findMany({
        where: { id: { in: idsOf(pending, 'supplierReturnId') } },
        select: { id: true, goodsReceipt: { select: { purchaseOrder: { select: orderSelect } } } },
      }),
      db.purchaseInvoice.findMany({
        where: { id: { in: idsOf(pending, 'purchaseInvoiceId') } },
        select: { id: true, ...purchaseSelect },
      }),
      db.purchaseCreditNote.findMany({
        where: { id: { in: idsOf(pending, 'purchaseCreditNoteId') } },
        select: { id: true, ...purchaseSelect },
      }),
    ]);
  const [supplierPayments, checks, bankLines, inflation, sessions, orders] = await Promise.all([
    db.supplierPayment.findMany({
      where: { id: { in: idsOf(pending, 'supplierPaymentId') } },
      select: { id: true, purchaseInvoice: { select: purchaseSelect } },
    }),
    db.check.findMany({ where: { id: { in: idsOf(pending, 'checkId') } }, select: { id: true, number: true, bankName: true } }),
    db.bankStatementLine.findMany({
      where: { id: { in: idsOf(pending, 'bankStatementLineId') } },
      select: { id: true, description: true },
    }),
    db.inflationAdjustment.findMany({
      where: { id: { in: idsOf(pending, 'inflationAdjustmentId') } },
      select: { id: true, periodFrom: true, periodTo: true },
    }),
    db.cashSession.findMany({
      where: { id: { in: idsOf(pending, 'cashSessionId') } },
      select: { id: true, openedAt: true, register: { select: { name: true } } },
    }),
    db.productionOrder.findMany({ where: { id: { in: idsOf(pending, 'productionOrderId') } }, select: { id: true, number: true } }),
  ]);
  // Diferencia de cambio vieja: "… - cuenta <id de la cuenta de dinero>",
  // sin vínculo en el asiento.
  const textIds = [...new Set(pending.map((e) => e.description.match(UUID)?.[0]).filter((v): v is string => !!v))];
  const moneyAccounts = byId(
    await db.financialAccount.findMany({ where: { id: { in: textIds } }, select: { id: true, name: true } }),
  );

  const inv = byId(invoices);
  const cn = byId(creditNotes);
  const rc = byId(receipts);
  const gr = byId(goodsReceipts);
  const sr = byId(supplierReturns);
  const pi = byId(purchaseInvoices);
  const pcn = byId(purchaseCreditNotes);
  const sp = byId(supplierPayments);
  const ch = byId(checks);
  const bl = byId(bankLines);
  const ia = byId(inflation);
  const cs = byId(sessions);
  const po = byId(orders);

  function label(e: LinkedEntry): string | null {
    const c = e.creditNoteId ? cn.get(e.creditNoteId) : undefined;
    if (c) return `${voucher(c.documentLetter, c.pointOfSale, c.number)} (anula ${sale(c.invoice)})`;
    const r = e.receiptId ? rc.get(e.receiptId) : undefined;
    if (r) return sale(r.invoice);
    const i = e.invoiceId ? inv.get(e.invoiceId) : undefined;
    if (i) return sale(i);
    const g = e.goodsReceiptId ? gr.get(e.goodsReceiptId) : undefined;
    if (g) return `${order(g.purchaseOrder)}${g.supplierDocNumber ? ` (remito ${g.supplierDocNumber})` : ''}`;
    const s = e.supplierReturnId ? sr.get(e.supplierReturnId) : undefined;
    if (s) return order(s.goodsReceipt.purchaseOrder);
    const p = e.supplierPaymentId ? sp.get(e.supplierPaymentId) : undefined;
    if (p) return `Factura de compra ${purchase(p.purchaseInvoice)}`;
    const f = e.purchaseInvoiceId ? pi.get(e.purchaseInvoiceId) : undefined;
    if (f) return purchase(f);
    const n = e.purchaseCreditNoteId ? pcn.get(e.purchaseCreditNoteId) : undefined;
    if (n) return purchase(n);
    const k = e.checkId ? ch.get(e.checkId) : undefined;
    if (k) return `N° ${k.number}, ${k.bankName}`;
    const b = e.bankStatementLineId ? bl.get(e.bankStatementLineId) : undefined;
    if (b) return `extracto: ${b.description}`;
    const a = e.inflationAdjustmentId ? ia.get(e.inflationAdjustmentId) : undefined;
    if (a) return `${dayFormat.format(a.periodFrom)} al ${dayFormat.format(a.periodTo)}`;
    const t = e.cashSessionId ? cs.get(e.cashSessionId) : undefined;
    if (t) return `${t.register.name}, turno del ${dayFormat.format(t.openedAt)}`;
    const o = e.productionOrderId ? po.get(e.productionOrderId) : undefined;
    if (o) return o.number;
    const m = moneyAccounts.get(e.description.match(UUID)?.[0] ?? '');
    if (m) return m.name;
    return null;
  }

  return entries.map((e) => {
    if (!UUID.test(e.description)) return e;
    const text = label(e);
    const description = text
      ? e.description.replace(ID_REF, text)
      : e.description.replace(new RegExp(`\\s*-?\\s*${ID_REF.source}`), '');
    return { ...e, description };
  });
}
