import { Prisma, tenantContextStorage } from '@plexo/database';
import type { ConnectorService } from '@plexo/connectors';
import type { MercadoPagoConnector } from './mercadopago.connector.js';
import type { MercadoPagoInStoreClient } from './mercadopago-instore.client.js';
import { MercadoPagoQrService, splitFiscalAddress } from './mercadopago-qr.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeRegister(overrides: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-1111-2222-3333-444444444444',
    name: 'Caja 1',
    branchId: 'bbbbbbbb-1111-2222-3333-444444444444',
    branch: { name: 'Sucursal Centro', fiscalAddress: 'Av. Corrientes 1234, CABA', mercadoPagoStore: null },
    mpPosId: null,
    mpExternalPosId: null,
    mpQrImageUrl: null,
    mpQrTemplateUrl: null,
    ...overrides,
  };
}

function makeIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intent-1',
    documentType: 'POS_QR',
    documentId: 'aaaaaaaa-1111-2222-3333-444444444444',
    status: 'PENDING',
    amount: new Prisma.Decimal(1500),
    externalId: 'ORD01TEST',
    externalStatus: 'created|created',
    expiresAt: new Date(Date.now() + 5 * 60_000),
    qrCodeBase64: 'data:image/png;base64,xx',
    externalPaymentId: null,
    consumedByInvoiceId: null,
    ...overrides,
  };
}

function makeDb(opts: { register?: Record<string, unknown>; intent?: Record<string, unknown> | null; open?: unknown[] } = {}) {
  const intent = opts.intent === undefined ? makeIntent() : opts.intent;
  return {
    cashRegister: {
      findUnique: jest.fn().mockResolvedValue(opts.register ?? makeRegister()),
      update: jest.fn().mockResolvedValue({}),
    },
    mercadoPagoStore: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'store-row', ...data })),
    },
    paymentIntent: {
      findUnique: jest.fn().mockResolvedValue(intent),
      findFirst: jest.fn().mockResolvedValue(intent),
      findMany: jest.fn().mockResolvedValue(opts.open ?? []),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'intent-new', ...data })),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ ...(intent ?? makeIntent()), id: where.id, ...data }),
      ),
    },
  };
}

function makeService(client: Partial<jest.Mocked<MercadoPagoInStoreClient>> = {}) {
  const connectorService = {
    getConnector: jest.fn().mockResolvedValue({ id: 'connector-1', status: 'CONNECTED', externalAccountId: '3714498973' }),
  } as unknown as jest.Mocked<ConnectorService>;
  const connector = {
    getValidAccessToken: jest.fn().mockResolvedValue('APP_USR-tenant'),
  } as unknown as jest.Mocked<MercadoPagoConnector>;
  const inStore = {
    findStore: jest.fn().mockResolvedValue(null),
    findPos: jest.fn().mockResolvedValue(null),
    createStore: jest.fn().mockResolvedValue({ id: 987 }),
    createPos: jest.fn().mockResolvedValue({
      id: 555,
      qr_response: { image: 'https://mp/qr.png', template_document: 'https://mp/qr.pdf' },
    }),
    deletePos: jest.fn().mockResolvedValue(undefined),
    createQrOrder: jest.fn().mockResolvedValue({
      id: 'ORD01NEW',
      status: 'created',
      transactions: { payments: [{ id: 'PAY01', status: 'created' }] },
      type_response: { qr_data: '00020101021243650016COM.MERCADOLIBRE' },
    }),
    getOrder: jest.fn(),
    cancelOrder: jest.fn().mockResolvedValue({ id: 'ORD01TEST', status: 'canceled' }),
    ...client,
  } as unknown as jest.Mocked<MercadoPagoInStoreClient>;
  return { service: new MercadoPagoQrService(connectorService, connector, inStore), inStore, connectorService };
}

