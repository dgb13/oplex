import { createHmac } from 'node:crypto';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { ConnectorService } from '@plexo/connectors';
import { Prisma, type PrismaService } from '@plexo/database';
import type { MercadoPagoConfigService, MercadoPagoConnector, MercadoPagoPaymentClient } from '@plexo/mercadopago';
import { INVOICE_PAID } from '../dashboard/events.js';
import type { SalesService } from '../sales/sales.service.js';
import { MercadoPagoWebhookService, type MercadoPagoWebhookInput } from './mercadopago-webhook.service.js';

// Same reasoning as apps/api's sales.service.spec.ts: @plexo/invoicing's
// real module pulls in @react-pdf/renderer (ESM the Jest/swc pipeline
// can't parse through the dist symlink) - only SalesService's TYPES are
// needed here, never a real InvoicingService instance.
jest.mock('@plexo/invoicing', () => ({}));
// Same reasoning, now also for @plexo/quotes (SalesService.createInvoiceFromQuote).
jest.mock('@plexo/quotes', () => ({}));

const SECRET = 'test-webhook-secret';

/** Independently signs a notification the same way MP does (per the
 * official manifest, re-derived here rather than imported from the SUT -
 * see mercadopago-webhook-signature.util.spec.ts for the same reasoning). */
function sign(dataId: string, requestId = 'req-1'): { signatureHeader: string; requestId: string } {
  const ts = '1742505638683';
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', SECRET).update(manifest).digest('hex');
  return { signatureHeader: `ts=${ts},v1=${v1}`, requestId };
}

function baseInput(overrides: Partial<MercadoPagoWebhookInput> = {}): MercadoPagoWebhookInput {
  const { signatureHeader, requestId } = sign('999888777');
  return {
    signatureHeader,
    requestId,
    dataId: '999888777',
    type: 'payment',
    tenantIdParam: 'tenant-1',
    payload: { type: 'payment', data: { id: '999888777' } },
    ...overrides,
  };
}

function makeIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intent-1',
    status: 'PENDING',
    documentType: 'INVOICE',
    documentId: 'invoice-1',
    amount: new Prisma.Decimal(1810),
    currency: 'ARS',
    ...overrides,
  };
}

function makeApprovedPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 555111,
    status: 'approved',
    external_reference: 'intent-1',
    transaction_amount: 1810,
    currency_id: 'ARS',
    date_approved: '2026-08-30T12:00:00.000Z',
    ...overrides,
  };
}

interface Deps {
  prisma: PrismaService;
  config: jest.Mocked<MercadoPagoConfigService>;
  connectorService: jest.Mocked<ConnectorService>;
  mercadoPagoConnector: jest.Mocked<MercadoPagoConnector>;
  paymentClient: jest.Mocked<MercadoPagoPaymentClient>;
  salesService: jest.Mocked<SalesService>;
  eventEmitter: jest.Mocked<EventEmitter2>;
  tx: Record<string, unknown>;
}

function makeDeps(overrides: {
  intent?: Record<string, unknown> | null;
  payment?: Record<string, unknown>;
  webhookEventExisting?: Record<string, unknown> | null;
} = {}): Deps {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    paymentIntent: {
      findFirst: jest.fn().mockResolvedValue(overrides.intent === undefined ? makeIntent() : overrides.intent),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...makeIntent(), ...data })),
    },
    userActivityLog: { create: jest.fn().mockResolvedValue({}) },
    invoice: {
      findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(0), status: 'PAID' }),
    },
  };

  const prisma = {
    webhookEvent: {
      findUnique: jest.fn().mockResolvedValue(overrides.webhookEventExisting ?? null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'event-1', processed: false, ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  return {
    prisma,
    tx,
    config: { webhookSecret: SECRET } as unknown as jest.Mocked<MercadoPagoConfigService>,
    connectorService: {
      getConnector: jest.fn().mockResolvedValue({ id: 'connector-1', status: 'CONNECTED' }),
    } as unknown as jest.Mocked<ConnectorService>,
    mercadoPagoConnector: {
      getValidAccessToken: jest.fn().mockResolvedValue('APP_USR-tenant-access-token'),
    } as unknown as jest.Mocked<MercadoPagoConnector>,
    paymentClient: {
      getPayment: jest.fn().mockResolvedValue(overrides.payment ?? makeApprovedPayment()),
    } as unknown as jest.Mocked<MercadoPagoPaymentClient>,
    salesService: {
      recordReceipt: jest.fn().mockResolvedValue({ id: 'receipt-1', amount: new Prisma.Decimal(1810) }),
    } as unknown as jest.Mocked<SalesService>,
    eventEmitter: { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>,
  };
}

function makeService(deps: Deps): MercadoPagoWebhookService {
  return new MercadoPagoWebhookService(
    deps.prisma,
    deps.config,
    deps.connectorService,
    deps.mercadoPagoConnector,
    deps.paymentClient,
    deps.salesService,
    deps.eventEmitter,
  );
}

describe('MercadoPagoWebhookService.handleNotification - signature', () => {
  it('rejects an invalid signature and never touches the database', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await expect(
      service.handleNotification(baseInput({ signatureHeader: 'ts=1,v1=deadbeef' })),
    ).rejects.toThrow('Firma de Mercado Pago inválida');

    expect(deps.prisma.webhookEvent.findUnique).not.toHaveBeenCalled();
    expect(deps.connectorService.getConnector).not.toHaveBeenCalled();
  });

  it('rejects when MP_WEBHOOK_SECRET is not configured, regardless of signature shape', async () => {
    const deps = makeDeps();
    (deps.config as { webhookSecret?: string }).webhookSecret = undefined;
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput())).rejects.toThrow('Firma de Mercado Pago inválida');
  });

  it('gives byte-for-byte the same 401 whether ?client= names a real tenant, a bogus one, or is missing (never leaks tenant existence)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);
    const badSignature = { signatureHeader: 'ts=1,v1=deadbeef' };

    const errors = await Promise.all(
      [
        baseInput({ ...badSignature, tenantIdParam: 'tenant-1' }),
        baseInput({ ...badSignature, tenantIdParam: 'nonexistent-tenant' }),
        baseInput({ ...badSignature, tenantIdParam: undefined }),
      ].map((input) => service.handleNotification(input).catch((err: Error) => err.message)),
    );

    expect(errors).toEqual([
      'Firma de Mercado Pago inválida',
      'Firma de Mercado Pago inválida',
      'Firma de Mercado Pago inválida',
    ]);
  });
});

