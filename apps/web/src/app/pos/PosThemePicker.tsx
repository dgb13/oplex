'use client';

import { Check } from 'lucide-react';
import { usePosTheme, type PosTheme } from './pos-theme';

const SWATCHES: { theme: PosTheme; label: string; className: string }[] = [
  { theme: 'light', label: 'Claro', className: 'bg-white border border-slate-300' },
  { theme: 'dark', label: 'Oscuro', className: 'bg-slate-900' },
  { theme: 'contrast', label: 'Alto contraste', className: 'bg-black' },
  { theme: 'emerald', label: 'Esmeralda', className: 'bg-emerald-500' },
];

/** Selector de 4 paletas de color propias del POS (independiente del
 * toggle claro/oscuro global del resto del ERP) - se monta en /pos,
 * /pos/history y /pos/sell. Ver apps/web/src/app/pos/pos-theme.tsx. */
export default function PosThemePicker() {
  const { theme, setTheme } = usePosTheme();

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Estilo de color del POS">
      {SWATCHES.map((swatch) => {
        const active = theme === swatch.theme;
        return (
          <button
            key={swatch.theme}
            type="button"
            title={swatch.label}
            aria-label={swatch.label}
            aria-pressed={active}
            onClick={() => setTheme(swatch.theme)}
            className={`relative flex h-6 w-6 items-center justify-center rounded-full transition ${swatch.className} ${
              active
                ? 'ring-2 ring-offset-2 ring-indigo-500 pos-dark:ring-offset-slate-900 pos-contrast:ring-amber-400 pos-contrast:ring-offset-black pos-emerald:ring-emerald-600'
                : 'ring-1 ring-slate-300 pos-dark:ring-slate-700 pos-contrast:ring-slate-600 pos-emerald:ring-emerald-200'
            }`}
          >
            {active && (
              <Check
                className={`h-3 w-3 ${
                  swatch.theme === 'light' || swatch.theme === 'emerald' ? 'text-slate-900' : 'text-white'
                }`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
