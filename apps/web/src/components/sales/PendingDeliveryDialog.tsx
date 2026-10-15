'use client';

import { Button } from '@/components/ui/button';
import type { StockShortage } from '@/lib/invoicing';

const QTY = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

/**
 * "Falta stock para entregar todo" (mockup aprobado el 2026-10-15): antes de
 * emitir, cuando alguna línea no alcanza con el stock del depósito. "Facturar
 * igual" emite con allowPendingDelivery: lo que hay se entrega ahora y el
 * resto queda en Ventas → Pendientes de entrega.
 */
export function PendingDeliveryDialog({
  shortages,
  pending,
  onBack,
  onConfirm,
}: {
  shortages: StockShortage[];
  pending: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-labelledby="pending-delivery-title"
        className="w-full max-w-[560px] rounded-xl border bg-card shadow-2xl"
      >
        <h3 id="pending-delivery-title" className="px-[18px] pt-4 pb-1.5 text-[17px] font-semibold">
          Falta stock para entregar todo
        </h3>
        <p className="mx-[18px] text-[13.5px] leading-normal text-muted-foreground">
          Podés facturar igual. Lo que hay se entrega ahora y lo que falta queda <b className="text-foreground">pendiente de entrega</b>
          : no se descuenta del stock hasta que lo entregues desde Ventas → Pendientes de entrega.
        </p>
        <div className="mx-[18px] my-3 overflow-x-auto rounded-[10px] border">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2.5 py-2 font-semibold">Artículo</th>
                <th className="px-2.5 py-2 text-right font-semibold">Facturás</th>
                <th className="px-2.5 py-2 text-right font-semibold">Se entrega ahora</th>
                <th className="px-2.5 py-2 text-right font-semibold">Queda pendiente</th>
              </tr>
            </thead>
            <tbody>
              {shortages.map((s) => (
                <tr key={s.articleVariantId} className="border-t">
                  <td className="px-2.5 py-2">{s.articleName}</td>
                  <td className="px-2.5 py-2 text-right">{QTY.format(s.requested)}</td>
                  <td className="px-2.5 py-2 text-right">{QTY.format(s.deliverNow)}</td>
                  <td className="px-2.5 py-2 text-right">
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                      {QTY.format(s.pending)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mx-[18px] text-xs text-muted-foreground">Avisamos en la campana a quienes manejan el depósito.</p>
        <div className="flex flex-wrap justify-end gap-2.5 px-[18px] pt-3 pb-4">
          <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
            Volver y corregir
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending} autoFocus>
            {pending ? 'Emitiendo...' : 'Facturar igual'}
          </Button>
        </div>
      </div>
    </div>
  );
}
