import type { InvoicePdfFormat } from '@plexo/database';
import QRCode from 'qrcode';
import { InvoicePdfService } from './invoice-pdf.service.js';
import type { InvoicePdfData } from './pdf-data.js';

const FORMATS: InvoicePdfFormat[] = ['A4', 'A5', 'TICKET'];

describe('InvoicePdfService', () => {
  it.each(FORMATS)('renders a non-empty PDF buffer for the %s format', async (format) => {
    const qrDataUri = await QRCode.toDataURL('https://www.afip.gob.ar/fe/qr/?p=test', { margin: 1, width: 200 });
    const data: InvoicePdfData = {
      issuerName: 'Mi Tenant SA',
      issuerTaxId: '30-12345678-9',
      issuerTaxConditionLabel: 'Responsable Inscripto',
      issuerFiscalAddress: 'Av. Siempre Viva 123, CABA',
      issuerGrossIncomeNumber: '30-12345678-9',
      issuerActivityStartDate: '01/01/2020',
      documentLetter: 'A',
      cbteTipoCode: 1,
      pointOfSale: '0001',
      number: '00000005',
      fullNumber: '0001-00000005',
      conceptLabel: 'Productos',
      issueDate: '28/08/2026',
      serviceDueDate: null,
      customerName: 'Cliente Demo SA',
      customerTaxIdLabel: 'CUIT',
      customerTaxId: '20-30405060-7',
      customerTaxConditionLabel: 'Responsable Inscripto',
      customerFiscalAddress: 'Calle Falsa 456, CABA',
      currencyCode: 'ARS',
      exchangeRate: '1',
      isBaseCurrency: true,
      vatMode: 'DISCRIMINATED',
      lines: [
        { description: 'Agua mineral 500ml', sku: 'AGUA-500', quantity: '10', unitPrice: '100,00', discount: '5%', lineTotal: '950,00' },
      ],
      hasLineDiscounts: true,
      totalRows: [
        { label: 'Importe Neto Gravado', amount: '950,00' },
        { label: 'IVA 21%', amount: '199,50' },
      ],
      total: '1149,50',
      vatContained: null,
      cae: '75123456789012',
      caeExpiry: '07/09/2026',
      qrDataUri,
    };
    const service = new InvoicePdfService();

    const buffer = await service.generate(format, data);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // %PDF es el magic header estándar de un PDF - confirma que
    // @react-pdf/renderer produjo un PDF real, no sólo bytes cualquiera.
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
