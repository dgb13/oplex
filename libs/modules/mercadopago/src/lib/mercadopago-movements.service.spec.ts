import { Prisma, tenantContextStorage } from '@plexo/database';
import { MercadoPagoMovementsService } from './mercadopago-movements.service.js';

function mpPayment(id: string, patch: Record<string, unknown> = {}) {
  return {
    id: `row-${id}`,
    mpPaymentId: id,
    status: 'approved',
    dateCreated: new Date('2026-10-20T14:00:00Z'),
    dateApproved: new Date('2026-10-20T14:00:05Z'),
    paymentTypeId: 'credit_card',
    installments: 3,
    currency: 'ARS',
    grossAmount: new Prisma.Decimal(1000),
    feeAmount: new Prisma.Decimal(60),
    netAmount: new Prisma.Decimal(940),
    refundedAmount: new Prisma.Decimal(0),
    moneyReleaseDate: new Date('2099-01-01T00:00:00Z'),
    moneyReleaseStatus: 'pending',
    description: null,
    payerEmail: 'cliente@ejemplo.com',
    paymentIntentId: null,
    ...patch,
  };
}

function setup(payments: unknown[], intents: unknown[]) {
  const db = {
    mercadoPagoPayment: {
      findMany: jest.fn().mockResolvedValue(payments),
      count: jest.fn().mockResolvedValue(payments.length),
    },
    paymentIntent: {
      findMany: jest.fn().mockResolvedValue(intents),
      count: jest.fn().mockResolvedValue(1),
    },
    tenantSettings: { findUnique: jest.fn().mockResolvedValue({ mercadoPagoLastSyncAt: null }) },
    invoice: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'inv-1', documentLetter: 'B', pointOfSale: '0002', number: '00000231', customerName: 'Lucía Fernández' },
        { id: 'inv-2', documentLetter: 'B', pointOfSale: '0002', number: '00000240', customerName: 'Consumidor final' },
      ]),
    },
    quote: { findMany: jest.fn().mockResolvedValue([{ id: 'q-1', number: 'PRE-000014', customer: { name: 'Delta SA' } }]) },
    cashRegister: { findMany: jest.fn().mockResolvedValue([{ id: 'reg-1', name: 'Caja Mostrador' }]) },
  };
  const run = <T>(fn: () => Promise<T>) =>
    tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
  return { db, run, service: new MercadoPagoMovementsService() };
}

describe('MercadoPagoMovementsService.list', () => {
  it('says where each payment came from and whether it is assigned in Oplex', async () => {
    const { service, run } = setup(
      [
        mpPayment('1', { paymentIntentId: 'i-link' }),
        mpPayment('2', { paymentIntentId: 'i-qr-free' }),
        mpPayment('3', { paymentIntentId: 'i-qr-sold' }),
        mpPayment('4', { paymentIntentId: 'i-quote' }),
        mpPayment('5', { description: 'Venta por Instagram' }),
        mpPayment('6', { paymentIntentId: 'i-qr-refund', status: 'refunded' }),
      ],
      [
        { id: 'i-link', documentType: 'INVOICE', documentId: 'inv-1', status: 'PAID', consumedByInvoiceId: null },
        { id: 'i-qr-free', documentType: 'POS_QR', documentId: 'reg-1', status: 'PAID', consumedByInvoiceId: null },
        { id: 'i-qr-sold', documentType: 'POS_QR', documentId: 'reg-1', status: 'PAID', consumedByInvoiceId: 'inv-2' },
        { id: 'i-quote', documentType: 'QUOTE', documentId: 'q-1', status: 'PAID', consumedByInvoiceId: null },
        { id: 'i-qr-refund', documentType: 'POS_QR', documentId: 'reg-1', status: 'REFUNDED', consumedByInvoiceId: null },
      ],
    );

    const { rows, unassignedCount } = await run(() => service.list({}));

    const summary = rows.map((r) => [r.mpPaymentId, r.originLabel, r.oplexState, r.oplexLabel]);
    expect(summary).toEqual([
      ['1', 'Factura B 0002-00000231', 'ASSIGNED', 'Cobro en la factura'],
      ['2', 'Caja Mostrador', 'UNASSIGNED', 'Sin asignar a una venta'],
      ['3', 'Caja Mostrador', 'ASSIGNED', 'Factura B 0002-00000240'],
      ['4', 'Cotización PRE-000014', 'QUOTE_PAID', 'Pagada, sin facturar'],
      ['5', 'Fuera de Oplex', 'OUTSIDE', 'Fuera de Oplex'],
      ['6', 'Caja Mostrador', 'REFUNDED', 'Devuelto'],
    ]);
    expect(rows[1].registerId).toBe('reg-1');
    expect(rows[0].method).toBe('Crédito · 3 cuotas');
    expect(rows[0].released).toBe(false);
    expect(rows[4].originDetail).toBe('Venta por Instagram');
    expect(unassignedCount).toBe(1);
  });

  it('filters "Fuera de Oplex" by payments without a charge of ours, and dates by Argentine days', async () => {
    const { service, db, run } = setup([], []);

    await run(() => service.list({ origin: 'outside', from: '2026-10-01', to: '2026-10-31', page: 2 }));

    const args = db.mercadoPagoPayment.findMany.mock.calls[0][0];
    expect(args.where.paymentIntentId).toBeNull();
    expect(args.where.dateCreated).toEqual({
      gte: new Date('2026-10-01T03:00:00Z'),
      lt: new Date('2026-11-01T03:00:00Z'),
    });
    expect(args.skip).toBe(50);
  });
});

