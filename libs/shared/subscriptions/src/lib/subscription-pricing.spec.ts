import { addMonthsUtc, computeSubscriptionCharge } from './subscription-pricing.js';

const SILVER = { priceMonthly: 176439, debitDiscountPercent: 5, annualDiscountPercent: 20 };

describe('computeSubscriptionCharge', () => {
  it('transferencia de 1 mes: precio de lista + IVA 21%', () => {
    expect(computeSubscriptionCharge(SILVER, 'TRANSFER', 1)).toEqual({
      months: 1,
      listPrice: 176439,
      discountPercent: 0,
      discountAmount: 0,
      netAmount: 176439,
      vatAmount: 37052.19,
      total: 213491.19,
    });
  });

  it('débito automático mensual: 5% sobre el neto, después IVA', () => {
    expect(computeSubscriptionCharge(SILVER, 'MP_DEBIT', 1)).toMatchObject({
      discountPercent: 5,
      discountAmount: 8821.95,
      netAmount: 167617.05,
      total: 202816.63,
    });
  });

  it('anual: 20% sobre los 12 meses, sin sumar el de débito', () => {
    const transfer = computeSubscriptionCharge(SILVER, 'TRANSFER', 12);
    expect(transfer).toMatchObject({ listPrice: 2117268, discountPercent: 20, netAmount: 1693814.4, total: 2049515.42 });
    expect(computeSubscriptionCharge(SILVER, 'MP_DEBIT', 12).discountPercent).toBe(20);
  });

  it('3 y 6 meses no tienen descuento', () => {
    expect(computeSubscriptionCharge(SILVER, 'TRANSFER', 3).discountPercent).toBe(0);
    expect(computeSubscriptionCharge(SILVER, 'TRANSFER', 6).discountPercent).toBe(0);
  });
});

describe('addMonthsUtc', () => {
  it('no se pasa de fin de mes', () => {
    expect(addMonthsUtc(new Date('2026-01-31T12:00:00Z'), 1).toISOString()).toBe('2026-02-28T12:00:00.000Z');
    expect(addMonthsUtc(new Date('2026-10-03T12:00:00Z'), 12).toISOString()).toBe('2027-10-03T12:00:00.000Z');
  });
});
