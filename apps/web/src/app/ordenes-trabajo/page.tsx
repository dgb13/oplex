'use client';

import NewWorkOrderModal from '@/components/work-orders/NewWorkOrderModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { businessProfileApi, isModuleEnabled } from '@/lib/businessModules';
import { profileApi } from '@/lib/profile';
import { formatDate, formatDay, statusTone, workOrdersApi } from '@/lib/workOrders';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Scope = 'open' | 'closed' | 'all';

/** Órdenes de trabajo: las abiertas por estado, búsqueda por número,
 * patente, cliente o trabajo. */
export default function WorkOrdersPage() {
  const router = useRouter();
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const enabled = business ? isModuleEnabled(business, 'ordenes-trabajo') : undefined;
  const configQuery = useQuery({ queryKey: ['work-order-config'], queryFn: workOrdersApi.config, enabled: enabled === true });
  const [scope, setScope] = useState<Scope>('open');
  const [statusId, setStatusId] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const ordersQuery = useQuery({
    queryKey: ['work-orders', scope, statusId, search],
    queryFn: () => workOrdersApi.list({ scope: statusId ? 'all' : scope, statusId: statusId || undefined, q: search || undefined }),
    enabled: enabled === true,
  });
  // Conteo por estado de las abiertas, para las pastillas del filtro.
  const openQuery = useQuery({
    queryKey: ['work-orders', 'open-counts'],
    queryFn: () => workOrdersApi.list({ scope: 'open' }),
    enabled: enabled === true,
  });
  const config = configQuery.data;
  const orders = ordersQuery.data ?? [];
  const counts = new Map<string, number>();
  for (const o of openQuery.data ?? []) counts.set(o.status.id, (counts.get(o.status.id) ?? 0) + 1);
  const canWrite = profile?.role === 'OWNER' || profile?.role === 'ADMIN' || profile?.role === 'SALES';
  // Hoy en hora local, "2026-10-28" (en-CA da ese formato).
  const today = new Date().toLocaleDateString('en-CA');

  if (enabled === false) {
    return (
      <div className="flex max-w-xl flex-col gap-2">
        <h1 className="text-xl font-semibold">Órdenes de trabajo</h1>
        <p className="text-sm text-muted-foreground">
          El módulo está apagado. Se prende en tu menú de usuario →{' '}
          <Link href="/settings/modules" className="underline">
            Rubro y módulos
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{config?.pluralName ?? 'Órdenes de trabajo'}</h1>
          <p className="text-sm text-muted-foreground">Cada trabajo, de que entra hasta que se entrega.</p>
        </div>
        {canWrite && config && <Button onClick={() => setCreating(true)}>+ Nueva {config.docName.toLowerCase()}</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['open', 'closed', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={!statusId && scope === s}
            onClick={() => {
              setScope(s);
              setStatusId('');
            }}
            className={`h-8 rounded-full border px-3 text-xs font-medium ${
              !statusId && scope === s ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-card'
            }`}
          >
            {s === 'open' ? `Abiertas (${openQuery.data?.length ?? '…'})` : s === 'closed' ? 'Cerradas' : 'Todas'}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        {(config?.statuses ?? [])
          .filter((s) => s.active && !s.isFinal)
          .map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={statusId === s.id}
              onClick={() => setStatusId(statusId === s.id ? '' : s.id)}
              className={`h-8 rounded-full border px-3 text-xs font-medium ${
                statusId === s.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-card'
              }`}
            >
              {s.name} · {counts.get(s.id) ?? 0}
            </button>
          ))}
      </div>

      <div className="max-w-md">
        <label htmlFor="wo-q" className="sr-only">
          Buscar
        </label>
        <Input
          id="wo-q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscá por número, patente, cliente o trabajo"
          className="h-10"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
              <th className="p-3">Número</th>
              <th className="p-3">Ingresó</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">{config ? 'Vehículo / equipo' : ''}</th>
              <th className="p-3">Trabajo</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Prometido</th>
            </tr>
          </thead>
          <tbody>
            {ordersQuery.isLoading ? (
              <tr>
                <td colSpan={7} className="p-4 text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-muted-foreground">
                  {search ? 'No hay resultados para esa búsqueda.' : 'No hay órdenes acá.'}
                </td>
              </tr>
            ) : (
              orders.map((o) => {
                const late = !o.closedAt && o.promisedAt && o.promisedAt.slice(0, 10) < today;
                return (
                  <tr key={o.id} onClick={() => router.push(`/ordenes-trabajo/${o.id}`)} className="cursor-pointer border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3">
                      <Link href={`/ordenes-trabajo/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-mono font-semibold">
                        {o.number}
                      </Link>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatDate(o.createdAt)}</td>
                    <td className="p-3">{o.customer.name}</td>
                    <td className="p-3 font-mono">{o.asset?.identifier ?? '—'}</td>
                    <td className="max-w-[260px] truncate p-3 text-muted-foreground" title={o.description}>
                      {o.description}
                    </td>
                    <td className="p-3">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(o.status)}`}>{o.status.name}</span>
                    </td>
                    <td className={`p-3 ${late ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                      {formatDay(o.promisedAt)}
                      {late ? ' · atrasada' : ''}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {creating && config && (
        <NewWorkOrderModal docName={config.docName} onClose={() => setCreating(false)} onCreated={(o) => router.push(`/ordenes-trabajo/${o.id}`)} />
      )}
    </div>
  );
}
