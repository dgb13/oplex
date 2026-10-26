'use client';

import { businessProfileApi, isModuleEnabled } from '@/lib/businessModules';
import { formatAssetValue, type CustomerAssetType } from '@/lib/customerAssets';
import { profileApi } from '@/lib/profile';
import { formatDate, statusTone, workOrdersApi } from '@/lib/workOrders';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import NewWorkOrderModal from './NewWorkOrderModal';

/** Historial de un vehículo / equipo en su ficha: sus órdenes de trabajo,
 * con los datos del día que entró (los km). */
export default function AssetWorkOrderHistory({
  assetId,
  customerId,
  type,
}: {
  assetId: string;
  customerId: string;
  type: CustomerAssetType | undefined;
}) {
  const router = useRouter();
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const enabled = Boolean(business) && isModuleEnabled(business, 'ordenes-trabajo');
  const configQuery = useQuery({ queryKey: ['work-order-config'], queryFn: workOrdersApi.config, enabled });
  const ordersQuery = useQuery({
    queryKey: ['work-orders', 'asset', assetId],
    queryFn: () => workOrdersApi.list({ assetId, scope: 'all' }),
    enabled,
  });
  const [creating, setCreating] = useState(false);
  const canWrite = profile?.role === 'OWNER' || profile?.role === 'ADMIN' || profile?.role === 'SALES';
  const numberFields = (type?.fields ?? []).filter((f) => f.type === 'NUMBER' && !f.hidden);

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Historial</h2>
        {enabled && canWrite && configQuery.data && (
          <button type="button" onClick={() => setCreating(true)} className="text-sm font-medium text-indigo-600 hover:underline">
            + Cargar {configQuery.data.docName.toLowerCase()}
          </button>
        )}
      </div>
      {!enabled ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Prendé Órdenes de trabajo en{' '}
          <Link href="/settings/modules" className="underline">
            Rubro y módulos
          </Link>{' '}
          para llevar el historial de trabajos.
        </p>
      ) : (ordersQuery.data ?? []).length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Todavía no tiene trabajos.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 pr-3">Fecha</th>
                <th className="py-2 pr-3">Orden</th>
                {numberFields.slice(0, 2).map((f) => (
                  <th key={f.key} className="py-2 pr-3">
                    {f.label}
                  </th>
                ))}
                <th className="py-2 pr-3">Trabajo</th>
                <th className="py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(ordersQuery.data ?? []).map((o) => (
                <tr key={o.id} onClick={() => router.push(`/ordenes-trabajo/${o.id}`)} className="cursor-pointer border-b last:border-0 hover:bg-muted/40">
                  <td className="py-2 pr-3 text-muted-foreground">{formatDate(o.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/ordenes-trabajo/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-mono font-semibold">
                      {o.number}
                    </Link>
                  </td>
                  {numberFields.slice(0, 2).map((f) => (
                    <td key={f.key} className="py-2 pr-3">
                      {formatAssetValue(f, o.assetSnapshot?.[f.key]) || '—'}
                    </td>
                  ))}
                  <td className="max-w-[280px] truncate py-2 pr-3" title={o.description}>
                    {o.description}
                  </td>
                  <td className="py-2">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(o.status)}`}>{o.status.name}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && configQuery.data && (
        <NewWorkOrderModal
          docName={configQuery.data.docName}
          defaultCustomerId={customerId}
          defaultAssetId={assetId}
          onClose={() => setCreating(false)}
          onCreated={(o) => router.push(`/ordenes-trabajo/${o.id}`)}
        />
      )}
    </section>
  );
}
