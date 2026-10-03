'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { reportsApi, type MoneyConcept } from '@/lib/reports';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  financialAccountId: string;
  onClose: () => void;
}

// Valor del Select de concepto: "concept:<key>" (frecuente) o
// "account:<id>" (otra cuenta del plan).
const CONCEPT_PREFIX = 'concept:';
const ACCOUNT_PREFIX = 'account:';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NewFinancialTransactionModal({ financialAccountId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<'OUT' | 'IN'>('OUT');
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [occurredAt, setOccurredAt] = useState(today);
  const [externalRef, setExternalRef] = useState('');
  const [error, setError] = useState('');

  const conceptsQuery = useQuery({
    queryKey: ['financial-movement-concepts'],
    queryFn: reportsApi.listMovementConcepts,
  });
  const conceptOptions = [
    ...(conceptsQuery.data?.frequent ?? [])
      .filter((c) => c.direction === direction)
      .map((c) => ({
        value: `${CONCEPT_PREFIX}${c.key}`,
        label: c.label,
        group: direction === 'OUT' ? 'Egresos frecuentes' : 'Ingresos frecuentes',
      })),
    ...(conceptsQuery.data?.others ?? []).map((a) => ({
      value: `${ACCOUNT_PREFIX}${a.id}`,
      label: `${a.code} ${a.name}`,
      group: 'Otra cuenta del plan',
    })),
  ];

  const mutation = useMutation({
    mutationFn: () =>
      reportsApi.recordFinancialTransaction({
        financialAccountId,
        direction,
        amount: Number(amount),
        concept: concept.startsWith(CONCEPT_PREFIX)
          ? (concept.slice(CONCEPT_PREFIX.length) as MoneyConcept)
          : undefined,
        accountingAccountId: concept.startsWith(ACCOUNT_PREFIX) ? concept.slice(ACCOUNT_PREFIX.length) : undefined,
        // Hoy = ahora; otro día = mediodía de ese día en la hora local (un
        // "2026-10-03" pelado es medianoche UTC, el día anterior en Argentina).
        occurredAt: occurredAt && occurredAt !== today() ? new Date(`${occurredAt}T12:00:00`).toISOString() : undefined,
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

  function changeDirection(next: 'OUT' | 'IN') {
    setDirection(next);
    // Un concepto frecuente es de un solo sentido; otra cuenta del plan sirve para los dos.
    if (concept.startsWith(CONCEPT_PREFIX)) {
      setConcept('');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!(Number(amount) > 0)) {
      setError('El importe tiene que ser mayor a cero');
      return;
    }
    if (!concept) {
      setError('Elegí un concepto');
      return;
    }
    mutation.mutate();
  }

  const segment = (value: 'OUT' | 'IN', label: string) => (
    <button
      type="button"
      aria-pressed={direction === value}
      onClick={() => changeDirection(value)}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        direction === value ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo movimiento</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1" role="group" aria-label="Tipo">
            {segment('OUT', 'Egreso')}
            {segment('IN', 'Ingreso')}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Importe</label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Concepto</label>
            <Select value={concept} onChange={setConcept} options={conceptOptions} placeholder="Elegir concepto..." />
            <p className="text-xs text-muted-foreground">
              ¿Pasás plata a otra cuenta tuya? Usá <span className="font-semibold text-foreground">Transferencia entre cuentas</span>.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Fecha</label>
            <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Detalle (opcional)</label>
            <Input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
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
