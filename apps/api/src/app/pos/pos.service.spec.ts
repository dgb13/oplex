import { BadRequestException } from '@nestjs/common';
import type { AccountingService } from '@plexo/accounting';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { MercadoPagoQrService } from '@plexo/mercadopago';
import type { CashRegistersService, CashSessionsService } from '@plexo/pos';
import type { ReportsFinancialService } from '@plexo/reports-financial';
import { PosService } from './pos.service.js';
import type { SalesService } from '../sales/sales.service.js';

// Mismo motivo que apps/api/src/app/sales/sales.service.spec.ts: esta suite
// sólo necesita SalesService como tipo (siempre mockeado a mano), nunca la
// implementación real, y su árbol de imports arrastra @react-pdf/renderer
// (ESM-only) vía @plexo/invoicing.
jest.mock('@plexo/invoicing', () => ({}));
// Same reasoning, now also for @plexo/quotes (SalesService.createInvoiceFromQuote).
jest.mock('@plexo/quotes', () => ({}));

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: withStockDefaults(db) as never }, fn);
}

/** Lo que PosService.assertStockAvailable lee - los tests que no prueban el
 * stock no lo declaran (sin variantes que revisar = no hay faltante). */
function withStockDefaults(db: Record<string, unknown>): Record<string, unknown> {
  return {
    articleVariant: { findMany: jest.fn().mockResolvedValue([]) },
    warehouse: { findUnique: jest.fn().mockResolvedValue({ name: 'Depósito Central' }) },
    ...db,
  };
}

/** Stock de QA Marco en el depósito de la caja, para assertStockAvailable. */
function stockDb(physical: number, reserved = 0) {
  return {
    articleVariant: {
      findMany: jest.fn().mockResolvedValue([{ id: 'variant-1', article: { name: 'QA Marco (prueba)' } }]),
    },
    stockLedger: { findUnique: jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(physical) }) },
    stockReservation: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantityReserved: new Prisma.Decimal(reserved) } }) },
  };
}

function makeRegister() {
  return {
    id: 'register-1',
    branchId: 'branch-1',
    warehouseId: 'warehouse-1',
    financialAccountId: 'account-1',
  };
}

function makeInvoice(total: number) {
  return {
    id: 'invoice-1',
    documentLetter: 'B',
    number: '00000001',
    total: new Prisma.Decimal(total),
  };
}

describe('PosService.checkout', () => {
  it('rejects when the register has no open session', async () => {
    const cashRegistersService = {
      getById: jest.fn().mockResolvedValue(makeRegister()),
    } as unknown as CashRegistersService;
    const cashSessionsService = {
      getOpenSession: jest.fn().mockResolvedValue(null),
    } as unknown as CashSessionsService;
    const service = new PosService(
      cashRegistersService,
      cashSessionsService,
      {} as SalesService,
      {} as AccountingService,
      {} as ReportsFinancialService,
    );

    await expect(
      runInTenant({}, () =>
        service.checkout({
          registerId: 'register-1',
          customerId: 'customer-1',
          documentLetter: 'B',
          currencyId: 'currency-1',
          lines: [],
          payments: [{ amount: 100, method: 'CASH' }],
        } as never),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the sum of payments does not match the invoice total, without recording any receipt', async () => {
    const cashRegistersService = {
      getById: jest.fn().mockResolvedValue(makeRegister()),
    } as unknown as CashRegistersService;
    const cashSessionsService = {
      getOpenSession: jest.fn().mockResolvedValue({ id: 'session-1' }),
      recordSaleMovement: jest.fn(),
    } as unknown as CashSessionsService;
    const salesService = {
      createSale: jest.fn().mockResolvedValue(makeInvoice(121)),
      recordReceipt: jest.fn(),
    } as unknown as SalesService;
    const service = new PosService(
      cashRegistersService,
      cashSessionsService,
      salesService,
      {} as AccountingService,
      {} as ReportsFinancialService,
    );

    await expect(
      runInTenant({}, () =>
        service.checkout({
          registerId: 'register-1',
          customerId: 'customer-1',
          documentLetter: 'B',
          currencyId: 'currency-1',
          lines: [],
          payments: [{ amount: 100, method: 'CASH' }], // invoice.total is 121
        } as never),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(salesService.recordReceipt).not.toHaveBeenCalled();
  });

  it('split payment (cash + card): records one Receipt per payment and a CashMovement only for the cash leg - the balance is moved once, by recordReceipt', async () => {
    const register = makeRegister();
    const invoice = makeInvoice(150);
    const cashRegistersService = {
      getById: jest.fn().mockResolvedValue(register),
    } as unknown as CashRegistersService;
    const cashSessionsService = {
      getOpenSession: jest.fn().mockResolvedValue({ id: 'session-1' }),
      recordSaleMovement: jest.fn().mockResolvedValue({ id: 'movement-1' }),
    } as unknown as CashSessionsService;
    const salesService = {
      createSale: jest.fn().mockResolvedValue(invoice),
      recordReceipt: jest.fn().mockResolvedValue({ id: 'receipt-x' }),
    } as unknown as SalesService;
    const reportsFinancialService = {
      recordFinancialTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
    } as unknown as ReportsFinancialService;
    const service = new PosService(
      cashRegistersService,
      cashSessionsService,
      salesService,
      {} as AccountingService,
      reportsFinancialService,
    );

    const result = await runInTenant({}, () =>
      service.checkout({
        registerId: 'register-1',
        customerId: 'customer-1',
        documentLetter: 'B',
        currencyId: 'currency-1',
        lines: [{ articleVariantId: 'variant-1', quantity: 1 }],
        payments: [
          { amount: 100, method: 'CASH' },
          { amount: 50, method: 'CARD' },
        ],
      } as never),
    );

    expect(result).toBe(invoice);
    expect(salesService.recordReceipt).toHaveBeenCalledTimes(2);
    expect(salesService.recordReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100, method: 'CASH', financialAccountId: 'account-1' }),
    );
    expect(salesService.recordReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 50, method: 'CARD', financialAccountId: undefined }),
    );

    // Sólo la porción en efectivo deja rastro en el ledger de la sesión...
    expect(cashSessionsService.recordSaleMovement).toHaveBeenCalledTimes(1);
    expect(cashSessionsService.recordSaleMovement).toHaveBeenCalledWith('session-1', 'invoice-1', 100);

    // ...y el saldo de la caja lo mueve SalesService.recordReceipt (por el
    // financialAccountId de arriba), una sola vez: la Caja ya no suma por su
    // cuenta - cada venta en efectivo contaba doble (2026-10-02).
    expect(reportsFinancialService.recordFinancialTransaction).not.toHaveBeenCalled();
  });
});

