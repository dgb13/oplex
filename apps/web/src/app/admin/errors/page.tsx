'use client';

import { adminErrorsApi, adminTenantsApi, type SystemErrorLog } from '@/lib/admin';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import AdminSelect from '../AdminSelect';

export default function AdminErrorsPage() {
  const [tenantId, setTenantId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: tenants } = useQuery({ queryKey: ['admin-tenants'], queryFn: adminTenantsApi.list });
  // No hay filtro de severidad: GlobalExceptionFilter sólo persiste acá
  // status >= 500 (ver ese archivo) - un 4xx nunca llega a esta tabla, así
  // que un selector "4xx/5xx" sería un filtro que siempre está vacío o
  // siempre da lo mismo que "Todos".
  const { data: errors, isLoading } = useQuery({
    queryKey: ['admin-errors', tenantId, from, to],
    queryFn: () =>
      adminErrorsApi.list({
        limit: 200,
        tenantId: tenantId || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Errores de plataforma</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Tenant</span>
          <AdminSelect
            className="min-w-48"
            buttonClassName="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
            value={tenantId}
            onChange={setTenantId}
            options={[{ value: '', label: 'Todos' }, ...(tenants ?? []).map((t) => ({ value: t.id, label: t.name }))]}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Desde</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Hasta</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando errores...</p>
        ) : !errors || errors.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin errores para este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Código</th>
                  <th className="p-3">Mensaje</th>
                  <th className="p-3">Ruta</th>
                  <th className="p-3">Tenant</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err) => (
                  <ErrorRow key={err.id} error={err} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ErrorRow({ error }: { error: SystemErrorLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-800/50 hover:bg-slate-800/30"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="p-3 whitespace-nowrap text-slate-400">{new Date(error.createdAt).toLocaleString('es-AR')}</td>
        <td className="p-3">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              error.statusCode >= 500 ? 'bg-red-900/50 text-red-300' : 'bg-amber-900/50 text-amber-300'
            }`}
          >
            {error.statusCode}
          </span>
        </td>
        <td className="p-3 text-slate-300">{error.message}</td>
        <td className="p-3 font-mono text-xs text-slate-500">
          {error.method} {error.path}
        </td>
        <td className="p-3 text-slate-400">{error.tenantId ?? '—'}</td>
      </tr>
      {expanded && error.stack && (
        <tr className="border-b border-slate-800/50 bg-slate-950/60">
          <td colSpan={5} className="p-3">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-slate-500">{error.stack}</pre>
          </td>
        </tr>
      )}
    </>
  );
}
