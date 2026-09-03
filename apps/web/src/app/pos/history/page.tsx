'use client';

import AppShell from '@/components/AppShell';
import { posApi } from '@/lib/pos';
import { useQuery } from '@tanstack/react-query';

export default function PosHistoryPage() {
  const sessionsQuery = useQuery({ queryKey: ['pos-sessions-history'], queryFn: posApi.listSessions });
  const sessions = sessionsQuery.data ?? [];

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Historial de turnos</h1>

        {sessionsQuery.isLoading && <p className="text-sm text-slate-500">Cargando...</p>}
        {!sessionsQuery.isLoading && sessions.length === 0 && (
          <p className="text-sm text-slate-500">Todavía no se cerró ningún turno.</p>
        )}

        {sessions.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-900 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Caja</th>
                  <th className="px-4 py-3">Apertura</th>
                  <th className="px-4 py-3">Cierre</th>
                  <th className="px-4 py-3">Abrió</th>
                  <th className="px-4 py-3">Cerró</th>
                  <th className="px-4 py-3 text-right">Esperado</th>
                  <th className="px-4 py-3 text-right">Contado</th>
                  <th className="px-4 py-3 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sessions.map((s) => {
                  const diff = Number(s.difference ?? 0);
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3">{s.register.name}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(s.openedAt).toLocaleString('es-AR')}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {s.closedAt ? new Date(s.closedAt).toLocaleString('es-AR') : '-'}
                      </td>
                      <td className="px-4 py-3">{s.openedBy.name ?? s.openedBy.email}</td>
                      <td className="px-4 py-3">{s.closedBy ? (s.closedBy.name ?? s.closedBy.email) : '-'}</td>
                      <td className="px-4 py-3 text-right">${Number(s.expectedAmount ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">${Number(s.countedAmount ?? 0).toFixed(2)}</td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          diff === 0 ? 'text-slate-500' : diff > 0 ? 'text-blue-600' : 'text-red-600'
                        }`}
                      >
                        {diff === 0 ? 'Exacto' : `${diff > 0 ? '+' : ''}$${diff.toFixed(2)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
