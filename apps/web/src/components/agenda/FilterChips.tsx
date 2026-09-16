'use client';

import type { CalendarEntrySource } from '@/lib/calendar';

export interface EntryTypeMeta {
  label: string;
  dot: string; // clase Tailwind bg-ev-*
}

export const ENTRY_TYPES: Record<CalendarEntrySource, EntryTypeMeta> = {
  sale: { label: 'Facturación', dot: 'bg-ev-sale' },
  collect: { label: 'Cobros', dot: 'bg-ev-collect' },
  pay: { label: 'Pagos', dot: 'bg-ev-pay' },
  tax: { label: 'Impuestos', dot: 'bg-ev-tax' },
  prod: { label: 'Producción', dot: 'bg-ev-prod' },
  cash: { label: 'Caja', dot: 'bg-ev-cash' },
  custom: { label: 'Propios', dot: 'bg-ev-custom' },
};

// Fase 2 (ver plan) - las 7 fuentes ya alimentan datos reales, ningún chip
// queda deshabilitado.
const ALL_SOURCES = Object.keys(ENTRY_TYPES) as CalendarEntrySource[];

interface Props {
  active: Set<CalendarEntrySource>;
  onToggle: (source: CalendarEntrySource) => void;
}

export default function FilterChips({ active, onToggle }: Props) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {ALL_SOURCES.map((source) => {
        const meta = ENTRY_TYPES[source];
        const isActive = active.has(source);
        return (
          <button
            key={source}
            type="button"
            onClick={() => onToggle(source)}
            className={`flex items-center gap-1.5 rounded-full border border-agenda-border bg-agenda-card px-3 py-1.5 text-xs text-agenda-text-dim transition select-none ${
              isActive ? '' : 'opacity-40 hover:border-agenda-text-faint'
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