describe('MercadoPagoMovementsService.summary', () => {
  it('adds up the period in pesos by origin and groups what MP has not released yet by day', async () => {
    const d = (n: number) => new Prisma.Decimal(n);
    const db = {
      mercadoPagoPayment: {
        findMany: jest
          .fn()
          // Período
          .mockResolvedValueOnce([
            { currency: 'ARS', grossAmount: d(1000), feeAmount: d(60), netAmount: d(940), refundedAmount: d(0), paymentIntentId: 'i-qr' },
            { currency: 'ARS', grossAmount: d(500), feeAmount: d(30), netAmount: d(470), refundedAmount: d(100), paymentIntentId: 'i-link' },
            { currency: 'ARS', grossAmount: d(200), feeAmount: d(10), netAmount: d(190), refundedAmount: d(0), paymentIntentId: null },
            { currency: 'USD', grossAmount: d(50), feeAmount: d(3), netAmount: d(47), refundedAmount: d(0), paymentIntentId: null },
          ])
          // Por liberarse
          .mockResolvedValueOnce([
            { moneyReleaseDate: new Date('2026-10-22T15:00:00Z'), netAmount: d(940), grossAmount: d(1000), refundedAmount: d(0) },
            { moneyReleaseDate: new Date('2026-10-22T20:00:00Z'), netAmount: d(190), grossAmount: d(200), refundedAmount: d(0) },
            // 01:00 UTC del 6/11 = 22:00 del 5/11 en Argentina
            { moneyReleaseDate: new Date('2026-11-06T01:00:00Z'), netAmount: d(470), grossAmount: d(500), refundedAmount: d(100) },
          ]),
      },
      paymentIntent: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'i-qr', documentType: 'POS_QR' },
          { id: 'i-link', documentType: 'INVOICE' },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ mercadoPagoLastSyncAt: null }) },
    };
    const service = new MercadoPagoMovementsService();

    const summary = await tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () =>
      service.summary({ from: '2026-10-01', to: '2026-10-31' }),
    );

    expect(summary).toMatchObject({
      gross: '1600.00', // 1000 + (500 - 100) + 200
      fee: '100.00',
      net: '1500.00', // 940 + (470 - 100) + 190
      count: 3,
      feePercent: 6.3,
      byOrigin: [
        { kind: 'CAJA', gross: '1000.00' },
        { kind: 'DOCS', gross: '400.00' },
        { kind: 'FUERA', gross: '200.00' },
      ],
      pendingRelease: '1500.00',
      upcomingReleases: [
        { date: '2026-10-22', amount: '1130.00' },
        { date: '2026-11-05', amount: '370.00' },
      ],
      otherCurrencies: [{ currency: 'USD', gross: '50.00', count: 1 }],
      unassignedCount: 2,
    });
  });
});
