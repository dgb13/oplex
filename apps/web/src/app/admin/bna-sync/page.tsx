'use client';

import { adminBnaSyncApi } from '@/lib/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import AdminSelect from '../AdminSelect';

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, '0')}:00`,
}));

/** Único cron de esta plataforma con horario/on-off configurable en
 * caliente (ver ExchangeRateSchedulerService, apps/api) - corre una sola
 * vez para todos los tenants, por eso vive acá en Admin y no en Preferencias
 * de cada tenant (que sólo tiene alta de moneda + cotización manual/sync
 * puntual, ver CurrencySettings). */
export default function AdminBnaSyncPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-bna-sync-settings'],
    queryFn: adminBnaSyncApi.getSettings,
  });
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (patch: Partial<{ enabled: boolean; hour: number }>) => adminBnaSyncApi.updateSettings(patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-bna-sync-settings'] }),
  });

  const syncNowMutation = useMutation({
    mutationFn: adminBnaSyncApi.syncNow,
    onSuccess: (result) => {
      setSyncError(null);
      setSyncResult(`Sincronizado en ${result.synced} tenant(s), ${result.skipped} sin moneda USD o con error.`);
    },
    onError: (err) => {
      setSyncResult(null);
      setSyncError(extractErrorMessage(err, 'No se pudo sincronizar con Banco Nación'));
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Cotizaciones USD</h1>
      <p className="text-sm text-slate-400">
        Sweep diario que sincroniza la cotización oficial del dólar (Banco Nación) para todos los
        tenants que ya tengan la moneda USD configurada. No es por tenant - ver "Monedas y
        Cotizaciones" en Preferencias para el alta de moneda y la carga manual puntual.
      </p>

      {isLoading || !settings ? (
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
                checked={settings.bnaSyncEnabled}
                onChange={(e) => updateMutation.mutate({ enabled: e.target.checked })}
                className="h-5 w-5 accent-indigo-600"
              />
              <span className="text-sm text-slate-300">{settings.bnaSyncEnabled ? 'Activada' : 'Desactivada'}</span>
            </label>
          </div>

          <div className="flex items-center justify-between border-b border-slate-800 py-4">
            <p className="text-sm font-medium text-slate-200">Horario</p>
            <AdminSelect
              className="w-28"
              value={String(settings.bnaSyncHour)}
              onChange={(h) => updateMutation.mutate({ hour: Number(h) })}
              options={HOUR_OPTIONS}
            />
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
    </div>
  );
}
