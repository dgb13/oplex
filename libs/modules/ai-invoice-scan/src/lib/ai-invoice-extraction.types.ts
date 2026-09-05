export type ExtractionSource = 'qr' | 'ai';

// confidence sólo tiene sentido para source:'ai' (un dato del QR es
// verdad absoluta, validada por ARCA - ver docs/plan-carga-comprobantes-ia.md,
// sección 2). undefined en un campo source:'qr'.
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

// Shape que la pantalla de revisión (1d) necesita - suficiente para
// prellenar CreatePurchaseInvoiceDto (sin purchaseOrderId, ver 1a) más lo
// que hace falta para buscar/crear el Company del proveedor.
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

// Lo que le pedimos a Claude devolver via tool use - todo sale de acá con
// confidence propia (0-1), independientemente de si el QR después
// reemplaza algún campo puntual con el dato "de verdad".
export interface ClaudeExtractionField<T> {
  value: T;
  confidence: number;
}

export interface ClaudeExtractionTaxLine {
  type: 'IVA_CREDITO' | 'PERCEPCION';
  concept: ClaudeExtractionField<string>;
  amount: ClaudeExtractionField<number>;
  netAmount: ClaudeExtractionField<number>;
  taxRate: ClaudeExtractionField<number | null>;
}

export interface ClaudeExtractionOutput {
  supplierCuit: ClaudeExtractionField<string | null>;
  supplierName: ClaudeExtractionField<string | null>;
  supplierInvoiceNumber: ClaudeExtractionField<string>;
  supplierInvoiceDate: ClaudeExtractionField<string>;
  documentLetter: ClaudeExtractionField<string | null>;
  pointOfSale: ClaudeExtractionField<string | null>;
  number: ClaudeExtractionField<string | null>;
  subtotal: ClaudeExtractionField<number>;
  currencyCode: ClaudeExtractionField<string>;
  taxLines: ClaudeExtractionTaxLine[];
}
