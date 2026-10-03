import type { PdfStyle } from '@plexo/database';
import type { PurchaseDocumentPdfData } from './pdf-data.js';
import { PdfGeneratorService } from './pdf-generator.service.js';

const STYLES: PdfStyle[] = ['MODERNO', 'COMPACTO', 'TRADICIONAL', 'NATURAL', 'LETRAS_GRANDES'];

const SAMPLE_DATA: PurchaseDocumentPdfData = {
  documentTypeLabel: 'Orden de Compra',
  number: 'OC-000001',
  issueDate: '27 de julio de 2026',
  tenantName: 'Mi Tenant SA',
  tenantTaxId: '30-12345678-9',
  supplierName: 'Distribuidora Norte',
  supplierTaxId: '20-11111111-1',
  supplierAddress: 'Av. Siempre Viva 123',
  transportModeName: 'Retira el proveedor',
  paymentTermName: 'Contado',
  deliveryTimeName: '7 días',
  currencyCode: 'USD',
  lines: [
    { articleName: 'Agua mineral 500ml', variantLabel: null, sku: 'AGUA-500', quantity: '10,00', unitCost: '1,50', lineTotal: '15,00' },
  ],
  total: '15,00',
  notes: 'Entregar en el depósito central',
};

describe('PdfGeneratorService', () => {
  it.each(STYLES)('renders a non-empty PDF buffer for the %s style', async (style) => {
    const service = new PdfGeneratorService();

    const buffer = await service.generate(style, SAMPLE_DATA);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // %PDF is the standard magic header for a PDF file - a cheap sanity
    // check that react-pdf actually produced a real PDF, not just bytes.
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
