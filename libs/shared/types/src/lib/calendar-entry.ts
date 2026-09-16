/**
 * DTO común que devuelve cada fuente de la Agenda (ver docs/plan-agenda.md).
 * Vive en @plexo/types (scope:shared), no en ningún módulo de negocio ni en
 * la lib nueva @plexo/calendar - así taxes/receivables/payables/calendar
 * pueden implementar `getCalendarEntries(from, to): Promise<CalendarEntry[]>`
 * sin importarse entre sí (el linter de Nx sólo permite que un módulo de
 * negocio dependa de sí mismo + scope:shared).
 */
export type CalendarEntrySource = 'sale' | 'collect' | 'pay' | 'tax' | 'prod' | 'cash' | 'custom';

export type CalendarEntryFlow = 'in' | 'out' | null;

export interface CalendarEntry {
  id: string;
  source: CalendarEntrySource;
  title: string;
  /** ISO 8601 */
  date: string;
  amount: number | null;
  flow: CalendarEntryFlow;
  ref: string | null;
  /** true sólo para los eventos propios (CalendarEvent) - los derivados se
   * editan navegando al documento origen, nunca desde la Agenda. */
  editable: boolean;
  /** Deep-link al documento origen - opcional en Fase 1 (ver plan, Fase 2). */
  link?: { module: string; id: string };
}
