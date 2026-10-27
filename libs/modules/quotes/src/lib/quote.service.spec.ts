import { Prisma, tenantContextStorage } from '@plexo/database';
import { QuoteService } from './quote.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeService() {
  const numbering = { nextNumber: jest.fn().mockResolvedValue('COT-000001') };
  const pdfGenerator = { generate: jest.fn() };
  const emailSender = { sendQuoteEmail: jest.fn() };
  return new QuoteService(numbering as never, pdfGenerator as never, emailSender as never);
}

function makeVariant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'variant-1',
    unitPrice: new Prisma.Decimal(100),
    article: { isService: false, taxDefinition: { calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(21) } },
    ...overrides,
  };
}

/** articleVariant.findUnique se llama 2 veces por línea (una vez desde
 * validateReferences, otra desde resolveLines) - keyed por id en vez de
 * mockResolvedValueOnce en cadena, para no depender del orden exacto de
 * esas llamadas. */
function makeVariantLookup(variants: Record<string, unknown>) {
  return jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(variants[where.id] ?? null));
}

function makeCreateDb(overrides: Record<string, unknown> = {}) {
  return {
    company: { findUnique: jest.fn().mockResolvedValue({ active: true, roles: [{ role: 'CUSTOMER' }] }) },
    currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS' }) },
    articleVariant: { findUnique: makeVariantLookup({ 'variant-1': makeVariant() }) },
    taxDefinition: { findFirst: jest.fn().mockResolvedValue(null) },
    tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    quote: { create: jest.fn((args) => Promise.resolve({ id: 'quote-1', ...args.data })) },
    ...overrides,
  };
}

describe('QuoteService.create - emisor Monotributo/Exento', () => {
  it.each(['MONOTRIBUTO', 'EXENTO'])('%s: no suma IVA aunque el artículo tenga alícuota (factura C)', async (condition) => {
    const db = makeCreateDb({
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ ownTaxCondition: condition }) },
    });
    const service = makeService();

    const result = await runAsUser(db, () =>
      service.create({
        customerId: 'customer-1',
        currencyId: 'currency-1',
        lines: [{ articleVariantId: 'variant-1', quantity: 2, unitPrice: 150, taxRate: 21 }],
      } as never),
    );

    expect(result.total.toNumber()).toBe(300);
    const createdLine = (db.quote.create as jest.Mock).mock.calls[0][0].data.lines.createMany.data[0];
    expect(createdLine.taxRate.toNumber()).toBe(0);
  });

  it('Responsable Inscripto: sigue sumando el IVA (sin cambios)', async () => {
    const db = makeCreateDb({
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ ownTaxCondition: 'RESPONSABLE_INSCRIPTO' }) },
    });
    const service = makeService();

    const result = await runAsUser(db, () =>
      service.create({
        customerId: 'customer-1',
        currencyId: 'currency-1',
        lines: [{ articleVariantId: 'variant-1', quantity: 2, unitPrice: 150 }],
      } as never),
    );

    expect(result.total.toNumber()).toBeCloseTo(363, 2);
  });
});

