import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { SubscriptionService } from '@plexo/subscriptions';
import type { BnaExchangeRatePort } from './bna-exchange-rate.port.js';
import type { EmailSender } from './email-sender.port.js';
import type { ElectronicInvoicingPort } from './electronic-invoicing.port.js';
import { InvoicingService } from './invoicing.service.js';
import type { InvoicePdfService } from './pdf/invoice-pdf.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T, userId = 'user-1'): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId, tx: db as never }, fn);
}

function runWithoutUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, fn);
}

function makeEmailSender(): EmailSender {
  return {
    sendInvoiceEmail: jest.fn().mockResolvedValue(undefined),
    sendOverdueAlertEmail: jest.fn().mockResolvedValue(undefined),
  };
}

function makeElectronicInvoicing(): ElectronicInvoicingPort {
  return {
    requestCae: jest
      .fn()
      .mockResolvedValue({ cae: 'CAE-1', caeExpiry: new Date('2030-01-01') }),
  };
}

function makeEventEmitter(): EventEmitter2 {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

function makeSubscriptionService(): SubscriptionService {
  return {
    assertCanIssueInvoiceThisMonth: jest.fn().mockResolvedValue(undefined),
  } as unknown as SubscriptionService;
}

function makeBnaExchangeRate(): BnaExchangeRatePort {
  return {
    getOfficialUsdRate: jest.fn().mockResolvedValue({ buy: 1000, sell: 1050, asOf: new Date('2026-01-01') }),
  };
}

function makeInvoicePdfService(): InvoicePdfService {
  return { generate: jest.fn() } as unknown as InvoicePdfService;
}

/** Mínimo que createInvoice necesita de vuelta de db.invoice.create/update
 * para no explotar en el emit de 'invoice.created' (total.toString(),
 * issueDate.toISOString(), etc.) - los tests de override/pricesIncludeTax
 * no verifican el resultado final, sólo lo que se manda a invoice.create. */
function makeFinalInvoiceFixture() {
  return {
    id: 'invoice-1',
    tenantId: 'tenant-1',
    number: '00000001',
    customerName: 'Acme',
    status: 'ISSUED',
    issueDate: new Date('2026-01-01'),
    total: new Prisma.Decimal(0),
    lines: [],
    taxLines: [],
  };
}

const baseDto = {
  customerId: 'customer-1',
  documentLetter: 'B' as const,
  pointOfSale: '0001',
  currencyId: 'currency-1',
  lines: [{ articleVariantId: 'variant-1', quantity: 1 }],
};

describe('InvoicingService.createInvoice', () => {
  it('throws when there is no authenticated user in context', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    await expect(runWithoutUser({}, () => service.createInvoice(baseDto))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when the customer does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when the referenced company is not flagged as a customer', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'SUPPLIER' }] }),
      },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when the customer is inactive', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: false, email: null, roles: [{ role: 'CUSTOMER' }] }),
      },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when the currency does not exist', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when a non-base currency has no exchange rate on file', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }),
      },
      currency: {
        findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS', isBase: false }),
      },
      exchangeRateHistory: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('uses dto.exchangeRate as an override instead of looking up the history, when provided', async () => {
    const exchangeRateHistoryFindFirst = jest.fn().mockResolvedValue(null);
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }),
      },
      currency: {
        findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'USD', isBase: false }),
      },
      exchangeRateHistory: { findFirst: exchangeRateHistoryFindFirst },
      // No mockeado a propósito - probar que la excepción que sigue es la de
      // "article variant no encontrado" (no la de "sin cotización en
      // historial") confirma que el override evitó resolveExchangeRate.
      articleVariant: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const dto = { ...baseDto, exchangeRate: 1050 };

    await expect(runInTenant(db, () => service.createInvoice(dto))).rejects.toThrow(
      NotFoundException,
    );
    expect(exchangeRateHistoryFindFirst).not.toHaveBeenCalled();
  });

  it('throws when a line references a missing article variant', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects a PERCENTAGE line discount over 100 instead of letting netAmount go negative', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-1',
          unitPrice: new Prisma.Decimal(100),
          article: { taxDefinition: null },
        }),
      },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const dto = {
      ...baseDto,
      lines: [{ articleVariantId: 'variant-1', quantity: 1, discountType: 'PERCENTAGE' as const, discountValue: 150 }],
    };

    await expect(runInTenant(db, () => service.createInvoice(dto))).rejects.toThrow(BadRequestException);
  });

  it('rejects an AMOUNT line discount larger than the line itself', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-1',
          unitPrice: new Prisma.Decimal(100),
          article: { taxDefinition: null },
        }),
      },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const dto = {
      ...baseDto,
      lines: [{ articleVariantId: 'variant-1', quantity: 1, discountType: 'AMOUNT' as const, discountValue: 500 }],
    };

    await expect(runInTenant(db, () => service.createInvoice(dto))).rejects.toThrow(BadRequestException);
  });

  it('runs the strict calculation chain: convert->line discount->subtotal->global discount->tax, distributed proportionally across lines with different rates', async () => {
    const emailSender = makeEmailSender();
    const electronicInvoicing = makeElectronicInvoicing();
    const service = new InvoicingService(emailSender, electronicInvoicing, makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      globalDiscountPercent: 10,
      lines: [
        { articleVariantId: 'variant-a', quantity: 1, discountType: 'PERCENTAGE' as const, discountValue: 10 },
        { articleVariantId: 'variant-b', quantity: 2, discountType: 'AMOUNT' as const, discountValue: 20 },
      ],
    };

    const variants: Record<string, unknown> = {
      'variant-a': {
        id: 'variant-a',
        unitPrice: new Prisma.Decimal(100),
        article: { taxDefinition: { calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(21), code: 'IVA_21' } },
      },
      'variant-b': {
        id: 'variant-b',
        unitPrice: new Prisma.Decimal(50),
        article: { taxDefinition: null },
      },
    };

    const createdInvoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      number: '00000001',
      customerName: 'Acme',
      customerTaxId: '20-1-1',
      documentLetter: 'B',
      pointOfSale: '0001',
      status: 'ISSUED',
      issueDate: new Date('2026-01-01'),
      exchangeRate: new Prisma.Decimal(2),
      subtotal: new Prisma.Decimal(324),
      taxTotal: new Prisma.Decimal(34.02),
      total: new Prisma.Decimal(358.02),
      lines: [],
      taxLines: [],
    };
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer-1',
          active: true,
          name: 'Acme',
          taxId: '20-1-1',
          email: 'buyer@example.com',
          roles: [{ role: 'CUSTOMER' }],
        }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS', isBase: false }) },
      exchangeRateHistory: {
        findFirst: jest.fn().mockResolvedValue({ rate: new Prisma.Decimal(2) }),
      },
      articleVariant: {
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve(variants[args.where.id]),
        ),
      },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdInvoice),
        update: jest.fn().mockResolvedValue(createdInvoice),
      },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    const createArgs = (db.invoice.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.exchangeRate.toNumber()).toBe(2);
    expect(createArgs.data.customerName).toBe('Acme');
    expect(createArgs.data.customerTaxId).toBe('20-1-1');
    expect(createArgs.data.subtotal.toNumber()).toBeCloseTo(324, 6);
    expect(createArgs.data.taxTotal.toNumber()).toBeCloseTo(34.02, 6);
    expect(createArgs.data.total.toNumber()).toBeCloseTo(358.02, 6);

    const lines = createArgs.data.lines.createMany.data;
    const lineA = lines.find((l: { articleVariantId: string }) => l.articleVariantId === 'variant-a');
    const lineB = lines.find((l: { articleVariantId: string }) => l.articleVariantId === 'variant-b');
    expect(lineA.netAmount.toNumber()).toBeCloseTo(180, 6);
    expect(lineA.lineTotal.toNumber()).toBeCloseTo(196.02, 6);
    expect(lineB.netAmount.toNumber()).toBeCloseTo(180, 6);
    expect(lineB.lineTotal.toNumber()).toBeCloseTo(162, 6);

    const caeRequest = (electronicInvoicing.requestCae as jest.Mock).mock.calls[0][0];
    expect(caeRequest.kind).toBe('FACTURA');
    expect(caeRequest.documentLetter).toBe('B');
    expect(caeRequest.customerTaxId).toBe('20-1-1');
    expect(caeRequest.currencyCode).toBe('ARS');
    // One tax group per distinct rate present on the lines (21% and 0%),
    // not one row per line - and their sum reproduces the invoice totals.
    expect(caeRequest.taxLines).toHaveLength(2);
    expect(caeRequest.taxLines.map((l: { rate: Prisma.Decimal }) => l.rate.toNumber()).sort()).toEqual([0, 21]);
    const taxLineNetTotal = caeRequest.taxLines.reduce(
      (sum: Prisma.Decimal, l: { netAmount: Prisma.Decimal }) => sum.add(l.netAmount),
      new Prisma.Decimal(0),
    );
    const taxLineTaxTotal = caeRequest.taxLines.reduce(
      (sum: Prisma.Decimal, l: { taxAmount: Prisma.Decimal }) => sum.add(l.taxAmount),
      new Prisma.Decimal(0),
    );
    expect(taxLineNetTotal.toNumber()).toBeCloseTo(324, 6);
    expect(taxLineTaxTotal.toNumber()).toBeCloseTo(34.02, 6);

    expect(emailSender.sendInvoiceEmail).toHaveBeenCalledWith({
      to: 'buyer@example.com',
      invoiceNumber: '0001-00000001',
      total: '358.02',
    });
  });

  it('derives AFIP Concepto (PRODUCTOS/SERVICIOS/PRODUCTOS_Y_SERVICIOS) from Article.isService per line, and forwards Invoice.dueDate as-is', async () => {
    const electronicInvoicing = makeElectronicInvoicing();
    const service = new InvoicingService(makeEmailSender(), electronicInvoicing, makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      dueDate: '2026-07-01',
      lines: [
        { articleVariantId: 'variant-product', quantity: 1 },
        { articleVariantId: 'variant-service', quantity: 1 },
      ],
    };

    const variants: Record<string, unknown> = {
      'variant-product': {
        id: 'variant-product',
        unitPrice: new Prisma.Decimal(100),
        article: { isService: false, taxDefinition: null },
      },
      'variant-service': {
        id: 'variant-service',
        unitPrice: new Prisma.Decimal(100),
        article: { isService: true, taxDefinition: null },
      },
    };

    const createdInvoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      number: '00000001',
      customerName: 'Acme',
      customerTaxId: '20-1-1',
      documentLetter: 'B',
      concept: 'PRODUCTOS_Y_SERVICIOS',
      pointOfSale: '0001',
      status: 'ISSUED',
      issueDate: new Date('2026-06-15'),
      dueDate: new Date('2026-07-01'),
      exchangeRate: new Prisma.Decimal(1),
      subtotal: new Prisma.Decimal(200),
      taxTotal: new Prisma.Decimal(0),
      total: new Prisma.Decimal(200),
      lines: [],
      taxLines: [],
    };
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer-1',
          active: true,
          name: 'Acme',
          taxId: '20-1-1',
          email: null,
          roles: [{ role: 'CUSTOMER' }],
        }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve(variants[args.where.id]),
        ),
      },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdInvoice),
        update: jest.fn().mockResolvedValue(createdInvoice),
      },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    const createArgs = (db.invoice.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.concept).toBe('PRODUCTOS_Y_SERVICIOS');

    const caeRequest = (electronicInvoicing.requestCae as jest.Mock).mock.calls[0][0];
    expect(caeRequest.concept).toBe('PRODUCTOS_Y_SERVICIOS');
    expect(caeRequest.dueDate).toEqual(new Date('2026-07-01'));
  });

  it('resolves PRODUCTOS when every line is a product, and SERVICIOS when every line is a service', async () => {
    async function createWithLine(isService: boolean) {
      const electronicInvoicing = makeElectronicInvoicing();
      const service = new InvoicingService(makeEmailSender(), electronicInvoicing, makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
      const createdInvoice = {
        id: 'invoice-1',
        number: '00000001',
        customerName: 'Acme',
        customerTaxId: null,
        documentLetter: 'B',
        concept: isService ? 'SERVICIOS' : 'PRODUCTOS',
        pointOfSale: '0001',
        status: 'ISSUED',
        issueDate: new Date('2026-06-15'),
        dueDate: null,
        exchangeRate: new Prisma.Decimal(1),
        subtotal: new Prisma.Decimal(100),
        taxTotal: new Prisma.Decimal(0),
        total: new Prisma.Decimal(100),
        lines: [],
        taxLines: [],
      };
      const db = {
        company: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'customer-1',
            active: true,
            name: 'Acme',
            taxId: null,
            email: null,
            roles: [{ role: 'CUSTOMER' }],
          }),
        },
        currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS', isBase: true }) },
        articleVariant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'variant-1',
            unitPrice: new Prisma.Decimal(100),
            article: { isService, taxDefinition: null },
          }),
        },
        invoice: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue(createdInvoice),
          update: jest.fn().mockResolvedValue(createdInvoice),
        },
      };

      await runInTenant(db, () => service.createInvoice(baseDto));
      return (db.invoice.create as jest.Mock).mock.calls[0][0].data.concept;
    }

    expect(await createWithLine(false)).toBe('PRODUCTOS');
    expect(await createWithLine(true)).toBe('SERVICIOS');
  });

  it('splits EXENTO/NO_GRAVADO lines out of netAmount into exemptAmount/nonTaxedAmount, keeping them out of the Iva[] breakdown', async () => {
    const electronicInvoicing = makeElectronicInvoicing();
    const service = new InvoicingService(makeEmailSender(), electronicInvoicing, makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      lines: [
        { articleVariantId: 'variant-gravado', quantity: 1 },
        { articleVariantId: 'variant-exento', quantity: 1 },
        { articleVariantId: 'variant-no-gravado', quantity: 1 },
      ],
    };

    const variants: Record<string, unknown> = {
      'variant-gravado': {
        id: 'variant-gravado',
        unitPrice: new Prisma.Decimal(100),
        article: { taxDefinition: { calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(21), code: 'IVA_21' } },
      },
      'variant-exento': {
        id: 'variant-exento',
        unitPrice: new Prisma.Decimal(50),
        article: { taxDefinition: { calculationType: 'EXENTO', code: 'IVA_EXENTO' } },
      },
      'variant-no-gravado': {
        id: 'variant-no-gravado',
        unitPrice: new Prisma.Decimal(30),
        article: { taxDefinition: { calculationType: 'NO_GRAVADO', code: 'NO_GRAVADO' } },
      },
    };

    const createdInvoice = {
      id: 'invoice-1',
      number: '00000001',
      customerName: 'Acme',
      customerTaxId: null,
      documentLetter: 'B',
      concept: 'PRODUCTOS',
      pointOfSale: '0001',
      issueDate: new Date('2026-06-15'),
      dueDate: null,
      exchangeRate: new Prisma.Decimal(1),
      subtotal: new Prisma.Decimal(180),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(201),
      lines: [],
      taxLines: [],
    };
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer-1',
          active: true,
          name: 'Acme',
          taxId: null,
          email: null,
          roles: [{ role: 'CUSTOMER' }],
        }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve(variants[args.where.id]),
        ),
      },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdInvoice),
        update: jest.fn().mockResolvedValue(createdInvoice),
      },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    const createArgs = (db.invoice.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data;
    expect(lines.find((l: { articleVariantId: string }) => l.articleVariantId === 'variant-gravado').taxKind).toBe('GRAVADO');
    expect(lines.find((l: { articleVariantId: string }) => l.articleVariantId === 'variant-exento').taxKind).toBe('EXENTO');
    expect(lines.find((l: { articleVariantId: string }) => l.articleVariantId === 'variant-no-gravado').taxKind).toBe('NO_GRAVADO');

    const caeRequest = (electronicInvoicing.requestCae as jest.Mock).mock.calls[0][0];
    // netAmount is GRAVADO-only (100), not the full 180 subtotal.
    expect(caeRequest.netAmount.toNumber()).toBe(100);
    expect(caeRequest.exemptAmount.toNumber()).toBe(50);
    expect(caeRequest.nonTaxedAmount.toNumber()).toBe(30);
    // Only the GRAVADO line ends up in the Iva[] breakdown.
    expect(caeRequest.taxLines).toHaveLength(1);
    expect(caeRequest.taxLines[0].netAmount.toNumber()).toBe(100);
  });

  it('computes IVA per line independently for each real AR alícuota (0%, 10.5%, 21%, 27%)', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      lines: [
        { articleVariantId: 'variant-0', quantity: 1 },
        { articleVariantId: 'variant-10-5', quantity: 1 },
        { articleVariantId: 'variant-21', quantity: 1 },
        { articleVariantId: 'variant-27', quantity: 1 },
      ],
    };

    const rateFor = (rate: number) => ({
      calculationType: 'PERCENTAGE' as const,
      rate: new Prisma.Decimal(rate),
      code: `IVA_${rate}`,
    });
    const variants: Record<string, unknown> = {
      'variant-0': { id: 'variant-0', unitPrice: new Prisma.Decimal(100), article: { taxDefinition: rateFor(0) } },
      'variant-10-5': { id: 'variant-10-5', unitPrice: new Prisma.Decimal(100), article: { taxDefinition: rateFor(10.5) } },
      'variant-21': { id: 'variant-21', unitPrice: new Prisma.Decimal(100), article: { taxDefinition: rateFor(21) } },
      'variant-27': { id: 'variant-27', unitPrice: new Prisma.Decimal(100), article: { taxDefinition: rateFor(27) } },
    };

    const createdInvoice = {
      id: 'invoice-rates',
      tenantId: 'tenant-1',
      number: '00000001',
      customerName: 'Acme',
      customerTaxId: '20-1-1',
      documentLetter: 'B',
      pointOfSale: '0001',
      status: 'ISSUED',
      issueDate: new Date('2026-01-01'),
      exchangeRate: new Prisma.Decimal(1),
      subtotal: new Prisma.Decimal(400),
      taxTotal: new Prisma.Decimal(58.5),
      total: new Prisma.Decimal(458.5),
      lines: [],
      taxLines: [],
    };
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer-1', active: true, name: 'Acme', taxId: '20-1-1', email: null,
          roles: [{ role: 'CUSTOMER' }],
        }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn((args: { where: { id: string } }) => Promise.resolve(variants[args.where.id])),
      },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdInvoice),
        update: jest.fn().mockResolvedValue(createdInvoice),
      },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    const createArgs = (db.invoice.create as jest.Mock).mock.calls[0][0];
    const lines = createArgs.data.lines.createMany.data;
    const byVariant = (id: string) =>
      lines.find((l: { articleVariantId: string }) => l.articleVariantId === id);

    // netAmount is 100 on every line (no discount) - only taxRate/lineTotal
    // vary, so each line's own tax is isolated from the others.
    expect(byVariant('variant-0').taxRate.toNumber()).toBe(0);
    expect(byVariant('variant-0').lineTotal.toNumber()).toBeCloseTo(100, 6);

    expect(byVariant('variant-10-5').taxRate.toNumber()).toBe(10.5);
    expect(byVariant('variant-10-5').lineTotal.toNumber()).toBeCloseTo(110.5, 6);

    expect(byVariant('variant-21').taxRate.toNumber()).toBe(21);
    expect(byVariant('variant-21').lineTotal.toNumber()).toBeCloseTo(121, 6);

    expect(byVariant('variant-27').taxRate.toNumber()).toBe(27);
    expect(byVariant('variant-27').lineTotal.toNumber()).toBeCloseTo(127, 6);

    // taxTotal on the header is the running sum of each line's own tax
    // (0 + 10.5 + 21 + 27 = 58.5), not re-derived from a blended rate.
    expect(createArgs.data.subtotal.toNumber()).toBeCloseTo(400, 6);
    expect(createArgs.data.taxTotal.toNumber()).toBeCloseTo(58.5, 6);
    expect(createArgs.data.total.toNumber()).toBeCloseTo(458.5, 6);
  });

  it('rounding edge case: per-line IVA on non-round prices still sums to the header at 2 decimals', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    // 33.33 + 33.33 + 33.34 = 100.00 exactly, but each line's own IVA at
    // 21% (6.9993 / 6.9993 / 7.0014) is NOT a clean 2-decimal amount -
    // exactly the "fracción de centavo por línea" case that hides rounding
    // bugs: taxTotal must still be the exact sum of the three (21.0000,
    // clean only because the netAmounts happen to sum to a round number),
    // and each line's own tax must survive un-rounded in memory even though
    // InvoiceLine.taxRate/netAmount/lineTotal are `@db.Decimal(14,2)`
    // columns that WILL round it on write.
    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      lines: [
        { articleVariantId: 'variant-a', quantity: 1 },
        { articleVariantId: 'variant-b', quantity: 1 },
        { articleVariantId: 'variant-c', quantity: 1 },
      ],
    };

    const taxDefinition = { calculationType: 'PERCENTAGE' as const, rate: new Prisma.Decimal(21), code: 'IVA_21' };
    const variants: Record<string, unknown> = {
      'variant-a': { id: 'variant-a', unitPrice: new Prisma.Decimal('33.33'), article: { taxDefinition } },
      'variant-b': { id: 'variant-b', unitPrice: new Prisma.Decimal('33.33'), article: { taxDefinition } },
      'variant-c': { id: 'variant-c', unitPrice: new Prisma.Decimal('33.34'), article: { taxDefinition } },
    };

    const createdInvoice = {
      id: 'invoice-round',
      tenantId: 'tenant-1',
      number: '00000001',
      customerName: 'Acme',
      customerTaxId: '20-1-1',
      documentLetter: 'B',
      pointOfSale: '0001',
      status: 'ISSUED',
      issueDate: new Date('2026-01-01'),
      exchangeRate: new Prisma.Decimal(1),
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      lines: [],
      taxLines: [],
    };
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'customer-1', active: true, name: 'Acme', taxId: '20-1-1', email: null,
          roles: [{ role: 'CUSTOMER' }],
        }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn((args: { where: { id: string } }) => Promise.resolve(variants[args.where.id])),
      },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdInvoice),
        update: jest.fn().mockResolvedValue(createdInvoice),
      },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    const createArgs = (db.invoice.create as jest.Mock).mock.calls[0][0];
    const lines: { netAmount: Prisma.Decimal; lineTotal: Prisma.Decimal }[] =
      createArgs.data.lines.createMany.data;
    const headerSubtotal: Prisma.Decimal = createArgs.data.subtotal;
    const headerTaxTotal: Prisma.Decimal = createArgs.data.taxTotal;
    const headerTotal: Prisma.Decimal = createArgs.data.total;

    // Exact per-line tax, unrounded (this is what actually gets summed into
    // taxTotal - proves the fraction of a cent isn't silently dropped).
    const taxAmounts = lines.map((l) => l.lineTotal.sub(l.netAmount));
    expect(taxAmounts[0].toNumber()).toBeCloseTo(6.9993, 6);
    expect(taxAmounts[1].toNumber()).toBeCloseTo(6.9993, 6);
    expect(taxAmounts[2].toNumber()).toBeCloseTo(7.0014, 6);

    // Simulates what Postgres actually does at INSERT time: every one of
    // these fields is a `@db.Decimal(14,2)` column (see schema.prisma), so
    // each value gets independently rounded to 2 decimals on write. If the
    // per-line calculation ever let a fraction of a cent get lost or
    // double-counted, summing the (post-DB-rounding) lines would land away
    // from the (post-DB-rounding) header - invisible to a check that only
    // compares full-precision in-memory Decimals, since taxTotal here is
    // literally the running sum of the same Decimal values (see
    // createInvoice), so it always matches itself by construction.
    const roundedNetSum = lines.reduce((s, l) => s.add(l.netAmount.toDP(2)), new Prisma.Decimal(0));
    const roundedTaxSum = taxAmounts.reduce((s, t) => s.add(t.toDP(2)), new Prisma.Decimal(0));

    expect(roundedNetSum.toDP(2).toNumber()).toBe(headerSubtotal.toDP(2).toNumber());
    expect(roundedTaxSum.toDP(2).toNumber()).toBe(headerTaxTotal.toDP(2).toNumber());
    // total is exactly subtotal + taxTotal by construction - worth pinning
    // down explicitly for this specific non-clean input too.
    expect(headerTotal.toNumber()).toBeCloseTo(headerSubtotal.add(headerTaxTotal).toNumber(), 10);
  });

  it('un unitPrice override en la línea reemplaza el precio de catálogo sin tocar su alícuota', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      lines: [{ articleVariantId: 'variant-1', quantity: 2, unitPrice: 200 }],
    };
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-1',
          unitPrice: new Prisma.Decimal(100),
          article: { taxDefinition: { calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(21) } },
        }),
      },
      invoice: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue(makeFinalInvoiceFixture()), update: jest.fn().mockResolvedValue(makeFinalInvoiceFixture()) },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    const line = (db.invoice.create as jest.Mock).mock.calls[0][0].data.lines.createMany.data[0];
    // 200 (override) × 2, no 100 (catálogo) × 2 - la alícuota sigue siendo
    // la del catálogo (21%) porque la línea no la anuló.
    expect(line.netAmount.toNumber()).toBeCloseTo(400, 2);
    expect(line.taxRate.toNumber()).toBe(21);
    expect(line.lineTotal.toNumber()).toBeCloseTo(484, 2);
  });

  it('pricesIncludeTax=true desglosa el precio final a neto+IVA en una línea GRAVADA, sin afectar una línea EXENTO', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      pricesIncludeTax: true,
      lines: [
        { articleVariantId: 'variant-gravado', quantity: 1, unitPrice: 121 },
        { articleVariantId: 'variant-exento', quantity: 1, unitPrice: 50 },
      ],
    };
    const variants: Record<string, unknown> = {
      'variant-gravado': {
        id: 'variant-gravado',
        unitPrice: new Prisma.Decimal(999), // ignorado - la línea manda un override
        article: { taxDefinition: { calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(21) } },
      },
      'variant-exento': {
        id: 'variant-exento',
        unitPrice: new Prisma.Decimal(999),
        article: { taxDefinition: { calculationType: 'EXENTO' } },
      },
    };
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn((args: { where: { id: string } }) => Promise.resolve(variants[args.where.id])),
      },
      invoice: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue(makeFinalInvoiceFixture()), update: jest.fn().mockResolvedValue(makeFinalInvoiceFixture()) },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    const lines = (db.invoice.create as jest.Mock).mock.calls[0][0].data.lines.createMany.data;
    const byVariant = (id: string) => lines.find((l: { articleVariantId: string }) => l.articleVariantId === id);

    // 121 con IVA incluido al 21% -> neto 100, IVA 21, lineTotal 121.
    expect(byVariant('variant-gravado').netAmount.toNumber()).toBeCloseTo(100, 2);
    expect(byVariant('variant-gravado').lineTotal.toNumber()).toBeCloseTo(121, 2);
    // La línea EXENTO no tiene nada que desglosar - el toggle es un no-op,
    // el precio tipeado (50) queda tal cual como neto.
    expect(byVariant('variant-exento').netAmount.toNumber()).toBeCloseTo(50, 2);
    expect(byVariant('variant-exento').lineTotal.toNumber()).toBeCloseTo(50, 2);
  });

  it('override de taxKind a EXENTO fuerza tasa 0 aunque la línea mande un taxRate', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      lines: [{ articleVariantId: 'variant-1', quantity: 1, taxKind: 'EXENTO' as const, taxRate: 21 }],
    };
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: {
        // Catálogo dice GRAVADO 21% - el override de la línea manda igual.
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-1',
          unitPrice: new Prisma.Decimal(100),
          article: { taxDefinition: { calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(21) } },
        }),
      },
      invoice: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue(makeFinalInvoiceFixture()), update: jest.fn().mockResolvedValue(makeFinalInvoiceFixture()) },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    const line = (db.invoice.create as jest.Mock).mock.calls[0][0].data.lines.createMany.data[0];
    expect(line.taxKind).toBe('EXENTO');
    expect(line.taxRate.toNumber()).toBe(0);
    expect(line.lineTotal.toNumber()).toBeCloseTo(100, 2);
  });

  it('otherTaxLines (percepciones) suman al total y se mandan a AFIP como otherTaxes, no como el 0.00 hardcodeado', async () => {
    const electronicInvoicing = makeElectronicInvoicing();
    const service = new InvoicingService(makeEmailSender(), electronicInvoicing, makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      lines: [{ articleVariantId: 'variant-1', quantity: 1, unitPrice: 100, taxKind: 'GRAVADO' as const, taxRate: 21 }],
      otherTaxLines: [{ kind: 'PROVINCIAL' as const, concept: 'Percepción IIBB', baseAmount: 100, rate: 3, amount: 3 }],
    };
    // create() tiene que devolver los taxLines persistidos con forma real
    // de Prisma.Decimal (no el objeto plano del DTO) - es lo que
    // createInvoice usa para armar otherTaxes, no dto.otherTaxLines
    // directamente (ver invoicing.service.ts).
    const persistedInvoice = {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      number: '00000001',
      customerName: 'Acme',
      customerTaxId: null,
      documentLetter: 'B',
      concept: 'PRODUCTOS',
      pointOfSale: '0001',
      status: 'ISSUED',
      issueDate: new Date('2026-01-01'),
      dueDate: null,
      exchangeRate: new Prisma.Decimal(1),
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(124),
      lines: [],
      taxLines: [
        {
          kind: 'PROVINCIAL',
          concept: 'Percepción IIBB',
          baseAmount: new Prisma.Decimal(100),
          rate: new Prisma.Decimal(3),
          amount: new Prisma.Decimal(3),
        },
      ],
    };
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: { findUnique: jest.fn().mockResolvedValue({ id: 'variant-1', unitPrice: new Prisma.Decimal(999), article: { taxDefinition: null } }) },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(persistedInvoice),
        update: jest.fn().mockResolvedValue(persistedInvoice),
      },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    // Neto 100 + IVA 21 + Percepción 3 = 124 - el total no se olvida de la
    // percepción (bug real que este test previene: total = netSubtotal +
    // taxTotal sin el .add(otherTaxesTotal) de InvoicingService).
    const createArgs = (db.invoice.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.total.toNumber()).toBeCloseTo(124, 2);
    expect(createArgs.data.taxLines.createMany.data).toEqual([
      { kind: 'PROVINCIAL', concept: 'Percepción IIBB', baseAmount: 100, rate: 3, amount: 3 },
    ]);

    const caeRequest = (electronicInvoicing.requestCae as jest.Mock).mock.calls[0][0];
    // AFIP_TRIBUTO_ID.PROVINCIAL = 2 (tabla pública de FEParamGetTiposTributos).
    expect(caeRequest.otherTaxes).toHaveLength(1);
    expect(caeRequest.otherTaxes[0].id).toBe(2);
    expect(caeRequest.otherTaxes[0].desc).toBe('Percepción IIBB');
    expect(caeRequest.otherTaxes[0].baseImp.toNumber()).toBe(100);
    expect(caeRequest.otherTaxes[0].alic.toNumber()).toBe(3);
    expect(caeRequest.otherTaxes[0].importe.toNumber()).toBe(3);
  });

  it('rejects a FORMULA tax definition rather than silently mis-taxing', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', active: true, email: null, roles: [{ role: 'CUSTOMER' }] }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-1',
          unitPrice: new Prisma.Decimal(100),
          article: { taxDefinition: { calculationType: 'FORMULA', code: 'WEIRD_TAX' } },
        }),
      },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('InvoicingService.listCurrencies', () => {
  it('reports latestRate 1 for the base currency without querying its history', async () => {
    const exchangeRateHistoryFindFirst = jest.fn();
    const db = {
      currency: {
        findMany: jest.fn().mockResolvedValue([{ id: 'ars', code: 'ARS', isBase: true }]),
      },
      exchangeRateHistory: { findFirst: exchangeRateHistoryFindFirst },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    const result = await runInTenant(db, () => service.listCurrencies());

    expect(result).toEqual([{ id: 'ars', code: 'ARS', isBase: true, latestRate: 1 }]);
    expect(exchangeRateHistoryFindFirst).not.toHaveBeenCalled();
  });

  it('reports the latest history rate for a non-base currency, or null when it has none yet', async () => {
    const db = {
      currency: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'usd', code: 'USD', isBase: false },
          { id: 'eur', code: 'EUR', isBase: false },
        ]),
      },
      exchangeRateHistory: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ rate: new Prisma.Decimal(1050) })
          .mockResolvedValueOnce(null),
      },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    const result = await runInTenant(db, () => service.listCurrencies());

    expect(result).toEqual([
      { id: 'usd', code: 'USD', isBase: false, latestRate: 1050 },
      { id: 'eur', code: 'EUR', isBase: false, latestRate: null },
    ]);
  });
});

