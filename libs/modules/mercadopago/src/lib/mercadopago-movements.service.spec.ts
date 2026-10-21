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
