'use client';

import { Button } from '@/components/ui/button';
import type { FinancialAccount } from '@/lib/reports';
import { treasuryApi, type Check } from '@/lib/treasury';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  check: Check;
  accounts: FinancialAccount[];
  onClose: () => void;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export default function DepositCheckModal({ check, accounts, onClose }: Props) {
  const queryClient = useQueryClient();
  const [financialAccountId, setFinancialAccountId] = useState(accounts[0]?.id ?? '');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => treasuryApi.depositCheck(check.id, financialAccountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checks'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo depositar el cheque';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!financialAccountId) {
      setError('Elegí la cuenta donde se deposita');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Depositar cheque</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {check.bankName} · Nº {check.number} · ${check.amount}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Cuenta de destino</label>
            {accounts.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No hay cuentas financieras creadas todavía (Reportes → Financiero).
              </p>
            ) : (
              <select
                className={selectClass}
                value={financialAccountId}
                onChange={(e) => setFinancialAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
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
            <Button type="submit" disabled={mutation.isPending || accounts.length === 0}>
              {mutation.isPending ? 'Depositando...' : 'Depositar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