describe('QuoteService.create', () => {
  it('resuelve el precio y la alícuota del catálogo cuando la línea no las anula', async () => {
    const db = makeCreateDb();
    const service = makeService();

    const result = await runAsUser(db, () =>
      service.create({
        customerId: 'customer-1',
        currencyId: 'currency-1',
        lines: [{ articleVariantId: 'variant-1', quantity: 2, unitPrice: 150 }],
      } as never),
    );

    expect(result.total.toNumber()).toBeCloseTo(2 * 150 * 1.21, 2);
    const createdLine = (db.quote.create as jest.Mock).mock.calls[0][0].data.lines.createMany.data[0];
    expect(createdLine.taxKind).toBe('GRAVADO');
    expect(createdLine.taxRate).toBeInstanceOf(Prisma.Decimal);
    expect(createdLine.taxRate.toNumber()).toBe(21);
  });

  it('override de unitPrice: usa el precio de la línea, no el del catálogo', async () => {
    const db = makeCreateDb();
    const service = makeService();

    const result = await runAsUser(db, () =>
      service.create({
        customerId: 'customer-1',
        currencyId: 'currency-1',
        lines: [{ articleVariantId: 'variant-1', quantity: 1, unitPrice: 200, taxRate: 21 }],
      } as never),
    );

    // 200 neto + 21% = 242, no 100 (precio de catálogo) + 21%
    expect(result.total.toNumber()).toBeCloseTo(242, 2);
  });

  it('pricesIncludeTax=true desglosa el precio final a neto+IVA de una línea GRAVADA', async () => {
    const db = makeCreateDb();
    const service = makeService();

    const result = await runAsUser(db, () =>
      service.create({
        customerId: 'customer-1',
        currencyId: 'currency-1',
        pricesIncludeTax: true,
        lines: [{ articleVariantId: 'variant-1', quantity: 1, unitPrice: 121, taxRate: 21 }],
      } as never),
    );

    // 121 con IVA incluido al 21% -> neto 100, IVA 21, total 121 (mismo
    // número de entrada porque ya era el total final - lo importante es
    // que el desglose interno sea neto=100/iva=21, no neto=121/iva=25,41).
    expect(result.total.toNumber()).toBeCloseTo(121, 2);
    const createdLine = (db.quote.create as jest.Mock).mock.calls[0][0].data.lines.createMany.data[0];
    expect(createdLine.netAmount.toNumber()).toBeCloseTo(100, 2);
    expect(createdLine.lineTotal.toNumber()).toBeCloseTo(121, 2);
  });

  it('override a EXENTO fuerza tasa 0 aunque se mande un taxRate', async () => {
    const db = makeCreateDb();
    const service = makeService();

    const result = await runAsUser(db, () =>
      service.create({
        customerId: 'customer-1',
        currencyId: 'currency-1',
        lines: [{ articleVariantId: 'variant-1', quantity: 1, unitPrice: 100, taxKind: 'EXENTO', taxRate: 21 }],
      } as never),
    );

    expect(result.total.toNumber()).toBeCloseTo(100, 2);
  });

  it('cotización con líneas a distintas alícuotas (21%/10,5%) cierra al centavo', async () => {
    const db = makeCreateDb({
      articleVariant: {
        findUnique: makeVariantLookup({
          'variant-1': makeVariant({ id: 'variant-1' }),
          'variant-2': makeVariant({
            id: 'variant-2',
            article: {
              isService: false,
              taxDefinition: { calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(10.5) },
            },
          }),
        }),
      },
    });
    const service = makeService();

    const result = await runAsUser(db, () =>
      service.create({
        customerId: 'customer-1',
        currencyId: 'currency-1',
        lines: [
          { articleVariantId: 'variant-1', quantity: 1, unitPrice: 1000, taxRate: 21 },
          { articleVariantId: 'variant-2', quantity: 1, unitPrice: 500, taxRate: 10.5 },
        ],
      } as never),
    );

    // 1000*1.21 + 500*1.105 = 1210 + 552.5 = 1762.5
    expect(result.total.toNumber()).toBeCloseTo(1762.5, 2);
  });
});

const NO_WORK_ORDERS = { workOrder: { findMany: jest.fn().mockResolvedValue([]) } };

