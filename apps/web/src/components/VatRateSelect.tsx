'use client';

import Select from '@/components/ui/Select';

export type VatKind = 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';

export interface VatValue {
  taxKind: VatKind;
  taxRate: number;
}

// Alícuotas de IVA vigentes en Argentina - mismo set ya construido y
// probado en Chrome para Compras (NewPurchaseInvoiceModal) - "Otra" cubre
// cualquier caso fuera de este set (p. ej. combustibles, regímenes
// especiales). Exento/No Gravado son clasificaciones fiscales propias
// (TaxLineKind), no una tasa - se listan aparte de los porcentajes.
const STANDARD_VAT_RATES = [21, 10.5, 27, 5, 2.5, 0];
const OTHER_RATE = 'OTRA';

function formatRate(rate: number): string {
  return rate.toString().replace('.', ',');
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

/** Selector de alícuota/clasificación de IVA compartido entre Facturación
 * y Cotizaciones - extraído del patrón ya probado en Compras para no
 * reescribir el mismo select 3 veces. A diferencia de Compras (que sólo
 * carga IVA Crédito con tasa), acá también hace falta Exento/No Gravado
 * como opciones de primer nivel, porque una línea de Factura/Cotización
 * puede ser cualquiera de las 3 clasificaciones (TaxLineKind), no sólo
 * "gravado a tal tasa". */
export default function VatRateSelect({
  value,
  onChange,
  className,
}: {
  value: VatValue;
  onChange: (value: VatValue) => void;
  className?: string;
}) {
  const isStandardRate = value.taxKind === 'GRAVADO' && STANDARD_VAT_RATES.includes(value.taxRate);
  const selectValue =
    value.taxKind === 'EXENTO' ? 'EXENTO' : value.taxKind === 'NO_GRAVADO' ? 'NO_GRAVADO' : isStandardRate ? String(value.taxRate) : OTHER_RATE;

  return (
    <div className={`flex items-center gap-1 ${className ?? ''}`}>
      <Select
        className="w-32"
        value={selectValue}
        onChange={(v) => {
          if (v === 'EXENTO' || v === 'NO_GRAVADO') {
            onChange({ taxKind: v, taxRate: 0 });
          } else if (v === OTHER_RATE) {
            onChange({ taxKind: 'GRAVADO', taxRate: value.taxRate });
          } else {
            onChange({ taxKind: 'GRAVADO', taxRate: Number(v) });
          }
        }}
        options={[
          ...STANDARD_VAT_RATES.map((r) => ({ value: String(r), label: `IVA ${formatRate(r)}%` })),
          { value: 'EXENTO', label: 'Exento' },
          { value: 'NO_GRAVADO', label: 'No Gravado' },
          { value: OTHER_RATE, label: 'Otra alícuota' },
        ]}
      />
      {selectValue === OTHER_RATE && (
        <input
          type="number"
          min={0}
          max={100}
          step="any"
          placeholder="%"
          className={`${inputClass} w-16 text-right`}
          value={value.taxRate}
          onChange={(e) => onChange({ taxKind: 'GRAVADO', taxRate: Number(e.target.value) })}
        />
      )}
    </div>
  );
}
