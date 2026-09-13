'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { reportsApi, type FinancialAccountProvider } from '@/lib/reports';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const PROVIDER_OPTIONS: { value: FinancialAccountProvider; label: string }[] = [
  { value: 'BANK', label: 'Banco' },
  { value: 'MERCADOPAGO', label: 'MercadoPago' },
  { value: 'PAYPAL', label: 'PayPal' },
  { value: 'CASH', label: 'Efectivo' },
];

export default function NewFinancialAccountModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<FinancialAccountProvider>('BANK');
  const [currentBalance, setCurrentBalance] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      reportsApi.createFinancialAccount({
        name,
        provider,
        currentBalance: currentBalance ? Number(currentBalance) : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear la cuenta';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nueva cuenta financiera</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Nombre</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cuenta corriente Banco Nación"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Proveedor</label>
            <select
              className={selectClass}
              value={provider}
              onChange={(e) => setProvider(e.target.value as FinancialAccountProvider)}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Saldo inicial (opcional)</label>
            <Input
              type="number"
              step="0.01"
              value={currentBalance}
              onChange={(e) => setCurrentBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando...' : 'Crear cuenta'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
