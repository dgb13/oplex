/** Shared data shape the ARCA/A5 and ticket templates render from - built
 * once by buildInvoicePdfData(), so the templates don't repeat any lookup
 * or formatting logic, only layout. A diferencia de Compras/Cotizaciones
 * (5 estilos visuales libres), acá el diseño es uno solo fiel al formato
 * real de ARCA - lo que varía entre A4/A5/TICKET es el tamaño de papel, no
 * el contenido. */
export interface InvoicePdfLine {
  description: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface InvoicePdfTaxBucket {
  label: string;
  net: string;
  tax: string;
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

  lines: InvoicePdfLine[];

  // Factura C (Monotributo/Exento): no discrimina IVA - netTaxed/
  // netExempt/netUntaxed/taxBuckets vienen vacíos y se muestra sólo este
  // subtotal (suma de las líneas). null en A/B/M.
  subtotalWithoutVat: string | null;
  // null = el importe es cero, la fila no se muestra en el PDF.
  netTaxed: string | null;
  netExempt: string | null;
  netUntaxed: string | null;
  taxBuckets: InvoicePdfTaxBucket[];
  taxTotal: string;
  total: string;

  cae: string;
  caeExpiry: string;

  qrDataUri: string;
}