describe('PosService - cobros QR sin venta', () => {
  const sale = {
    documentLetter: 'C' as const,
    currencyId: 'currency-1',
    lines: [{ articleVariantId: 'variant-1', quantity: 16, unitPrice: 1 }],
    payments: [{ amount: 16, method: 'MERCADOPAGO' }],
  };

  function makeService(overrides: {
    mercadoPagoQrService?: Record<string, jest.Mock>;
    cashSessionsService?: Record<string, jest.Mock>;
  }) {
    return new PosService(
      { getById: jest.fn().mockResolvedValue(makeRegister()) } as unknown as CashRegistersService,
      (overrides.cashSessionsService ?? {}) as unknown as CashSessionsService,
      {} as SalesService,
      {} as AccountingService,
      {} as ReportsFinancialService,
      (overrides.mercadoPagoQrService ?? {}) as unknown as MercadoPagoQrService,
    );
  }

  function makeUnclaimed(saleDraft: unknown) {
    return {
      id: 'intent-1',
      registerId: 'register-1',
      status: 'PAID',
      amount: '16.00',
      saleDraft,
      paidAt: '2026-10-01T13:00:00.000Z',
      createdAt: '2026-10-01T12:58:00.000Z',
      createdByUserId: 'user-1',
      externalPaymentId: 'PAY-1',
    };
  }

  it('guarda la venta junto con el cobro QR', async () => {
    const createCharge = jest.fn().mockResolvedValue({ id: 'intent-1' });
    const service = makeService({ mercadoPagoQrService: { createCharge } });

    await runInTenant(stockDb(49), () => service.createQrCharge({ registerId: 'register-1', amount: 16, sale } as never));

    expect(createCharge).toHaveBeenCalledWith('register-1', 16, expect.objectContaining({ documentLetter: 'C', lines: sale.lines }));
  });

  it('no genera el QR si falta stock en el depósito de la caja - el cliente nunca llega a pagar', async () => {
    const createCharge = jest.fn();
    const service = makeService({ mercadoPagoQrService: { createCharge } });

    await expect(
      runInTenant(stockDb(8), () => service.createQrCharge({ registerId: 'register-1', amount: 16, sale } as never)),
    ).rejects.toThrow('No hay stock suficiente en Depósito Central - QA Marco (prueba): hay 8 y la venta lleva 16');
    expect(createCharge).not.toHaveBeenCalled();
  });

  it('checkout corta por falta de stock antes de crear la venta', async () => {
    const createSale = jest.fn();
    const service = new PosService(
      { getById: jest.fn().mockResolvedValue(makeRegister()) } as unknown as CashRegistersService,
      { getOpenSession: jest.fn().mockResolvedValue({ id: 'session-1' }) } as unknown as CashSessionsService,
      { createSale } as unknown as SalesService,
      {} as AccountingService,
      {} as ReportsFinancialService,
      {} as MercadoPagoQrService,
    );

    await expect(
      runInTenant(stockDb(8), () => service.checkout({ ...sale, registerId: 'register-1' } as never)),
    ).rejects.toThrow(/hay 8 y la venta lleva 16/);
    expect(createSale).not.toHaveBeenCalled();
  });

  it('lo reservado para producción no cuenta como disponible', async () => {
    const createCharge = jest.fn();
    const service = makeService({ mercadoPagoQrService: { createCharge } });

    await expect(
      runInTenant(stockDb(20, 10), () => service.createQrCharge({ registerId: 'register-1', amount: 16, sale } as never)),
    ).rejects.toThrow('hay 10 libres (10 reservadas para producción) y la venta lleva 16');
    expect(createCharge).not.toHaveBeenCalled();
  });

  it('rechaza una venta cuya fila de Mercado Pago no es el monto del QR', async () => {
    const createCharge = jest.fn();
    const service = makeService({ mercadoPagoQrService: { createCharge } });

    await expect(
      service.createQrCharge({
        registerId: 'register-1',
        amount: 10,
        sale: { ...sale, payments: [{ amount: 16, method: 'MERCADOPAGO' }] },
      } as never),
    ).rejects.toThrow(/una sola fila de Mercado Pago/);
    expect(createCharge).not.toHaveBeenCalled();
  });

  it('confirma la venta guardada con el mismo checkout, pagando la fila de Mercado Pago con ese cobro', async () => {
    const service = makeService({
      mercadoPagoQrService: { getUnclaimedCharge: jest.fn().mockResolvedValue(makeUnclaimed(sale)) },
    });
    const checkout = jest.spyOn(service, 'checkout').mockResolvedValue({ id: 'invoice-1' } as never);

    await service.confirmQrSale('intent-1');

    expect(checkout).toHaveBeenCalledWith({
      ...sale,
      registerId: 'register-1',
      payments: [{ amount: 16, method: 'MERCADOPAGO', paymentIntentId: 'intent-1' }],
    });
  });

  it('un cobro viejo sin la venta guardada no se puede confirmar desde la lista', async () => {
    const service = makeService({
      mercadoPagoQrService: { getUnclaimedCharge: jest.fn().mockResolvedValue(makeUnclaimed(null)) },
    });
    const checkout = jest.spyOn(service, 'checkout');

    await expect(service.confirmQrSale('intent-1')).rejects.toThrow(/no tiene la venta guardada/);
    expect(checkout).not.toHaveBeenCalled();
  });

  it('no deja cerrar el turno con un cobro QR acreditado sin venta en la caja', async () => {
    const closeSession = jest.fn();
    const service = makeService({
      cashSessionsService: {
        getSessionSummary: jest.fn().mockResolvedValue({ session: { id: 'session-1', registerId: 'register-1' } }),
        closeSession,
      },
      mercadoPagoQrService: { listUnclaimedCharges: jest.fn().mockResolvedValue([makeUnclaimed(sale)]) },
    });

    await expect(service.closeSession('session-1', { countedAmount: 100 } as never)).rejects.toThrow(
      /cobro con QR acreditado sin venta/,
    );
    expect(closeSession).not.toHaveBeenCalled();
  });
});

