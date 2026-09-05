import { api } from '@/lib/api';

export type AiInvoiceScanAvailability =
  | { available: 'green' }
  | { available: 'yellow'; reason: string }
  | { available: 'red'; reason: string };

export type ExtractionSource = 'qr' | 'ai';

export interface ExtractedField<T> {
  value: T;
  source: ExtractionSource;
  confidence?: number;
}

export interface ExtractedTaxLine {
  type: 'IVA_CREDITO' | 'PERCEPCION';
  concept: ExtractedField<string>;
  amount: ExtractedField<number>;
  netAmount: ExtractedField<number>;
  taxRate: ExtractedField<number | null>;
}

export interface AiInvoiceExtractionResult {
  supplierCuit: ExtractedField<string | null>;
  supplierName: ExtractedField<string | null>;
  supplierInvoiceNumber: ExtractedField<string>;
  supplierInvoiceDate: ExtractedField<string>;
  documentLetter: ExtractedField<string | null>;
  pointOfSale: ExtractedField<string | null>;
  number: ExtractedField<string | null>;
  subtotal: ExtractedField<number>;
  currencyCode: ExtractedField<string>;
  taxLines: ExtractedTaxLine[];
}

// "Carga de comprobantes IA" (ver docs/plan-carga-comprobantes-ia.md) - la
// creación real del comprobante (purchaseInvoicesApi.create, ya soporta el
// modo sin OC) y el adjuntado del archivo (purchaseInvoicesApi.uploadAttachment,
// ya existente) NO viven acá - esta pantalla los llama directo después de
// que el usuario confirma la revisión.
export const aiInvoiceScanApi = {
  getStatus: () => api.get<AiInvoiceScanAvailability>('/purchase-invoices/ai-scan/status').then((r) => r.data),
  extract: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<AiInvoiceExtractionResult>('/purchase-invoices/ai-scan/extract', formData)
      .then((r) => r.data);
  },
};
