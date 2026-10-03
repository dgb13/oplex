/** Shared data shape the ARCA/A5 and ticket templates render from - built
 * once by buildInvoicePdfData(), so the templates don't repeat any lookup
 * or formatting logic, only layout. A diferencia de Compras/Cotizaciones
 * (5 estilos visuales libres), acá el diseño es uno solo fiel al formato
 * real de ARCA - lo que varía entre A4/A5/TICKET es el tamaño de papel, no
 * el contenido.
 *
 * Los importes de las líneas y las filas de totales ya vienen en los
 * términos de la letra (ver InvoiceVatMode): las plantillas sólo dibujan. */

/** - DISCRIMINATED (A, M): precios netos e IVA por alícuota.
 *  - INCLUDED (B): precios finales; el IVA va aparte como "IVA contenido".
 *  - NONE (C): emisor Monotributo/Exento, precios finales sin IVA. */
export type InvoiceVatMode = 'DISCRIMINATED' | 'INCLUDED' | 'NONE';

export interface InvoicePdfLine {
  description: string;
  sku: string;
  quantity: string;
  /** Neto en DISCRIMINATED, final en INCLUDED/NONE. */
  unitPrice: string;
  /** "10%" o un importe; null sin bonificación. */
  discount: string | null;
  /** Precio × cantidad menos la bonificación de la línea, en los mismos
   * términos que unitPrice (antes del descuento general, que va en los
   * totales). */
  lineTotal: string;
}

export interface InvoicePdfTotalRow {
  label: string;
  amount: string;
}

export interface InvoicePdfData {
  // Emisor (el tenant).
  issuerName: string;
  issuerTaxId: string | null;
  issuerTaxConditionLabel: string | null;
  issuerFiscalAddress: string | null;
  issuerGrossIncomeNumber: string | null;
  issuerActivityStartDate: string | null;

  // Comprobante.
  documentLetter: string;
  cbteTipoCode: number;
  pointOfSale: string;
  number: string;
  fullNumber: string;
  conceptLabel: string;
  issueDate: string;
  serviceDueDate: string | null;

  // Receptor.
  customerName: string;
  // null = no mostrar la línea (Consumidor Final cuyo nombre ya es
  // "Consumidor Final" - antes salía repetido).
  customerTaxIdLabel: string | null;
  customerTaxId: string | null;
  customerTaxConditionLabel: string | null;
  customerFiscalAddress: string | null;

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
  /** Sólo en B: el IVA que contiene el total. */
  vatContained: string | null;

  cae: string;
  caeExpiry: string;

  qrDataUri: string;
}
