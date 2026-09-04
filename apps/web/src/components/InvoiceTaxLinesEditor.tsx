'use client';

import type { InvoiceTaxLineInput, InvoiceTaxLineKind } from '@/lib/invoicing';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

// PROVINCIAL (Percepción IIBB) primero - la opción más común en la
// práctica, ver AFIP_TRIBUTO_ID en el backend para el código real que
// recibe cada una.
const TAX_LINE_KIND_LABELS: Record<InvoiceTaxLineKind, string> = {
  PROVINCIAL: 'Percepción IIBB (provincial)',
  NATIONAL: 'Impuesto nacional',
  MUNICIPAL: 'Impuesto municipal',
  INTERNAL: 'Impuesto interno',
  OTHER: 'Otro',
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function defaultTaxLine(): InvoiceTaxLineInput {
  return { kind: 'PROVINCIAL', concept: 'Percepción IIBB', amount: 0 };
}

/** Editor de "otros tributos" (percepciones, ej. IIBB) de una factura de
 * venta - mismo patrón visual que el editor de IVA/Percepciones de Compras
 * (NewPurchaseInvoiceModal), pero sin la rama IVA_CREDITO (acá el IVA ya se
 * resuelve por línea, esto es sólo lo adicional que AFIP transmite en
 * Tributos[]). amount se auto-sugiere desde baseAmount×rate cuando ambos
 * están cargados, pero queda editable igual - mismo criterio que
 * computeIvaAmount del lado Compras. */
export default function InvoiceTaxLinesEditor({
  lines,
  onChange,
}: {
  lines: InvoiceTaxLineInput[];
  onChange: (lines: InvoiceTaxLineInput[]) => void;
}) {
  function update(index: number, patch: Partial<InvoiceTaxLineInput>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function updateAmountInputs(index: number, patch: { baseAmount?: number; rate?: number }) {
    onChange(
      lines.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        const suggested =
          next.baseAmount != null && next.rate != null ? round2((next.baseAmount * next.rate) / 100) : next.amount;
        return { ...next, amount: suggested };
      }),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-600 dark:text-slate-400">Otros tributos (percepciones)</label>
        <button
          type="button"
          onClick={() => onChange([...lines, defaultTaxLine()])}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          + agregar tributo
        </button>
      </div>
      {lines.map((line, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-lg border border-slate-200 dark:border-slate-800 p-2">
          <div className="flex items-center gap-2">
            <select
              className={`${inputClass} w-56`}
              value={line.kind}
              onChange={(e) => {
                const kind = e.target.value as InvoiceTaxLineKind;
                update(i, { kind, concept: TAX_LINE_KIND_LABELS[kind] });
              }}
            >
              {(Object.keys(TAX_LINE_KIND_LABELS) as InvoiceTaxLineKind[]).map((k) => (
                <option key={k} value={k}>
                  {TAX_LINE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Concepto, p. ej. Percepción IIBB Buenos Aires"
              className={`${inputClass} flex-1`}
              value={line.concept}
              onChange={(e) => update(i, { concept: e.target.value })}
            />
            <button
              type="button"
              onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="any"
              placeholder="Base imponible"
              title="Base imponible (opcional)"
              className={`${inputClass} w-32 text-right`}
              value={line.baseAmount ?? ''}
              onChange={(e) =>
                updateAmountInputs(i, { baseAmount: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
            <input
              type="number"
              min={0}
              step="any"
              placeholder="% alícuota"
              title="Alícuota (opcional)"
              className={`${inputClass} w-24 text-right`}
              value={line.rate ?? ''}
              onChange={(e) =>
                updateAmountInputs(i, { rate: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
            <input
              type="number"
              min={0}
              step="any"
              placeholder="Monto"
              title="Monto a cobrar - se sugiere solo desde Base×Alícuota, se puede ajustar"
              className={`${inputClass} flex-1 text-right`}
              value={line.amount}
              onChange={(e) => update(i, { amount: Number(e.target.value) })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
