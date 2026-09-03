'use client';

import { posApi } from '@/lib/pos';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  sessionId: string;
  type: 'CASH_IN' | 'CASH_OUT';
  onClose: () => void;
  onDone: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500';

export default function CashMovementModal({ sessionId, type, onClose, onDone }: Props) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const dto = { amount: Number(amount), reason };
      return type === 'CASH_IN' ? posApi.cashIn(sessionId, dto) : posApi.cashOut(sessionId, dto);
    },
    onSuccess: onDone,
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el movimiento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (Number(amount) <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }
    if (!reason.trim()) {
      setError('El motivo es obligatorio');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {type === 'CASH_IN' ? 'Ingreso de efectivo' : 'Egreso de efectivo'}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">Monto</label>
            <input
              type="number"
              step="any"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600">Motivo</label>
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
