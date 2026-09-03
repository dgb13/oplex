'use client';

import { posApi } from '@/lib/pos';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import NumericKeypad from '../NumericKeypad';

interface Props {
  sessionId: string;
  expectedAmount: number;
  onClose: () => void;
  onClosed: () => void;
}

export default function CloseSessionModal({ sessionId, expectedAmount, onClose, onClosed }: Props) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const countedAmount = Number(counted.replace(',', '.')) || 0;
  const difference = countedAmount - expectedAmount;

  const mutation = useMutation({
    mutationFn: () => posApi.closeSession(sessionId, { countedAmount, notes: notes || undefined }),
    onSuccess: onClosed,
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo cerrar el turno';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const diffColor = difference === 0 ? 'text-slate-500' : difference > 0 ? 'text-blue-600' : 'text-red-600';
  const diffLabel = difference === 0 ? 'Exacto' : difference > 0 ? 'Sobrante' : 'Faltante';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Cerrar turno</h2>
        <p className="mb-4 text-xs text-slate-500">Esperado: ${expectedAmount.toFixed(2)}</p>

        <div className="mb-2 rounded-lg bg-slate-100 px-4 py-3 text-right text-2xl font-semibold text-slate-900">
          ${counted || '0'}
        </div>
        {counted !== '' && (
          <p className={`mb-3 text-right text-sm font-medium ${diffColor}`}>
            {diffLabel}: ${Math.abs(difference).toFixed(2)}
          </p>
        )}

        <NumericKeypad value={counted} onChange={setCounted} />

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
            disabled={mutation.isPending || counted === ''}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {mutation.isPending ? 'Cerrando...' : 'Cerrar turno'}
          </button>
        </div>
      </div>
    </div>
  );
}
