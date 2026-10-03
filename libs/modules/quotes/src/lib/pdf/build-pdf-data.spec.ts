import { amountInWords, buildQuotePdfData, resolveVatMode, type PdfSourceEmitter, type PdfSourceQuote } from './build-pdf-data.js';

const d = (value: number) => ({ toString: () => String(value) });

function makeQuote(overrides: Partial<PdfSourceQuote> = {}): PdfSourceQuote {
  return {
    number: 'PRE-000124',
    createdAt: new Date('2026-10-03T12:00:00Z'),
    validUntil: new Date('2026-10-18T00:00:00Z'),
    notes: null,
    currency: { code: 'ARS' },
    customer: { name: 'Talleres Rivera SA', taxId: '30-70987654-3', fiscalAddress: null, taxCondition: 'IVA Responsable Inscripto' },
    lines: [
      {
        // 2 × 100 neto, 21% → 200 + 42
        quantity: d(2),
        unitPrice: d(100),
        taxRate: d(21),
        taxKind: 'GRAVADO',
        netAmount: d(200),
        lineTotal: d(242),
        articleVariant: { sku: 'MESA', article: { name: 'Mesa', unitOfMeasure: 'UNIT' } },
      },
      {
        // 10 × 50 neto con 10% de bonificación = 450, 10,5% → 47,25
        quantity: d(10),
        unitPrice: d(50),
        discountPercent: d(10),
        taxRate: d(10.5),
        taxKind: 'GRAVADO',
        netAmount: d(450),
        lineTotal: d(497.25),
        articleVariant: { sku: 'TUBO', article: { name: 'Tubo', unitOfMeasure: 'KG' } },
      },
    ],
    ...overrides,
  };
}

const RI: PdfSourceEmitter = { name: 'Metalúrgica del Sur SRL', taxId: '30-71234567-8', ownTaxCondition: 'RESPONSABLE_INSCRIPTO' };
const noImages = { logo: null, lineImages: [] };

describe('resolveVatMode', () => {
  it('desglosa sólo entre dos Responsables Inscriptos (factura A)', () => {
    expect(resolveVatMode('RESPONSABLE_INSCRIPTO', '30-1', 'IVA Responsable Inscripto')).toBe('DISCRIMINATED');
  });

  it('muestra precios finales para consumidor final, monotributo o condición desconocida (factura B)', () => {
    expect(resolveVatMode('RESPONSABLE_INSCRIPTO', null, null)).toBe('INCLUDED');
    expect(resolveVatMode('RESPONSABLE_INSCRIPTO', '20-1', 'Responsable Monotributo')).toBe('INCLUDED');
    expect(resolveVatMode('RESPONSABLE_INSCRIPTO', '20-1', null)).toBe('INCLUDED');
  });

  it('no menciona IVA si el emisor es Monotributo o Exento (factura C)', () => {
    expect(resolveVatMode('MONOTRIBUTO', '30-1', 'IVA Responsable Inscripto')).toBe('NONE');
    expect(resolveVatMode('EXENTO', null, null)).toBe('NONE');
  });
});

describe('buildQuotePdfData', () => {
  it('con IVA discriminado, los importes son netos y el IVA va por alícuota', () => {
    const data = buildQuotePdfData(makeQuote(), RI, noImages);

    expect(data.vatMode).toBe('DISCRIMINATED');
    expect(data.lines.map((l) => [l.unitPrice, l.discount, l.vatLabel, l.amount, l.unit])).toEqual([
      ['100,00', null, '21%', '200,00', 'u.'],
      ['50,00', '10%', '10,5%', '450,00', 'kg'],
    ]);
    expect(data.totals).toMatchObject({
      subtotal: '700,00',
      discount: '50,00',
      netTaxed: '650,00',
      vatByRate: [
        { label: 'IVA 21%', amount: '42,00' },
        { label: 'IVA 10,5%', amount: '47,25' },
      ],
      vatContained: null,
      total: '739,25',
    });
  });

  it('con IVA incluido, los importes son finales y se informa el IVA contenido', () => {
    const quote = makeQuote({ customer: { name: 'Consumidor', taxId: null, fiscalAddress: null } });
    const data = buildQuotePdfData(quote, RI, noImages);

    expect(data.vatMode).toBe('INCLUDED');
    expect(data.lines[0]).toMatchObject({ unitPrice: '121,00', amount: '242,00' });
    expect(data.totals).toMatchObject({ netTaxed: null, vatByRate: [], vatContained: '89,25', total: '739,25' });
  });

  it('para un monotributista no hay IVA ni alícuotas en cero', () => {
    const quote = makeQuote({
      lines: [
        {
          quantity: d(3),
          unitPrice: d(1000),
          taxRate: d(0),
          taxKind: 'GRAVADO',
          netAmount: d(3000),
          lineTotal: d(3000),
          articleVariant: { sku: 'X', article: { name: 'Servicio' } },
        },
      ],
    });
    const data = buildQuotePdfData(quote, { ...RI, ownTaxCondition: 'MONOTRIBUTO' }, noImages);

    expect(data.vatMode).toBe('NONE');
    expect(data.emitter.taxConditionLabel).toBe('Responsable Monotributo');
    expect(data.totals).toMatchObject({ vatByRate: [], vatContained: null, discount: null, total: '3.000,00' });
  });

  it('calcula días de validez, iniciales, color y CBU', () => {
    const data = buildQuotePdfData(
      makeQuote(),
      { ...RI, brandColor: 'rojo', bankCbu: '0070099920000012345678', bankAlias: 'METALSUR.VENTAS' },
      noImages,
    );

    expect(data.validDays).toBe(15);
    expect(data.emitter.initials).toBe('MD');
    expect(data.emitter.brandColor).toBe('#4f39f6');
    expect(data.bank).toEqual({ name: null, cbu: '00700999 20000012345678', alias: 'METALSUR.VENTAS' });
  });

  it('no imprime datos bancarios si están apagados', () => {
    const data = buildQuotePdfData(makeQuote(), { ...RI, bankAlias: 'X', quoteShowBankDetails: false }, noImages);
    expect(data.bank).toBeNull();
  });
});

describe('amountInWords', () => {
  it.each([
    [0, 'pesos cero con 00/100'],
    [100, 'pesos cien con 00/100'],
    [21_000, 'pesos veintiún mil con 00/100'],
    [1_234_567.89, 'pesos un millón doscientos treinta y cuatro mil quinientos sesenta y siete con 89/100'],
    [1_501_000_000, 'pesos mil quinientos un millones con 00/100'],
    [739.25, 'pesos setecientos treinta y nueve con 25/100'],
  ])('%d → %s', (amount, words) => {
    expect(amountInWords(amount, 'ARS')).toBe(words);
  });

  it('nombra la moneda', () => {
    expect(amountInWords(1, 'USD')).toBe('dólares estadounidenses uno con 00/100');
  });
});
