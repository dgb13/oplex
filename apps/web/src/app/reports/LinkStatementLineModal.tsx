'use client';

import { Button } from '@/components/ui/button';
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

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

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
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Vincular línea de extracto</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {new Date(line.lineDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })} — {line.description} — $
          {Number(line.amount).toFixed(2)}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Movimiento a vincular</label>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay movimientos sin conciliar en esta cuenta.</p>
            ) : (
              <select className={selectClass} value={transactionId} onChange={(e) => setTransactionId(e.target.value)}>
                {candidates.map((tx) => (
                  <option key={tx.id} value={tx.id}>
                    {new Date(tx.occurredAt).toLocaleDateString('es-AR')} — ${Number(tx.amount).toFixed(2)} —{' '}
                    {tx.externalRef ?? 'sin referencia'}
                  </option>
                ))}
              </select>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || candidates.length === 0}>
              {mutation.isPending ? 'Vinculando...' : 'Vincular'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
