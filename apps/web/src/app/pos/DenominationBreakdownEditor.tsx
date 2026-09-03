'use client';

import { ARS_DENOMINATIONS } from '@/lib/arsDenominations';
import type { DenominationBreakdownItem } from '@/lib/pos';

const DENOMINATION_LABEL: Record<'BILL' | 'COIN', string> = { BILL: 'Billete', COIN: 'Moneda' };

/** Filas de conteo por denominación, estilo Odoo - factorizado acá (Fase 3)
 * porque tanto CloseSessionModal como OpenSessionModal necesitan la misma
 * UI (input de cantidad + subtotal por fila, dentro de una lista con
 * scroll). `counts` es un Record indexado por posición en ARS_DENOMINATIONS
 * (mismo criterio que ya usaban ambos modales antes de la extracción). */
export default function DenominationBreakdownEditor({
  counts,
  onChange,
}: {
  counts: Record<number, string>;
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
      {ARS_DENOMINATIONS.map((d, i) => {
        const count = counts[i] ?? '';
        const subtotal = d.value * (Number(count) || 0);
        return (
          <div key={`${d.kind}-${d.value}`} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
              {DENOMINATION_LABEL[d.kind]} ${d.value}
            </span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={count}
              onChange={(e) => onChange(i, e.target.value)}
              placeholder="0"
              className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm outline-none focus:border-indigo-500 pos-dark:border-slate-600 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-dark:focus:border-indigo-400 pos-contrast:border-slate-600 pos-contrast:bg-slate-900 pos-contrast:text-white pos-contrast:focus:border-amber-400 pos-emerald:border-emerald-200 pos-emerald:bg-white pos-emerald:focus:border-emerald-500"
            />
            <span className="flex-1 text-right text-xs text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
              ${subtotal.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Total en vivo del desglose (Σ denomination × count) - misma cuenta que
 * el servidor recalcula de forma autoritativa (ver CashSessionsService),
 * este helper es sólo para mostrarlo mientras se cuenta. */
export function breakdownTotal(counts: Record<number, string>): number {
  return ARS_DENOMINATIONS.reduce((sum, d, i) => sum + d.value * (Number(counts[i]) || 0), 0);
}

/** Arma el payload denominationBreakdown a partir de los counts de la UI,
 * descartando filas en 0 - lo que mandan tanto CloseSessionModal como
 * OpenSessionModal al servidor cuando el cajero usa el modo "Desglose". */
export function buildDenominationBreakdown(counts: Record<number, string>): DenominationBreakdownItem[] {
  return ARS_DENOMINATIONS.map((d, i) => ({ kind: d.kind, denomination: d.value, count: Number(counts[i]) || 0 })).filter(
    (item) => item.count > 0,
  );
}
