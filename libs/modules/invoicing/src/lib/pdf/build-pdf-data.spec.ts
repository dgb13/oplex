import { Prisma } from '@plexo/database';
import { buildInvoicePdfData, MONOTRIBUTO_CREDIT_LEGEND, type PdfSourceDocument, type PdfSourceLine } from './build-pdf-data.js';

function makeLine(overrides: Partial<Record<keyof PdfSourceLine, unknown>> = {}): PdfSourceLine {
  return {
    quantity: new Prisma.Decimal(1),
    unitPrice: new Prisma.Decimal(100),
    discountType: 'PERCENTAGE',
    discountValue: new Prisma.Decimal(0),
    netAmount: new Prisma.Decimal(100),
    taxRate: new Prisma.Decimal(21),
    taxKind: 'GRAVADO',
    lineTotal: new Prisma.Decimal(121),
    articleVariant: {
      sku: 'AGUA-500',
      color: null,
      size: null,
      brand: null,
      attributes: null,
      article: { name: 'Agua mineral 500ml', unitOfMeasure: 'UNIT' },
    },
    ...overrides,
  } as PdfSourceLine;
}

function makeDoc(overrides: Partial<PdfSourceDocument> = {}): PdfSourceDocument {
  return {
    kind: 'FACTURA',
    documentLetter: 'A',
    pointOfSale: '0001',
    number: '00000005',
    concept: 'PRODUCTOS',
    issueDate: new Date('2026-08-28T00:00:00Z'),
    dueDate: null,
    customerName: 'Cliente Demo SA',
    customerTaxId: '20-30405060-7',
    customerTaxCondition: 'IVA Responsable Inscripto',
    customerFiscalAddress: 'Calle Falsa 456, CABA',
    issuerTaxCondition: null,
    globalDiscountPercent: new Prisma.Decimal(0),
    total: new Prisma.Decimal(121),
    exchangeRate: new Prisma.Decimal(1),
    currency: { code: 'ARS', isBase: true },
    afipCae: '75123456789012',
    afipCaeExpiry: new Date('2026-09-07T00:00:00Z'),
    notes: null,
    lines: [makeLine()],
    saleCondition: 'Contado',
    ...overrides,
  };
}

const TENANT = { name: 'Mi Tenant SA', taxId: '30-12345678-9' };
type Settings = Parameters<typeof buildInvoicePdfData>[2];
const settings = (values: Record<string, unknown>) => values as unknown as Settings;

