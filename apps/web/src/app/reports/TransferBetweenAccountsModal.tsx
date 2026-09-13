'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { reportsApi, type FinancialAccount } from '@/lib/reports';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  accounts: FinancialAccount[];
  defaultFromId: string;
  onClose: () => void;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export default function TransferBetweenAccountsModal({ accounts, defaultFromId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [fromId, setFromId] = useState(defaultFromId);
  const [toId, setToId] = useState(accounts.find((a) => a.id !== defaultFromId)?.id ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      reportsApi.transferBetweenAccounts({
        fromFinancialAccountId: fromId,
        toFinancialAccountId: toId,
        amount: Number(amount),
        note: note || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-unreconciled'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-reconciliation'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo transferir entre cuentas';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (fromId === toId) {
      setError('La cuenta de origen y destino no pueden ser la misma');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('El importe debe ser mayor a cero');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Transferir entre cuentas</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Desde</label>
            <select className={selectClass} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Hacia</label>
            <select className={selectClass} value={toId} onChange={(e) => setToId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Importe</label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Nota (opcional)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || accounts.length < 2}>
              {mutation.isPending ? 'Transfiriendo...' : 'Transferir'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
