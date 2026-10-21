import { Prisma, tenantContextStorage } from '@plexo/database';
import type { ConnectorService } from '@plexo/connectors';
import { MercadoPagoPaymentService } from './mercadopago-payment.service.js';
import type { MercadoPagoConnector } from './mercadopago.connector.js';
import type { MercadoPagoPreferenceClient } from './mercadopago-preference.client.js';
import type { MercadoPagoConfigService } from './mercadopago-config.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  // Mercado Pago › Configuración: sin fila de ajustes = links prendidos.
  const tx = { tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) }, ...db };
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: tx as never }, fn);
}

function makeConnectorService(overrides: Partial<jest.Mocked<ConnectorService>> = {}) {
  return {
    getConnector: jest.fn().mockResolvedValue({ id: 'connector-1', status: 'CONNECTED' }),
    ...overrides,
  } as unknown as jest.Mocked<ConnectorService>;
}

function makeConnector(overrides: Partial<jest.Mocked<MercadoPagoConnector>> = {}) {
  return {
    getValidAccessToken: jest.fn().mockResolvedValue('APP_USR-tenant-access-token'),
    ...overrides,
  } as unknown as jest.Mocked<MercadoPagoConnector>;
}

function makePreferenceClient(overrides: Partial<jest.Mocked<MercadoPagoPreferenceClient>> = {}) {
  return {
    createPreference: jest.fn().mockResolvedValue({
      id: 'preference-1',
      init_point: 'https://mercadopago.com/checkout/v1/redirect?pref_id=preference-1',
    }),
    ...overrides,
  } as unknown as jest.Mocked<MercadoPagoPreferenceClient>;
}

function makeConfig(overrides: Partial<jest.Mocked<MercadoPagoConfigService>> = {}) {
  return {
    webhookNotificationUrl: jest.fn().mockReturnValue('http://localhost:3000/api/webhooks/mercadopago?client=tenant-1'),
    ...overrides,
  } as unknown as jest.Mocked<MercadoPagoConfigService>;
}

function makeInvoice(balanceDue = 121) {
  return {
    id: 'invoice-1',
    balanceDue: new Prisma.Decimal(balanceDue),
    documentLetter: 'B',
    pointOfSale: '0001',
    number: '00000042',
    currency: { code: 'ARS' },
  };
}

function makeQuote(status = 'ACCEPTED') {
  return {
    id: 'quote-1',
    status,
    total: new Prisma.Decimal(500),
    number: 'PRE-000123',
    currency: { code: 'ARS' },
  };
}

