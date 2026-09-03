'use client';

import { ARS_DENOMINATIONS } from '@/lib/arsDenominations';
import { posApi, type DenominationBreakdownItem } from '@/lib/pos';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import NumericKeypad from '../NumericKeypad';

interface Props {
  sessionId: string;
  expectedAmount: number;
  onClose: () => void;
  onClosed: () => void;
}

type Mode = 'simple' | 'breakdown';

const DENOMINATION_LABEL: Record<'BILL' | 'COIN', string> = { BILL: 'Billete', COIN: 'Moneda' };

export default function CloseSessionModal({ sessionId, expectedAmount, onClose, onClosed }: Props) {
  const [mode, setMode] = useState<Mode>('simple');
  const [counted, setCounted] = useState('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const breakdownTotal = useMemo(
    () => ARS_DENOMINATIONS.reduce((sum, d, i) => sum + d.value * (Number(counts[i]) || 0), 0),
    [counts],
  );

  const countedAmount = mode === 'simple' ? Number(counted.replace(',', '.')) || 0 : breakdownTotal;
  const difference = countedAmount - expectedAmount;

  const mutation = useMutation({
    mutationFn: () => {
      const denominationBreakdown: DenominationBreakdownItem[] | undefined =
        mode === 'breakdown'
          ? ARS_DENOMINATIONS.map((d, i) => ({ kind: d.kind, denomination: d.value, count: Number(counts[i]) || 0 })).filter(
              (item) => item.count > 0,
            )
          : undefined;
      return posApi.closeSession(sessionId, { countedAmount, notes: notes || undefined, denominationBreakdown });
    },
    onSuccess: onClosed,
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo cerrar el turno';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const diffColor = difference === 0 ? 'text-slate-500' : difference > 0 ? 'text-blue-600' : 'text-red-600';
  const diffLabel = difference === 0 ? 'Exacto' : difference > 0 ? 'Sobrante' : 'Faltante';
  // En modo desglose siempre se puede confirmar (todos los conteos en 0 es
  // un cierre legítimo - "vacié la caja") - en modo simple se exige haber
  // tipeado algo, igual que antes.
  const canSubmit = mode === 'simple' ? counted !== '' : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Cerrar turno</h2>
        <p className="mb-4 text-xs text-slate-500">Esperado: ${expectedAmount.toFixed(2)}</p>

        <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode('simple')}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === 'simple' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Monto simple
          </button>
          <button
            type="button"
            onClick={() => setMode('breakdown')}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === 'breakdown' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Desglose
          </button>
        </div>

        <div className="mb-2 rounded-lg bg-slate-100 px-4 py-3 text-right text-2xl font-semibold text-slate-900">
          ${mode === 'simple' ? counted || '0' : countedAmount.toFixed(2)}
        </div>
        {(mode === 'breakdown' || counted !== '') && (
          <p className={`mb-3 text-right text-sm font-medium ${diffColor}`}>
            {diffLabel}: ${Math.abs(difference).toFixed(2)}
          </p>
        )}

        {mode === 'simple' ? (
          <NumericKeypad value={counted} onChange={setCounted} />
        ) : (
          <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
            {ARS_DENOMINATIONS.map((d, i) => {
              const count = counts[i] ?? '';
              const subtotal = d.value * (Number(count) || 0);
              return (
                <div key={`${d.kind}-${d.value}`} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs text-slate-500">
                    {DENOMINATION_LABEL[d.kind]} ${d.value}
                  </span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={count}
                    onChange={(e) => setCounts((prev) => ({ ...prev, [i]: e.target.value }))}
                    placeholder="0"
                    className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-sm outline-none focus:border-indigo-500"
                  />
                  <span className="flex-1 text-right text-xs text-slate-500">${subtotal.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}

        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (opcional)"
          className="mt-3 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-800">
            Cancelar
          </button>
          <button
            onClick={() => {
              setError('');
              mutation.mutate();
            }}
            disabled={mutation.isPending || !canSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {mutation.isPending ? 'Cerrando...' : 'Cerrar turno'}
          </button>
        </div>
      </div>
    </div>
  );
}
