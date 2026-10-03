/** Shared data shape all 5 templates render from, built once by
 * QuoteService.generatePdf (see build-pdf-data.ts). Customer-facing (unlike
 * @plexo/inventory-cart's single-template cart export) - full 5-style
 * system, same as @plexo/purchases, but a standalone copy: no module imports
 * another module's internals (see purchase-email-sender.port.ts for the
 * same rule applied to email senders).
 *
 * Todos los importes llegan ya formateados (es-AR) y en los términos que
 * corresponden a vatMode, así las plantillas sólo dibujan. */

/** Cómo se muestra el IVA - lo decide la condición del emisor y del cliente,
 * igual que la letra de la factura que saldría de esta cotización:
 * - DISCRIMINATED: emisor RI y cliente RI (factura A). Precios netos,
 *   columna de alícuota y resumen por alícuota.
 * - INCLUDED: emisor RI y cliente consumidor final, monotributista, exento
 *   o de condición desconocida (factura B). Precios finales y una línea
 *   "IVA contenido".
 * - NONE: emisor Monotributo o Exento (factura C). Precios finales, sin
 *   mención del IVA. */
export type QuoteVatMode = 'DISCRIMINATED' | 'INCLUDED' | 'NONE';

export interface QuotePdfImage {
  data: Buffer;
  format: 'png' | 'jpg';
}

export interface QuotePdfEmitter {
  /** Razón social. */
  name: string;
  tradeName: string | null;
  taxId: string | null;
  taxConditionLabel: string;
  grossIncomeNumber: string | null;
  activityStart: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo: QuotePdfImage | null;
  /** Para el recuadro que reemplaza al logo cuando no hay uno cargado. */
  initials: string;
  /** #rrggbb - el de la empresa o el índigo de Oplex. */
  brandColor: string;
}

export interface QuotePdfCustomer {
  name: string;
  taxId: string | null;
  taxCondition: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  contactFirstName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface QuotePdfConditions {
  payment: string | null;
  delivery: string | null;
  place: string | null;
  warranty: string | null;
}

export interface QuotePdfBank {
  name: string | null;
  cbu: string | null;
  alias: string | null;
}

export interface QuotePdfLine {
  articleName: string;
  variantLabel: string | null;
  sku: string;
  quantity: string;
  unit: string;
  /** Neto en DISCRIMINATED, final en INCLUDED/NONE. */
  unitPrice: string;
  /** "5%" o null si la línea no tiene bonificación. */
  discount: string | null;
  /** "21%", "Exento", "No Grav." - sólo se usa en DISCRIMINATED. */
  vatLabel: string | null;
  /** Importe de la línea con la bonificación aplicada, en los mismos
   * términos que unitPrice. */
  amount: string;
  note: string | null;
  image: QuotePdfImage | null;
}

export interface QuotePdfTotals {
  /** Suma de precio × cantidad, antes de bonificaciones. */
  subtotal: string;
  /** null si ninguna línea tiene bonificación. */
  discount: string | null;
  /** Sólo en DISCRIMINATED. */
  netTaxed: string | null;
  netExempt: string | null;
  /** Sólo las alícuotas con importe, en DISCRIMINATED. */
  vatByRate: { label: string; amount: string }[];
  vatTotal: string | null;
  /** Sólo en INCLUDED: el IVA que contiene el total. */
  vatContained: string | null;
  total: string;
  /** "pesos ciento veinte mil con 00/100". */
  totalInWords: string;
}

export interface QuotePdfData {
  number: string;
  issueDate: string;
  validUntil: string | null;
  validDays: number | null;
  sellerName: string | null;
  currencyCode: string;
  emitter: QuotePdfEmitter;
  customer: QuotePdfCustomer;
  conditions: QuotePdfConditions;
  bank: QuotePdfBank | null;
  vatMode: QuoteVatMode;
  lines: QuotePdfLine[];
  totals: QuotePdfTotals;
  notes: string | null;
}

export const NOT_AN_INVOICE_LEGEND = 'Documento no válido como factura';