describe('MercadoPagoQrService.activateRegister', () => {
  const address = {
    streetName: 'Av. Corrientes',
    streetNumber: '1234',
    cityName: 'CABA',
    stateName: 'Ciudad Autónoma de Buenos Aires',
    latitude: -34.60372,
    longitude: -58.38159,
  };

  it('creates the branch store the first time, then the POS, and keeps the printable QR', async () => {
    const db = makeDb();
    const { service, inStore } = makeService();

    await runInTenant(db, () => service.activateRegister('aaaaaaaa-1111-2222-3333-444444444444', address));

    expect(inStore.createStore).toHaveBeenCalledWith(
      'APP_USR-tenant',
      '3714498973',
      expect.objectContaining({
        name: 'Sucursal Centro',
        external_id: 'OPXbbbbbbbb111122223333444444444444',
        location: expect.objectContaining({ street_number: '1234', latitude: -34.60372 }),
      }),
    );
    expect(inStore.createPos).toHaveBeenCalledWith(
      'APP_USR-tenant',
      expect.objectContaining({ store_id: '987', external_id: 'OPXaaaaaaaa111122223333444444444444' }),
    );
    expect(db.cashRegister.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mpPosId: '555',
          mpQrImageUrl: 'https://mp/qr.png',
          mpQrTemplateUrl: 'https://mp/qr.pdf',
        }),
      }),
    );
  });

  it('reuses the branch store when another register of the same branch already activated it', async () => {
    const store = {
      mpStoreId: '111',
      streetName: 'Av. Corrientes',
      streetNumber: '1234',
      cityName: 'CABA',
      stateName: 'Ciudad Autónoma de Buenos Aires',
      latitude: new Prisma.Decimal(-34.6),
      longitude: new Prisma.Decimal(-58.38),
    };
    const db = makeDb({ register: makeRegister({ branch: { name: 'Sucursal Centro', fiscalAddress: null, mercadoPagoStore: store } }) });
    const { service, inStore } = makeService();

    await runInTenant(db, () => service.activateRegister('aaaaaaaa-1111-2222-3333-444444444444', address));

    expect(inStore.createStore).not.toHaveBeenCalled();
    expect(inStore.createPos).toHaveBeenCalledWith('APP_USR-tenant', expect.objectContaining({ store_id: '111' }));
  });

  it('refuses when the register already has its QR active', async () => {
    const db = makeDb({ register: makeRegister({ mpPosId: '555' }) });
    const { service } = makeService();

    await expect(
      runInTenant(db, () => service.activateRegister('aaaaaaaa-1111-2222-3333-444444444444', address)),
    ).rejects.toThrow('ya está activo');
  });
});

describe('MercadoPagoQrService.createCharge', () => {
  it('creates a hybrid QR order on the register POS for the exact amount', async () => {
    const db = makeDb({ register: makeRegister({ mpExternalPosId: 'OPXPOS' }) });
    const { service, inStore } = makeService();

    const charge = await runInTenant(db, () => service.createCharge('aaaaaaaa-1111-2222-3333-444444444444', 1500));

    expect(inStore.createQrOrder).toHaveBeenCalledWith(
      'APP_USR-tenant',
      expect.objectContaining({ externalPosId: 'OPXPOS', totalAmount: '1500.00', expirationTime: 'PT10M' }),
      expect.any(String),
    );
    expect(charge.status).toBe('PENDING');
    expect(charge.qrCodeBase64).toMatch(/^data:image\/png;base64,/);
  });

  it('cancels a charge still waiting on the same register before creating the new one', async () => {
    const waiting = makeIntent({ id: 'intent-old' });
    const db = makeDb({ register: makeRegister({ mpExternalPosId: 'OPXPOS' }), open: [waiting] });
    const { service, inStore } = makeService();

    await runInTenant(db, () => service.createCharge('aaaaaaaa-1111-2222-3333-444444444444', 1500));

    expect(inStore.cancelOrder).toHaveBeenCalledWith('APP_USR-tenant', 'ORD01TEST');
    expect(db.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'intent-old' }, data: expect.objectContaining({ status: 'CANCELLED' }) }),
    );
  });

  it('refuses when the register has no QR activated', async () => {
    const db = makeDb();
    const { service, inStore } = makeService();

    await expect(
      runInTenant(db, () => service.createCharge('aaaaaaaa-1111-2222-3333-444444444444', 1500)),
    ).rejects.toThrow('no tiene el QR');
    expect(inStore.createQrOrder).not.toHaveBeenCalled();
  });

  it('marks the charge ERROR and rethrows when Mercado Pago refuses the order', async () => {
    const db = makeDb({ register: makeRegister({ mpExternalPosId: 'OPXPOS' }) });
    const { service } = makeService({ createQrOrder: jest.fn().mockRejectedValue(new Error('pos not found')) });

    await expect(
      runInTenant(db, () => service.createCharge('aaaaaaaa-1111-2222-3333-444444444444', 1500)),
    ).rejects.toThrow('pos not found');
    expect(db.paymentIntent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ERROR' } }),
    );
  });
});

