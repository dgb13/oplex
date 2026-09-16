'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { taxDeadlinesApi, TAX_DEADLINE_KIND_LABELS, type TaxDeadlineKind, type TaxDeadlineStatus } from '@/lib/memberships';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

function pillClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
    active ? 'bg-primary text-primary-foreground' : 'border text-muted-foreground hover:text-foreground'
  }`;
}

const KIND_OPTIONS = Object.entries(TAX_DEADLINE_KIND_LABELS) as [TaxDeadlineKind, string][];

/** Carga 100% manual, sin integración con ningún calendario oficial de
 * ARCA - ver TaxDeadlineService. */
export default function TaxDeadlinesTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TaxDeadlineStatus | 'ALL'>('PENDING');
  const [kind, setKind] = useState<TaxDeadlineKind>('IVA');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const { data: deadlines, isLoading } = useQuery({
    queryKey: ['tax-deadlines', statusFilter],
    queryFn: () => taxDeadlinesApi.list(statusFilter === 'ALL' ? undefined : statusFilter),
  });

  const createMutation = useMutation({
    mutationFn: taxDeadlinesApi.create,
    onSuccess: () => {
      setDueDate('');
      setDescription('');
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['tax-deadlines'] });
    },
  });

  const markDoneMutation = useMutation({
    mutationFn: taxDeadlinesApi.markDone,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tax-deadlines'] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!dueDate || !description.trim()) {
      setError('Fecha y descripción son obligatorias');
      return;
    }
    createMutation.mutate({ kind, dueDate, description: description.trim() });
  }

  // dueDate es una fecha "sin hora" (el usuario elige un día en un <input
  // type=date>, viaja como "2026-08-01"); el backend la persiste como
  // medianoche UTC. Comparar/mostrar en hora LOCAL corre el riesgo de un
  // día de diferencia para cualquier viewer en huso horario negativo (ej.
  // Argentina, UTC-3) - por eso todo acá usa los componentes UTC de la
  // fecha, nunca los locales.
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Tipo</label>
          <Select
            value={kind}
            onChange={(value) => setKind(value as TaxDeadlineKind)}
            options={KIND_OPTIONS.map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Vencimiento</label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs text-muted-foreground">Descripción</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="IVA mensual, Monotributo, etc."
          />
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Agregando...' : '+ Agregar vencimiento'}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        {(['PENDING', 'DONE', 'ALL'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={pillClass(statusFilter === s)}>
            {s === 'PENDING' ? 'Pendientes' : s === 'DONE' ? 'Cumplidos' : 'Todos'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : !deadlines || deadlines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin vencimientos cargados</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                <th className="p-3">Tipo</th>
                <th className="p-3">Vencimiento</th>
                <th className="p-3">Descripción</th>
                <th className="p-3">Estado</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {deadlines.map((d) => {
                const due = new Date(d.dueDate);
                const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
                const overdue = d.status === 'PENDING' && dueUtc < today;
                return (
                  <tr key={d.id} className="border-b border-border/50">
                    <td className="p-3">{TAX_DEADLINE_KIND_LABELS[d.kind]}</td>
                    <td className={`p-3 ${overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                      {due.toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    </td>
                    <td className="p-3">{d.description}</td>
                    <td className="p-3 text-xs">
                      {d.status === 'DONE' ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Cumplido</span>
                      ) : overdue ? (
                        <span className="text-red-600 dark:text-red-400">Vencido</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Pendiente</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {d.status === 'PENDING' && (
                        <button
                          onClick={() => markDoneMutation.mutate(d.id)}
                          className="text-xs font-medium text-primary hover:text-primary/80"
                        >
                          Marcar cumplido
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
