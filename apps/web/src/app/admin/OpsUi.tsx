// Piezas compartidas de /admin/backups, /admin/server y las filas nuevas de
// /admin/system-status (boceto aprobado del panel de backups y servidor).

export type Tone = 'ok' | 'warn' | 'bad';

const TONE = {
  ok: { dot: 'bg-green-500', pill: 'bg-green-900/50 text-green-300', card: 'border-slate-800 bg-slate-900', bar: 'bg-green-500' },
  warn: { dot: 'bg-amber-500', pill: 'bg-amber-900/50 text-amber-300', card: 'border-amber-900 bg-amber-950/30', bar: 'bg-amber-500' },
  bad: { dot: 'bg-red-500', pill: 'bg-red-900/50 text-red-300', card: 'border-red-900 bg-red-950/30', bar: 'bg-red-500' },
} as const;

export const AR_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toLocaleString('es-AR', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unitIndex]}`;
}

/** "Hoy 00:30", "Ayer 23:00" o "18/10 23:00", siempre en hora de Argentina. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const day = (d: Date) => d.toLocaleDateString('es-AR', { timeZone: AR_TIME_ZONE });
  const time = date.toLocaleTimeString('es-AR', { timeZone: AR_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const now = new Date();
  if (day(date) === day(now)) return `Hoy ${time}`;
  if (day(date) === day(new Date(now.getTime() - 86_400_000))) return `Ayer ${time}`;
  const short = date.toLocaleDateString('es-AR', { timeZone: AR_TIME_ZONE, day: '2-digit', month: '2-digit' });
  return `${short} ${time}`;
}

export function formatDuration(fromIso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} días`;
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[tone].dot}`} aria-hidden />;
}

export function Pill({ tone, children }: { tone: Tone | 'gray'; children: React.ReactNode }) {
  const cls = tone === 'gray' ? 'bg-slate-800 text-slate-400' : TONE[tone].pill;
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export function StatCard({
  title,
  tone,
  pill,
  pillTone,
  big,
  children,
}: {
  title: string;
  tone: Tone;
  pill: string;
  pillTone?: Tone | 'gray';
  big: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <article className={`flex min-w-0 flex-col gap-2.5 rounded-xl border p-4 ${TONE[tone].card}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Dot tone={tone} />
          {title}
        </span>
        <Pill tone={pillTone ?? tone}>{pill}</Pill>
      </div>
      <div className="text-xl font-semibold tabular-nums text-white">{big}</div>
      {children}
    </article>
  );
}

export function Meter({ percent, tone, left, right }: { percent: number; tone: Tone; left: string; right: string }) {
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <span className={`block h-full rounded-full ${TONE[tone].bar}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-500">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

export function Kv({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-slate-500">{label}</dt>
          <dd className="text-right tabular-nums text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ErrorLine({ children }: { children: React.ReactNode }) {
  return <div className="break-words rounded-md bg-black/30 px-2 py-1.5 font-mono text-xs text-red-300">{children}</div>;
}

export function AlertBanner({ tone, children, aside }: { tone: 'warn' | 'bad'; children: React.ReactNode; aside?: string }) {
  const cls =
    tone === 'bad' ? 'border-red-900 bg-red-950/40 text-red-300' : 'border-amber-900 bg-amber-950/40 text-amber-300';
  return (
    <div className={`flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3.5 text-sm ${cls}`}>
      <span className="min-w-0 flex-1">{children}</span>
      {aside && <span className="whitespace-nowrap text-xs opacity-85">✉ {aside}</span>}
    </div>
  );
}

export function Box({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800 px-4 py-3.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function diskTone(percent: number, alertPercent: number): Tone {
  if (percent >= 95) return 'bad';
  return percent >= alertPercent ? 'warn' : 'ok';
}
