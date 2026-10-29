import { Prisma, tenantContextStorage } from '@plexo/database';
import type { MercadoPagoPaymentsSyncService } from '@plexo/mercadopago';
import { PosPointChargesService } from './pos-point-charges.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const SOLD = new Date('2026-10-28T13:42:00Z');
const at = (minutes: number) => new Date(SOLD.getTime() + minutes * 60_000);

function charge(id: string, amount: number, soldAt = SOLD) {
  return { id, amount: new Prisma.Decimal(amount), soldAt, status: 'PENDING', candidateCount: 0, notifiedAt: null };
}

function payment(id: string, amount: number, dateCreated: Date, type = 'POINT') {
  return {
    mpPaymentId: id,
    grossAmount: new Prisma.Decimal(amount),
    dateCreated,
    status: 'approved',
    paymentMethodId: 'visa',
    paymentTypeId: 'debit_card',
    installments: 1,
    raw: { point_of_interaction: { type } },
  };
}

function makeDb(charges: ReturnType<typeof charge>[], payments: ReturnType<typeof payment>[]) {
  return {
    posPointCharge: {
      findMany: jest.fn((args: { where: { mpPaymentId?: unknown } }) =>
        Promise.resolve(args.where.mpPaymentId ? [] : charges),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    mercadoPagoPayment: { findMany: jest.fn().mockResolvedValue(payments) },
  };
}

function makeService() {
  return new PosPointChargesService(
    {} as MercadoPagoPaymentsSyncService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe('PosPointChargesService.match', () => {
  it('confirma la venta con el único pago de Point del mismo monto dentro de la ventana', async () => {
    const db = makeDb([charge('c1', 25000)], [payment('p1', 25000, at(1)), payment('p2', 25000, at(1), 'INSTORE')]);

    await runInTenant(db, () => makeService().match(at(5)));

    expect(db.posPointCharge.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'CONFIRMED', mpPaymentId: 'p1', candidateCount: 1 },
    });
  });

  it('no adivina cuando dos pagos encajan: queda para elegir', async () => {
    const db = makeDb([charge('c1', 8400)], [payment('p1', 8400, at(1)), payment('p2', 8400, at(14))]);

    await runInTenant(db, () => makeService().match(at(15)));

    expect(db.posPointCharge.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'AMBIGUOUS', candidateCount: 2 },
    });
  });

  it('dos ventas iguales que compiten por el mismo pago no lo toman solas', async () => {
    const db = makeDb([charge('c1', 5000), charge('c2', 5000, at(3))], [payment('p1', 5000, at(2))]);

    await runInTenant(db, () => makeService().match(at(10)));

    const calls = db.posPointCharge.update.mock.calls.map((c) => c[0]);
    expect(calls).toEqual([
      { where: { id: 'c1' }, data: { status: 'AMBIGUOUS', candidateCount: 1 } },
      { where: { id: 'c2' }, data: { status: 'AMBIGUOUS', candidateCount: 1 } },
    ]);
  });

  it('ignora pagos fuera de la ventana o de otro monto', async () => {
    const db = makeDb([charge('c1', 25000)], [payment('p1', 25000, at(25)), payment('p2', 24999.99, at(1)), payment('p3', 25000, at(-3))]);

    await runInTenant(db, () => makeService().match(at(26)));

    expect(db.posPointCharge.update).not.toHaveBeenCalled();
  });
});
