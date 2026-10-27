'use client';

import { customerAssetsApi, formatAssetValue, type AssetFieldDef } from '@/lib/customerAssets';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { formatDate, formatDay, workOrdersApi } from '@/lib/workOrders';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Campos que van juntos en el título grande ("Toyota Hilux").
const TITLE_TYPES: AssetFieldDef['type'][] = ['TEXT', 'VEHICLE_BRAND', 'VEHICLE_MODEL'];

function Lines({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-7 border-b border-slate-400" />
      ))}
    </>
  );
}

/** Hoja de trabajo de una orden, para imprimir en A4 y dejar en el vehículo
 * o el equipo: quien hace el trabajo lee qué hay que hacer y completa a mano
 * lo que hizo. Uso interno: sin precios ni teléfono del cliente. Sin
 * AppShell: es una hoja (igual que el comprobante de ingreso). */
export default function WorkSheetPage() {
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
  // Los datos del día que entró (los kilómetros de ese día, no los de hoy).
  const assetFields = (assetType?.fields ?? []).filter(
    (f) => !f.hidden && !f.isIdentifier && order.assetSnapshot?.[f.key] !== undefined && order.assetSnapshot?.[f.key] !== '',
  );
  const titleFields = assetFields.filter((f) => TITLE_TYPES.includes(f.type)).slice(0, 2);
  const otherFields = assetFields.filter((f) => !titleFields.includes(f));
  const title = titleFields.map((f) => formatAssetValue(f, order.assetSnapshot?.[f.key])).join(' ');
  const detail = otherFields.map((f) => `${f.label}: ${formatAssetValue(f, order.assetSnapshot?.[f.key])}`).join(' · ');

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <style>{'@media print { .no-print { display: none !important; } @page { size: A4; margin: 10mm; } }'}</style>
      <div className="no-print flex justify-center gap-2 border-b bg-slate-50 p-3">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Imprimir / guardar PDF
        </button>
        <button type="button" onClick={() => window.close()} className="rounded-lg border px-4 py-2 text-sm">
          Cerrar
        </button>
      </div>

      <main className="mx-auto flex max-w-[760px] flex-col gap-3 p-8 text-sm print:p-0">
        <header>
          <p className="text-xs font-bold tracking-widest text-slate-600 uppercase">Hoja de trabajo · {configQuery.data.docName}</p>
          <p className="font-mono text-4xl leading-tight font-bold">{order.number}</p>
        </header>

        {order.asset && (
          <section className="flex items-center gap-5 rounded-xl border-2 border-slate-900 px-5 py-3">
            <div>
              <p className="text-[11px] font-bold tracking-wide text-slate-600 uppercase">{order.asset.typeName}</p>
              <p className="rounded-md border-2 border-slate-900 px-3 py-1 font-mono text-4xl font-bold tracking-wide">
                {order.asset.identifier}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              {title && <p className="text-3xl leading-tight font-extrabold">{title}</p>}
              {detail && <p className="mt-1 text-base text-slate-700">{detail}</p>}
            </div>
          </section>
        )}

        <section className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-100 px-3 py-2">
            <p className="text-[11px] font-bold tracking-wide text-slate-600 uppercase">Prometido</p>
            <p className="text-lg font-extrabold">{formatDay(order.promisedAt) || '—'}</p>
          </div>
          <div className="rounded-lg bg-slate-100 px-3 py-2">
            <p className="text-[11px] font-bold tracking-wide text-slate-600 uppercase">Responsable</p>
            <p className="text-lg font-bold">{order.assignedUserName ?? '—'}</p>
          </div>
          <div className="rounded-lg bg-slate-100 px-3 py-2">
            <p className="text-[11px] font-bold tracking-wide text-slate-600 uppercase">Cliente</p>
            <p className="text-lg font-bold">{order.customer.name}</p>
          </div>
        </section>

        <section>
          <p className="text-xs font-bold tracking-wide text-slate-600 uppercase">Qué hay que hacer</p>
          <p className="mt-1 text-base font-semibold whitespace-pre-line">{order.description}</p>
        </section>
        {order.intakeNotes && (
          <section>
            <p className="text-xs font-bold tracking-wide text-slate-600 uppercase">Cómo vino</p>
            <p className="mt-1 whitespace-pre-line text-slate-700">{order.intakeNotes}</p>
          </section>
        )}

        <section className="mt-1 flex flex-col gap-3 border-t-2 border-dashed border-slate-400 pt-3">
          <p className="text-xs font-extrabold tracking-widest uppercase">Para completar al terminar</p>

          <div>
            <p className="font-bold">Trabajo realizado</p>
            <Lines count={5} />
          </div>

          <div>
            <p className="font-bold">Repuestos usados</p>
            <div className="mt-1 grid grid-cols-[70px_1fr] text-[11px] font-bold tracking-wide text-slate-600 uppercase">
              <span>Cant.</span>
              <span>Descripción</span>
            </div>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="grid grid-cols-[70px_1fr]">
                <div className="h-7 border-r border-b border-slate-400" />
                <div className="h-7 border-b border-slate-400" />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6 font-bold">
            <p className="flex items-end gap-2">
              Horas trabajadas <span className="h-6 flex-1 border-b border-slate-400" />
            </p>
            <p className="flex items-end gap-2">
              Terminado el <span className="h-6 flex-1 border-b border-slate-400" />
            </p>
          </div>

          <div>
            <p className="font-bold">
              Para avisarle al cliente <span className="font-normal text-slate-600">(algo que conviene revisar más adelante)</span>
            </p>
            <Lines count={2} />
          </div>

          <div className="mt-4 flex justify-end">
            <p className="w-64 border-t border-slate-900 pt-1 text-center text-xs text-slate-700">Firma de quien hizo el trabajo</p>
          </div>
        </section>

        <footer className="mt-2 border-t pt-2 text-center text-[11px] text-slate-500">
          {businessName} · {order.number} · Ingresó el {formatDate(order.createdAt)} · Uso interno, sin precios
        </footer>
      </main>
    </div>
  );
}
