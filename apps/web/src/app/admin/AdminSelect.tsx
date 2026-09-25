'use client';

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';

export interface AdminSelectOption {
  value: string;
  label: string;
}

interface AdminSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly AdminSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  // Reemplaza el aspecto del botón (tamaño/fondo) - mismo criterio que
  // buttonClassName en components/ui/Select.tsx.
  buttonClassName?: string;
}

const BUTTON_LAYOUT = 'flex w-full items-center justify-between gap-2 outline-none disabled:opacity-50';
const DEFAULT_BUTTON_LOOK =
  'rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 focus:border-indigo-500';

/** Reemplazo de <select> nativo para el Backoffice (/admin) - mismo
 * problema que components/ui/Select.tsx (el popup de un <select> nativo lo
 * pinta el SO/navegador), pero ese componente usa los tokens semánticos
 * del tema global (bg-popover, etc.), y el layout de /admin es SIEMPRE
 * oscuro (slate-950 fijo, ver admin/layout.tsx) sin importar el tema
 * elegido - en modo claro el popup hubiera salido blanco sobre una página
 * oscura. Misma idea que PosSelect para el tema propio del POS. */
export default function AdminSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  buttonClassName,
}: AdminSelectProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className ?? ''}`}>
        <ListboxButton className={`${BUTTON_LAYOUT} ${buttonClassName ?? DEFAULT_BUTTON_LOOK}`}>
          <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>
            {selected ? selected.label : (placeholder ?? 'Elegir...')}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        </ListboxButton>
        {/* z-[80]: mismo criterio que components/ui/Select.tsx - el popup
         * vive en un portal y compite contra los modales enteros. */}
        <ListboxOptions
          anchor="bottom start"
          className="z-[80] mt-1 max-h-72 min-w-[var(--button-width)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl outline-none"
        >
          {options.map((o) => (
            <ListboxOption
              key={o.value}
              value={o.value}
              className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-slate-100 data-[focus]:bg-slate-800"
            >
              {({ selected: isSelected }) => (
                <>
                  <span className="truncate">{o.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-indigo-400" />}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
