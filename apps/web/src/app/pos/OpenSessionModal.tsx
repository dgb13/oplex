'use client';

import { posApi } from '@/lib/pos';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import NumericKeypad from './NumericKeypad';

interface Props {
  registerId: string;
  onClose: () => void;
  onOpened: () => void;
}

export default function OpenSessionModal({ registerId, onClose, onOpened }: Props) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      posApi.openSession({ registerId, openingAmount: Number(amount.replace(',', '.')) || 0 }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-open-sessions'] });
      onOpened();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo abrir el turno';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Abrir turno</h2>
        <p className="mb-4 text-xs text-slate-500">Declará el efectivo inicial en el cajón</p>

        <div className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-right text-2xl font-semibold text-slate-900">
          ${amount || '0'}
        </div>

        <NumericKeypad value={amount} onChange={setAmount} />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              setError('');
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {mutation.isPending ? 'Abriendo...' : 'Abrir turno'}
          </button>
        </div>
      </div>
    </div>
  );
}
