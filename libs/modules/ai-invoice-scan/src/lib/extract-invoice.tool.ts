// Definición de tool use para Claude (Anthropic) - fuerza una salida JSON
// estructurada en vez de parsear texto libre. Cada campo lleva su propia
// "confidence" (0-1) porque, a diferencia del QR, todo lo que sale de acá
// es una lectura de la IA, nunca un dato validado por ARCA - ver
// docs/plan-carga-comprobantes-ia.md, sección 2.
const CONFIDENT_FIELD_SCHEMA = (valueSchema: Record<string, unknown>) => ({
  type: 'object',
  properties: {
    value: valueSchema,
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['value', 'confidence'],
});

const TAX_LINE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['IVA_CREDITO', 'PERCEPCION'] },
    concept: CONFIDENT_FIELD_SCHEMA({ type: 'string' }),
    amount: CONFIDENT_FIELD_SCHEMA({ type: 'number' }),
    netAmount: CONFIDENT_FIELD_SCHEMA({ type: 'number' }),
    taxRate: CONFIDENT_FIELD_SCHEMA({ type: ['number', 'null'] }),
  },
  required: ['type', 'concept', 'amount', 'netAmount', 'taxRate'],
};

export const EXTRACT_INVOICE_TOOL = {
  name: 'extract_purchase_invoice_data',
  description:
    'Extrae los datos estructurados de una factura de compra argentina (foto o escaneo) para cargarla en un sistema contable.',
  input_schema: {
    type: 'object' as const,
    properties: {
      supplierCuit: CONFIDENT_FIELD_SCHEMA({ type: ['string', 'null'], description: 'CUIT del proveedor, sólo dígitos' }),
      supplierName: CONFIDENT_FIELD_SCHEMA({ type: ['string', 'null'] }),
      supplierInvoiceNumber: CONFIDENT_FIELD_SCHEMA({
        type: 'string',
        description: 'Número completo tal como figura impreso, ej. "0001-00012345"',
      }),
      supplierInvoiceDate: CONFIDENT_FIELD_SCHEMA({ type: 'string', description: 'Fecha en formato ISO yyyy-mm-dd' }),
      documentLetter: CONFIDENT_FIELD_SCHEMA({ type: ['string', 'null'], enum: ['A', 'B', 'C', 'M', null] }),
      pointOfSale: CONFIDENT_FIELD_SCHEMA({ type: ['string', 'null'] }),
      number: CONFIDENT_FIELD_SCHEMA({ type: ['string', 'null'] }),
      subtotal: CONFIDENT_FIELD_SCHEMA({ type: 'number', description: 'Neto, antes de impuestos' }),
      currencyCode: CONFIDENT_FIELD_SCHEMA({ type: 'string', description: 'ARS o USD' }),
      taxLines: { type: 'array', items: TAX_LINE_SCHEMA },
    },
    required: [
      'supplierCuit',
      'supplierName',
      'supplierInvoiceNumber',
      'supplierInvoiceDate',
      'documentLetter',
      'pointOfSale',
      'number',
      'subtotal',
      'currencyCode',
      'taxLines',
    ],
  },
};
