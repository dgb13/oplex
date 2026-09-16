'use client';

import type { CalendarEntry } from '@/lib/calendar';
import { Trash2 } from 'lucide-react';
import { ENTRY_TYPES } from './FilterChips';

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const EV_TAG_TEXT: Record<string, string> = {
  sale: 'text-ev-sale',
  collect: 'text-ev-collect',
  pay: 'text-ev-pay',
  tax: 'text-ev-tax',
  prod: 'text-ev-prod',
  cash: 'text-ev-cash',
  custom: 'text-ev-custom',
};

const EV_TAG_BG: Record<string, string> = {
  sale: 'bg-ev-sale-bg',
  collect: 'bg-ev-collect-bg',
  pay: 'bg-ev-pay-bg',
  tax: 'bg-ev-tax-bg',
  prod: 'bg-ev-prod-bg',
  cash: 'bg-ev-cash-bg',
  custom: 'bg-ev-custom-bg',
};

const EV_BAR: Record<string, string> = {
  sale: 'bg-ev-sale',
  collect: 'bg-ev-collect',
  pay: 'bg-ev-pay',
  tax: 'bg-ev-tax',
  prod: 'bg-ev-prod',
  cash: 'bg-ev-cash',
  custom: 'bg-ev-custom',
};

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

function dayTitle(date: string, today: string): string {
  const [, m, d] = date.split('-').map(Number);
  const label = `${d} ${MONTH_ABBR[m - 1]}`;
  return date === today ? `Hoy, ${label}` : label;
}

interface Props {
  date: string;
  today: string;
  entries: CalendarEntry[];
  onDeleteEvent: (id: string) => void;
  onAddEvent: () => void;
}

export default function DayPanel({ date, today, entries, onDeleteEvent, onAddEvent }: Props) {
  const totalIn = entries.filter((e) => e.flow === 'in' && e.amount != null).reduce((s, e) => s + (e.amount ?? 0), 0);
  const totalOut = entries.filter((e) => e.flow === 'out' && e.amount != null).reduce((s, e) => s + (e.amount ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-agenda-border bg-agenda-card p-4">
        <h3 className="mb-3.5 flex items-center justify-between text-[11px] font-bold tracking-wide text-agenda-text-faint uppercase">
          <span>{dayTitle(date, today)}</span>
          <span className="rounded-full bg-agenda-violet-soft px-2 py-0.5 text-[11px] font-normal tracking-normal text-agenda-violet-dim">
            {entries.length}
          </span>
        </h3>
        {entries.length === 0 ? (
          <p className="py-5 text-center text-sm text-agenda-text-faint">Nada agendado este día.</p>
        ) : (
          <div>
            {entries.map((ev) => {
              const meta = ENTRY_TYPES[ev.source];
              return (
                <div key={ev.id} className="flex gap-2.5 border-b border-agenda-border-soft py-2.5 last:border-b-0 last:pb-0">
                  <div className={`w-[3px] shrink-0 rounded-full ${EV_BAR[ev.source]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 truncate text-[13.5px] font-medium text-agenda-text">{ev.title}</div>
                    <div className="flex items-center gap-2 text-xs text-agenda-text-dim">
                      <span className={`rounded px-1.5 py-px text-[10.5px] font-semibold ${EV_TAG_TEXT[ev.source]} ${EV_TAG_BG[ev.source]}`}>
                        {meta.label}
                      </span>
                      {ev.ref && <span className="truncate">{ev.ref}</span>}
                    </div>
                  </div>
                  {ev.amount != null && (
                    <div
                      className={`shrink-0 self-center font-mono text-[13.5px] font-semibold tabular-nums ${
                        ev.flow === 'in' ? 'text-ev-prod' : 'text-ev-pay'
                      }`}
                    >
                      {ev.flow === 'in' ? '+' : '−'}
                      {fmtMoney(ev.amount)}
                    </div>
                  )}
                  {ev.editable && (
                    <button
                      type="button"
                      onClick={() => onDeleteEvent(ev.id)}
                      title="Borrar"
                      className="shrink-0 self-center text-agenda-text-faint transition hover:text-ev-pay"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-agenda-border bg-agenda-card p-4">
        <h3 className="mb-3.5 text-[11px] font-bold tracking-wide text-agenda-text-faint uppercase">Balance del día</h3>
        <div className="flex gap-2.5">
          <div className="flex-1 rounded-lg border border-agenda-border-soft bg-agenda-bg p-3">
            <div className="mb-1 text-[11px] text-agenda-text-faint">A cobrar</div>
            <div className="font-mono text-lg font-bold tabular-nums text-ev-prod">{fmtMoney(totalIn)}</div>
          </div>
          <div className="flex-1 rounded-lg border border-agenda-border-soft bg-agenda-bg p-3">
            <div className="mb-1 text-[11px] text-agenda-text-faint">A pagar</div>
            <div className="font-mono text-lg font-bold tabular-nums text-ev-pay">{fmtMoney(totalOut)}</div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onAddEvent}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-agenda-border py-2.5 text-sm font-medium text-agenda-text-dim transition hover:border-agenda-violet hover:bg-agenda-violet-soft hover:text-agenda-violet-dim"
      >
        <span className="text-base leading-none">+</span> Agregar evento propio
      </button>
    </div>
  );
}
