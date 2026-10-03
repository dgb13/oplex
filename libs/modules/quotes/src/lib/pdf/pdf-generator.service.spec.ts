import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildQuotePdfData, type PdfSourceEmitter, type PdfSourceQuote } from './build-pdf-data.js';
import { PdfGeneratorService } from './pdf-generator.service.js';

const STYLES = ['MODERNO', 'COMPACTO', 'TRADICIONAL', 'NATURAL', 'LETRAS_GRANDES'] as const;
// Con QUOTE_PDF_PREVIEW_DIR=<carpeta> los PDF quedan guardados para mirarlos.
const PREVIEW_DIR = process.env['QUOTE_PDF_PREVIEW_DIR'];

const d = (value: number) => ({ toString: () => String(value) });

function line(sku: string, name: string, qty: number, price: number, extra: Partial<PdfSourceQuote['lines'][number]> = {}) {
  const discount = Number(extra.discountPercent?.toString() ?? 0);
  const net = Math.round(qty * price * (1 - discount / 100) * 100) / 100;
  return {
    quantity: d(qty),
    unitPrice: d(price),
    taxRate: d(21),
    taxKind: 'GRAVADO' as const,
    netAmount: d(net),
    lineTotal: d(Math.round(net * 121) / 100),
    articleVariant: { sku, article: { name, unitOfMeasure: 'UNIT' } },
    ...extra,
  };
}

const QUOTE: PdfSourceQuote = {
  number: 'PRE-000124',
  createdAt: new Date('2026-10-03T12:00:00Z'),
  validUntil: new Date('2026-10-18T00:00:00Z'),
  notes: 'Los precios de chapa y tubo se ajustan si la lista del proveedor cambia antes de la aprobación.',
  paymentTerms: '50% anticipo, saldo contra entrega',
  deliveryTerms: '10 días hábiles desde la aprobación',
  deliveryPlace: 'Puesto en planta del cliente',
  warranty: '6 meses por defectos de fabricación',
  currency: { code: 'ARS' },
  customer: {
    name: 'Talleres Rivera SA',
    taxId: '30-70987654-3',
    taxCondition: 'IVA Responsable Inscripto',
    fiscalAddress: 'Calle 12 N° 845, La Plata, Buenos Aires',
    email: 'compras@talleresrivera.com.ar',
  },
  contactPerson: { firstName: 'Lucía', lastName: 'Rivera', email: 'lucia@talleresrivera.com.ar', whatsapp: null },
  createdBy: { name: 'Martín Gómez' },
  lines: [
    line('MESA-TRABAJO-600X1200', 'Mesa de trabajo 600 × 1200 mm', 2, 320000, { notes: 'Con estante inferior' }),
    line('RUEDA-GIRATORIA-FRENO', 'Rueda giratoria con freno 3"', 8, 8500),
    line('TUBO-40X20-16', 'Tubo rectangular 40 × 20 × 1,6 mm', 12, 28900, { discountPercent: d(5) }),
    line('SERV-PINT-EPX', 'Pintura epoxi en polvo', 1, 95000),
  ],
};

const EMITTER: PdfSourceEmitter = {
  name: 'Metalúrgica del Sur SRL',
  tradeName: 'MetalSur',
  taxId: '30-71234567-8',
  ownTaxCondition: 'RESPONSABLE_INSCRIPTO',
  grossIncomeNumber: '901-123456-7',
  activityStartDate: new Date('2015-03-01T00:00:00Z'),
  fiscalAddress: 'Av. Mitre 1450, Avellaneda, Buenos Aires',
  contactPhone: '(011) 4201-5566',
  contactEmail: 'ventas@metalsur.com.ar',
  website: 'metalsur.com.ar',
  bankName: 'Banco Galicia',
  bankCbu: '0070099920000012345678',
  bankAlias: 'METALSUR.VENTAS',
};

const CASES = {
  ri: { quote: QUOTE, emitter: EMITTER },
  consumidor: { quote: { ...QUOTE, customer: { ...QUOTE.customer, taxId: null, taxCondition: null } }, emitter: EMITTER },
  monotributo: { quote: QUOTE, emitter: { ...EMITTER, ownTaxCondition: 'MONOTRIBUTO' as const } },
};

describe('PdfGeneratorService', () => {
  const service = new PdfGeneratorService();
  if (PREVIEW_DIR) mkdirSync(PREVIEW_DIR, { recursive: true });

  for (const [caseName, { quote, emitter }] of Object.entries(CASES)) {
    it.each(STYLES)(`arma un PDF (%s, ${caseName})`, async (style) => {
      const data = buildQuotePdfData(quote, emitter, { logo: null, lineImages: [] });
      const buffer = await service.generate(style, data);

      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
      expect(buffer.length).toBeGreaterThan(5000);
      if (PREVIEW_DIR) writeFileSync(join(PREVIEW_DIR, `${style}-${caseName}.pdf`), buffer);
    });
  }
});
