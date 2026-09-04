import { api } from '@/lib/api';

export interface Currency {
  id: string;
  code: string;
  name: string;
  isBase: boolean;
  // Última cotización cargada (ExchangeRateHistory) - 1 para la moneda
  // base, null si todavía no se cargó ninguna.
  latestRate: number | null;
}

export interface ExchangeRateHistoryEntry {
  id: string;
  currencyId: string;
  rate: string;
  effectiveAt: string;
}

export interface InvoiceLine {
  id: string;
  articleVariantId: string;
  quantity: string;
  unitPrice: string;
  discountType: 'PERCENTAGE' | 'AMOUNT';
  discountValue: string;
  netAmount: string;
  taxRate: string;
  lineTotal: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  customerName: string;
  customerTaxId: string | null;
  documentLetter: string;
  pointOfSale: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  balanceDue: string;
  afipCae: string | null;
  lines: InvoiceLine[];
}

export interface InvoiceLineDetail extends InvoiceLine {
  articleVariant: {
    sku: string;
    color: string | null;
    size: string | null;
    brand: string | null;
    attributes: Record<string, string> | null;
    article: { name: string };
  };
}

export interface InvoiceReceipt {
  id: string;
  amount: string;
  method: string;
  paidAt: string;
}

export interface InvoiceCreditNote {
  id: string;
  documentLetter: string;
  pointOfSale: string;
  number: string;
  reason: string;
  total: string;
  issueDate: string;
  afipCae: string | null;
}

export interface InvoiceDetail extends Invoice {
  lines: InvoiceLineDetail[];
  receipts: InvoiceReceipt[];
  creditNotes: InvoiceCreditNote[];
}

export interface CreateSaleLineInput {
  articleVariantId: string;
  quantity: number;
  discountType?: 'PERCENTAGE' | 'AMOUNT';
  discountValue?: number;
  // Anula precio/alícuota de catálogo para esta línea - ver
  // CreateInvoiceLineDto en el backend para el criterio completo.
  unitPrice?: number;
  taxKind?: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
  taxRate?: number;
}

// AFIP Tributos - jurisdicción del tributo (id numérico que espera AFIP se
// resuelve en el backend, ver AFIP_TRIBUTO_ID en InvoicingService).
export type InvoiceTaxLineKind = 'NATIONAL' | 'PROVINCIAL' | 'MUNICIPAL' | 'INTERNAL' | 'OTHER';

export interface InvoiceTaxLineInput {
  kind: InvoiceTaxLineKind;
  concept: string;
  baseAmount?: number;
  rate?: number;
  amount: number;
}

export interface CreateSaleInput {
  customerId: string;
  warehouseId: string;
  documentLetter: 'A' | 'B' | 'C' | 'M';
  branchId: string;
  currencyId: string;
  // Override puntual de la cotización de este comprobante - si no viene, el
  // backend resuelve la última cargada en el historial. Sin efecto para la
  // moneda base.
  exchangeRate?: number;
  globalDiscountPercent?: number;
  dueDate?: string;
  pricesIncludeTax?: boolean;
  lines: CreateSaleLineInput[];
  // Percepciones/otros tributos (ej. IIBB) - opcional, la mayoría de las
  // facturas no llevan ninguno.
  otherTaxLines?: InvoiceTaxLineInput[];
}

export interface ReceiptCheckInput {
  number: string;
  bankName: string;
  drawerCuit?: string;
  format?: 'PHYSICAL' | 'ECHEQ';
  issueDate: string;
  dueDate: string;
}

export interface RecordReceiptInput {
  invoiceId: string;
  amount: number;
  method: string;
  financialAccountId?: string;
  check?: ReceiptCheckInput;
}

export interface CreateCreditNoteLineInput {
  invoiceLineId: string;
  quantity: number;
}

export interface CreateCreditNoteInput {
  invoiceId: string;
  reason: string;
  lines: CreateCreditNoteLineInput[];
}

export interface CreateCurrencyInput {
  code: string;
  name: string;
  isBase?: boolean;
}

export type InvoicePdfFormat = 'A4' | 'A5' | 'TICKET';

export const INVOICE_PDF_FORMATS: { value: InvoicePdfFormat; label: string; description: string }[] = [
  { value: 'A4', label: 'A4', description: 'Hoja completa - el formato estándar de oficina' },
  { value: 'A5', label: 'A5', description: 'Media hoja' },
  { value: 'TICKET', label: 'Ticket', description: 'Angosto, para impresora térmica/de tickets' },
];

/** Blob en vez de un <a href>/window.open directo, así viaja el header de
 * Authorization - mismo criterio que openPdf en apps/web/src/lib/purchases.ts. */
async function openPdf(id: string, format?: InvoicePdfFormat): Promise<void> {
  const res = await api.get(`/invoicing/invoices/${id}/pdf`, {
    params: format ? { format } : {},
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export const invoicingApi = {
  listInvoices: () => api.get<Invoice[]>('/invoicing/invoices').then((r) => r.data),
  getInvoice: (id: string) => api.get<InvoiceDetail>(`/invoicing/invoices/${id}`).then((r) => r.data),
  listCurrencies: () => api.get<Currency[]>('/invoicing/currencies').then((r) => r.data),
  createCurrency: (dto: CreateCurrencyInput) =>
    api.post<Currency>('/invoicing/currencies', dto).then((r) => r.data),
  recordExchangeRate: (currencyId: string, rate: number) =>
    api.post('/invoicing/exchange-rates', { currencyId, rate }).then((r) => r.data),
  syncBnaRate: () => api.post('/invoicing/exchange-rates/sync-bna').then((r) => r.data),
  getExchangeRateHistory: (currencyId: string) =>
    api
      .get<ExchangeRateHistoryEntry[]>('/invoicing/exchange-rates', { params: { currencyId } })
      .then((r) => r.data),
  createSale: (dto: CreateSaleInput) => api.post<Invoice>('/sales/invoices', dto).then((r) => r.data),
  recordReceipt: (dto: RecordReceiptInput) =>
    api.post('/sales/receipts', dto).then((r) => r.data),
  createCreditNote: (dto: CreateCreditNoteInput) =>
    api.post('/sales/credit-notes', dto).then((r) => r.data),
  openPdf: (id: string, format?: InvoicePdfFormat) => openPdf(id, format),
};

export const invoicingPreferencesApi = {
  get: () => api.get<{ invoicePdfFormat: InvoicePdfFormat }>('/invoicing/preferences').then((r) => r.data),
  update: (invoicePdfFormat: InvoicePdfFormat) =>
    api.patch<{ invoicePdfFormat: InvoicePdfFormat }>('/invoicing/preferences', { invoicePdfFormat }).then((r) => r.data),
};
