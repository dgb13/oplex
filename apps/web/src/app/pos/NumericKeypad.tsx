'use client';

import { Delete } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'] as const;

/** Teclado numérico grande para mostrador (apertura/cierre de caja, monto
 * recibido) - pensado para tocarse rápido en una pantalla táctil, no para
 * tipear con teclado físico (el input de texto detrás sigue aceptando
 * teclado normal igual, esto es sólo un atajo visual). Coma como separador
 * decimal (es-AR) - se normaliza a punto recién al mandar el monto a la
 * API, nunca acá. */
export default function NumericKeypad({ value, onChange }: Props) {
  function press(key: (typeof KEYS)[number]) {
    if (key === 'del') {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === ',' && value.includes(',')) {
      return;
    }
    onChange(value + key);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => press(key)}
          className="flex h-14 items-center justify-center rounded-lg bg-slate-100 text-xl font-semibold text-slate-800 transition hover:bg-slate-200 active:bg-slate-300"
        >
          {key === 'del' ? <Delete className="h-5 w-5" /> : key}
        </button>
      ))}
    </div>
  );
}