describe('buildInvoicePdfData', () => {
  it('Factura A: precios netos, Neto Gravado e IVA por alícuota', async () => {
    const data = await buildInvoicePdfData(makeDoc(), TENANT, null);

    expect(data.title).toBe('Factura');
    expect(data.cbteTipoCode).toBe('01');
    expect(data.vatMode).toBe('DISCRIMINATED');
    expect(data.lines[0]).toMatchObject({ unitPrice: '100,00', lineTotal: '100,00', discount: null, vatLabel: '21%', unit: 'u.' });
    expect(data.totalRows).toEqual([
      { label: 'Importe neto gravado', amount: '100,00' },
      { label: 'IVA 21%', amount: '21,00' },
    ]);
    expect(data.transparency).toBeNull();
    expect(data.totalInWords).toBe('pesos ciento veintiuno con 00/100');
  });

  it('shows the line detail and the hour unit for labor billed by the hour', async () => {
    const labor = makeLine({
      description: ' Cambio de embrague ',
      quantity: new Prisma.Decimal(2.5),
      articleVariant: {
        sku: 'MO-HORA',
        color: null,
        size: null,
        brand: null,
        attributes: null,
        article: { name: 'Mano de obra', unitOfMeasure: 'HOUR' },
      },
    });
    const data = await buildInvoicePdfData(makeDoc({ lines: [labor, makeLine()] }), TENANT, null);

    expect(data.lines[0]).toMatchObject({ description: 'Mano de obra', note: 'Cambio de embrague', quantity: '2,5', unit: 'h' });
    expect(data.lines[1].note).toBeNull();
  });

  it('splits EXENTO/NO_GRAVADO lines out of the taxed bucket entirely', async () => {
    const doc = makeDoc({
      lines: [
        makeLine(),
        makeLine({ taxKind: 'EXENTO', netAmount: new Prisma.Decimal(50), taxRate: new Prisma.Decimal(0), lineTotal: new Prisma.Decimal(50) }),
        makeLine({ taxKind: 'NO_GRAVADO', netAmount: new Prisma.Decimal(30), taxRate: new Prisma.Decimal(0), lineTotal: new Prisma.Decimal(30) }),
      ],
    });

    const data = await buildInvoicePdfData(doc, TENANT, null);

    expect(data.totalRows).toEqual([
      { label: 'Importe neto gravado', amount: '100,00' },
      { label: 'IVA 21%', amount: '21,00' },
      { label: 'Importe exento', amount: '50,00' },
      { label: 'Importe no gravado', amount: '30,00' },
    ]);
    expect(data.lines.map((line) => line.vatLabel)).toEqual(['21%', 'Exento', 'No grav.']);
  });

  it('Consumidor Final sin CUIT: sin documento y con la condición', async () => {
    const withCuit = await buildInvoicePdfData(makeDoc(), TENANT, null);
    expect(withCuit.customer).toMatchObject({ docLabel: 'CUIT', docNumber: '20-30405060-7', taxConditionLabel: 'IVA Responsable Inscripto' });

    const consumidorFinal = await buildInvoicePdfData(makeDoc({ customerTaxId: null, customerTaxCondition: null }), TENANT, null);
    expect(consumidorFinal.customer).toMatchObject({ docLabel: null, docNumber: null, taxConditionLabel: 'Consumidor Final' });

    const withDni = await buildInvoicePdfData(makeDoc({ customerTaxId: '25123456', customerTaxCondition: null }), TENANT, null);
    expect(withDni.customer).toMatchObject({ docLabel: 'DNI', docNumber: '25123456', taxConditionLabel: 'Consumidor Final' });
  });

  it('Factura C no discrimina IVA: sin Neto Gravado ni filas de IVA', async () => {
    const line = makeLine({ taxRate: new Prisma.Decimal(0), lineTotal: new Prisma.Decimal(100) });
    const factC = await buildInvoicePdfData(makeDoc({ documentLetter: 'C', lines: [line], total: new Prisma.Decimal(100) }), TENANT, null);
    expect(factC.vatMode).toBe('NONE');
    expect(factC.cbteTipoCode).toBe('11');
    expect(factC.totalRows).toEqual([]);
    expect(factC.transparency).toBeNull();
    expect(factC.total).toBe('100,00');
  });

  it('Factura B: precios finales y el recuadro de Transparencia Fiscal (RG 5614)', async () => {
    const factB = await buildInvoicePdfData(makeDoc({ documentLetter: 'B' }), TENANT, null);
    expect(factB.vatMode).toBe('INCLUDED');
    expect(factB.lines[0]).toMatchObject({ unitPrice: '121,00', lineTotal: '121,00' });
    expect(factB.totalRows).toEqual([]);
    expect(factB.total).toBe('121,00');
    expect(factB.transparency).toEqual({ vatContained: '21,00', otherIndirectTaxes: '0,00' });
  });

  it('Transparencia Fiscal: los impuestos internos van en "otros impuestos nacionales indirectos"', async () => {
    const factB = await buildInvoicePdfData(makeDoc({ documentLetter: 'B', total: new Prisma.Decimal(131) }), TENANT, null, undefined, [
      { kind: 'INTERNAL', concept: 'Impuestos internos', amount: new Prisma.Decimal(10) },
    ]);
    expect(factB.transparency).toEqual({ vatContained: '21,00', otherIndirectTaxes: '10,00' });
  });

  it('con descuento general, el IVA por alícuota se calcula sobre el neto ya descontado', async () => {
    // 2 x 100 con 10% de bonificación de línea = 180; 10% general = 162; IVA 21% = 34,02
    const line = makeLine({
      quantity: new Prisma.Decimal(2),
      discountValue: new Prisma.Decimal(10),
      netAmount: new Prisma.Decimal(180),
      lineTotal: new Prisma.Decimal(196.02),
    });
    const data = await buildInvoicePdfData(
      makeDoc({ lines: [line], globalDiscountPercent: new Prisma.Decimal(10), total: new Prisma.Decimal(196.02) }),
      TENANT,
      null,
    );
    expect(data.hasLineDiscounts).toBe(true);
    expect(data.lines[0]).toMatchObject({ unitPrice: '100,00', discount: '10%', lineTotal: '180,00' });
    expect(data.totalRows).toEqual([
      { label: 'Subtotal', amount: '180,00' },
      { label: 'Descuento 10%', amount: '-18,00' },
      { label: 'Importe neto gravado', amount: '162,00' },
      { label: 'IVA 21%', amount: '34,02' },
    ]);
  });

  it('muestra las percepciones para que la suma llegue al total', async () => {
    const data = await buildInvoicePdfData(makeDoc({ documentLetter: 'B', total: new Prisma.Decimal(124) }), TENANT, null, undefined, [
      { kind: 'PROVINCIAL', concept: 'Percepción IIBB CABA', amount: new Prisma.Decimal(3) },
    ]);
    expect(data.totalRows).toEqual([
      { label: 'Subtotal', amount: '121,00' },
      { label: 'Percepción IIBB CABA', amount: '3,00' },
    ]);
    expect(data.total).toBe('124,00');
  });

  it('usa la condición del emisor guardada al emitir, no la actual', async () => {
    const data = await buildInvoicePdfData(
      makeDoc({ issuerTaxCondition: 'RESPONSABLE_INSCRIPTO' }),
      TENANT,
      settings({ ownTaxCondition: 'MONOTRIBUTO' }),
    );
    expect(data.emitter.taxConditionLabel).toBe('IVA Responsable Inscripto');
  });

  it('toma los datos fiscales y la marca de TenantSettings, o los deja vacíos sin ella', async () => {
    const withSettings = await buildInvoicePdfData(
      makeDoc(),
      TENANT,
      settings({
        ownTaxCondition: 'RESPONSABLE_INSCRIPTO',
        fiscalAddress: 'Av. Siempre Viva 123, CABA',
        grossIncomeNumber: '901-123456-7',
        activityStartDate: new Date('2020-01-01T00:00:00Z'),
        tradeName: 'Demo',
        contactPhone: '11 4444-5555',
        brandColor: '#0f766e',
      }),
    );
    expect(withSettings.emitter).toMatchObject({
      taxConditionLabel: 'IVA Responsable Inscripto',
      address: 'Av. Siempre Viva 123, CABA',
      grossIncomeNumber: '901-123456-7',
      activityStart: '01/01/2020',
      tradeName: 'Demo',
      phone: '11 4444-5555',
      brandColor: '#0f766e',
      initials: 'D',
    });

    const withoutSettings = await buildInvoicePdfData(makeDoc(), TENANT, null);
    expect(withoutSettings.emitter).toMatchObject({ taxConditionLabel: null, address: null, brandColor: '#4f39f6', initials: 'MT' });
  });

  it('servicios: el período facturado y el vencimiento que se informan a ARCA', async () => {
    const productos = await buildInvoicePdfData(makeDoc({ dueDate: new Date('2026-09-10T00:00:00Z') }), TENANT, null);
    expect(productos.servicePeriod).toBeNull();

    const servicios = await buildInvoicePdfData(
      makeDoc({ concept: 'SERVICIOS', dueDate: new Date('2026-09-10T00:00:00Z') }),
      TENANT,
      null,
    );
    expect(servicios.servicePeriod).toEqual({ from: '28/08/2026', to: '28/08/2026', paymentDue: '10/09/2026' });

    const sinVencimiento = await buildInvoicePdfData(makeDoc({ concept: 'PRODUCTOS_Y_SERVICIOS' }), TENANT, null);
    expect(sinVencimiento.servicePeriod?.paymentDue).toBe('28/08/2026');
  });

  it('factura A a un monotributista: leyenda de la Ley 27.618', async () => {
    const mono = await buildInvoicePdfData(makeDoc({ customerTaxCondition: 'Responsable Monotributo' }), TENANT, null);
    expect(mono.legends).toEqual([MONOTRIBUTO_CREDIT_LEGEND]);

    const ri = await buildInvoicePdfData(makeDoc(), TENANT, null);
    expect(ri.legends).toEqual([]);
  });

  it('datos bancarios sólo en facturas y si la casilla de facturas está tildada', async () => {
    const bank = { bankName: 'Banco Galicia', bankCbu: '0070099920000012345678', bankAlias: 'DEMO.VENTAS' };
    const factura = await buildInvoicePdfData(makeDoc(), TENANT, settings(bank));
    expect(factura.bank).toEqual({ name: 'Banco Galicia', cbu: '00700999 20000012345678', alias: 'DEMO.VENTAS' });

    const sinCasilla = await buildInvoicePdfData(makeDoc(), TENANT, settings({ ...bank, invoiceShowBankDetails: false }));
    expect(sinCasilla.bank).toBeNull();

    const notaDeCredito = await buildInvoicePdfData(makeDoc({ kind: 'NOTA_CREDITO' }), TENANT, settings(bank));
    expect(notaDeCredito.bank).toBeNull();
  });

  it('nota de crédito: título, código y comprobante asociado', async () => {
    const data = await buildInvoicePdfData(
      makeDoc({ kind: 'NOTA_CREDITO', associatedDocument: 'Factura A 0001-00000005 del 28/08/2026', reason: 'Devolución' }),
      TENANT,
      null,
    );
    expect(data.title).toBe('Nota de crédito');
    expect(data.cbteTipoCode).toBe('03');
    expect(data.associatedDocument).toBe('Factura A 0001-00000005 del 28/08/2026');
    expect(data.reason).toBe('Devolución');
  });

  it('builds the article description from the article name plus the variant label, when there is one', async () => {
    const doc = makeDoc({
      lines: [
        makeLine({
          articleVariant: { sku: 'REMERA-ROJ-S', color: 'Rojo', size: 'S', brand: null, attributes: null, article: { name: 'Remera' } },
        }),
      ],
    });

    const data = await buildInvoicePdfData(doc, TENANT, null);

    expect(data.lines[0].description).toBe('Remera · Rojo / S');
  });
});
