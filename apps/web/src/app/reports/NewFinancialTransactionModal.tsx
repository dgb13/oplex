'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { reportsApi } from '@/lib/reports';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  financialAccountId: string;
  onClose: () => void;
}

export default function NewFinancialTransactionModal({ financialAccountId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      reportsApi.recordFinancialTransaction({
        financialAccountId,
        amount: Number(amount),
        occurredAt: occurredAt || undefined,
        externalRef: externalRef || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-unreconciled', financialAccountId] });
      void queryClient.invalidateQueries({ queryKey: ['financial-reconciliation', financialAccountId] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el movimiento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) === 0) {
      setError('El importe es obligatorio y no puede ser cero');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo movimiento</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Importe positivo para un ingreso, negativo para un egreso.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Importe</label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000 o -500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Fecha (opcional, por defecto ahora)</label>
            <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Referencia externa (opcional)</label>
            <Input
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="N° de comprobante bancario"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Registrar movimiento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
