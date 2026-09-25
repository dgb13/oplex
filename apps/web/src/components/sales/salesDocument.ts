import { computeLineTotals } from '@/components/VatLineSummary';
import type { VatKind } from '@/components/VatRateSelect';

/** Línea de un comprobante de venta mientras se edita (Nueva cotización /
 * Nueva factura) - forma común a QuoteLineInput y CreateSaleLineInput, cada
 * formulario la mapea a su DTO al guardar. `key` es sólo para React (una
 * línea no tiene id propio hasta guardarse). */
export interface SalesLine {
  key: string;
  articleVariantId: string;
  quantity: number;
  unitPrice: number;
  taxKind: VatKind;
  taxRate: number;
  // Detalle libre de la línea (sólo Cotizaciones lo persiste hoy).
  notes?: string;
}

let lineSeq = 0;
export function newLineKey(): string {
  lineSeq += 1;
  return `line-${lineSeq}`;
}

export function currencySymbol(code: string | undefined): string {
  if (!code || code === 'ARS') return '$';
  if (code === 'USD') return 'US$';
  return code;
}

const AMOUNT_FORMAT = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatAmount(value: number, currencyCode?: string): string {
  return `${currencySymbol(currencyCode)} ${AMOUNT_FORMAT.format(value)}`;
}

export function formatRate(rate: number): string {
  return rate.toString().replace('.', ',');
}

export interface SalesTotals {
  netTaxed: number;
  netExempt: number;
  // IVA por alícuota, ordenado de mayor a menor - sólo las que tienen monto.
  vatByRate: { rate: number; amount: number }[];
  otherTaxes: number;
  total: number;
  lineCount: number;
}

/** Mismo cálculo que VatLineSummary (y que el backend al guardar) - sólo
 * preview en vivo; el total definitivo lo calcula el backend. */
export function computeSalesTotals(
  lines: SalesLine[],
  pricesIncludeTax: boolean,
  otherTaxLines?: { amount: number }[],
): SalesTotals {
  let netTaxed = 0;
  let netExempt = 0;
  const vat = new Map<number, number>();
  let lineCount = 0;
  for (const line of lines) {
    if (!line.articleVariantId) continue;
    lineCount += 1;
    const { netAmount, taxAmount, taxRate, taxKind } = computeLineTotals(line, pricesIncludeTax);
    if (taxKind === 'GRAVADO') {
      netTaxed += netAmount;
      if (taxAmount > 0) vat.set(taxRate, (vat.get(taxRate) ?? 0) + taxAmount);
    } else {
      netExempt += netAmount;
    }
  }
  const vatByRate = Array.from(vat, ([rate, amount]) => ({ rate, amount })).sort((a, b) => b.rate - a.rate);
  const vatTotal = vatByRate.reduce((sum, v) => sum + v.amount, 0);
  const otherTaxes = (otherTaxLines ?? []).reduce((sum, l) => sum + (l.amount || 0), 0);
  return {
    netTaxed,
    netExempt,
    vatByRate,
    otherTaxes,
    total: netTaxed + netExempt + vatTotal + otherTaxes,
    lineCount,
  };
}