describe('MercadoPagoPaymentService.createPaymentLink (INVOICE)', () => {
  it('creates a PaymentIntent, calls the preference client, and persists init_point/QR', async () => {
    const db = {
      invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice()) },
      paymentIntent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'intent-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'intent-1', ...data })),
      },
    };
    const connectorService = makeConnectorService();
    const connector = makeConnector();
    const preferenceClient = makePreferenceClient();
    const service = new MercadoPagoPaymentService(connectorService, connector, preferenceClient, makeConfig());

    const result = await runInTenant(db, () =>
      service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' }),
    );

    expect(connector.getValidAccessToken).toHaveBeenCalledWith('connector-1');
    expect(preferenceClient.createPreference).toHaveBeenCalledWith(
      'APP_USR-tenant-access-token',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            title: 'Factura B 0001-00000042',
            currency_id: 'ARS',
            unit_price: 121,
            quantity: 1,
          }),
        ],
        external_reference: 'intent-1',
        notification_url: 'http://localhost:3000/api/webhooks/mercadopago?client=tenant-1',
      }),
      expect.any(String),
    );
    expect(result.initPoint).toBe('https://mercadopago.com/checkout/v1/redirect?pref_id=preference-1');
    expect(result.externalId).toBe('preference-1');
    expect(result.qrCodeBase64).toMatch(/^data:image\/png;base64,/);
  });

  it('returns the existing PENDING intent instead of creating a second one (idempotency)', async () => {
    const existing = { id: 'intent-existing', status: 'PENDING', amount: new Prisma.Decimal(121) };
    const db = {
      invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice()) },
      paymentIntent: { findFirst: jest.fn().mockResolvedValue(existing), create: jest.fn() },
    };
    const preferenceClient = makePreferenceClient();
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), preferenceClient, makeConfig());

    const result = await runInTenant(db, () =>
      service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' }),
    );

    expect(result).toBe(existing);
    expect(db.paymentIntent.create).not.toHaveBeenCalled();
    expect(preferenceClient.createPreference).not.toHaveBeenCalled();
  });

  it('rejects an invoice with no outstanding balance', async () => {
    const db = { invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice(0)) } };
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), makeConfig());

    await expect(
      runInTenant(db, () => service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' })),
    ).rejects.toThrow('Esta factura no tiene saldo pendiente');
  });

  it('rejects when the invoice does not exist (or belongs to another tenant, per RLS)', async () => {
    const db = { invoice: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), makeConfig());

    await expect(
      runInTenant(db, () => service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' })),
    ).rejects.toThrow('Invoice not found');
  });

  it('rejects when this tenant never connected Mercado Pago', async () => {
    const db = {
      invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice()) },
      paymentIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const connectorService = makeConnectorService({ getConnector: jest.fn().mockResolvedValue(null) });
    const service = new MercadoPagoPaymentService(connectorService, makeConnector(), makePreferenceClient(), makeConfig());

    await expect(
      runInTenant(db, () => service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' })),
    ).rejects.toThrow('todavía no vinculó una cuenta de Mercado Pago');
  });

  it('rejects with a distinct "needs reconnection" message when the connector is EXPIRED/REVOKED (was connected, now isn\'t)', async () => {
    for (const status of ['EXPIRED', 'REVOKED', 'ERROR']) {
      const db = {
        invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice()) },
        paymentIntent: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const connectorService = makeConnectorService({
        getConnector: jest.fn().mockResolvedValue({ id: 'connector-1', status }),
      });
      const service = new MercadoPagoPaymentService(connectorService, makeConnector(), makePreferenceClient(), makeConfig());

      await expect(
        runInTenant(db, () => service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' })),
      ).rejects.toThrow('necesita reconectarse');
    }
  });

  it('rejects with the "never connected" message when the connector is still PENDING (OAuth started, never finished)', async () => {
    const db = {
      invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice()) },
      paymentIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const connectorService = makeConnectorService({
      getConnector: jest.fn().mockResolvedValue({ id: 'connector-1', status: 'PENDING' }),
    });
    const service = new MercadoPagoPaymentService(connectorService, makeConnector(), makePreferenceClient(), makeConfig());

    await expect(
      runInTenant(db, () => service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' })),
    ).rejects.toThrow('todavía no vinculó una cuenta de Mercado Pago');
  });

  it('fails clean when OAUTH_CALLBACK_BASE_URL (and therefore the webhook URL) is not configured', async () => {
    const db = {
      invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice()) },
      paymentIntent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const config = makeConfig({ webhookNotificationUrl: jest.fn().mockReturnValue(undefined) });
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), config);

    await expect(
      runInTenant(db, () => service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' })),
    ).rejects.toThrow('OAUTH_CALLBACK_BASE_URL');
  });

  it('marks the intent ERROR and rethrows when the preference call itself fails', async () => {
    const db = {
      invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice()) },
      paymentIntent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'intent-1', ...data })),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const preferenceClient = makePreferenceClient({
      createPreference: jest.fn().mockRejectedValue(new Error('collector not eligible')),
    } as never);
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), preferenceClient, makeConfig());

    await expect(
      runInTenant(db, () => service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' })),
    ).rejects.toThrow('collector not eligible');

    expect(db.paymentIntent.update).toHaveBeenCalledWith({ where: { id: 'intent-1' }, data: { status: 'ERROR' } });
  });

  it('marks the intent ERROR when Mercado Pago responds without an init_point', async () => {
    const db = {
      invoice: { findUnique: jest.fn().mockResolvedValue(makeInvoice()) },
      paymentIntent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'intent-1', ...data })),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const preferenceClient = makePreferenceClient({
      createPreference: jest.fn().mockResolvedValue({ id: 'preference-1' }),
    } as never);
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), preferenceClient, makeConfig());

    await expect(
      runInTenant(db, () => service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' })),
    ).rejects.toThrow('init_point');

    expect(db.paymentIntent.update).toHaveBeenCalledWith({ where: { id: 'intent-1' }, data: { status: 'ERROR' } });
  });
});

describe('MercadoPagoPaymentService.createPaymentLink (QUOTE)', () => {
  it('uses the quote total (no balanceDue concept) and its own description', async () => {
    const db = {
      quote: { findUnique: jest.fn().mockResolvedValue(makeQuote()) },
      paymentIntent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'intent-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'intent-1', ...data })),
      },
    };
    const preferenceClient = makePreferenceClient();
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), preferenceClient, makeConfig());

    await runInTenant(db, () => service.createPaymentLink({ documentType: 'QUOTE', documentId: 'quote-1' }));

    expect(preferenceClient.createPreference).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        items: [expect.objectContaining({ title: 'Cotización PRE-000123', unit_price: 500 })],
      }),
      expect.any(String),
    );
  });

  it('rejects a quote that is not ACCEPTED', async () => {
    const db = { quote: { findUnique: jest.fn().mockResolvedValue(makeQuote('DRAFT')) } };
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), makeConfig());

    await expect(
      runInTenant(db, () => service.createPaymentLink({ documentType: 'QUOTE', documentId: 'quote-1' })),
    ).rejects.toThrow('cotización aceptada');
  });
});

describe('MercadoPagoPaymentService.getPaymentLink', () => {
  it('returns the intent when found', async () => {
    const intent = { id: 'intent-1', status: 'PENDING' };
    const db = { paymentIntent: { findUnique: jest.fn().mockResolvedValue(intent) } };
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), makeConfig());

    const result = await runInTenant(db, () => service.getPaymentLink('intent-1'));

    expect(result).toBe(intent);
  });

  it('throws NotFoundException when the intent does not exist (or belongs to another tenant)', async () => {
    const db = { paymentIntent: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), makeConfig());

    await expect(runInTenant(db, () => service.getPaymentLink('intent-1'))).rejects.toThrow('Payment link not found');
  });
});

