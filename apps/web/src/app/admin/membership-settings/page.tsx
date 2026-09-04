'use client';

import { adminMembershipSettingsApi } from '@/lib/memberships';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const HOUR_OPTIONS = [1, 2, 5, 8] as const;

/** "Duración de sesión de membership" - calcado de /admin/bna-sync, mismo
 * patrón GET+PATCH sobre PlatformSettings. Ver
 * docs/plan_modulo_contadores.txt, "Duración del token de sesión". */
export default function AdminMembershipSettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-membership-settings'],
    queryFn: adminMembershipSettingsApi.getSettings,
  });

  const updateMutation = useMutation({
    mutationFn: (hours: number) => adminMembershipSettingsApi.updateSettings(hours),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-membership-settings'] }),
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Sesión de contadores externos</h1>
      <p className="text-sm text-slate-400">
        Cuánto dura el token que recibe un contador al "entrar" a un cliente de su cartera (ver
        Contadores → Mi cartera → Entrar). Se aplica a cada activación nueva - no afecta sesiones ya
        emitidas.
      </p>

      {isLoading || !settings ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-200">Duración</p>
            <div className="flex gap-2">
              {HOUR_OPTIONS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => updateMutation.mutate(h)}
                  disabled={updateMutation.isPending}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                    settings.membershipSessionDurationHours === h
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
