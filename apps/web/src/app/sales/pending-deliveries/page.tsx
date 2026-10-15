'use client';

import { Button } from '@/components/ui/button';
import { invoicingApi, type PendingDeliveryRow } from '@/lib/invoicing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';

const QTY = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

function apiError(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : (message ?? fallback);
}

/**
 * Ventas → Pendientes de entrega (mockup aprobado el 2026-10-15): lo
 * facturado sin stock que todavía no salió del depósito. "Entregar" descuenta
 * del depósito de la factura (lo que haya, hasta lo pendiente) y registra el
 * costo de lo vendido con el costo de ese momento.
 */
export default function PendingDeliveriesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['pending-deliveries'], queryFn: invoicingApi.listPendingDeliveries, refetchInterval: 60_000 });
  const rows = query.data ?? [];
  const deliverable = rows.filter((r) => r.availableNow > 0).length;

  const deliver = useMutation({
    mutationFn: (row: PendingDeliveryRow) => invoicingApi.deliverPending(row.id, Math.min(row.quantityPending, row.availableNow)),
    onSuccess: (next, row) => {
      queryClient.setQueryData(['pending-deliveries'], next);
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      const amount = Math.min(row.quantityPending, row.availableNow);
      toast.success(
        amount < row.quantityPending
          ? `Entregaste ${QTY.format(amount)} de ${row.articleName}. Quedan ${QTY.format(row.quantityPending - amount)} pendientes.`
          : `Entregaste ${QTY.format(amount)} de ${row.articleName} (${row.invoiceLabel}).`,
      );
    },
    onError: (err) => toast.error(apiError(err, 'No se pudo registrar la entrega.')),
  });

  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] border bg-card p-[18px]">
      <div>
        <h1 className="m-0 text-[19px] font-semibold">Pendientes de entrega</h1>
        <p className="m-0 text-sm text-muted-foreground">Artículos facturados que todavía no salieron del depósito.</p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <div className="rounded-[10px] border px-3 py-2 text-[12.5px] text-muted-foreground">
          <b className="block text-lg text-foreground">{rows.length}</b>
          {rows.length === 1 ? 'línea pendiente' : 'líneas pendientes'}
        </div>
        <div className="rounded-[10px] border px-3 py-2 text-[12.5px] text-muted-foreground">
          <b className="block text-lg text-foreground">{deliverable}</b>
          se {deliverable === 1 ? 'puede' : 'pueden'} entregar ya
        </div>
      </div>

      <div className="overflow-x-auto rounded-[10px] border">
        <table className="w-full border-collapse text-[13px] tabular-nums">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2.5 py-2 font-semibold">Factura</th>
              <th className="px-2.5 py-2 font-semibold">Cliente</th>
              <th className="px-2.5 py-2 font-semibold">Artículo</th>
              <th className="px-2.5 py-2 text-right font-semibold">Pendiente</th>
              <th className="px-2.5 py-2 font-semibold">Stock ahora</th>
              <th className="px-2.5 py-2" />
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td colSpan={6} className="px-2.5 py-6 text-center text-muted-foreground">
                  Cargando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2.5 py-6 text-center text-muted-foreground">
                  No hay entregas pendientes. Cuando factures algo sin stock suficiente, aparece acá.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t align-middle">
                  <td className="px-2.5 py-2">
                    {row.invoiceLabel}
                    <br />
                    <span className="text-xs text-muted-foreground">{DATE.format(new Date(row.issueDate))}</span>
                  </td>
                  <td className="px-2.5 py-2">{row.customerName}</td>
                  <td className="px-2.5 py-2">
                    {row.articleName}
                    <br />
                    <span className="text-xs text-muted-foreground">{row.warehouseName}</span>
                  </td>
                  <td className="px-2.5 py-2 text-right">{QTY.format(row.quantityPending)}</td>
                  <td className="px-2.5 py-2">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        row.availableNow > 0
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      hay {QTY.format(row.availableNow)}
                    </span>
                  </td>
                  <td className="px-2.5 py-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={row.availableNow <= 0 || deliver.isPending}
                      onClick={() => deliver.mutate(row)}
                      title={row.availableNow <= 0 ? 'Todavía no hay stock en el depósito para entregar' : undefined}
                    >
                      Entregar
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="m-0 text-xs text-muted-foreground">
        &quot;Entregar&quot; descuenta del depósito elegido en la factura y registra el costo de lo vendido con el costo de ese momento. Se
        puede entregar una parte. Si se anula la factura con una nota de crédito, lo pendiente se cancela sin tocar el stock. En el detalle
        de la factura aparece la marca &quot;Pendiente de entrega&quot;.
      </p>
    </div>
  );
}
