/** Cálculo del cobro de un plan de Oplex. Los precios de Plan son SIN IVA
 * (decisión del usuario, 2026-10-03): se aplica el descuento que
 * corresponda sobre el neto y después el IVA 21%.
 *
 * Descuentos, no acumulables:
 * - 12 meses por adelantado: Plan.annualDiscountPercent (20% por defecto).
 * - Débito automático mensual de Mercado Pago: Plan.debitDiscountPercent (5%).
 * - 1, 3 o 6 meses por transferencia/efectivo: sin descuento. */

export const SUBSCRIPTION_VAT_PERCENT = 21;
export const SUBSCRIPTION_MONTH_OPTIONS = [1, 3, 6, 12] as const;

export type SubscriptionPaymentMethodValue = 'MP_DEBIT' | 'TRANSFER' | 'CASH' | 'OTHER';

type Decimalish = { toString(): string } | number;

export interface PlanPricing {
  priceMonthly: Decimalish;
  debitDiscountPercent: Decimalish;
  annualDiscountPercent: Decimalish;
}

export interface SubscriptionCharge {
  months: number;
  listPrice: number;
  discountPercent: number;
  discountAmount: number;
  netAmount: number;
  vatAmount: number;
  total: number;
}

function num(value: Decimalish): number {
  return typeof value === 'number' ? value : Number(value.toString());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function discountPercentFor(plan: PlanPricing, method: SubscriptionPaymentMethodValue, months: number): number {
  if (months === 12) return num(plan.annualDiscountPercent);
  if (method === 'MP_DEBIT' && months === 1) return num(plan.debitDiscountPercent);
  return 0;
}

export function computeSubscriptionCharge(
  plan: PlanPricing,
  method: SubscriptionPaymentMethodValue,
  months: number,
): SubscriptionCharge {
  const listPrice = round2(num(plan.priceMonthly) * months);
  const discountPercent = discountPercentFor(plan, method, months);
  const discountAmount = round2((listPrice * discountPercent) / 100);
  const netAmount = round2(listPrice - discountAmount);
  const vatAmount = round2((netAmount * SUBSCRIPTION_VAT_PERCENT) / 100);
  return { months, listPrice, discountPercent, discountAmount, netAmount, vatAmount, total: round2(netAmount + vatAmount) };
}

/** Suma meses calendario en UTC, sin pasarse de fin de mes (31/01 + 1 = 28/02). */
export function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function addDaysUtc(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
