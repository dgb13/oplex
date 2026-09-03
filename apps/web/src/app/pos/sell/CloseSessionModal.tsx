'use client';

import { posApi } from '@/lib/pos';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import DenominationBreakdownEditor, { breakdownTotal, buildDenominationBreakdown } from '../DenominationBreakdownEditor';
import NumericKeypad from '../NumericKeypad';

interface Props {
  sessionId: string;
  expectedAmount: number;
  onClose: () => void;
  onClosed: () => void;
}

type Mode = 'simple' | 'breakdown';

export default function CloseSessionModal({ sessionId, expectedAmount, onClose, onClosed }: Props) {
  const [mode, setMode] = useState<Mode>('simple');
  const [counted, setCounted] = useState('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const breakdownAmount = useMemo(() => breakdownTotal(counts), [counts]);

  const countedAmount = mode === 'simple' ? Number(counted.replace(',', '.')) || 0 : breakdownAmount;
  const difference = countedAmount - expectedAmount;

  const mutation = useMutation({
    mutationFn: () => {
      const denominationBreakdown = mode === 'breakdown' ? buildDenominationBreakdown(counts) : undefined;
      return posApi.closeSession(sessionId, { countedAmount, notes: notes || undefined, denominationBreakdown });
    },
    onSuccess: onClosed,
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo cerrar el turno';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const diffColor =
    difference === 0
      ? 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
      : difference > 0
        ? 'text-blue-600 pos-dark:text-blue-400 pos-contrast:text-blue-400 pos-emerald:text-blue-600'
        : 'text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600';
  const diffLabel = difference === 0 ? 'Exacto' : difference > 0 ? 'Sobrante' : 'Faltante';
  // En modo desglose siempre se puede confirmar (todos los conteos en 0 es
  // un cierre legítimo - "vacié la caja") - en modo simple se exige haber
  // tipeado algo, igual que antes.
  const canSubmit = mode === 'simple' ? counted !== '' : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-6 shadow-2xl pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-contrast:border-slate-700 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white">
        <h2 className="mb-1 text-lg font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900">
          Cerrar turno
        </h2>
        <p className="mb-4 text-xs text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
          Esperado: ${expectedAmount.toFixed(2)}
        </p>

        <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-xs font-medium pos-dark:bg-slate-800 pos-contrast:bg-slate-900 pos-emerald:bg-emerald-50">
          <button
            type="button"
            onClick={() => setMode('simple')}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === 'simple'
                ? 'bg-white text-slate-900 shadow-sm pos-dark:bg-slate-700 pos-dark:text-slate-100 pos-contrast:bg-black pos-contrast:text-white pos-emerald:bg-white pos-emerald:text-slate-900'
                : 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
            }`}
          >
            Monto simple
          </button>
          <button
            type="button"
            onClick={() => setMode('breakdown')}
            className={`flex-1 rounded-md py-1.5 transition ${
              mode === 'breakdown'
                ? 'bg-white text-slate-900 shadow-sm pos-dark:bg-slate-700 pos-dark:text-slate-100 pos-contrast:bg-black pos-contrast:text-white pos-emerald:bg-white pos-emerald:text-slate-900'
                : 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
            }`}
          >
            Desglose
          </button>
        </div>

        <div className="mb-2 rounded-lg bg-slate-100 px-4 py-3 text-right text-2xl font-semibold text-slate-900 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-contrast:bg-slate-900 pos-contrast:text-white pos-emerald:bg-emerald-50 pos-emerald:text-slate-900">
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
          <DenominationBreakdownEditor
            counts={counts}
            onChange={(i, value) => setCounts((prev) => ({ ...prev, [i]: value }))}
          />
        )}

        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (opcional)"
          className="mt-3 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-indigo-500 pos-dark:border-slate-600 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-dark:focus:border-indigo-400 pos-contrast:border-slate-600 pos-contrast:bg-slate-900 pos-contrast:text-white pos-contrast:focus:border-amber-400 pos-emerald:border-emerald-200 pos-emerald:bg-emerald-50 pos-emerald:text-slate-900 pos-emerald:focus:border-emerald-500"
        />

        {error && (
          <p className="mt-3 text-sm text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-800 pos-dark:text-slate-300 pos-dark:hover:text-slate-100 pos-contrast:text-slate-200 pos-contrast:hover:text-white pos-emerald:text-slate-600 pos-emerald:hover:text-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              setError('');
              mutation.mutate();
            }}
            disabled={mutation.isPending || !canSubmit}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
          >
            {mutation.isPending ? 'Cerrando...' : 'Cerrar turno'}
          </button>
        </div>
      </div>
    </div>
  );
}
