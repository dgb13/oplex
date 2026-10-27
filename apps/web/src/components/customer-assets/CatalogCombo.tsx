'use client';

import { Input } from '@/components/ui/input';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';

/** "Citroën  C4" / "citroen c4" -> "citroen c4" (mismo criterio que
 * catalogKey en el API). */
export function catalogKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Buscador de una lista de Oplex (marcas, modelos) con "Otra, no está en la
 * lista" al final, que pasa a escribir a mano. El modo a mano lo maneja el
 * formulario (`manual`), porque la aclaración se muestra abajo de todo.
 */
export default function CatalogCombo({
  id,
  value,
  onChange,
  options,
  manual,
  onManualChange,
  otherLabel,
  listTitle,
  disabled,
  disabledPlaceholder,
  searchPlaceholder,
  manualPlaceholder,
  canGoBack = true,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  manual: boolean;
  onManualChange: (manual: boolean) => void;
  /** "Otra, no está en la lista" / "Otro, no está en la lista". */
  otherLabel: string;
  listTitle?: string;
  disabled?: boolean;
  disabledPlaceholder?: string;
  searchPlaceholder: string;
  manualPlaceholder: string;
  /** false: no hay lista a la que volver (el modelo de una marca escrita a mano). */
  canGoBack?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = catalogKey(query);
    return options.filter((o) => !q || catalogKey(o).includes(q));
  }, [options, query]);
  // La última fila es "Otra, no está en la lista".
  const rows = matches.length + 1;

  function pick(option: string) {
    onChange(option);
    setOpen(false);
    setQuery('');
  }

  function goManual() {
    onManualChange(true);
    onChange(query.trim());
    setOpen(false);
    setQuery('');
  }

  if (manual) {
    return (
      <div className="flex flex-col gap-1">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={manualPlaceholder}
          className="border-orange-300 dark:border-orange-800"
          autoFocus
        />
        {canGoBack && (
          <button
            type="button"
            onClick={() => {
              onManualChange(false);
              onChange('');
            }}
            className="self-start text-xs font-medium text-primary hover:text-primary/80"
          >
            Volver a la lista
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={open ? query : value}
        disabled={disabled}
        placeholder={disabled ? disabledPlaceholder : searchPlaceholder}
        autoComplete="off"
        className="pr-9"
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, rows - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open) {
            e.preventDefault();
            if (active < matches.length) pick(matches[active]);
            else goManual();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      {open && !disabled && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border bg-popover py-1 shadow-xl">
          {listTitle && (
            <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{listTitle}</p>
          )}
          {matches.map((option, i) => (
            <button
              key={option}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(option);
              }}
              onMouseEnter={() => setActive(i)}
              className={`block w-full px-3 py-2 text-left text-sm ${i === active ? 'bg-muted' : ''}`}
            >
              {option}
            </button>
          ))}
          {matches.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Ninguno coincide.</p>}
          <div className="mt-1 border-t" />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              goManual();
            }}
            onMouseEnter={() => setActive(matches.length)}
            className={`block w-full px-3 py-2.5 text-left text-sm font-semibold text-orange-700 dark:text-orange-400 ${
              active === matches.length ? 'bg-muted' : ''
            }`}
          >
            {otherLabel}
          </button>
        </div>
      )}
    </div>
  );
}
