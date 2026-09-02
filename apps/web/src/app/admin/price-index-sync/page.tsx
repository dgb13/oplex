'use client';

import { adminPriceIndexSyncApi } from '@/lib/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

const SOURCE_LABELS: Record<string, string> = {
  API_ARGENTINADATOS: 'Sincronizado',
  MANUAL: 'Manual',
};

function formatPeriod(period: string): string {
  const date = new Date(period);
  return date.toLocaleDateString('es-AR', { timeZone: 'UTC', year: 'numeric', month: 'long' });
}

/** Único índice usado por el Ajuste por Inflación (RT6/NC39, ver pestaña
 * "Ajuste por Inflación" en Contabilidad) - dato nacional único, igual para
 * todos los tenants, por eso vive acá en Admin (mismo criterio que
 * Cotizaciones USD) y no en Preferencias de cada tenant. */
export default function AdminPriceIndexSyncPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin-price-index-settings'],
    queryFn: adminPriceIndexSyncApi.getSettings,
  });
  const { data: periods, isLoading: periodsLoading } = useQuery({
    queryKey: ['admin-price-index-periods'],
    queryFn: adminPriceIndexSyncApi.listPeriods,
  });
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState('');
  const [newVariation, setNewVariation] = useState('');
  const [formError, setFormError] = useState('');

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<{ enabled: boolean; hour: number }>) => adminPriceIndexSyncApi.updateSettings(patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-price-index-settings'] }),
  });

  const syncNowMutation = useMutation({
    mutationFn: adminPriceIndexSyncApi.syncNow,
    onSuccess: (result) => {
      setSyncError(null);
      setSyncResult(`${result.synced} período(s) sincronizado(s), ${result.skippedManual} omitido(s) (ya corregidos a mano).`);
      void queryClient.invalidateQueries({ queryKey: ['admin-price-index-periods'] });
    },
    onError: (err) => {
      setSyncResult(null);
      setSyncError(extractErrorMessage(err, 'No se pudo sincronizar los índices de inflación'));
    },
  });

  const upsertMutation = useMutation({
    mutationFn: () => adminPriceIndexSyncApi.upsertPeriod(`${newPeriod}-01`, Number(newVariation)),
    onSuccess: () => {
      setFormError('');
      setNewPeriod('');
      setNewVariation('');
      void queryClient.invalidateQueries({ queryKey: ['admin-price-index-periods'] });
    },
    onError: (err) => setFormError(extractErrorMessage(err, 'No se pudo guardar el período')),
  });

  function handleUpsert(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!newPeriod) {
      setFormError('Elegí un mes');
      return;
    }
    if (!newVariation || Number.isNaN(Number(newVariation))) {
      setFormError('La variación mensual debe ser un número');
      return;
    }
    upsertMutation.mutate();
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Índices de Inflación</h1>
      <p className="text-sm text-slate-400">
        Serie mensual de IPC usada por el Ajuste por Inflación Contable (RT6/NC39, ver Contabilidad →
        "Ajuste por Inflación"). Es un único dato nacional, igual para todos los tenants. La
        sincronización automática trae la variación mensual desde una fuente pública (no confirmada
        como INDEC oficial) - un período corregido a mano nunca se pisa con el sync.
      </p>

      {settingsLoading || !settings ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <p className="text-sm font-medium text-slate-200">Sincronización automática</p>
              <p className="text-xs text-slate-500">Corre una vez por día, a la hora configurada.</p>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.ipcSyncEnabled}
                onChange={(e) => updateMutation.mutate({ enabled: e.target.checked })}
                className="h-5 w-5 accent-indigo-600"
              />
              <span className="text-sm text-slate-300">{settings.ipcSyncEnabled ? 'Activada' : 'Desactivada'}</span>
            </label>
          </div>

          <div className="flex items-center justify-between border-b border-slate-800 py-4">
            <p className="text-sm font-medium text-slate-200">Horario</p>
            <select
              value={settings.ipcSyncHour}
              onChange={(e) => updateMutation.mutate({ hour: Number(e.target.value) })}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between pt-4">
            <div>
              <p className="text-sm font-medium text-slate-200">Forzar sincronización</p>
              <p className="text-xs text-slate-500">Corre ahora mismo, sin importar el horario/on-off de arriba.</p>
            </div>
            <button
              type="button"
              onClick={() => syncNowMutation.mutate()}
              disabled={syncNowMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {syncNowMutation.isPending ? 'Sincronizando...' : 'Sincronizar ahora'}
            </button>
          </div>

          {syncResult && <p className="mt-4 text-sm text-emerald-400">{syncResult}</p>}
          {syncError && <p className="mt-4 text-sm text-red-400">{syncError}</p>}
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <p className="mb-4 text-sm font-medium text-slate-200">Cargar/corregir un período a mano</p>
        <form onSubmit={handleUpsert} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-400">
            Mes
            <input
              type="month"
              value={newPeriod}
              onChange={(e) => setNewPeriod(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-400">
            Variación mensual (%)
            <input
              type="number"
              step="0.01"
              value={newVariation}
              onChange={(e) => setNewVariation(e.target.value)}
              placeholder="2.8"
              className="w-32 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
          </label>
          <button
            type="submit"
            disabled={upsertMutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {upsertMutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </form>
        {formError && <p className="mt-2 text-sm text-red-400">{formError}</p>}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <p className="mb-4 text-sm font-medium text-slate-200">Serie cargada</p>
        {periodsLoading ? (
          <p className="text-sm text-slate-500">Cargando...</p>
        ) : !periods || periods.length === 0 ? (
          <p className="text-sm text-slate-500">Sin períodos cargados todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Mes</th>
                <th className="pb-2 pr-4 text-right">Variación</th>
                <th className="pb-2 pr-4 text-right">Índice</th>
                <th className="pb-2">Fuente</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/50">
                  <td className="py-2 pr-4 capitalize text-slate-300">{formatPeriod(p.period)}</td>
                  <td className="py-2 pr-4 text-right text-slate-300">{Number(p.monthlyVariationPct).toFixed(2)}%</td>
                  <td className="py-2 pr-4 text-right text-slate-300">{Number(p.indexValue).toFixed(4)}</td>
                  <td className="py-2 text-slate-400">{SOURCE_LABELS[p.source] ?? p.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
