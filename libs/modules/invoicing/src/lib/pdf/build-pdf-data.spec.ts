import { Prisma } from '@plexo/database';
import { buildInvoicePdfData } from './build-pdf-data.js';
import type { InvoiceWithCurrencyAndLines } from '../invoicing.service.js';

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
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
      article: { name: 'Agua mineral 500ml' },
    },
    ...overrides,
  } as unknown as InvoiceWithCurrencyAndLines['lines'][number];
}

function makeInvoice(overrides: Record<string, unknown> = {}): InvoiceWithCurrencyAndLines {
  return {
    documentLetter: 'A',
    pointOfSale: '0001',
    globalDiscountPercent: new Prisma.Decimal(0),
    issuerTaxCondition: null,
    customerTaxCondition: null,
    number: '00000005',
    concept: 'PRODUCTOS',
    issueDate: new Date('2026-08-28T00:00:00Z'),
    dueDate: null,
    customerTaxId: '20-30405060-7',
    customerName: 'Cliente Demo SA',
    subtotal: new Prisma.Decimal(100),
    taxTotal: new Prisma.Decimal(21),
    total: new Prisma.Decimal(121),
    exchangeRate: new Prisma.Decimal(1),
    afipCae: '75123456789012',
    afipCaeExpiry: new Date('2026-09-07T00:00:00Z'),
    currency: { code: 'ARS', isBase: true },
    lines: [makeLine()],
    ...overrides,
  } as unknown as InvoiceWithCurrencyAndLines;
}

const CUSTOMER = {
  taxCondition: 'Responsable Inscripto',
  fiscalAddress: 'Calle Falsa 456, CABA',
} as unknown as Parameters<typeof buildInvoicePdfData>[1];

const TENANT = { name: 'Mi Tenant SA', taxId: '30-12345678-9' } as unknown as Parameters<typeof buildInvoicePdfData>[2];

