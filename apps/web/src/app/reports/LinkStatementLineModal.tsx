'use client';

import { bankReconciliationApi, type BankStatementLine } from '@/lib/bank-reconciliation';
import type { FinancialTransaction } from '@/lib/reports';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  line: BankStatementLine;
  candidates: FinancialTransaction[];
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function LinkStatementLineModal({ line, candidates, onClose }: Props) {
  const queryClient = useQueryClient();
  const [transactionId, setTransactionId] = useState(candidates[0]?.id ?? '');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => bankReconciliationApi.linkLine(line.id, transactionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bank-statement-lines', line.financialAccountId] });
      void queryClient.invalidateQueries({ queryKey: ['financial-unreconciled', line.financialAccountId] });
      void queryClient.invalidateQueries({ queryKey: ['financial-reconciliation', line.financialAccountId] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo vincular la línea';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!transactionId) {
      setError('Elegí un movimiento para vincular');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Vincular línea de extracto</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          {new Date(line.lineDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })} — {line.description} — $
          {Number(line.amount).toFixed(2)}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Movimiento a vincular</label>
            {candidates.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-600">
                No hay movimientos sin conciliar en esta cuenta.
              </p>
            ) : (
              <select className={inputClass} value={transactionId} onChange={(e) => setTransactionId(e.target.value)}>
                {candidates.map((tx) => (
                  <option key={tx.id} value={tx.id}>
                    {new Date(tx.occurredAt).toLocaleDateString('es-AR')} — ${Number(tx.amount).toFixed(2)} —{' '}
                    {tx.externalRef ?? 'sin referencia'}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || candidates.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Vinculando...' : 'Vincular'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