describe('MercadoPagoPaymentService.cancelPaymentLink', () => {
  it('cancels a PENDING intent', async () => {
    const db = {
      paymentIntent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'intent-1', status: 'PENDING' }),
        update: jest.fn().mockResolvedValue({ id: 'intent-1', status: 'CANCELLED' }),
      },
    };
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), makeConfig());

    const result = await runInTenant(db, () => service.cancelPaymentLink('intent-1'));

    expect(result.status).toBe('CANCELLED');
    expect(db.paymentIntent.update).toHaveBeenCalledWith({ where: { id: 'intent-1' }, data: { status: 'CANCELLED' } });
  });

  it('also expires the preference at Mercado Pago, without failing the cancel if MP does not answer', async () => {
    const db = {
      paymentIntent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'intent-1', status: 'PENDING', externalId: 'preference-1' }),
        update: jest.fn().mockResolvedValue({ id: 'intent-1', status: 'CANCELLED' }),
      },
    };
    const expirePreference = jest.fn().mockRejectedValue(new Error('timeout'));
    const service = new MercadoPagoPaymentService(
      makeConnectorService(),
      makeConnector(),
      makePreferenceClient({ expirePreference }),
      makeConfig(),
    );

    const result = await runInTenant(db, () => service.cancelPaymentLink('intent-1'));

    expect(expirePreference).toHaveBeenCalledWith('APP_USR-tenant-access-token', 'preference-1');
    expect(result.status).toBe('CANCELLED');
  });

  it('rejects cancelling an intent that is not PENDING', async () => {
    const db = { paymentIntent: { findUnique: jest.fn().mockResolvedValue({ id: 'intent-1', status: 'PAID' }) } };
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), makeConfig());

    await expect(runInTenant(db, () => service.cancelPaymentLink('intent-1'))).rejects.toThrow(
      'No se puede cancelar un link en estado PAID',
    );
  });
});

describe('MercadoPagoPaymentService - links apagados y listado', () => {
  it('refuses to create a link when Mercado Pago › Configuración turned them off', async () => {
    const db = {
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ mercadoPagoLinksEnabled: false }) },
      invoice: { findUnique: jest.fn() },
    };
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), makeConfig());

    await expect(
      runInTenant(db, () => service.createPaymentLink({ documentType: 'INVOICE', documentId: 'invoice-1' })),
    ).rejects.toThrow('Los links de pago de Mercado Pago están apagados');
    expect(db.invoice.findUnique).not.toHaveBeenCalled();
  });

  it('lists invoice and quote links with their document, customer and whether they can still be paid', async () => {
    const createdAt = new Date('2026-10-20T12:00:00Z');
    const intent = (id: string, documentType: string, documentId: string, status = 'PENDING') => ({
      id,
      documentType,
      documentId,
      status,
      amount: new Prisma.Decimal(54800),
      currency: 'ARS',
      initPoint: `https://mp/${id}`,
      createdAt,
      paidAt: null,
    });
    const db = {
      paymentIntent: {
        findMany: jest.fn().mockResolvedValue([
          intent('l1', 'INVOICE', 'inv-1'),
          intent('l2', 'QUOTE', 'q-1', 'CANCELLED'),
          intent('l3', 'INVOICE', 'inv-2', 'PAID'),
        ]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            documentLetter: 'B',
            pointOfSale: '0002',
            number: '00000233',
            status: 'ISSUED',
            balanceDue: new Prisma.Decimal(54800),
            customerName: 'Ana Ruiz',
            customer: { email: 'ana@ejemplo.com' },
          },
          {
            id: 'inv-2',
            documentLetter: 'B',
            pointOfSale: '0002',
            number: '00000231',
            status: 'PAID',
            balanceDue: new Prisma.Decimal(0),
            customerName: 'Lucía Fernández',
            customer: { email: null },
          },
        ]),
      },
      quote: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'q-1', number: 'PRE-000016', status: 'ACCEPTED', customer: { name: 'Delta SA', email: null } }]),
      },
    };
    const service = new MercadoPagoPaymentService(makeConnectorService(), makeConnector(), makePreferenceClient(), makeConfig());

    const rows = await runInTenant(db, () => service.listPaymentLinks());

    expect(db.paymentIntent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { documentType: { in: ['INVOICE', 'QUOTE'] } } }),
    );
    expect(rows.map((r) => [r.documentLabel, r.customerName, r.customerEmail, r.status, r.payable])).toEqual([
      ['Factura B 0002-00000233', 'Ana Ruiz', 'ana@ejemplo.com', 'PENDING', true],
      ['Cotización PRE-000016', 'Delta SA', null, 'CANCELLED', true],
      ['Factura B 0002-00000231', 'Lucía Fernández', null, 'PAID', false],
    ]);
    expect(rows[0].amount).toBe('54800.00');
  });
});
