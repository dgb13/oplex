'use client';

import type { AxiosError } from 'axios';

/** Piezas comunes de los importadores (artículos, proveedores y clientes):
 * mismo recorrido de 4 pasos, mismas opciones y mismos estados por fila. */

export const IMPORT_STEPS = ['Archivo', 'Columnas', 'Revisión', 'Importar'];

export function errorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

export const formatInt = (n: number) => n.toLocaleString('es-AR');

export function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {IMPORT_STEPS.map((name, i) => {
        const n = i + 1;
        const state = step === n ? 'on' : step > n ? 'done' : 'todo';
        return (
          <li
            key={name}
            className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm ${
              state === 'on' ? 'border-primary text-foreground' : 'text-muted-foreground'
            }`}
          >
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                state === 'on' ? 'bg-primary text-primary-foreground' : state === 'done' ? 'bg-green-600 text-white' : 'bg-muted'
              }`}
            >
              {state === 'done' ? '✓' : n}
            </span>
            {name}
          </li>
        );
      })}
    </ol>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function Choice({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">{label}</span>
      <div className="inline-flex flex-wrap gap-0.5 self-start rounded-lg border bg-muted p-0.5">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${value === v ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

const TILE_TONES = {
  ok: 'text-green-600 dark:text-green-400',
  info: 'text-blue-600 dark:text-blue-400',
  bad: 'text-destructive',
  muted: 'text-foreground',
};

export function Tile({
  tone,
  count,
  label,
  active,
  onClick,
}: {
  tone: keyof typeof TILE_TONES;
  count: number;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-xl border bg-card p-3 text-left ${active ? 'border-primary ring-1 ring-primary' : ''}`}
    >
      <span className={`block text-2xl font-bold tabular-nums ${TILE_TONES[tone]}`}>{formatInt(count)}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  );
}

export function ValueRow({
  label,
  count,
  value,
  options,
  onChange,
}: {
  label: string;
  count: number;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${value ? 'bg-muted/60' : 'bg-amber-50 dark:bg-amber-950/40'}`}>
      <span>
        {label} <span className="text-xs text-muted-foreground">· {formatInt(count)}</span>
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 max-w-40 rounded-md border bg-card px-2 text-sm">
        {!value && <option value="">Elegí…</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export type ImportRowStatus = 'new' | 'update' | 'skip' | 'error';

const STATUS_CLASS: Record<ImportRowStatus, string> = {
  new: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  skip: 'bg-muted text-muted-foreground',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
};

export function StatusPill({ status, labels }: { status: ImportRowStatus; labels: Record<ImportRowStatus, string> }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS_CLASS[status]}`}>{labels[status]}</span>;
}
