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
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
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

  it('split payment (cash + card): records one Receipt per payment, a CashMovement only for the cash leg, and increments FinancialAccount.currentBalance only by the cash amount', async () => {
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

    // ...y sólo esa porción incrementa FinancialAccount.currentBalance (el
    // gap real de InvoicingService.recordReceipt que este composition-root
    // existe para cerrar).
    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledTimes(1);
    expect(reportsFinancialService.recordFinancialTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ financialAccountId: 'account-1', amount: 100 }),
    );
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
      {} as CashRegistersService,
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

    await service.createQrCharge({ registerId: 'register-1', amount: 16, sale } as never);

    expect(createCharge).toHaveBeenCalledWith('register-1', 16, expect.objectContaining({ documentLetter: 'C', lines: sale.lines }));
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
