/** Shared data shape the 5 styles (A4/A5) and the ticket render from - built
 * once by buildInvoicePdfData(), so the templates don't repeat any lookup
 * or formatting logic, only layout. Mismo sistema de 5 estilos que
 * Cotizaciones/Compras pero con los datos que exige ARCA (RG 1415 Anexo II,
 * RG 4291, RG 5614): sirve igual para facturas y notas de crédito.
 *
 * Los importes de las líneas y las filas de totales ya vienen en los
 * términos de la letra (ver InvoiceVatMode): las plantillas sólo dibujan. */

/** - DISCRIMINATED (A, M): precios netos e IVA por alícuota.
 *  - INCLUDED (B): precios finales; el IVA va aparte como "IVA contenido".
 *  - NONE (C): emisor Monotributo/Exento, precios finales sin IVA. */
export type InvoiceVatMode = 'DISCRIMINATED' | 'INCLUDED' | 'NONE';

export type InvoicePdfKind = 'FACTURA' | 'NOTA_CREDITO';

export interface InvoicePdfImage {
  data: Buffer;
  format: 'png' | 'jpg';
}

export interface InvoicePdfEmitter {
  /** Razón social. */
  name: string;
  tradeName: string | null;
  taxId: string | null;
  taxConditionLabel: string | null;
  grossIncomeNumber: string | null;
  activityStart: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo: InvoicePdfImage | null;
  /** Para el recuadro que reemplaza al logo cuando no hay uno cargado. */
  initials: string;
  /** #rrggbb - el de la empresa o el índigo de Oplex. */
  brandColor: string;
}

export interface InvoicePdfCustomer {
  name: string;
  /** "CUIT", o null para Consumidor Final sin documento. */
  docLabel: string | null;
  docNumber: string | null;
  taxConditionLabel: string;
  address: string | null;
}

export interface InvoicePdfLine {
  description: string;
  sku: string;
  quantity: string;
  unit: string;
  /** Neto en DISCRIMINATED, final en INCLUDED/NONE. */
  unitPrice: string;
  /** "10%" o un importe; null sin bonificación. */
  discount: string | null;
  /** "21%", "Exento", "No grav." - sólo se muestra en DISCRIMINATED. */
  vatLabel: string;
  /** Precio × cantidad menos la bonificación de la línea, en los mismos
   * términos que unitPrice (antes del descuento general, que va en los
   * totales). */
  lineTotal: string;
  /** Foto del artículo - sólo la usa el estilo Natural. */
  image: InvoicePdfImage | null;
}

export interface InvoicePdfTotalRow {
  label: string;
  amount: string;
}

/** RG 5614 (Ley 27.743): en comprobantes a consumidores finales. */
export interface InvoicePdfTransparency {
  vatContained: string;
  otherIndirectTaxes: string;
}

export interface InvoicePdfData {
  kind: InvoicePdfKind;
  /** "Factura" / "Nota de crédito". */
  title: string;
  emitter: InvoicePdfEmitter;
  customer: InvoicePdfCustomer;

  documentLetter: string;
  /** "01", "06", "13"... */
  cbteTipoCode: string;
  pointOfSale: string;
  number: string;
  fullNumber: string;
  conceptLabel: string;
  issueDate: string;
  /** Concepto servicios: lo mismo que se informa a ARCA (FchServDesde/
   * FchServHasta/FchVtoPago). null en productos. */
  servicePeriod: { from: string; to: string; paymentDue: string } | null;
  /** "Contado", "Cuenta corriente · vence 14/11/2026"... */
  saleCondition: string;
  /** Sólo en notas de crédito: "Factura A 0001-00000124 del 15/10/2026". */
  associatedDocument: string | null;
  reason: string | null;

  currencyCode: string;
  exchangeRate: string;
  isBaseCurrency: boolean;

  vatMode: InvoiceVatMode;
  lines: InvoicePdfLine[];
  /** true si alguna línea tiene bonificación (agrega la columna). */
  hasLineDiscounts: boolean;

  /** Filas antes del total, ya en orden: subtotal y descuento general (si
   * hay), neto gravado e IVA por alícuota (sólo A/M), exento, no gravado y
   * percepciones/otros tributos. Sólo las que tienen importe. */
  totalRows: InvoicePdfTotalRow[];
  total: string;
  /** "pesos ciento veinte mil con 00/100". */
  totalInWords: string;
  /** Sólo en B. */
  transparency: InvoicePdfTransparency | null;
  /** Leyendas fiscales extra (p. ej. Ley 27.618 en A a monotributistas). */
  legends: string[];

  bank: { name: string | null; cbu: string | null; alias: string | null } | null;
  notes: string | null;

  cae: string;
  caeExpiry: string;
  qrDataUri: string;
}

export const AUTHORIZED_LEGEND = 'Comprobante autorizado';
export const TRANSPARENCY_TITLE = 'Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)';