describe('MercadoPagoQrService.getCharge (polling asks MP, so a lost webhook never blocks the Caja)', () => {
  it('marks PAID with the MP payment id when the order is processed', async () => {
    const db = makeDb();
    const { service } = makeService({
      getOrder: jest.fn().mockResolvedValue({
        id: 'ORD01TEST',
        status: 'processed',
        transactions: { payments: [{ id: 'PAY01', status: 'processed' }] },
      }),
    });

    const charge = await runInTenant(db, () => service.getCharge('intent-1'));

    expect(charge.status).toBe('PAID');
    expect(charge.externalPaymentId).toBe('PAY01');
  });

  it('flags a rejected attempt while the order stays open', async () => {
    const db = makeDb();
    const { service } = makeService({
      getOrder: jest.fn().mockResolvedValue({
        id: 'ORD01TEST',
        status: 'action_required',
        transactions: { payments: [{ id: 'PAY01', status: 'failed' }] },
      }),
    });

    const charge = await runInTenant(db, () => service.getCharge('intent-1'));

    expect(charge.status).toBe('PENDING');
    expect(charge.rejected).toBe(true);
  });

  it('maps an expired order to EXPIRED', async () => {
    const db = makeDb();
    const { service } = makeService({ getOrder: jest.fn().mockResolvedValue({ id: 'ORD01TEST', status: 'expired' }) });

    const charge = await runInTenant(db, () => service.getCharge('intent-1'));

    expect(charge.status).toBe('EXPIRED');
  });

  it('does not ask MP again once the charge is final', async () => {
    const db = makeDb({ intent: makeIntent({ status: 'PAID' }) });
    const getOrder = jest.fn();
    const { service } = makeService({ getOrder });

    await runInTenant(db, () => service.getCharge('intent-1'));

    expect(getOrder).not.toHaveBeenCalled();
  });
});

describe('MercadoPagoQrService.cancelCharge', () => {
  it('keeps a payment that landed while cancelling instead of overwriting it with CANCELLED', async () => {
    const db = makeDb();
    const { service } = makeService({
      cancelOrder: jest.fn().mockRejectedValue(new Error('order already processed')),
      getOrder: jest.fn().mockResolvedValue({
        id: 'ORD01TEST',
        status: 'processed',
        transactions: { payments: [{ id: 'PAY01', status: 'processed' }] },
      }),
    });

    const charge = await runInTenant(db, () => service.cancelCharge('intent-1'));

    expect(charge.status).toBe('PAID');
  });
});

