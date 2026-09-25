'use client';

import { currencySymbol, formatAmount, formatRate, type SalesTotals } from './salesDocument';

const AMOUNT_FORMAT = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Totales en vivo del panel lateral: neto, IVA por alícuota (sólo las que
 * aparecen), otros tributos si hay, y el total grande. */
export default function SalesTotalsPanel({ totals, currencyCode }: { totals: SalesTotals; currencyCode?: string }) {
  const row = (label: string, value: number) => (
    <div className="flex justify-between gap-3 text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{formatAmount(value, currencyCode)}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5 border-t pt-4">
      <p className="text-xs text-muted-foreground">
        {totals.lineCount === 0
          ? 'Sin artículos todavía'
          : `${totals.lineCount} artículo${totals.lineCount === 1 ? '' : 's'}`}
      </p>
      {row('Neto gravado', totals.netTaxed)}
      {totals.netExempt > 0 && row('Exento / no gravado', totals.netExempt)}
      {totals.vatByRate.map((v) => (
        <div key={v.rate}>{row(`IVA ${formatRate(v.rate)}%`, v.amount)}</div>
      ))}
      {totals.otherTaxes > 0 && row('Otros tributos', totals.otherTaxes)}
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold">Total</span>
        <span className="text-2xl font-bold tabular-nums">
          <span className="mr-1 text-sm font-medium text-muted-foreground">{currencySymbol(currencyCode)}</span>
          {AMOUNT_FORMAT.format(totals.total)}
        </span>
      </div>
    </div>
  );
}
