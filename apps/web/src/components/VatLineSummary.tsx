'use client';

import type { VatKind } from './VatRateSelect';

export interface VatSummaryLine {
  articleVariantId: string;
  quantity: number;
  unitPrice?: number;
  taxKind?: VatKind;
  taxRate?: number;
}

const ZERO_BUCKET = { vat21: 0, vat10_5: 0, vat27: 0, vatOther: 0 };

function bucketRate(rate: number, amount: number, into: typeof ZERO_BUCKET): void {
  if (Math.abs(rate - 21) < 0.01) into.vat21 += amount;
  else if (Math.abs(rate - 10.5) < 0.01) into.vat10_5 += amount;
  else if (Math.abs(rate - 27) < 0.01) into.vat27 += amount;
  else into.vatOther += amount;
}

/** Preview en el cliente del desglose Neto/IVA por alícuota, con la misma
 * fórmula que el backend (InvoicingService/QuoteService - ver
 * resolveLineTax/pricesIncludeTax): sin descuento de línea/global, porque
 * ninguno de los dos formularios que usan esto expone esos campos hoy. Sólo
 * para mostrar un total en vivo antes de guardar - el cálculo real y
 * definitivo lo hace el backend al crear el comprobante. Compartido entre
 * Facturación y Cotizaciones (a diferencia del backend, que sí duplica esta
 * lógica entre InvoicingService/QuoteService por la regla de "un lib module
 * nunca importa el Service de otro módulo" - acá no aplica esa regla). */
export function computeLineTotals(line: VatSummaryLine, pricesIncludeTax: boolean) {
  const rate = line.taxRate ?? 0;
  const kind = line.taxKind ?? 'GRAVADO';
  const rawUnitPrice = line.unitPrice ?? 0;
  const unitPrice =
    pricesIncludeTax && kind === 'GRAVADO' && rate > 0 ? rawUnitPrice / (1 + rate / 100) : rawUnitPrice;
  const netAmount = unitPrice * (line.quantity || 0);
  const taxAmount = kind === 'GRAVADO' ? (netAmount * rate) / 100 : 0;
  return { netAmount, taxAmount, taxRate: rate, taxKind: kind, lineTotal: netAmount + taxAmount };
}

/** Resumen Neto + IVA por alícuota + Total, mismas columnas que el Libro
 * IVA - preview en vivo antes de guardar/emitir. otherTaxLines (opcional,
 * sólo lo pasa Facturación - Cotizaciones no tiene percepciones) suma una
 * columna más y entra al Total, igual que hace el backend en
 * InvoicingService.createInvoice. */
export default function VatLineSummary({
  lines,
  pricesIncludeTax,
  otherTaxLines,
}: {
  lines: VatSummaryLine[];
  pricesIncludeTax: boolean;
  otherTaxLines?: { amount: number }[];
}) {
  let netTaxed = 0;
  let netExempt = 0;
  const buckets = { ...ZERO_BUCKET };
  for (const line of lines) {
    if (!line.articleVariantId) continue;
    const { netAmount, taxAmount, taxRate, taxKind } = computeLineTotals(line, pricesIncludeTax);
    if (taxKind === 'GRAVADO') {
      netTaxed += netAmount;
      bucketRate(taxRate, taxAmount, buckets);
    } else {
      netExempt += netAmount;
    }
  }
  const vatTotal = buckets.vat21 + buckets.vat10_5 + buckets.vat27 + buckets.vatOther;
  const otherTaxesTotal = (otherTaxLines ?? []).reduce((sum, l) => sum + (l.amount || 0), 0);
  const total = netTaxed + netExempt + vatTotal + otherTaxesTotal;
  const money = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-6">
      <Stat label="Neto Grav." value={money(netTaxed)} />
      <Stat label="Exento/No Grav." value={money(netExempt)} />
      <Stat label="IVA 21%" value={money(buckets.vat21)} />
      <Stat label="IVA 10,5%" value={money(buckets.vat10_5)} />
      <Stat label="IVA 27%/Otras" value={money(buckets.vat27 + buckets.vatOther)} />
      {otherTaxLines != null && <Stat label="Otros tributos" value={money(otherTaxesTotal)} />}
      <Stat label="Total" value={money(total)} bold />
    </div>
  );
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p>{label}</p>
      <p className={bold ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}>
        {value}
      </p>
    </div>
  );
}
