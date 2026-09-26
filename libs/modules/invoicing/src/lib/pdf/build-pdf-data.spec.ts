import { Prisma } from '@plexo/database';
import { buildInvoicePdfData } from './build-pdf-data.js';
import type { InvoiceWithCurrencyAndLines } from '../invoicing.service.js';

function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    quantity: new Prisma.Decimal(1),
    unitPrice: new Prisma.Decimal(100),
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
    documentLetter: 'B',
    pointOfSale: '0001',
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
  it('buckets a GRAVADO-only invoice into netTaxed + one tax bucket, with exempt/untaxed as null', async () => {
    const data = await buildInvoicePdfData(makeInvoice(), CUSTOMER, TENANT, null);

    expect(data.netTaxed).toBe('100,00');
    expect(data.netExempt).toBeNull();
    expect(data.netUntaxed).toBeNull();
    expect(data.taxBuckets).toEqual([{ label: 'IVA 21%', net: '100,00', tax: '21,00' }]);
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

    expect(data.netTaxed).toBe('100,00');
    expect(data.netExempt).toBe('50,00');
    expect(data.netUntaxed).toBe('30,00');
    expect(data.taxBuckets).toEqual([{ label: 'IVA 21%', net: '100,00', tax: '21,00' }]);
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

  it('Factura C does not discriminate VAT: only a subtotal, no Neto Gravado / IVA rows', async () => {
    const factC = await buildInvoicePdfData(makeInvoice({ documentLetter: 'C' }), CUSTOMER, TENANT, null);
    expect(factC.taxBuckets).toEqual([]);
    expect(factC.netTaxed).toBeNull();
    expect(factC.subtotalWithoutVat).toBe('100,00');

    const factB = await buildInvoicePdfData(makeInvoice(), CUSTOMER, TENANT, null);
    expect(factB.subtotalWithoutVat).toBeNull();
    expect(factB.taxBuckets.length).toBeGreaterThan(0);
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
    expect(withSettings.issuerActivityStartDate).not.toBeNull();

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
