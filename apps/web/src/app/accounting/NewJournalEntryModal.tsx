'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { accountingApi, type JournalLineDirection } from '@/lib/accounting';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

interface LineForm {
  accountId: string;
  direction: JournalLineDirection;
  amount: string;
}

const DIRECTION_OPTIONS: { value: JournalLineDirection; label: string }[] = [
  { value: 'DEBIT', label: 'Debe' },
  { value: 'CREDIT', label: 'Haber' },
];

export default function NewJournalEntryModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({
    queryKey: ['accounting-accounts'],
    queryFn: accountingApi.listAccounts,
  });
  const accounts = accountsQuery.data ?? [];

  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineForm[]>([
    { accountId: '', direction: 'DEBIT', amount: '' },
    { accountId: '', direction: 'CREDIT', amount: '' },
  ]);
  const [error, setError] = useState('');

  const debitTotal = lines
    .filter((l) => l.direction === 'DEBIT')
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const creditTotal = lines
    .filter((l) => l.direction === 'CREDIT')
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const isBalanced = lines.length >= 2 && debitTotal > 0 && debitTotal === creditTotal;

  const mutation = useMutation({
    mutationFn: () =>
      accountingApi.postJournalEntry({
        description,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          direction: l.direction,
          amount: Number(l.amount),
        })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounting-journal-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['accounting-trial-balance'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo postear el asiento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { accountId: '', direction: 'DEBIT', amount: '' }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!description.trim()) {
      setError('La descripción es obligatoria');
      return;
    }
    if (lines.some((l) => !l.accountId || !l.amount || Number(l.amount) <= 0)) {
      setError('Cada línea necesita cuenta e importe mayor a cero');
      return;
    }
    if (!isBalanced) {
      setError(`El asiento no balancea: débitos $${debitTotal.toFixed(2)} vs créditos $${creditTotal.toFixed(2)}`);
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo asiento manual</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Descripción</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ajuste de caja..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground">Líneas</label>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-primary hover:text-primary/80"
              >
                + agregar línea
              </button>
            </div>
            {lines.map((line, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  className="flex-1"
                  value={line.accountId}
                  onChange={(value) => updateLine(index, { accountId: value })}
                  placeholder="Cuenta..."
                  options={accounts.map((acc) => ({ value: acc.id, label: `${acc.code} — ${acc.name}` }))}
                />
                <Select
                  value={line.direction}
                  onChange={(value) => updateLine(index, { direction: value as JournalLineDirection })}
                  options={DIRECTION_OPTIONS}
                />
                <Input
                  type="number"
                  step="any"
                  className="w-28"
                  value={line.amount}
                  onChange={(e) => updateLine(index, { amount: e.target.value })}
                  placeholder="0.00"
                />
                {lines.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div
            className={`rounded-lg border p-3 text-sm ${
              isBalanced
                ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            Debe: ${debitTotal.toFixed(2)} · Haber: ${creditTotal.toFixed(2)}
            {isBalanced ? ' · Balanceado ✓' : ''}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || !isBalanced}>
              {mutation.isPending ? 'Posteando...' : 'Postear asiento'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