describe('buildInvoicePdfData', () => {
  it('Factura A: precios netos, Neto Gravado e IVA por alícuota', async () => {
    const data = await buildInvoicePdfData(makeInvoice(), CUSTOMER, TENANT, null);

    expect(data.vatMode).toBe('DISCRIMINATED');
    expect(data.lines[0]).toMatchObject({ unitPrice: '100,00', lineTotal: '100,00', discount: null });
    expect(data.totalRows).toEqual([
      { label: 'Importe Neto Gravado', amount: '100,00' },
      { label: 'IVA 21%', amount: '21,00' },
    ]);
    expect(data.vatContained).toBeNull();
  });

  it('splits EXENTO/NO_GRAVADO lines out of the taxed bucket entirely', async () => {
    const invoice = makeInvoice({
      lines: [
        makeLine({ taxKind: 'GRAVADO', netAmount: new Prisma.Decimal(100), taxRate: new Prisma.Decimal(21), lineTotal: new Prisma.Decimal(121) }),
        makeLine({ taxKind: 'EXENTO', netAmount: new Prisma.Decimal(50), taxRate: new Prisma.Decimal(0), lineTotal: new Prisma.Decimal(50) }),
        makeLine({ taxKind: 'NO_GRAVADO', netAmount: new Prisma.Decimal(30), taxRate: new Prisma.Decimal(0), lineTotal: new Prisma.Decimal(30) }),
      ],
    });

    const data = await buildInvoicePdfData(invoice, CUSTOMER, TENANT, null);

    expect(data.totalRows).toEqual([
      { label: 'Importe Neto Gravado', amount: '100,00' },
      { label: 'IVA 21%', amount: '21,00' },
      { label: 'Importe Exento', amount: '50,00' },
      { label: 'Importe No Gravado', amount: '30,00' },
    ]);
  });

  it('labels Consumidor Final (no customerTaxId) distinctly from a CUIT', async () => {
    const withCuit = await buildInvoicePdfData(makeInvoice(), CUSTOMER, TENANT, null);
    expect(withCuit.customerTaxIdLabel).toBe('CUIT');
    expect(withCuit.customerTaxId).toBe('20-30405060-7');

    const consumidorFinal = await buildInvoicePdfData(
      makeInvoice({ customerTaxId: null }),
      CUSTOMER,
      TENANT,
      null,
    );
    expect(consumidorFinal.customerTaxIdLabel).toBe('Consumidor Final');
    expect(consumidorFinal.customerTaxId).toBeNull();

    // El cliente genérico de Caja ya se llama "Consumidor Final": no repetirlo.
    const generic = await buildInvoicePdfData(
      makeInvoice({ customerTaxId: null, customerName: 'Consumidor Final' }),
      CUSTOMER,
      TENANT,
      null,
    );
    expect(generic.customerTaxIdLabel).toBeNull();
  });

  it('Factura C no discrimina IVA: sin Neto Gravado ni filas de IVA', async () => {
    const line = makeLine({ taxRate: new Prisma.Decimal(0), lineTotal: new Prisma.Decimal(100) });
    const factC = await buildInvoicePdfData(
      makeInvoice({ documentLetter: 'C', lines: [line], taxTotal: new Prisma.Decimal(0), total: new Prisma.Decimal(100) }),
      CUSTOMER,
      TENANT,
      null,
    );
    expect(factC.vatMode).toBe('NONE');
    expect(factC.totalRows).toEqual([]);
    expect(factC.vatContained).toBeNull();
    expect(factC.total).toBe('100,00');
  });

  it('Factura B: precios finales y el IVA aparte como IVA contenido', async () => {
    const factB = await buildInvoicePdfData(makeInvoice({ documentLetter: 'B' }), CUSTOMER, TENANT, null);
    expect(factB.vatMode).toBe('INCLUDED');
    expect(factB.lines[0]).toMatchObject({ unitPrice: '121,00', lineTotal: '121,00' });
    expect(factB.totalRows).toEqual([]);
    expect(factB.total).toBe('121,00');
    expect(factB.vatContained).toBe('21,00');
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
      makeInvoice({ lines: [line], globalDiscountPercent: new Prisma.Decimal(10), total: new Prisma.Decimal(196.02) }),
      CUSTOMER,
      TENANT,
      null,
    );
    expect(data.hasLineDiscounts).toBe(true);
    expect(data.lines[0]).toMatchObject({ unitPrice: '100,00', discount: '10%', lineTotal: '180,00' });
    expect(data.totalRows).toEqual([
      { label: 'Subtotal', amount: '180,00' },
      { label: 'Descuento 10%', amount: '-18,00' },
      { label: 'Importe Neto Gravado', amount: '162,00' },
      { label: 'IVA 21%', amount: '34,02' },
    ]);
  });

  it('muestra las percepciones para que la suma llegue al total', async () => {
    const data = await buildInvoicePdfData(
      makeInvoice({ documentLetter: 'B', total: new Prisma.Decimal(124) }),
      CUSTOMER,
      TENANT,
      null,
      [{ kind: 'PROVINCIAL', concept: 'Percepción IIBB CABA', amount: new Prisma.Decimal(3) }],
    );
    expect(data.totalRows).toEqual([
      { label: 'Subtotal', amount: '121,00' },
      { label: 'Percepción IIBB CABA', amount: '3,00' },
    ]);
    expect(data.total).toBe('124,00');
  });

  it('usa la condición IVA guardada al emitir, no la actual', async () => {
    const data = await buildInvoicePdfData(
      makeInvoice({ issuerTaxCondition: 'RESPONSABLE_INSCRIPTO', customerTaxCondition: 'IVA Responsable Inscripto' }),
      { ...CUSTOMER, taxCondition: 'Responsable Monotributo' } as typeof CUSTOMER,
      TENANT,
      { ownTaxCondition: 'MONOTRIBUTO' } as unknown as Parameters<typeof buildInvoicePdfData>[3],
    );
    expect(data.issuerTaxConditionLabel).toBe('Responsable Inscripto');
    expect(data.customerTaxConditionLabel).toBe('IVA Responsable Inscripto');
  });

  it('maps ownTaxCondition and the fiscal fields from TenantSettings, or leaves them null without it', async () => {
    const withSettings = await buildInvoicePdfData(makeInvoice(), CUSTOMER, TENANT, {
      ownTaxCondition: 'RESPONSABLE_INSCRIPTO',
      fiscalAddress: 'Av. Siempre Viva 123, CABA',
      grossIncomeNumber: '30-12345678-9',
      activityStartDate: new Date('2020-01-01T00:00:00Z'),
    } as unknown as Parameters<typeof buildInvoicePdfData>[3]);
    expect(withSettings.issuerTaxConditionLabel).toBe('Responsable Inscripto');
    expect(withSettings.issuerFiscalAddress).toBe('Av. Siempre Viva 123, CABA');
    expect(withSettings.issuerGrossIncomeNumber).toBe('30-12345678-9');
    expect(withSettings.issuerActivityStartDate).toBe('01/01/2020');

    const withoutSettings = await buildInvoicePdfData(makeInvoice(), CUSTOMER, TENANT, null);
    expect(withoutSettings.issuerTaxConditionLabel).toBeNull();
    expect(withoutSettings.issuerFiscalAddress).toBeNull();
  });

  it('only surfaces serviceDueDate when the concept is not PRODUCTOS', async () => {
    const productos = await buildInvoicePdfData(
      makeInvoice({ concept: 'PRODUCTOS', dueDate: new Date('2026-09-10T00:00:00Z') }),
      CUSTOMER,
      TENANT,
      null,
    );
    expect(productos.serviceDueDate).toBeNull();

    const servicios = await buildInvoicePdfData(
      makeInvoice({ concept: 'SERVICIOS', dueDate: new Date('2026-09-10T00:00:00Z') }),
      CUSTOMER,
      TENANT,
      null,
    );
    expect(servicios.serviceDueDate).not.toBeNull();
  });

  it('builds the article description from the article name plus the variant label, when there is one', async () => {
    const invoice = makeInvoice({
      lines: [
        makeLine({
          articleVariant: {
            sku: 'REMERA-ROJ-S',
            color: 'Rojo',
            size: 'S',
            brand: null,
            attributes: null,
            article: { name: 'Remera' },
          },
        }),
      ],
    });

    const data = await buildInvoicePdfData(invoice, CUSTOMER, TENANT, null);

    expect(data.lines[0].description).toBe('Remera · Rojo / S');
  });
});
