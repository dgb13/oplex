'use client';

import { Input } from '@/components/ui/input';
import { currentMonthRange, currentQuarterRange, currentYearRange, previousMonthRange } from './dateRange';

interface Props {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onPreset: (range: { from: string; to: string }) => void;
}

const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Este mes', range: currentMonthRange },
  { label: 'Mes anterior', range: previousMonthRange },
  { label: 'Este trimestre', range: currentQuarterRange },
  { label: 'Este año', range: currentYearRange },
];

export default function DateRangeFilter({ from, to, onFromChange, onToChange, onPreset }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Desde
        <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        Hasta
        <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onPreset(p.range())}
            className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