describe('PosService.closeSession - diferencia de arqueo', () => {
  it('el faltante mueve el saldo de la caja y se asienta contra la cuenta contable de esa caja', async () => {
    const order: string[] = [];
    const reportsFinancialService = {
      recordFinancialTransaction: jest.fn(() => {
        order.push('balance');
        return Promise.resolve({ id: 'tx-1' });
      }),
    } as unknown as ReportsFinancialService;
    const accountingService = {
      ensureMoneyAccounts: jest.fn(() => {
        order.push('ensure');
        return Promise.resolve();
      }),
      postCashSessionAdjustmentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const closedAt = new Date('2026-10-02T23:00:00Z');
    const service = new PosService(
      { getById: jest.fn().mockResolvedValue(makeRegister()) } as unknown as CashRegistersService,
      {
        getSessionSummary: jest.fn().mockResolvedValue({ session: { id: 'session-1', registerId: 'register-1' } }),
        closeSession: jest.fn().mockResolvedValue({
          session: { id: 'session-1', difference: new Prisma.Decimal(-50), closedAt },
        }),
      } as unknown as CashSessionsService,
      {} as SalesService,
      accountingService,
      reportsFinancialService,
      { listUnclaimedCharges: jest.fn().mockResolvedValue([]) } as unknown as MercadoPagoQrService,
    );

    await runInTenant({}, () => service.closeSession('session-1', { countedAmount: 950 } as never));

    expect(order).toEqual(['ensure', 'balance']);
    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ financialAccountId: 'account-1', amount: -50 }),
    );
    expect(accountingService.postCashSessionAdjustmentJournalEntry).toHaveBeenCalledWith({
      cashSessionId: 'session-1',
      financialAccountId: 'account-1',
      difference: new Prisma.Decimal(-50),
      date: closedAt,
    });
  });
});

