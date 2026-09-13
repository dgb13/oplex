'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { bankReconciliationApi, type BankStatementLine } from '@/lib/bank-reconciliation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  line: BankStatementLine;
  onClose: () => void;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

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
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Crear movimiento</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
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
            <label className="text-sm text-muted-foreground">Fecha</label>
            <Input value={new Date(line.lineDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })} disabled />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Importe</label>
            <Input value={`$${Number(line.amount).toFixed(2)}`} disabled />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Tipo de movimiento</label>
            <select className={selectClass} value={isExpense ? 'EXPENSE' : 'INCOME'} disabled>
              {isExpense ? (
                <option value="EXPENSE">Gasto bancario</option>
              ) : (
                <option value="INCOME">Ingreso bancario</option>
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Descripción</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Crear movimiento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
