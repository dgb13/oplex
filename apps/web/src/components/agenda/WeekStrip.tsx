'use client';

import type { CalendarEntry } from '@/lib/calendar';
import { ENTRY_TYPES } from './FilterChips';

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const EV_BORDER: Record<string, string> = {
  sale: 'border-l-ev-sale',
  collect: 'border-l-ev-collect',
  pay: 'border-l-ev-pay',
  tax: 'border-l-ev-tax',
  prod: 'border-l-ev-prod',
  cash: 'border-l-ev-cash',
  custom: 'border-l-ev-custom',
};

const EV_BG: Record<string, string> = {
  sale: 'bg-ev-sale-bg',
  collect: 'bg-ev-collect-bg',
  pay: 'bg-ev-pay-bg',
  tax: 'bg-ev-tax-bg',
  prod: 'bg-ev-prod-bg',
  cash: 'bg-ev-cash-bg',
  custom: 'bg-ev-custom-bg',
};

function fmtAmount(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lunes de la semana que contiene `dateKey` (YYYY-MM-DD, interpretado en
 * hora local - mismo criterio que toDateKey). */
export function mondayOf(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dow = (date.getDay() + 6) % 7; // lunes = 0
  date.setDate(date.getDate() - dow);
  return date;
}

export function weekDays(dateKey: string): string[] {
  const monday = mondayOf(dateKey);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return toDateKey(d);
  });
}

interface Props {
  selectedDate: string;
  entriesByDate: Map<string, CalendarEntry[]>;
  today: string;
  onSelectDate: (date: string) => void;
}

/** Vista semana (Fase 2, ver docs/plan-agenda.md) - no está en el
 * prototipo aprobado (sus botones Semana/Día son decorativos, sin
 * comportamiento), así que sigue el mismo lenguaje visual de MonthGrid en
 * vez de inventar un patrón nuevo: misma paleta, mismos bordes de color por
 * tipo - a diferencia de una celda de mes, acá entra la lista completa de
 * eventos del día, sin truncar a 3 + "+N más". */
export default function WeekStrip({ selectedDate, entriesByDate, today, onSelectDate }: Props) {
  const days = weekDays(selectedDate);

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((date, i) => {
        const evs = entriesByDate.get(date) ?? [];
        const [, , dayNum] = date.split('-');
        const isToday = date === today;
        const isSelected = date === selectedDate;
        return (
          <button
            key={date}
            type="button"
            onClick={() => onSelectDate(date)}
            className={`flex min-h-[220px] flex-col gap-1.5 rounded-2xl border border-agenda-border bg-agenda-card p-3 text-left transition hover:bg-agenda-card-hover ${
              isSelected ? 'ring-2 ring-inset ring-agenda-violet' : ''
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-agenda-text-faint uppercase">{DOW_LABELS[i]}</span>
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[13px] font-medium ${
                  isToday ? 'bg-agenda-violet font-bold text-white' : 'text-agenda-text-dim'
                }`}
              >
                {Number(dayNum)}
              </span>
            </div>
            {evs.map((ev) => (
              <div
                key={ev.id}
                className={`flex items-center gap-1.5 overflow-hidden rounded-md border-l-[2.5px] px-1.5 py-0.5 text-[11.5px] text-agenda-text ${EV_BORDER[ev.source]} ${EV_BG[ev.source]}`}
                title={`${ENTRY_TYPES[ev.source].label} · ${ev.title}`}
              >
                <span className="truncate">{ev.title}</span>
                {ev.amount != null && (
                  <span className="ml-auto shrink-0 font-mono text-[10.5px] text-agenda-text-dim tabular-nums">
                    {fmtAmount(ev.amount)}
                  </span>
                )}
              </div>
            ))}
          </button>
        );
      })}
    </div>
  );
}