describe('MercadoPagoWebhookService.handleNotification - reconciliation happy path', () => {
  it('reconciles an approved INVOICE payment: recordReceipt is the ONLY accounting path taken', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.paymentClient.getPayment).toHaveBeenCalledWith('APP_USR-tenant-access-token', '999888777');
    expect(deps.tx.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: 'intent-1' },
      data: expect.objectContaining({ status: 'PAID', externalPaymentId: '555111' }),
    });
    expect(deps.salesService.recordReceipt).toHaveBeenCalledWith({
      invoiceId: 'invoice-1',
      amount: 1810,
      method: 'MERCADO_PAGO',
    });
    expect(deps.tx.userActivityLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'mercadopago.payment_received' }) }),
    );
    expect(deps.eventEmitter.emit).toHaveBeenCalledWith(INVOICE_PAID, expect.objectContaining({ invoiceId: 'invoice-1' }));
    expect(deps.prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
  });

  it('marks PAID but does NOT call recordReceipt for a QUOTE intent (informational only, per Fase 3)', async () => {
    const deps = makeDeps({ intent: makeIntent({ documentType: 'QUOTE', documentId: 'quote-1' }) });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.tx.paymentIntent.update).toHaveBeenCalledWith({
      where: { id: 'intent-1' },
      data: expect.objectContaining({ status: 'PAID' }),
    });
    expect(deps.salesService.recordReceipt).not.toHaveBeenCalled();
    expect(deps.eventEmitter.emit).not.toHaveBeenCalled();
  });
});

