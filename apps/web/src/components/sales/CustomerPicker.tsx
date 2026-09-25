'use client';

import type { Company } from '@/lib/companies';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Cliente de un comprobante de venta: buscador por nombre/CUIT y, una vez
 * elegido, una tarjeta con sus datos fiscales. Arranca VACÍO a propósito -
 * los formularios viejos preseleccionaban el primer cliente de la lista y
 * era muy fácil cotizarle/facturarle al que no era sin darse cuenta.
 */
export default function CustomerPicker({
  customers,
  value,
  onChange,
  autoFocus,
  onPicked,
}: {
  customers: Company[];
  value: string;
  onChange: (customerId: string) => void;
  autoFocus?: boolean;
  // Para mover el foco al siguiente paso (la búsqueda de artículos).
  onPicked?: () => void;
}) {
  const selected = customers.find((c) => c.id === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // "Cambiar" desmonta la tarjeta y monta el buscador - el foco va recién
  // cuando el input existe.
  const [focusSearch, setFocusSearch] = useState(false);
  useEffect(() => {
    if (focusSearch && inputRef.current) {
      inputRef.current.focus();
      setFocusSearch(false);
    }
  }, [focusSearch, value]);

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const digits = query.replace(/\D/g, '');
    return customers.filter((c) => {
      const haystack = c.name.toLowerCase();
      const byName = words.every((w) => haystack.includes(w));
      const byTaxId = digits.length >= 3 && (c.taxId ?? '').replace(/\D/g, '').includes(digits);
      return byName || byTaxId;
    });
  }, [customers, query]);

  function pick(id: string) {
    onChange(id);
    setQuery('');
    setOpen(false);
    setActive(0);
    onPicked?.();
  }

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary">
          {selected.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{selected.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {selected.taxId ? `CUIT ${selected.taxId}` : 'Sin CUIT cargado'}
            {' · '}
            {selected.taxCondition ?? 'Condición IVA sin cargar'}
            {selected.email ? ` · ${selected.email}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange('');
            setOpen(true);
            setFocusSearch(true);
          }}
          className="shrink-0 text-xs font-medium text-primary hover:text-primary/80"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            const match = matches[active];
            if (match) pick(match.id);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder="Buscá el cliente por nombre o CUIT"
        autoFocus={autoFocus}
        className="h-11 w-full rounded-xl border bg-card pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        autoComplete="off"
      />
      {open && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border bg-popover py-1 shadow-xl">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Ningún cliente coincide. Usá &quot;+ Nuevo cliente&quot;.
            </p>
          ) : (
            matches.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                  i === active ? 'bg-muted' : ''
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.taxId ?? 'sin CUIT'}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
