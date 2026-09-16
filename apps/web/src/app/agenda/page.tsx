'use client';

import DayPanel from '@/components/agenda/DayPanel';
import FilterChips from '@/components/agenda/FilterChips';
import MonthGrid from '@/components/agenda/MonthGrid';
import UpcomingWeekStrip from '@/components/agenda/UpcomingWeekStrip';
import WeekStrip, { weekDays } from '@/components/agenda/WeekStrip';
import EventDialog from '@/components/agenda/EventDialog';
import { calendarApi, type CalendarEntry, type CalendarEntrySource } from '@/lib/calendar';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const ALL_SOURCES = ['sale', 'collect', 'pay', 'tax', 'prod', 'cash', 'custom'] as const;

type AgendaView = 'month' | 'week' | 'day';

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateKey: string, delta: number): string {
  const d = fromDateKey(dateKey);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function weekRange(selectedDate: string): { from: string; to: string } {
  const [first, ...rest] = weekDays(selectedDate);
  return { from: first ?? selectedDate, to: rest[rest.length - 1] ?? selectedDate };
}

export default function AgendaPage() {
  const today = useMemo(() => toDateKey(new Date()), []);
  const [view, setView] = useState<AgendaView>('month');
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(today);
  const [activeFilters, setActiveFilters] = useState<Set<CalendarEntrySource>>(new Set(ALL_SOURCES));
  const [showDialog, setShowDialog] = useState(false);
  const queryClient = useQueryClient();

  const range = view === 'month' ? monthRange(viewYear, viewMonth) : view === 'week' ? weekRange(selectedDate) : { from: selectedDate, to: selectedDate };

  const entriesQuery = useQuery({
    queryKey: ['calendar-entries', range.from, range.to],
    queryFn: () => calendarApi.getEntries(range),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => calendarApi.deleteEvent(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['calendar-entries'] }),
  });

  const entries = entriesQuery.data ?? [];
  const visibleEntries = useMemo(() => entries.filter((e) => activeFilters.has(e.source)), [entries, activeFilters]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of visibleEntries) {
      const key = e.date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [visibleEntries]);

  const dayEntries = entriesByDate.get(selectedDate) ?? [];

  function goPrev() {
    if (view === 'month') goToMonth(-1);
    else if (view === 'week') setSelectedDate((d) => addDays(d, -7));
    else setSelectedDate((d) => addDays(d, -1));
  }

  function goNext() {
    if (view === 'month') goToMonth(1);
    else if (view === 'week') setSelectedDate((d) => addDays(d, 7));
    else setSelectedDate((d) => addDays(d, 1));
  }

  function goToMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  function goToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDate(today);
  }

  function changeView(next: AgendaView) {
    if (next === 'month') {
      // Al volver a mes, resincroniza con el día que se venía mirando en
      // semana/día - si no, "mes" quedaría mostrando el último mes
      // navegado en vez del que contiene el día seleccionado.
      const d = fromDateKey(selectedDate);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
    setView(next);
  }

  function toggleFilter(source: CalendarEntrySource) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  const rangeLabel =
    view === 'month'
      ? `${MONTHS[viewMonth]} ${viewYear}`
      : view === 'week'
        ? weekLabel(range.from, range.to)
        : dayLabel(selectedDate);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Todo lo que vence, se cobra, se paga o se produce, en un solo lugar.
        </p>
      </div>

      <UpcomingWeekStrip />

      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={goPrev}
            className="grid h-7.5 w-7.5 place-items-center rounded-lg border border-agenda-border bg-agenda-card text-agenda-text-dim transition hover:bg-agenda-card-hover hover:text-agenda-text"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="grid h-7.5 w-7.5 place-items-center rounded-lg border border-agenda-border bg-agenda-card text-agenda-text-dim transition hover:bg-agenda-card-hover hover:text-agenda-text"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <h2 className="min-w-[150px] pl-1 text-[17px] font-semibold">{rangeLabel}</h2>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="rounded-lg border border-agenda-border bg-agenda-card px-3.5 py-1.5 text-[13px] font-medium text-agenda-text-dim transition hover:text-agenda-text"
        >
          Hoy
        </button>
        <div className="ml-auto flex gap-0.5 rounded-lg border border-agenda-border bg-agenda-card p-1">
          {(['month', 'week', 'day'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => changeView(v)}
              className={`rounded-md px-3 py-1 text-[13px] font-medium transition ${
                view === v ? 'bg-agenda-violet text-white' : 'text-agenda-text-dim hover:text-agenda-text'
              }`}
            >
              {v === 'month' ? 'Mes' : v === 'week' ? 'Semana' : 'Día'}
            </button>
          ))}
        </div>
      </div>

      <FilterChips active={activeFilters} onToggle={toggleFilter} />

      {view === 'day' ? (
        <div className="mx-auto w-full max-w-xl">
          <DayPanel
            date={selectedDate}
            today={today}
            entries={dayEntries}
            onDeleteEvent={(id) => deleteMutation.mutate(id)}
            onAddEvent={() => setShowDialog(true)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
          {view === 'month' ? (
            <MonthGrid
              year={viewYear}
              month={viewMonth}
              entriesByDate={entriesByDate}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          ) : (
            <WeekStrip selectedDate={selectedDate} entriesByDate={entriesByDate} today={today} onSelectDate={setSelectedDate} />
          )}
          <DayPanel
            date={selectedDate}
            today={today}
            entries={dayEntries}
            onDeleteEvent={(id) => deleteMutation.mutate(id)}
            onAddEvent={() => setShowDialog(true)}
          />
        </div>
      )}

      {showDialog && <EventDialog defaultDate={selectedDate} onClose={() => setShowDialog(false)} />}
    </div>
  );
}

function weekLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) {
    return `${fd} - ${td} ${MONTH_ABBR[tm - 1]} ${ty}`;
  }
  return `${fd} ${MONTH_ABBR[fm - 1]} - ${td} ${MONTH_ABBR[tm - 1]} ${ty}`;
}

function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} de ${MONTHS[m - 1].toLowerCase()} ${y}`;
}
