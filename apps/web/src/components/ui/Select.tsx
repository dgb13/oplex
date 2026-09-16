'use client';

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Reemplazo de <select> nativo - un <select> sin estilo muestra el popup
 * de opciones pintado por el SO/navegador, no por nuestro CSS (no
 * respeta `color-scheme` de la app), lo que en modo oscuro daba letras
 * blancas sobre fondo blanco (reportado por el usuario) - imposible de
 * arreglar de verdad sólo con clases en el <select>. Mismo lenguaje
 * visual que el popup de ArticlePicker (Combobox de Headless UI, ya
 * usado en el resto de la app): rounded-xl/border/shadow-xl/bg-popover,
 * ChevronDown, hover con bg-muted, tilde en la opción elegida. */
export default function Select({ value, onChange, options, placeholder, disabled, className }: SelectProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className ?? ''}`}>
        <ListboxButton
          className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <span className={`truncate ${selected ? '' : 'text-muted-foreground'}`}>
            {selected ? selected.label : (placeholder ?? 'Elegir...')}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </ListboxButton>
        {/* z-[80]: este Select se usa dentro de modales con z-[70]
         * (ArticleFormModal/PersonAvatarModal, el máximo hoy en la app) -
         * el popup vive fuera de ese contenedor (portal de Headless UI),
         * así que compite por stacking contra el modal entero, no sólo
         * contra su contenido - necesita ganarle a ese z-index, no sólo
         * usar uno "alto" arbitrario (bug real: con z-[60] el modal lo
         * tapaba por completo, encontrado probando en vivo). */}
        {/* min-w, no w: el botón se angosta al ancho de la opción
         * ELEGIDA (ej. "Todos"), no de la más larga del listado (ej.
         * "Endosado") - con un ancho fijo el popup truncaba las opciones
         * más largas que la seleccionada actual (bug real, visto en
         * "Cartera de Cheques" y "Vencimientos" con listas de estados). */}
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
              {({ selected: isSelected }) => (
                <>
                  <span className="truncate">{o.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
