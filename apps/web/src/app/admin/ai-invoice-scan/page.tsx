'use client';

import { adminAiInvoiceScanApi } from '@/lib/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Kill-switch global de "Carga de comprobantes IA" - calcado de
 * /admin/membership-settings/bna-sync, mismo patrón GET+PATCH sobre
 * PlatformSettings. Ver docs/plan-carga-comprobantes-ia.md. */
export default function AdminAiInvoiceScanPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-ai-invoice-scan-settings'],
    queryFn: adminAiInvoiceScanApi.getSettings,
  });

  const updateMutation = useMutation({
    mutationFn: (enabled: boolean) => adminAiInvoiceScanApi.updateSettings(enabled),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-ai-invoice-scan-settings'] }),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Escaneo IA de comprobantes</h1>
      <p className="text-sm text-slate-400">
        Apaga la carga de comprobantes con IA para TODA la plataforma (ej. un incidente del proveedor de
        IA) - independiente del cupo mensual de cada plan, que se configura por plan en{' '}
        <span className="text-slate-300">Planes → Cupo IA/mes</span>.
      </p>

      {isLoading || !settings ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div>
            <p className="text-sm font-medium text-slate-200">Escaneo con IA habilitado</p>
            <p className="text-xs text-slate-500">
              {settings.aiInvoiceScanEnabled ? 'Activo para todos los tenants con cupo.' : 'Deshabilitado para toda la plataforma.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateMutation.mutate(!settings.aiInvoiceScanEnabled)}
            disabled={updateMutation.isPending}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
              settings.aiInvoiceScanEnabled
                ? 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            }`}
          >
            {settings.aiInvoiceScanEnabled ? 'Deshabilitar' : 'Habilitar'}
          </button>
        </div>
      )}
    </div>
  );
}