describe('QuoteService status transitions', () => {
  it('accept() rejects a quote that already has an answer or was cancelled', async () => {
    for (const status of ['ACCEPTED', 'REJECTED', 'CANCELLED']) {
      const findUnique = jest.fn().mockResolvedValue({ id: 'quote-1', status });
      const db = { quote: { findUnique } };
      const service = makeService();

      await expect(runAsUser(db, () => service.accept('quote-1'))).rejects.toThrow(
        'Esta cotización ya tiene una respuesta del cliente o está cancelada',
      );
    }
  });

  it('accept() takes a DRAFT quote straight to ACCEPTED (accepted in person, never sent)', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'quote-1', status: 'DRAFT' });
    const update = jest.fn().mockResolvedValue({ id: 'quote-1', status: 'ACCEPTED' });
    const db = { quote: { findUnique, update }, ...NO_WORK_ORDERS };
    const service = makeService();

    const result = await runAsUser(db, () => service.accept('quote-1'));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ACCEPTED' } }));
    expect(result.status).toBe('ACCEPTED');
  });

  it('accept() transitions a SENT quote to ACCEPTED', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'quote-1', status: 'SENT' });
    const update = jest.fn().mockResolvedValue({ id: 'quote-1', status: 'ACCEPTED' });
    const db = { quote: { findUnique, update }, ...NO_WORK_ORDERS };
    const service = makeService();

    const result = await runAsUser(db, () => service.accept('quote-1'));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'quote-1' }, data: { status: 'ACCEPTED' } }),
    );
    expect(result.status).toBe('ACCEPTED');
  });

  describe('linked work orders', () => {
    const STATUSES = {
      received: { id: 's-received', sortOrder: 0, isFinal: false },
      rejected: { id: 's-rejected', sortOrder: 1, isFinal: false, quoteOutcome: 'REJECTED' },
      repair: { id: 's-repair', sortOrder: 2, isFinal: false, quoteOutcome: 'ACCEPTED' },
      ready: { id: 's-ready', sortOrder: 3, isFinal: false },
    };

    function makeDb(orders: { id: string; statusId: string; status: { sortOrder: number } }[], target: unknown) {
      return {
        quote: {
          findUnique: jest.fn().mockResolvedValue({ id: 'quote-1', status: 'SENT' }),
          update: jest.fn().mockResolvedValue({ id: 'quote-1' }),
        },
        workOrder: { findMany: jest.fn().mockResolvedValue(orders), update: jest.fn() },
        workOrderStatus: { findFirst: jest.fn().mockResolvedValue(target) },
      };
    }

    it('reject() moves the open order to the status marked for a rejection, and logs it', async () => {
      const db = makeDb([{ id: 'wo-1', statusId: 's-received', status: STATUSES.received }], STATUSES.rejected);
      await runAsUser(db, () => makeService().reject('quote-1'));

      expect(db.workOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { quoteId: 'quote-1', closedAt: null } }));
      expect(db.workOrderStatus.findFirst).toHaveBeenCalledWith({ where: { quoteOutcome: 'REJECTED', active: true } });
      const data = db.workOrder.update.mock.calls[0][0].data;
      expect(data.statusId).toBe('s-rejected');
      expect(data.closedAt).toBeNull();
      expect(data.statusChanges.create).toEqual({ fromStatusId: 's-received', toStatusId: 's-rejected', userId: 'user-1' });
    });

    it('accept() only moves orders forward', async () => {
      const db = makeDb(
        [
          { id: 'wo-1', statusId: 's-received', status: STATUSES.received },
          { id: 'wo-2', statusId: 's-ready', status: STATUSES.ready },
        ],
        STATUSES.repair,
      );
      await runAsUser(db, () => makeService().accept('quote-1'));

      expect(db.workOrder.update).toHaveBeenCalledTimes(1);
      expect(db.workOrder.update.mock.calls[0][0].where).toEqual({ tenantId_id: { tenantId: 'tenant-1', id: 'wo-1' } });
    });

    it('leaves the order alone when no status is marked', async () => {
      const db = makeDb([{ id: 'wo-1', statusId: 's-received', status: STATUSES.received }], null);
      await runAsUser(db, () => makeService().reject('quote-1'));
      expect(db.workOrder.update).not.toHaveBeenCalled();
    });
  });

  it('cancel() refuses to cancel an already-cancelled quote', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'quote-1', status: 'CANCELLED' });
    const db = { quote: { findUnique } };
    const service = makeService();

    await expect(runAsUser(db, () => service.cancel('quote-1'))).rejects.toThrow(
      'Esta cotización ya está cancelada',
    );
  });
});