describe('MercadoPagoWebhookService.handleNotification - double notification (idempotency)', () => {
  it('a second notification for an already-processed event is a total no-op: recordReceipt runs exactly once', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.handleNotification(baseInput());
    expect(deps.salesService.recordReceipt).toHaveBeenCalledTimes(1);

    // Second delivery of the SAME notification: findUnique now returns the
    // row this same test just "created", already processed=true.
    (deps.prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue({ id: 'event-1', processed: true });
    await service.handleNotification(baseInput());

    expect(deps.salesService.recordReceipt).toHaveBeenCalledTimes(1);
    expect(deps.paymentClient.getPayment).toHaveBeenCalledTimes(1);
  });

  it('an intent already PAID from a prior notification is never reconciled twice, even under a different externalPaymentId', async () => {
    // Simulates the SAME PaymentIntent already settled by an earlier
    // notification - this webhook's own WebhookEvent row is new (a
    // DIFFERENT MP payment attempt notifying about the same intent), but
    // the intent itself is no longer PENDING.
    const deps = makeDeps({ intent: makeIntent({ status: 'PAID', documentId: 'invoice-1' }) });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.tx.paymentIntent.update).not.toHaveBeenCalled();
    expect(deps.salesService.recordReceipt).not.toHaveBeenCalled();
    // Still acked (not an error) - WebhookEvent still gets marked processed.
    expect(deps.prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
  });

  it('a retry of a previously-FAILED (unprocessed) event reprocesses instead of skipping', async () => {
    const deps = makeDeps({ webhookEventExisting: { id: 'event-1', processed: false } });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    // Must NOT re-insert (findUnique already found it) but MUST still do
    // the real work - this is the retry path the atomicity fix depends on.
    expect(deps.prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(deps.salesService.recordReceipt).toHaveBeenCalledTimes(1);
  });
});

describe('MercadoPagoWebhookService.handleNotification - altered amount', () => {
  it('does not asentar when the approved amount does not match the PaymentIntent (marks ERROR instead)', async () => {
    const deps = makeDeps({ payment: makeApprovedPayment({ transaction_amount: 1 }) });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.tx.paymentIntent.update).toHaveBeenCalledWith({ where: { id: 'intent-1' }, data: { status: 'ERROR' } });
    expect(deps.salesService.recordReceipt).not.toHaveBeenCalled();
    expect(deps.eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('does not asentar when the currency does not match', async () => {
    const deps = makeDeps({ payment: makeApprovedPayment({ currency_id: 'USD' }) });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.tx.paymentIntent.update).toHaveBeenCalledWith({ where: { id: 'intent-1' }, data: { status: 'ERROR' } });
    expect(deps.salesService.recordReceipt).not.toHaveBeenCalled();
  });
});

describe('MercadoPagoWebhookService.handleNotification - atomicity (mark PAID + recordReceipt + activity log in one transaction)', () => {
  it('when recordReceipt throws, the failure propagates, WebhookEvent stays unprocessed, and no invoice.paid event fires', async () => {
    const deps = makeDeps();
    (deps.salesService.recordReceipt as jest.Mock).mockRejectedValue(new Error('unbalanced entry'));
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput())).rejects.toThrow('unbalanced entry');

    // The PENDING->PAID update DID run inside the same callback Prisma's
    // $transaction wraps - real rollback of that write is Prisma's own
    // guarantee (the same one SalesService.createSale's doc comment
    // already relies on for every other flow in this app), not something
    // a mocked tx can re-prove. What this test asserts is the contract
    // this service must uphold GIVEN that guarantee: never mark the
    // WebhookEvent processed, never emit as if it succeeded.
    expect(deps.prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ error: 'unbalanced entry' }) }),
    );
    expect(deps.prisma.webhookEvent.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
    expect(deps.eventEmitter.emit).not.toHaveBeenCalled();
  });
});

describe('MercadoPagoWebhookService.handleNotification - multi-tenant isolation', () => {
  it('when the resolved payment.external_reference does not match any PaymentIntent visible under this tenant, it is treated as an orphan - never guessed at, never reconciled', async () => {
    // getTenantDb() inside withTenantContext(tenantIdParam, ...) is the
    // ONLY thing RLS scopes - a real cross-tenant id would make Postgres
    // itself return null here (proven exhaustively by
    // cross-tenant-read.rls-spec.ts, which now covers payment_intents
    // too). This test proves the application layer's half of the
    // guarantee: given exactly what RLS would produce for a foreign-
    // tenant id (null), the service throws instead of silently
    // reconciling something, and never falls back to any other lookup.
    const deps = makeDeps({ intent: null });
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput({ tenantIdParam: 'tenant-victim' }))).rejects.toThrow(
      'No PaymentIntent found',
    );

    expect(deps.salesService.recordReceipt).not.toHaveBeenCalled();
    expect(deps.tx.paymentIntent.update).not.toHaveBeenCalled();
    // Left unprocessed on purpose - see the "orphan" doc comment in the
    // service: this could be a genuine race (the PaymentIntent not
    // committed yet), not necessarily a real orphan, so a legitimate MP
    // retry must get a real second chance.
    expect(deps.prisma.webhookEvent.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
  });
});

describe('MercadoPagoWebhookService.handleNotification - other terminal cases', () => {
  it('acks without reconciling when the tenant has no CONNECTED Mercado Pago connector', async () => {
    const deps = makeDeps();
    (deps.connectorService.getConnector as jest.Mock).mockResolvedValue(null);
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.paymentClient.getPayment).not.toHaveBeenCalled();
    expect(deps.prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
  });

  it('leaves the intent PENDING when the payment is not yet approved', async () => {
    const deps = makeDeps({ payment: makeApprovedPayment({ status: 'pending' }) });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.tx.paymentIntent.update).not.toHaveBeenCalled();
    expect(deps.salesService.recordReceipt).not.toHaveBeenCalled();
  });

  it('ignores non-payment notification types without creating a WebhookEvent row', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.handleNotification(baseInput({ type: 'merchant_order', payload: { type: 'merchant_order' } }));

    expect(deps.prisma.webhookEvent.findUnique).not.toHaveBeenCalled();
    expect(deps.connectorService.getConnector).not.toHaveBeenCalled();
  });
});