describe('PosService.recordCashMovement - ingresos y egresos de la Caja', () => {
  function makeService(db: Record<string, unknown> = {}) {
    const reportsFinancialService = {
      recordFinancialTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
    } as unknown as ReportsFinancialService;
    const accountingService = {
      ensureMoneyAccounts: jest.fn().mockResolvedValue(undefined),
      postMoneyMovementJournalEntry: jest.fn().mockResolvedValue({}),
      postTransferJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const cashSessionsService = {
      recordCashMovement: jest.fn().mockResolvedValue({ id: 'mov-1' }),
      getSessionSummary: jest.fn().mockResolvedValue({ session: { id: 'session-1', registerId: 'register-1' } }),
    } as unknown as CashSessionsService;
    const service = new PosService(
      { getById: jest.fn().mockResolvedValue({ ...makeRegister(), name: 'Caja 2' }) } as unknown as CashRegistersService,
      cashSessionsService,
      {} as SalesService,
      accountingService,
      reportsFinancialService,
      {} as MercadoPagoQrService,
    );
    const run = <T>(fn: () => T) => runInTenant(db, fn);
    return { service, reportsFinancialService, accountingService, cashSessionsService, run };
  }

  it('pago de un gasto: baja la caja y se asienta contra el concepto', async () => {
    const { service, reportsFinancialService, accountingService, cashSessionsService, run } = makeService();

    await run(() =>
      service.recordCashMovement(
        'session-1',
        { amount: 1200, reason: 'Artículos de limpieza', kind: 'EXPENSE', concept: 'GENERAL_EXPENSES' },
        'CASH_OUT',
      ),
    );

    // El arqueo lo sigue contando igual.
    expect(cashSessionsService.recordCashMovement).toHaveBeenCalledWith('session-1', expect.anything(), 'CASH_OUT');
    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith({
      financialAccountId: 'account-1',
      amount: -1200,
      externalRef: 'Artículos de limpieza',
    });
    expect(accountingService.postMoneyMovementJournalEntry).toHaveBeenCalledWith({
      financialAccountId: 'account-1',
      amount: new Prisma.Decimal(-1200),
      counterpart: { concept: 'GENERAL_EXPENSES' },
      description: 'Gastos generales - Caja 2 - Artículos de limpieza',
    });
  });

  it('retiro a otra cuenta: transferencia, baja la caja y sube la otra', async () => {
    const db = {
      financialAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'fa-bank', name: 'Banco Galicia CC', currencyId: null }) },
    };
    const { service, reportsFinancialService, accountingService, run } = makeService(db);

    await run(() =>
      service.recordCashMovement(
        'session-1',
        { amount: 50000, reason: 'Retiro del mediodía', kind: 'TRANSFER', financialAccountId: 'fa-bank' },
        'CASH_OUT',
      ),
    );

    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ financialAccountId: 'account-1', amount: -50000 }),
    );
    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ financialAccountId: 'fa-bank', amount: 50000 }),
    );
    expect(accountingService.postTransferJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        fromFinancialAccountId: 'account-1',
        toFinancialAccountId: 'fa-bank',
        amount: new Prisma.Decimal(50000),
      }),
    );
    expect(accountingService.postMoneyMovementJournalEntry).not.toHaveBeenCalled();
  });

  it('aporte de un socio: ingreso contra Aportes de Socios', async () => {
    const { service, accountingService, run } = makeService();

    await run(() => service.recordCashMovement('session-1', { amount: 3000, reason: 'Cambio', kind: 'PARTNER' }, 'CASH_IN'));

    expect(accountingService.postMoneyMovementJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ amount: new Prisma.Decimal(3000), counterpart: { concept: 'PARTNER_CONTRIBUTIONS' } }),
    );
  });

  it('un gasto sin decir cuál no se registra (ni en el arqueo)', async () => {
    const { service, cashSessionsService, run } = makeService();

    await expect(
      run(() => service.recordCashMovement('session-1', { amount: 100, reason: 'x', kind: 'EXPENSE' }, 'CASH_OUT')),
    ).rejects.toThrow(BadRequestException);
    expect(cashSessionsService.recordCashMovement).not.toHaveBeenCalled();
  });

  it('no se puede "retirar" a la misma caja', async () => {
    const db = {
      financialAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'account-1', name: 'Caja 2', currencyId: null }) },
    };
    const { service, run } = makeService(db);

    await expect(
      run(() =>
        service.recordCashMovement(
          'session-1',
          { amount: 100, reason: 'x', kind: 'TRANSFER', financialAccountId: 'account-1' },
          'CASH_OUT',
        ),
      ),
    ).rejects.toThrow(/otra cuenta/);
  });
});
