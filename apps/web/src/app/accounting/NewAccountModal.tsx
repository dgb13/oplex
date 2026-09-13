'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accountingApi, type AccountType } from '@/lib/accounting';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'ASSET', label: 'Activo' },
  { value: 'LIABILITY', label: 'Pasivo' },
  { value: 'EQUITY', label: 'Patrimonio' },
  { value: 'INCOME', label: 'Ingreso' },
  { value: 'EXPENSE', label: 'Gasto' },
];

export default function NewAccountModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('ASSET');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => accountingApi.createAccount({ code, name, type }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounting-accounts'] });
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
    if (!code.trim() || !name.trim()) {
      setError('Código y nombre son obligatorios');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nueva cuenta</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Código</label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="1.1.03" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Nombre</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Caja" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Tipo</label>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
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
