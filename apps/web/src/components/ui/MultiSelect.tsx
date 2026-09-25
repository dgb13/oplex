'use client';

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import type { SelectOption } from './Select';

interface MultiSelectProps {
  value: readonly string[];
  onChange: (value: string[]) => void;
  options: readonly SelectOption[];
  // Texto del botón cuando no hay nada elegido.
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Variante de selección múltiple de components/ui/Select.tsx (mismo
 * aspecto, mismo z-[80] - ver el comentario ahí). Reemplaza al
 * <select multiple> nativo, que además del popup pintado por el SO obligaba
 * a Ctrl+click para elegir más de uno: acá cada click en una opción la
 * agrega o la quita, y la lista queda abierta para seguir eligiendo. */
export default function MultiSelect({ value, onChange, options, placeholder, disabled, className }: MultiSelectProps) {
  const selectedLabels = options.filter((o) => value.includes(o.value)).map((o) => o.label);

  return (
    <Listbox value={[...value]} onChange={onChange} disabled={disabled} multiple>
      <div className={`relative ${className ?? ''}`}>
        <ListboxButton className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50">
          <span className={`truncate ${selectedLabels.length > 0 ? '' : 'text-muted-foreground'}`}>
            {selectedLabels.length > 0 ? selectedLabels.join(', ') : (placeholder ?? 'Elegir...')}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="z-[80] mt-1 max-h-72 min-w-[var(--button-width)] overflow-y-auto rounded-xl border bg-popover py-1 shadow-xl outline-none"
        >
          {options.map((o) => (
            <ListboxOption
              key={o.value}
              value={o.value}
              className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-popover-foreground data-[focus]:bg-muted"
            >
              {({ selected }) => (
                <>
                  <span className="truncate">{o.label}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
