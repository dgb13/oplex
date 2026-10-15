import type { InvoicePdfFormat, PdfStyle } from '@plexo/database';
import QRCode from 'qrcode';
import { InvoicePdfService } from './invoice-pdf.service.js';
import type { InvoicePdfData } from './pdf-data.js';

const FORMATS: InvoicePdfFormat[] = ['A4', 'A5', 'TICKET'];
const STYLES: PdfStyle[] = ['MODERNO', 'COMPACTO', 'TRADICIONAL', 'NATURAL', 'LETRAS_GRANDES'];

async function makeData(overrides: Partial<InvoicePdfData> = {}): Promise<InvoicePdfData> {
  const qrDataUri = await QRCode.toDataURL('https://www.afip.gob.ar/fe/qr/?p=test', { margin: 1, width: 200 });
  return {
    kind: 'FACTURA',
    title: 'Factura',
    emitter: {
      name: 'Mi Tenant SA',
      tradeName: 'Demo',
      taxId: '30-12345678-9',
      taxConditionLabel: 'IVA Responsable Inscripto',
      grossIncomeNumber: '901-123456-7',
      activityStart: '01/01/2020',
      address: 'Av. Siempre Viva 123, CABA',
      phone: '11 4444-5555',
      email: 'ventas@demo.com',
      website: 'demo.com',
      logo: null,
      initials: 'D',
      brandColor: '#4f39f6',
    },
    customer: {
      name: 'Cliente Demo SA',
      docLabel: 'CUIT',
      docNumber: '20-30405060-7',
      taxConditionLabel: 'IVA Responsable Inscripto',
      address: 'Calle Falsa 456, CABA',
    },
    documentLetter: 'A',
    cbteTipoCode: '01',
    pointOfSale: '0001',
    number: '00000005',
    fullNumber: '0001-00000005',
    conceptLabel: 'Productos y servicios',
    issueDate: '28/08/2026',
    servicePeriod: { from: '28/08/2026', to: '28/08/2026', paymentDue: '10/09/2026' },
    saleCondition: 'Cuenta corriente · vence 10/09/2026',
    associatedDocument: null,
    reason: null,
    currencyCode: 'ARS',
    exchangeRate: '1',
    isBaseCurrency: true,
    vatMode: 'DISCRIMINATED',
    lines: [
      { description: 'Agua mineral 500ml', sku: 'AGUA-500', quantity: '10', unit: 'u.', unitPrice: '100,00', discount: '5%', vatLabel: '21%', lineTotal: '950,00', image: null },
    ],
    hasLineDiscounts: true,
    totalRows: [
      { label: 'Importe neto gravado', amount: '950,00' },
      { label: 'IVA 21%', amount: '199,50' },
    ],
    total: '1.149,50',
    totalInWords: 'pesos mil ciento cuarenta y nueve con 50/100',
    transparency: null,
    legends: [],
    bank: { name: 'Banco Galicia', cbu: '00700999 20000012345678', alias: 'DEMO.VENTAS' },
    notes: 'Orden de compra 4512',
    cae: '75123456789012',
    caeExpiry: '07/09/2026',
    qrDataUri,
    ...overrides,
  };
}

function expectPdf(buffer: Buffer) {
  expect(Buffer.isBuffer(buffer)).toBe(true);
  // %PDF es el magic header estándar de un PDF - confirma que
  // @react-pdf/renderer produjo un PDF real, no sólo bytes cualquiera.
  expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
}

describe('InvoicePdfService', () => {
  const service = new InvoicePdfService();

  it.each(FORMATS.flatMap((format) => STYLES.map((style) => [format, style] as const)))(
    'renders a PDF for %s / %s',
    async (format, style) => {
      expectPdf(await service.generate(format, style, await makeData()));
    },
  );

  it.each(STYLES)('renders a Factura B and a nota de crédito in %s', async (style) => {
    const facturaB = await makeData({
      documentLetter: 'B',
      cbteTipoCode: '06',
      vatMode: 'INCLUDED',
      customer: { name: 'Consumidor Final', docLabel: null, docNumber: null, taxConditionLabel: 'Consumidor Final', address: null },
      transparency: { vatContained: '199,50', otherIndirectTaxes: '0,00' },
    });
    expectPdf(await service.generate('A4', style, facturaB));

    const creditNote = await makeData({
      kind: 'NOTA_CREDITO',
      title: 'Nota de crédito',
      cbteTipoCode: '03',
      associatedDocument: 'Factura A 0001-00000005 del 28/08/2026',
      reason: 'Devolución',
      bank: null,
      legends: ['El crédito fiscal discriminado en el presente comprobante...'],
    });
    expectPdf(await service.generate('A4', style, creditNote));
  });
});
