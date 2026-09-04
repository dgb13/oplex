'use client';

import { taxDeadlinesApi, TAX_DEADLINE_KIND_LABELS, type TaxDeadlineKind, type TaxDeadlineStatus } from '@/lib/memberships';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

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
      <form
        onSubmit={handleSubmit}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Tipo</label>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value as TaxDeadlineKind)}>
            {KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Vencimiento</label>
          <input className={inputClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs text-slate-500">Descripción</label>
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="IVA mensual, Monotributo, etc."
          />
        </div>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Agregando...' : '+ Agregar vencimiento'}
        </button>
      </form>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        {(['PENDING', 'DONE', 'ALL'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
            }`}
          >
            {s === 'PENDING' ? 'Pendientes' : s === 'DONE' ? 'Cumplidos' : 'Todos'}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : !deadlines || deadlines.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin vencimientos cargados</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Tipo</th>
                <th className="pb-2 pr-4">Vencimiento</th>
                <th className="pb-2 pr-4">Descripción</th>
                <th className="pb-2 pr-4">Estado</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {deadlines.map((d) => {
                const due = new Date(d.dueDate);
                const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
                const overdue = d.status === 'PENDING' && dueUtc < today;
                return (
                  <tr key={d.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{TAX_DEADLINE_KIND_LABELS[d.kind]}</td>
                    <td className={`py-2 pr-4 ${overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
                      {due.toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    </td>
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{d.description}</td>
                    <td className="py-2 pr-4 text-xs">
                      {d.status === 'DONE' ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Cumplido</span>
                      ) : overdue ? (
                        <span className="text-red-600 dark:text-red-400">Vencido</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Pendiente</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {d.status === 'PENDING' && (
                        <button
                          onClick={() => markDoneMutation.mutate(d.id)}
                          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-700 dark:hover:text-indigo-300"
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
        )}
      </div>
    </div>
  );
}
