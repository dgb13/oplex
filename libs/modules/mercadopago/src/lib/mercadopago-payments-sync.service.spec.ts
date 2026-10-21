import type { ConnectorService } from '@plexo/connectors';
import { tenantContextStorage } from '@plexo/database';
import type { MercadoPagoPaymentClient } from './mercadopago-payment.client.js';
import { MercadoPagoPaymentsSyncService, toRow } from './mercadopago-payments-sync.service.js';
import type { MercadoPagoConnector } from './mercadopago.connector.js';

function payment(id: number, patch: Record<string, unknown> = {}) {
  return {
    id,
    status: 'approved',
    date_created: '2026-10-20T13:00:00.000-03:00',
    date_last_updated: `2026-10-20T13:${String(id % 60).padStart(2, '0')}:00.000-03:00`,
    transaction_amount: 1000,
    transaction_details: { net_received_amount: 940 },
    currency_id: 'ARS',
    payment_type_id: 'credit_card',
    installments: 3,
    ...patch,
  };
}

function setup(pages: Array<{ results: unknown[]; total: number }>, opts: { lastSyncAt?: Date | null } = {}) {
  const searchPayments = jest.fn();
  pages.forEach((p) => searchPayments.mockResolvedValueOnce({ results: p.results, paging: { total: p.total } }));
  const db = {
    tenantSettings: {
      findUnique: jest.fn().mockResolvedValue({ mercadoPagoLastSyncAt: opts.lastSyncAt ?? null }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    paymentIntent: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'intent-link', externalPaymentId: '1' },
        { id: 'intent-qr', externalPaymentId: '2' },
      ]),
    },
    mercadoPagoPayment: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const service = new MercadoPagoPaymentsSyncService(
    { getConnector: jest.fn().mockResolvedValue({ id: 'c1', status: 'CONNECTED' }) } as unknown as ConnectorService,
    { getValidAccessToken: jest.fn().mockResolvedValue('token') } as unknown as MercadoPagoConnector,
    { searchPayments, getPayment: jest.fn() } as unknown as MercadoPagoPaymentClient,
  );
  const run = <T>(fn: () => Promise<T>) =>
    tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
  return { service, db, searchPayments, run };
}

describe('toRow', () => {
  it('fee = bruto - neto for a collected payment', () => {
    const row = toRow(payment(1) as never, null);
    expect(row.grossAmount?.toString()).toBe('1000');
    expect(row.netAmount?.toString()).toBe('940');
    expect(row.feeAmount?.toString()).toBe('60');
    expect(row.installments).toBe(3);
  });

  it('no fee for a payment MP did not collect', () => {
    const row = toRow(payment(1, { status: 'pending', transaction_details: { net_received_amount: 0 } }) as never, null);
    expect(row.feeAmount?.toString()).toBe('0');
  });
});

describe('MercadoPagoPaymentsSyncService.sync', () => {
  it('first sync looks 90 days back, pages until the last short page and marks the sync time', async () => {
    const full = Array.from({ length: 100 }, (_, i) => payment(100 + i));
    const { service, db, searchPayments, run } = setup([
      { results: full, total: 130 },
      { results: Array.from({ length: 30 }, (_, i) => payment(300 + i)), total: 130 },
    ]);

    const result = await run(() => service.sync());

    expect(result.synced).toBe(130);
    expect(result.partial).toBe(false);
    expect(searchPayments).toHaveBeenCalledTimes(2);
    const first = searchPayments.mock.calls[0][1];
    const daysBack = (Date.parse(first.end_date) - Date.parse(first.begin_date)) / 86_400_000;
    expect(Math.round(daysBack)).toBe(90);
    expect(first).toMatchObject({ range: 'date_last_updated', sort: 'date_last_updated', criteria: 'asc', offset: 0 });
    expect(searchPayments.mock.calls[1][1].offset).toBe(100);
    expect(db.mercadoPagoPayment.upsert).toHaveBeenCalledTimes(130);
    expect(db.tenantSettings.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      data: { mercadoPagoLastSyncAt: result.lastSyncAt },
    });
  });

  it('later syncs start a day before the last one', async () => {
    const last = new Date('2026-10-20T10:00:00Z');
    const { service, searchPayments, run } = setup([{ results: [], total: 0 }], { lastSyncAt: last });

    await run(() => service.sync());

    expect(searchPayments.mock.calls[0][1].begin_date).toBe('2026-10-19T10:00:00.000Z');
  });

  it('links each payment to our charge by external_reference, else by the stored payment id', async () => {
    const { service, db, run } = setup([
      {
        results: [
          payment(1, { external_reference: 'intent-link' }),
          payment(2),
          payment(3, { external_reference: 'someone-else' }),
        ],
        total: 3,
      },
    ]);

    await run(() => service.sync());

    const byId = Object.fromEntries(
      db.mercadoPagoPayment.upsert.mock.calls.map(([args]) => [args.create.mpPaymentId, args.create.paymentIntentId]),
    );
    expect(byId).toEqual({ '1': 'intent-link', '2': 'intent-qr', '3': null });
  });

  it('refuses when Mercado Pago is not connected', async () => {
    const { db } = setup([]);
    const service = new MercadoPagoPaymentsSyncService(
      { getConnector: jest.fn().mockResolvedValue({ id: 'c1', status: 'EXPIRED' }) } as unknown as ConnectorService,
      {} as MercadoPagoConnector,
      {} as MercadoPagoPaymentClient,
    );

    await expect(
      tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () => service.sync()),
    ).rejects.toThrow('no está conectada');
  });
});
