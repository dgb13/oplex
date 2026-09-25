'use client';

import { adminAuditApi, adminTenantsApi } from '@/lib/admin';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import AdminSelect from '../AdminSelect';

const PAGE_SIZE = 50;

export default function AdminActivityPage() {
  const [tenantId, setTenantId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: tenants } = useQuery({ queryKey: ['admin-tenants'], queryFn: adminTenantsApi.list });
  const { data, isLoading } = useQuery({
    queryKey: ['admin-activity', tenantId, from, to, page],
    queryFn: () =>
      adminAuditApi.list({
        tenantId: tenantId || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  function resetToFirstPage() {
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white">Actividad (todos los tenants)</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Tenant</span>
          <AdminSelect
            className="min-w-48"
            buttonClassName="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
            value={tenantId}
            onChange={(id) => {
              setTenantId(id);
              resetToFirstPage();
            }}
            options={[{ value: '', label: 'Todos' }, ...(tenants ?? []).map((t) => ({ value: t.id, label: t.name }))]}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Desde</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetToFirstPage();
            }}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-slate-500">Hasta</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetToFirstPage();
            }}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
          />
        </label>
        {(tenantId || from || to) && (
          <button
            type="button"
            onClick={() => {
              setTenantId('');
              setFrom('');
              setTo('');
              resetToFirstPage();
            }}
            className="rounded-lg px-3 py-1.5 text-xs text-slate-400 transition hover:text-slate-200"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando actividad...</p>
        ) : !data || data.items.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin actividad para este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Tenant</th>
                  <th className="p-3">Usuario</th>
                  <th className="p-3">Acción</th>
                  <th className="p-3">Entidad</th>
                  <th className="p-3">Resultado</th>
                  <th className="p-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="p-3 whitespace-nowrap text-slate-400">
                      {new Date(row.occurredAt).toLocaleString('es-AR')}
                    </td>
                    <td className="p-3 text-slate-300">{row.tenantName}</td>
                    <td className="p-3 text-slate-300">{row.userEmail ?? row.userId ?? '—'}</td>
                    <td className="p-3 font-mono text-xs text-slate-400">{row.action}</td>
                    <td className="p-3 text-slate-400">
                      {row.entityType ? `${row.entityType}${row.entityLabel ? ` · ${row.entityLabel}` : ''}` : '—'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          row.outcome === 'SUCCESS' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                        }`}
                      >
                        {row.outcome}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-500">{row.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && (data.page > 1 || data.hasMore) && (
        <div className="flex items-center justify-center gap-3 text-sm text-slate-400">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs transition hover:bg-slate-800 disabled:opacity-40"
          >
            Anterior
          </button>
          <span>Página {data.page}</span>
          <button
            type="button"
            disabled={!data.hasMore}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs transition hover:bg-slate-800 disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
