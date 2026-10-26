'use client';

import { customerAssetsApi, formatAssetValue } from '@/lib/customerAssets';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { formatDate, formatDay, workOrdersApi } from '@/lib/workOrders';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Comprobante de ingreso de una orden de trabajo, para imprimir (o
 * guardar como PDF desde el navegador) y que el cliente firme. Sin AppShell:
 * es una hoja. */
export default function IntakeReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    if (!localStorage.getItem('token')) router.replace('/login');
  }, [router]);

  const orderQuery = useQuery({ queryKey: ['work-order', id], queryFn: () => workOrdersApi.get(id) });
  const configQuery = useQuery({ queryKey: ['work-order-config'], queryFn: workOrdersApi.config });
  const settingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  const order = orderQuery.data;
  const typesQuery = useQuery({
    queryKey: ['customer-asset-types'],
    queryFn: customerAssetsApi.listTypes,
    enabled: Boolean(order?.asset),
  });

  if (!order || !configQuery.data || !settingsQuery.data) {
    return <p className="p-8 text-sm text-slate-500">Cargando…</p>;
  }
  const settings = settingsQuery.data;
  const businessName = settings.tradeName || settings.tenantName || '';
  const assetType = typesQuery.data?.find((t) => t.id === order.asset?.typeId);
  const assetFields = (assetType?.fields ?? []).filter((f) => !f.hidden && order.assetSnapshot?.[f.key] !== undefined);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{'@media print { .no-print { display: none !important; } @page { margin: 14mm; } }'}</style>
      <div className="no-print flex justify-center gap-2 border-b bg-slate-50 p-3">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Imprimir / guardar PDF
        </button>
        <button type="button" onClick={() => window.close()} className="rounded-lg border px-4 py-2 text-sm">
          Cerrar
        </button>
      </div>

      <main className="mx-auto max-w-[760px] p-8 text-sm">
        <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-4">
          <div>
            <p className="text-xl font-bold">{businessName}</p>
            <p className="text-slate-600">
              {[settings.tenantTaxId ? `CUIT ${settings.tenantTaxId}` : null, settings.contactPhone, settings.fiscalAddress].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-slate-500">{configQuery.data.docName}</p>
            <p className="font-mono text-xl font-bold">{order.number}</p>
            <p className="text-slate-600">Ingreso: {formatDate(order.createdAt)}</p>
          </div>
        </header>

        <h1 className="mt-5 text-base font-bold uppercase tracking-wide">Comprobante de ingreso</h1>

        <section className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Cliente</p>
            <p className="font-semibold">{order.customer.name}</p>
            {order.customer.phone && <p>{order.customer.phone}</p>}
          </div>
          {order.asset && (
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">{order.asset.typeName}</p>
              <p className="font-mono text-base font-bold">{order.asset.identifier}</p>
              {assetFields
                .filter((f) => !f.isIdentifier)
                .map((f) => (
                  <p key={f.key}>
                    <span className="text-slate-500">{f.label}:</span> {formatAssetValue(f, order.assetSnapshot?.[f.key])}
                  </p>
                ))}
            </div>
          )}
        </section>

        <section className="mt-5">
          <p className="text-xs font-semibold uppercase text-slate-500">Trabajo pedido</p>
          <p className="mt-1 min-h-[3rem] whitespace-pre-line rounded border p-2">{order.description}</p>
        </section>
        <section className="mt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Cómo ingresó</p>
          <p className="mt-1 min-h-[3rem] whitespace-pre-line rounded border p-2">{order.intakeNotes ?? ''}</p>
        </section>
        <section className="mt-4 grid grid-cols-2 gap-6">
          <p>
            <span className="text-slate-500">Prometido para:</span> {formatDay(order.promisedAt) || '—'}
          </p>
          <p>
            <span className="text-slate-500">Responsable:</span> {order.assignedUserName ?? '—'}
          </p>
        </section>

        <p className="mt-6 text-xs text-slate-600">
          El cliente deja lo detallado arriba para el trabajo indicado. Cualquier trabajo adicional se
          presupuesta y se hace sólo con su aprobación.
        </p>

        <section className="mt-14 grid grid-cols-3 gap-6 text-center text-xs text-slate-600">
          <p className="border-t border-slate-400 pt-1">Firma del cliente</p>
          <p className="border-t border-slate-400 pt-1">Aclaración</p>
          <p className="border-t border-slate-400 pt-1">Recibió</p>
        </section>

        <footer className="mt-10 border-t pt-2 text-center text-[11px] text-slate-500">
          Documento no válido como factura · {businessName} · {order.number}
        </footer>
      </main>
    </div>
  );
}
