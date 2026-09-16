'use client';

import type { CalendarEntry } from '@/lib/calendar';

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

interface Cell {
  day: number;
  date: string; // YYYY-MM-DD
  other: boolean;
}

function buildCells(year: number, month: number): Cell[] {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const raw: { day: number; other: boolean; m: number }[] = [];
  for (let i = startDow - 1; i >= 0; i--) raw.push({ day: prevDays - i, other: true, m: month - 1 });
  for (let d = 1; d <= daysInMonth; d++) raw.push({ day: d, other: false, m: month });
  while (raw.length % 7 !== 0) raw.push({ day: raw.length - (startDow + daysInMonth) + 1, other: true, m: month + 1 });

  return raw.map(({ day, other, m }) => {
    let y = year;
    let mm = m;
    if (mm < 0) {
      mm = 11;
      y -= 1;
    }
    if (mm > 11) {
      mm = 0;
      y += 1;
    }
    const date = `${y}-${String(mm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { day, date, other };
  });
}

interface Props {
  year: number;
  month: number;
  entriesByDate: Map<string, CalendarEntry[]>;
  today: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export default function MonthGrid({ year, month, entriesByDate, today, selectedDate, onSelectDate }: Props) {
  const cells = buildCells(year, month);

  return (
    <div className="overflow-hidden rounded-2xl border border-agenda-border bg-agenda-card">
      <div className="grid grid-cols-7 border-b border-agenda-border">
        {DOW_LABELS.map((d) => (
          <div key={d} className="p-2.5 text-center text-[11px] font-semibold tracking-wide text-agenda-text-faint uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const evs = cell.other ? [] : (entriesByDate.get(cell.date) ?? []);
          const isToday = cell.date === today;
          const isSelected = cell.date === selectedDate;
          return (
            <button
              key={`${cell.date}-${i}`}
              type="button"
              disabled={cell.other}
              onClick={() => onSelectDate(cell.date)}
              className={`flex min-h-[104px] flex-col gap-1 border-r border-b border-agenda-border-soft p-2 text-left transition last:border-r-0 ${
                cell.other ? 'cursor-default bg-agenda-bg/40' : 'hover:bg-agenda-card-hover'
              } ${isSelected && !cell.other ? 'ring-2 ring-inset ring-agenda-violet' : ''}`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[13px] font-medium ${
                  isToday
                    ? 'bg-agenda-violet font-bold text-white'
                    : cell.other
                      ? 'text-agenda-text-faint opacity-50'
                      : 'text-agenda-text-dim'
                }`}
              >
                {cell.day}
              </span>
              {evs.slice(0, 3).map((ev) => (
                <div
                  key={ev.id}
                  className={`flex items-center gap-1.5 overflow-hidden rounded-md border-l-[2.5px] px-1.5 py-0.5 text-[11.5px] text-agenda-text ${EV_BORDER[ev.source]} ${EV_BG[ev.source]}`}
                >
                  <span className="truncate">{ev.title}</span>
                  {ev.amount != null && (
                    <span className="ml-auto shrink-0 font-mono text-[10.5px] text-agenda-text-dim tabular-nums">
                      {fmtAmount(ev.amount)}
                    </span>
                  )}
                </div>
              ))}
              {evs.length > 3 && <div className="pl-1.5 text-[11px] text-agenda-text-faint">+{evs.length - 3} más</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