describe('MercadoPagoQrService.consumeForSale', () => {
  const input = { intentId: 'intent-1', registerId: 'aaaaaaaa-1111-2222-3333-444444444444', amount: 1500, invoiceId: 'inv-1' };

  it('links a credited charge to the sale', async () => {
    const db = makeDb({ intent: makeIntent({ status: 'PAID' }) });
    const { service } = makeService();

    await runInTenant(db, () => service.consumeForSale(input));

    expect(db.paymentIntent.update).toHaveBeenCalledWith({ where: { id: 'intent-1' }, data: { consumedByInvoiceId: 'inv-1' } });
  });

  it.each([
    ['not credited yet', makeIntent({ status: 'PENDING' }), 'todavía no se acreditó'],
    ['already used', makeIntent({ status: 'PAID', consumedByInvoiceId: 'inv-0' }), 'ya se usó'],
    ['from another register', makeIntent({ status: 'PAID', documentId: 'other-register' }), 'otra caja'],
    ['for another amount', makeIntent({ status: 'PAID', amount: new Prisma.Decimal(1499) }), 'el cobro QR es de'],
  ])('refuses a charge %s', async (_label, intent, message) => {
    const db = makeDb({ intent });
    const { service } = makeService();

    await expect(runInTenant(db, () => service.consumeForSale(input))).rejects.toThrow(new RegExp(message, 'i'));
    expect(db.paymentIntent.update).not.toHaveBeenCalled();
  });
});

describe('MercadoPagoQrService - cobros acreditados sin venta', () => {
  const registerId = 'aaaaaaaa-1111-2222-3333-444444444444';

  it('lista sólo los cobros PAID de la caja que no pagaron ninguna venta, con la venta guardada', async () => {
    const draft = { documentLetter: 'C', lines: [{ articleVariantId: 'v-1', quantity: 2 }], payments: [] };
    const paid = makeIntent({ status: 'PAID', paidAt: new Date('2026-10-01T13:00:00Z'), createdAt: new Date('2026-10-01T12:58:00Z'), createdByUserId: 'user-1', saleDraft: draft });
    const db = makeDb({ open: [paid] });
    const { service } = makeService();

    const result = await runInTenant(db, () => service.listUnclaimedCharges(registerId));

    expect(db.paymentIntent.findMany).toHaveBeenCalledWith({
      where: { documentType: 'POS_QR', documentId: registerId, status: 'PAID', consumedByInvoiceId: null },
      orderBy: { paidAt: 'asc' },
    });
    expect(result).toEqual([
      expect.objectContaining({ id: 'intent-1', registerId, paidAt: '2026-10-01T13:00:00.000Z', saleDraft: draft }),
    ]);
  });

  it('createCharge guarda la venta junto con el cobro', async () => {
    const db = makeDb({ register: makeRegister({ mpExternalPosId: 'OPXPOS' }), open: [] });
    const { service } = makeService();
    const draft = { documentLetter: 'C', lines: [], payments: [] };

    await runInTenant(db, () => service.createCharge(registerId, 1500, draft));

    expect(db.paymentIntent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ saleDraft: draft }) });
  });

  it.each([
    ['not credited yet', makeIntent({ status: 'PENDING' }), 'todavía no se acreditó'],
    ['already used', makeIntent({ status: 'PAID', consumedByInvoiceId: 'inv-0' }), 'ya se usó'],
  ])('getUnclaimedCharge refuses a charge %s', async (_label, intent, message) => {
    const db = makeDb({ intent });
    const { service } = makeService();

    await expect(runInTenant(db, () => service.getUnclaimedCharge('intent-1'))).rejects.toThrow(new RegExp(message, 'i'));
  });
});

describe('splitFiscalAddress', () => {
  it('splits "street number, city, state"', () => {
    expect(splitFiscalAddress('Av. Corrientes 1234, CABA, Ciudad Autónoma de Buenos Aires')).toEqual({
      streetName: 'Av. Corrientes',
      streetNumber: '1234',
      cityName: 'CABA',
      stateName: 'Ciudad Autónoma de Buenos Aires',
    });
  });

  it('leaves the number empty when there is none', () => {
    expect(splitFiscalAddress('Calle Los Aromos s/n, Tandil').streetNumber).toBe('');
  });

  it('handles a missing address', () => {
    expect(splitFiscalAddress(null)).toEqual({ streetName: '', streetNumber: '', cityName: '', stateName: '' });
  });
});
