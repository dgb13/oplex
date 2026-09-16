'use client';

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';

export interface PosSelectOption {
  value: string;
  label: string;
}

interface PosSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly PosSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Reemplazo de <select> nativo para el POS - mismo problema que
 * components/ui/Select.tsx (el popup de opciones de un <select> nativo lo
 * pinta el SO/navegador, no nuestro CSS), pero ese componente usa los
 * tokens semánticos del resto de la app (bg-popover, etc.) que no
 * reaccionan al tema propio del POS (`data-pos-theme`, ver pos-theme.tsx -
 * totalmente desacoplado del `.dark` global). Esta variante repite el
 * mismo patrón de clases pos-dark:/pos-contrast:/pos-emerald: que ya usa
 * el resto del módulo (ver `inputClass` en CreateRegisterModal.tsx /
 * CheckoutModal.tsx) para que el popup respete el estilo elegido con
 * PosThemePicker. */
export default function PosSelect({ value, onChange, options, placeholder, disabled, className }: PosSelectProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className ?? ''}`}>
        <ListboxButton
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 disabled:opacity-50 pos-dark:border-slate-600 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-dark:focus:border-indigo-400 pos-contrast:border-slate-600 pos-contrast:bg-slate-900 pos-contrast:text-white pos-contrast:focus:border-amber-400 pos-emerald:border-emerald-200 pos-emerald:bg-emerald-50 pos-emerald:text-slate-900 pos-emerald:focus:border-emerald-500"
        >
          <span className={`truncate ${selected ? '' : 'text-slate-400 pos-dark:text-slate-500 pos-contrast:text-slate-400 pos-emerald:text-slate-400'}`}>
            {selected ? selected.label : (placeholder ?? 'Elegir...')}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 pos-dark:text-slate-500 pos-contrast:text-slate-400 pos-emerald:text-slate-400" />
        </ListboxButton>
        {/* z-[80]: mismo criterio que components/ui/Select.tsx - vive fuera
         * del modal (portal de Headless UI) y compite en stacking contra
         * el modal entero, no sólo contra su contenido. */}
        <ListboxOptions
          anchor="bottom start"
          className="z-[80] mt-1 max-h-72 min-w-[var(--button-width)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-2xl outline-none pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-contrast:border-slate-700 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white"
        >
          {options.map((o) => (
            <ListboxOption
              key={o.value}
              value={o.value}
              className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-slate-900 data-[focus]:bg-slate-100 pos-dark:text-slate-100 pos-dark:data-[focus]:bg-slate-800 pos-contrast:text-white pos-contrast:data-[focus]:bg-slate-800 pos-emerald:text-slate-900 pos-emerald:data-[focus]:bg-emerald-50"
            >
              {({ selected: isSelected }) => (
                <>
                  <span className="truncate">{o.label}</span>
                  {isSelected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600 pos-contrast:text-amber-400 pos-emerald:text-emerald-600" />
                  )}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