describe('InvoicingService.syncBnaRate', () => {
  it('records the official sell rate against the tenant USD currency', async () => {
    const db = {
      currency: { findFirst: jest.fn().mockResolvedValue({ id: 'usd-1', code: 'USD' }) },
      exchangeRateHistory: {
        create: jest.fn().mockResolvedValue({ id: 'rate-1', currencyId: 'usd-1', rate: new Prisma.Decimal(1050) }),
      },
    };
    const bnaExchangeRate = makeBnaExchangeRate();
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), bnaExchangeRate, makeInvoicePdfService());

    const result = await runInTenant(db, () => service.syncBnaRate());

    expect(bnaExchangeRate.getOfficialUsdRate).toHaveBeenCalled();
    expect(db.exchangeRateHistory.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', currencyId: 'usd-1', rate: 1050 },
    });
    expect(result.rate.toString()).toBe('1050');
  });

  it('throws when the tenant has no USD currency configured yet', async () => {
    const db = { currency: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(runInTenant(db, () => service.syncBnaRate())).rejects.toThrow(BadRequestException);
  });
});

describe('InvoicingService.createCreditNote', () => {
  const invoiceLine = {
    id: 'line-1',
    quantity: new Prisma.Decimal(2),
    netAmount: new Prisma.Decimal(100),
    lineTotal: new Prisma.Decimal(121),
    taxRate: new Prisma.Decimal(21),
  };

  function dbWithInvoice(invoice: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
    return {
      invoice: {
        findUnique: jest.fn().mockResolvedValue(invoice),
        update: jest.fn().mockResolvedValue(invoice),
      },
      creditNote: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'cn-1',
          number: '00000001',
          documentLetter: 'B',
          pointOfSale: '0001',
          issueDate: new Date('2026-01-01'),
          exchangeRate: new Prisma.Decimal(2),
          subtotal: new Prisma.Decimal(50),
          taxTotal: new Prisma.Decimal(10.5),
          total: new Prisma.Decimal(60.5),
          lines: [],
        }),
        update: jest.fn().mockResolvedValue({ id: 'cn-1', number: '00000001', lines: [] }),
      },
      creditNoteLine: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      currency: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS' }),
      },
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('throws when the invoice does not exist', async () => {
    const db = { invoice: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(
      runInTenant(db, () =>
        service.createCreditNote({ invoiceId: 'missing', reason: 'x', lines: [{ invoiceLineId: 'line-1', quantity: 1 }] }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to credit an invoice that was never issued (no CAE)', async () => {
    const db = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', afipCae: null, lines: [invoiceLine] }),
      },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(
      runInTenant(db, () =>
        service.createCreditNote({
          invoiceId: 'invoice-1',
          reason: 'x',
          lines: [{ invoiceLineId: 'line-1', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a line that does not belong to the invoice', async () => {
    const invoice = {
      id: 'invoice-1',
      afipCae: 'CAE-ORIGINAL',
      balanceDue: new Prisma.Decimal(121),
      lines: [invoiceLine],
    };
    const db = dbWithInvoice(invoice);
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(
      runInTenant(db, () =>
        service.createCreditNote({
          invoiceId: 'invoice-1',
          reason: 'return',
          lines: [{ invoiceLineId: 'other-line', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects crediting more than what is left on the line, across prior credit notes', async () => {
    const invoice = {
      id: 'invoice-1',
      afipCae: 'CAE-ORIGINAL',
      balanceDue: new Prisma.Decimal(121),
      lines: [invoiceLine],
    };
    const db = dbWithInvoice(invoice, {
      creditNoteLine: {
        groupBy: jest.fn().mockResolvedValue([
          { invoiceLineId: 'line-1', _sum: { quantity: new Prisma.Decimal(1) } },
        ]),
      },
    });
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(
      runInTenant(db, () =>
        service.createCreditNote({
          invoiceId: 'invoice-1',
          reason: 'return',
          lines: [{ invoiceLineId: 'line-1', quantity: 2 }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('computes proportional subtotal/tax/total for the credited quantity and requests its own CAE', async () => {
    const invoice = {
      id: 'invoice-1',
      afipCae: 'CAE-ORIGINAL',
      number: '00000042',
      pointOfSale: '0001',
      documentLetter: 'B',
      concept: 'SERVICIOS',
      customerTaxId: '20-1-1',
      currencyId: 'currency-1',
      exchangeRate: new Prisma.Decimal(2),
      balanceDue: new Prisma.Decimal(121),
      lines: [invoiceLine],
    };
    const electronicInvoicing = makeElectronicInvoicing();
    const db = dbWithInvoice(invoice);
    const service = new InvoicingService(makeEmailSender(), electronicInvoicing, makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await runInTenant(db, () =>
      service.createCreditNote({
        invoiceId: 'invoice-1',
        reason: 'return',
        lines: [{ invoiceLineId: 'line-1', quantity: 1 }],
      }),
    );

    // Half of the line's quantity credited -> half its netAmount/tax/total.
    const createArgs = (db.creditNote.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.invoiceId).toBe('invoice-1');
    expect(createArgs.data.reason).toBe('return');
    expect(createArgs.data.subtotal.toNumber()).toBe(50);
    expect(createArgs.data.total.toNumber()).toBe(60.5);

    const caeRequest = (electronicInvoicing.requestCae as jest.Mock).mock.calls[0][0];
    expect(caeRequest.kind).toBe('NOTA_CREDITO');
    expect(caeRequest.customerTaxId).toBe('20-1-1');
    // Reuses the original invoice's concept as-is, no due date of its own.
    expect(caeRequest.concept).toBe('SERVICIOS');
    expect(caeRequest.dueDate).toBeNull();
    expect(caeRequest.associatedVoucher).toEqual({
      documentLetter: 'B',
      pointOfSale: '0001',
      number: '00000042',
    });
    expect(caeRequest.taxLines).toHaveLength(1);
    expect(caeRequest.taxLines[0].rate.toNumber()).toBe(21);
  });

  it('reuses each credited line\'s taxKind (not re-derived) to route into exemptAmount/nonTaxedAmount/taxLines', async () => {
    const exentoLine = {
      id: 'line-exento',
      quantity: new Prisma.Decimal(1),
      netAmount: new Prisma.Decimal(50),
      lineTotal: new Prisma.Decimal(50),
      taxRate: new Prisma.Decimal(0),
      taxKind: 'EXENTO',
    };
    const noGravadoLine = {
      id: 'line-no-gravado',
      quantity: new Prisma.Decimal(1),
      netAmount: new Prisma.Decimal(30),
      lineTotal: new Prisma.Decimal(30),
      taxRate: new Prisma.Decimal(0),
      taxKind: 'NO_GRAVADO',
    };
    const invoice = {
      id: 'invoice-1',
      afipCae: 'CAE-ORIGINAL',
      number: '00000042',
      pointOfSale: '0001',
      documentLetter: 'B',
      concept: 'PRODUCTOS',
      customerTaxId: null,
      currencyId: 'currency-1',
      exchangeRate: new Prisma.Decimal(1),
      balanceDue: new Prisma.Decimal(80),
      lines: [{ ...invoiceLine, taxKind: 'GRAVADO' }, exentoLine, noGravadoLine],
    };
    const electronicInvoicing = makeElectronicInvoicing();
    const db = dbWithInvoice(invoice);
    const service = new InvoicingService(makeEmailSender(), electronicInvoicing, makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await runInTenant(db, () =>
      service.createCreditNote({
        invoiceId: 'invoice-1',
        reason: 'return',
        lines: [
          { invoiceLineId: 'line-exento', quantity: 1 },
          { invoiceLineId: 'line-no-gravado', quantity: 1 },
        ],
      }),
    );

    const caeRequest = (electronicInvoicing.requestCae as jest.Mock).mock.calls[0][0];
    expect(caeRequest.exemptAmount.toNumber()).toBe(50);
    expect(caeRequest.nonTaxedAmount.toNumber()).toBe(30);
    expect(caeRequest.netAmount.toNumber()).toBe(0); // nothing GRAVADO was credited
    expect(caeRequest.taxLines).toHaveLength(0);
  });

  it('rejects a credit note whose total exceeds the invoice balance due', async () => {
    const invoice = {
      id: 'invoice-1',
      afipCae: 'CAE-ORIGINAL',
      balanceDue: new Prisma.Decimal(10),
      lines: [invoiceLine],
    };
    const db = dbWithInvoice(invoice);
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());

    await expect(
      runInTenant(db, () =>
        service.createCreditNote({
          invoiceId: 'invoice-1',
          reason: 'return',
          lines: [{ invoiceLineId: 'line-1', quantity: 2 }],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('InvoicingService.recordReceipt', () => {
  it('marks the invoice PARTIALLY_PAID when the receipt does not cover the full balance', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const db = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      receipt: { create: jest.fn().mockResolvedValue({ id: 'receipt-1' }) },
    };

    await runInTenant(db, () =>
      service.recordReceipt({ invoiceId: 'invoice-1', amount: 40, method: 'CASH' }),
    );

    const updateArgs = (db.invoice.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.status).toBe('PARTIALLY_PAID');
    expect(updateArgs.data.balanceDue.toNumber()).toBe(60);
  });

  it('keeps the invoice OVERDUE (not PARTIALLY_PAID) when a partial payment still leaves it past due', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const pastDueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const db = {
      invoice: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(100), dueDate: pastDueDate }),
        update: jest.fn().mockResolvedValue({}),
      },
      receipt: { create: jest.fn().mockResolvedValue({ id: 'receipt-1' }) },
    };

    await runInTenant(db, () =>
      service.recordReceipt({ invoiceId: 'invoice-1', amount: 40, method: 'CASH' }),
    );

    expect((db.invoice.update as jest.Mock).mock.calls[0][0].data.status).toBe('OVERDUE');
  });

  it('marks the invoice PAID when the receipt covers the full balance', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const db = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      receipt: { create: jest.fn().mockResolvedValue({ id: 'receipt-1' }) },
    };

    await runInTenant(db, () =>
      service.recordReceipt({ invoiceId: 'invoice-1', amount: 100, method: 'CASH' }),
    );

    expect((db.invoice.update as jest.Mock).mock.calls[0][0].data.status).toBe('PAID');
  });

  it('rejects a receipt larger than the balance due', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const db = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(50) }),
      },
    };

    await expect(
      runInTenant(db, () =>
        service.recordReceipt({ invoiceId: 'invoice-1', amount: 100, method: 'CASH' }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('InvoicingService.sendOverdueInvoiceAlert', () => {
  it('formats the invoice number/balance/due date and forwards them to the email sender', async () => {
    const emailSender = makeEmailSender();
    const service = new InvoicingService(emailSender, makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const invoice = {
      documentLetter: 'B' as const,
      number: '00000042',
      balanceDue: new Prisma.Decimal(1210.5),
      dueDate: new Date('2026-07-01T00:00:00.000Z'),
    };

    await service.sendOverdueInvoiceAlert(invoice, 'cliente@demo.com', {
      from: undefined,
      tone: 'NEUTRAL',
    });

    expect(emailSender.sendOverdueAlertEmail).toHaveBeenCalledWith({
      to: 'cliente@demo.com',
      invoiceNumber: 'B-00000042',
      balanceDue: '1210.50',
      dueDate: invoice.dueDate.toLocaleDateString('es-AR'),
      from: undefined,
      tone: 'NEUTRAL',
    });
  });

  it('forwards the CC mailbox when the sender identity includes one', async () => {
    const emailSender = makeEmailSender();
    const service = new InvoicingService(emailSender, makeElectronicInvoicing(), makeEventEmitter(), makeSubscriptionService(), makeBnaExchangeRate(), makeInvoicePdfService());
    const invoice = {
      documentLetter: 'B' as const,
      number: '00000042',
      balanceDue: new Prisma.Decimal(1210.5),
      dueDate: new Date('2026-07-01T00:00:00.000Z'),
    };

    await service.sendOverdueInvoiceAlert(invoice, 'cliente@demo.com', {
      tone: 'NEUTRAL',
      cc: 'cobranzas@acme.com',
    });

    expect(emailSender.sendOverdueAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ cc: 'cobranzas@acme.com' }),
    );
  });
});
