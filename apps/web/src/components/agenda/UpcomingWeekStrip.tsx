'use client';

import { calendarApi } from '@/lib/calendar';
import { resolveCalendarLink } from '@/lib/calendarLinks';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ENTRY_TYPES } from './FilterChips';

const EV_BORDER: Record<string, string> = {
  sale: 'border-l-ev-sale',
  collect: 'border-l-ev-collect',
  pay: 'border-l-ev-pay',
  tax: 'border-l-ev-tax',
  prod: 'border-l-ev-prod',
  cash: 'border-l-ev-cash',
  custom: 'border-l-ev-custom',
};

function fmtAmount(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

function fmtDay(date: string): string {
  const [, m, d] = date.slice(0, 10).split('-');
  const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${Number(d)} ${MONTH_ABBR[Number(m) - 1]}`;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Vencimientos de esta semana" (Fase 2, ver docs/plan-agenda.md) - franja
 * fija arriba del calendario, siempre sobre HOY→+6 días sin importar qué
 * mes/semana/día se esté navegando abajo (gancho explícito del plan para un
 * futuro panel de estudio contable vía `assignedTo`, sin ese filtro
 * todavía). Query propia, independiente de la del calendario principal. */
export default function UpcomingWeekStrip() {
  const today = new Date();
  const from = toDateKey(today);
  const toDate = new Date(today);
  toDate.setDate(toDate.getDate() + 6);
  const to = toDateKey(toDate);

  const query = useQuery({
    queryKey: ['calendar-entries', from, to, 'upcoming-week'],
    queryFn: () => calendarApi.getEntries({ from, to }),
  });

  const entries = query.data ?? [];
  if (entries.length === 0) return null;

  return (
    <div className="rounded-2xl border border-agenda-border bg-agenda-card p-3.5">
      <h3 className="mb-2.5 text-[11px] font-bold tracking-wide text-agenda-text-faint uppercase">Vencimientos de esta semana</h3>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {entries.map((ev) => {
          const href = ev.link ? resolveCalendarLink(ev.link) : null;
          const content = (
            <>
              <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-agenda-text-faint">
                <span>{fmtDay(ev.date)}</span>
                <span>·</span>
                <span>{ENTRY_TYPES[ev.source].label}</span>
              </div>
              <div className="truncate text-[12.5px] font-medium text-agenda-text">{ev.title}</div>
              {ev.amount != null && (
                <div className="mt-0.5 font-mono text-[11.5px] tabular-nums text-agenda-text-dim">{fmtAmount(ev.amount)}</div>
              )}
            </>
          );
          const className = `min-w-[160px] shrink-0 rounded-lg border-l-[2.5px] border-agenda-border bg-agenda-bg px-3 py-2 transition hover:bg-agenda-card-hover ${EV_BORDER[ev.source]}`;
          return href ? (
            <Link key={ev.id} href={href} className={className}>
              {content}
            </Link>
          ) : (
            <div key={ev.id} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
