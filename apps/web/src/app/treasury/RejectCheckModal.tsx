'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { treasuryApi, type Check } from '@/lib/treasury';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  check: Check;
  onClose: () => void;
}

export default function RejectCheckModal({ check, onClose }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      treasuryApi.rejectCheck(check.id, { reason, feeAmount: feeAmount ? Number(feeAmount) : undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checks'] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo rechazar el cheque';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!reason.trim()) {
      setError('El motivo es obligatorio');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rechazar cheque</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          {check.bankName} · Nº {check.number} · ${check.amount}
        </p>
        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
          Reabre el saldo pendiente de la factura que este cheque había cancelado.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Motivo</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Sin fondos, firma no coincide..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Gasto de rechazo (opcional)</label>
            <Input type="number" min={0} step="0.01" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={mutation.isPending}>
              {mutation.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
