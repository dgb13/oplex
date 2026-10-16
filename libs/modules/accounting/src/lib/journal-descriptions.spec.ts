import { tenantContextStorage } from '@plexo/database';
import { withReadableDescriptions } from './journal-descriptions.js';

const INVOICE_ID = '6b3eb197-25d7-4495-94be-eb88ded9d8b0';
const SESSION_ID = '03242432-3475-419b-a223-ee941947d8d6';
const ACCOUNT_ID = '7e11fabd-57f6-4720-b82d-04616aa536c4';
const ORPHAN_ID = '45060a71-bb2a-4c5d-bf3b-52867d9938ab';

function entry(description: string, links: Record<string, string> = {}) {
  return {
    description,
    invoiceId: null,
    creditNoteId: null,
    goodsReceiptId: null,
    supplierReturnId: null,
    purchaseInvoiceId: null,
    purchaseCreditNoteId: null,
    supplierPaymentId: null,
    receiptId: null,
    checkId: null,
    bankStatementLineId: null,
    inflationAdjustmentId: null,
    cashSessionId: null,
    productionOrderId: null,
    ...links,
  };
}

function makeDb() {
  const none = { findMany: jest.fn().mockResolvedValue([]) };
  return {
    invoice: {
      findMany: jest.fn().mockResolvedValue([
        { id: INVOICE_ID, documentLetter: 'B', pointOfSale: '0002', number: '00000001', customerName: 'Consumidor Final' },
      ]),
    },
    cashSession: {
      findMany: jest.fn().mockResolvedValue([
        { id: SESSION_ID, openedAt: new Date('2026-09-20T13:00:00Z'), register: { name: 'Caja 2' } },
      ]),
    },
    financialAccount: { findMany: jest.fn().mockResolvedValue([{ id: ACCOUNT_ID, name: 'Banco Galicia USD' }]) },
    creditNote: none,
    receipt: none,
    goodsReceipt: none,
    supplierReturn: none,
    purchaseInvoice: none,
    purchaseCreditNote: none,
    supplierPayment: none,
    check: none,
    bankStatementLine: none,
    inflationAdjustment: none,
    productionOrder: none,
  };
}

function run<T>(fn: () => Promise<T>): Promise<T> {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: makeDb() as never }, fn);
}

describe('withReadableDescriptions', () => {
  it('cambia el id interno por el número del comprobante y la contraparte', async () => {
    const [sale, shortage, fx] = await run(() =>
      withReadableDescriptions([
        entry(`Venta - comprobante ${INVOICE_ID}`, { invoiceId: INVOICE_ID }),
        entry(`Faltante de caja - turno ${SESSION_ID}`, { cashSessionId: SESSION_ID }),
        entry(`Ganancia por diferencia de cambio - cuenta ${ACCOUNT_ID}`),
      ]),
    );
    expect(sale.description).toBe('Venta - Factura B 0002-00000001 - Consumidor Final');
    expect(shortage.description).toBe('Faltante de caja - Caja 2, turno del 20/09/2026');
    expect(fx.description).toBe('Ganancia por diferencia de cambio - Banco Galicia USD');
  });

  it('sin con qué armarlo, saca el id; lo que no tiene id queda igual', async () => {
    const [orphan, manual] = await run(() =>
      withReadableDescriptions([entry(`Ajuste por Inflación (RECPAM) - ${ORPHAN_ID}`), entry('Aporte de socio')]),
    );
    expect(orphan.description).toBe('Ajuste por Inflación (RECPAM)');
    expect(manual.description).toBe('Aporte de socio');
  });
});
