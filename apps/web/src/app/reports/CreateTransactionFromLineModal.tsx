'use client';

import { bankReconciliationApi, type BankStatementLine } from '@/lib/bank-reconciliation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  line: BankStatementLine;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function CreateTransactionFromLineModal({ line, onClose }: Props) {
  const queryClient = useQueryClient();
  const isExpense = Number(line.amount) < 0;
  const [description, setDescription] = useState(line.description);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      bankReconciliationApi.createTransactionFromLine(line.id, {
        kind: isExpense ? 'EXPENSE' : 'INCOME',
        description: description || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bank-statement-lines', line.financialAccountId] });
      void queryClient.invalidateQueries({ queryKey: ['financial-unreconciled', line.financialAccountId] });
      void queryClient.invalidateQueries({ queryKey: ['financial-reconciliation', line.financialAccountId] });
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el movimiento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Crear movimiento</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Este movimiento apareció en el extracto pero no tiene ningún comprobante cargado en Oplex — se va a
          registrar y postear su asiento contable automáticamente.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Fecha</label>
            <input
              className={inputClass}
              value={new Date(line.lineDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
              disabled
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Importe</label>
            <input className={inputClass} value={`$${Number(line.amount).toFixed(2)}`} disabled />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Tipo de movimiento</label>
            <select className={inputClass} value={isExpense ? 'EXPENSE' : 'INCOME'} disabled>
              {isExpense ? (
                <option value="EXPENSE">Gasto bancario</option>
              ) : (
                <option value="INCOME">Ingreso bancario</option>
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Descripción</label>
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
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
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Guardando...' : 'Crear movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
