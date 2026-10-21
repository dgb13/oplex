// Períodos de la sección Mercado Pago (Resumen y Movimientos). Las fechas
// se arman con el día local del navegador, AAAA-MM-DD; la API las toma como
// días de Argentina.

export type Period = 'month' | 'prev' | 'last7' | 'last90';

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'month', label: 'Este mes' },
  { value: 'prev', label: 'Mes anterior' },
  { value: 'last7', label: 'Últimos 7 días' },
  { value: 'last90', label: 'Últimos 90 días' },
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function periodRange(period: Period): { from: string; to: string } {
  const today = new Date();
  switch (period) {
    case 'month':
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
    case 'prev':
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case 'last7':
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), to: ymd(today) };
    case 'last90':
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89)), to: ymd(today) };
  }
}

export function PeriodSelect({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      Período
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Period)}
        className="h-9 rounded-lg border bg-card px-2.5 text-sm text-foreground"
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
