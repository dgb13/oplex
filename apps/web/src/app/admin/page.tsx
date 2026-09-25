'use client';

import { adminErrorsApi, adminTenantsApi, type TenantStatus, type TenantSummary } from '@/lib/admin';
import { startImpersonation } from '@/lib/impersonation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AdminSelect from './AdminSelect';

// Same extraction as CompanyFormModal/LoginPage - without this, a failed
// suspend/reactivate/impersonate silently reset the row back to its normal
// buttons with zero indication anything went wrong.
function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const STATUS_LABELS: Record<TenantStatus, string> = { ACTIVE: 'Activo', SUSPENDED: 'Suspendido' };
const STATUS_COLORS: Record<TenantStatus, string> = {
  ACTIVE: 'bg-green-900/50 text-green-300',
  SUSPENDED: 'bg-red-900/50 text-red-300',
};

export default function AdminTenantsPage() {
  const { data: tenants, isLoading } = useQuery({ queryKey: ['admin-tenants'], queryFn: adminTenantsApi.list });
  const { data: recentErrors } = useQuery({
    queryKey: ['admin-errors-recent'],
    queryFn: () => adminErrorsApi.list({ limit: 200 }),
  });

  const errorsLast24h =
    recentErrors?.filter((e) => Date.now() - new Date(e.createdAt).getTime() < 24 * 60 * 60 * 1000).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Tenants</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Tenants totales" value={tenants ? String(tenants.length) : '—'} />
        <StatCard
          label="Suspendidos"
          value={tenants ? String(tenants.filter((t) => t.status === 'SUSPENDED').length) : '—'}
          alert={!!tenants?.some((t) => t.status === 'SUSPENDED')}
        />
        <StatCard label="Errores 5xx (24hs)" value={String(errorsLast24h)} alert={errorsLast24h > 0} />
      </div>

      {tenants && tenants.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-4 text-sm font-medium text-slate-400">Facturas emitidas este mes, por tenant</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={tenants}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={40} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="invoicesThisMonth" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando tenants...</p>
        ) : !tenants || tenants.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin tenants todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="p-3">Tenant</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Plan</th>
                  <th className="p-3">Suscripción</th>
                  <th className="p-3 text-right">Usuarios</th>
                  <th className="p-3 text-right">Facturas/mes</th>
                  <th className="p-3">Creado</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => (
                  <TenantRow key={tenant.id} tenant={tenant} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alert ? 'border-red-900 bg-red-950/40' : 'border-slate-800 bg-slate-900'}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${alert ? 'text-red-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function TenantRow({ tenant }: { tenant: TenantSummary }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-tenant-users', tenant.id],
    queryFn: () => adminTenantsApi.listUsers(tenant.id),
    enabled: impersonating,
  });

  const statusMutation = useMutation({
    mutationFn: (status: TenantStatus) => adminTenantsApi.updateStatus(tenant.id, status),
    onSuccess: () => {
      setConfirmingStatus(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: (userId: string) => adminTenantsApi.impersonate(tenant.id, userId),
    onSuccess: (result) => startImpersonation(queryClient, router, tenant.id, result.accessToken, result.expiresAt),
  });

  const nextStatus: TenantStatus = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30">
      <td className="p-3 font-medium text-slate-200">{tenant.name}</td>
      <td className="p-3">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[tenant.status]}`}>
          {STATUS_LABELS[tenant.status]}
        </span>
      </td>
      <td className="p-3 text-slate-300">{tenant.planKey ?? '—'}</td>
      <td className="p-3 text-slate-400">{tenant.subscriptionStatus ?? '—'}</td>
      <td className="p-3 text-right text-slate-300">{tenant.activeUsers}</td>
      <td className="p-3 text-right text-slate-300">{tenant.invoicesThisMonth}</td>
      <td className="p-3 text-slate-500">{new Date(tenant.createdAt).toLocaleDateString('es-AR')}</td>
      <td className="p-3">
        {confirmingStatus ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-amber-400">
              {nextStatus === 'SUSPENDED'
                ? '¿Confirmás suspender este tenant? No van a poder loguearse.'
                : '¿Confirmás reactivar este tenant?'}
            </span>
            <button
              type="button"
              onClick={() => statusMutation.mutate(nextStatus)}
              disabled={statusMutation.isPending}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              {statusMutation.isPending ? 'Aplicando...' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingStatus(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:text-slate-200"
            >
              Volver
            </button>
            {statusMutation.isError && (
              <span className="text-xs text-red-400">
                {extractErrorMessage(statusMutation.error, 'No se pudo aplicar el cambio')}
              </span>
            )}
          </div>
        ) : impersonating ? (
          <div className="flex flex-wrap items-center gap-2">
            {usersLoading ? (
              <span className="text-xs text-slate-500">Cargando usuarios...</span>
            ) : (
              <AdminSelect
                className="min-w-56"
                buttonClassName="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
                value={selectedUserId}
                onChange={setSelectedUserId}
                placeholder="Elegí un usuario"
                options={(users ?? []).map((u) => ({ value: u.id, label: `${u.email} (${u.role})` }))}
              />
            )}
            <button
              type="button"
              onClick={() => selectedUserId && impersonateMutation.mutate(selectedUserId)}
              disabled={!selectedUserId || impersonateMutation.isPending}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              {impersonateMutation.isPending ? 'Ingresando...' : 'Confirmar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setImpersonating(false);
                setSelectedUserId('');
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:text-slate-200"
            >
              Volver
            </button>
            {impersonateMutation.isError && (
              <span className="text-xs text-red-400">
                {extractErrorMessage(impersonateMutation.error, 'No se pudo impersonar a este usuario')}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmingStatus(true)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                tenant.status === 'ACTIVE'
                  ? 'border-red-800 text-red-400 hover:bg-red-950'
                  : 'border-green-800 text-green-400 hover:bg-green-950'
              }`}
            >
              {tenant.status === 'ACTIVE' ? 'Suspender' : 'Activar'}
            </button>
            <button
              type="button"
              onClick={() => setImpersonating(true)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
            >
              Impersonar
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
