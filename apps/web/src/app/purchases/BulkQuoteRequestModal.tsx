'use client';

import { Button } from '@/components/ui/button';
import { quoteRequestsApi } from '@/lib/purchases';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

export interface GroupedPedidoLine {
  articleVariantId: string;
  sku: string;
  articleName: string;
  variantLabel: string | null;
  quantity: number;
}

export interface GroupedPedido {
  supplierId: string;
  supplierName: string;
  lines: GroupedPedidoLine[];
  // Ej. "Solicitado por Orden de producción de Pan casero redondo
  // (#a1b2c3d4)" - mismo texto en las N líneas de un mismo grupo, ver
  // ProductionOrderDetailPage. Undefined en el flujo de Alertas de stock
  // (StockAlertsPanel), que no lo necesita.
  notes?: string;
}

/** Un Pedido de Cotización por proveedor, de un click - extraído de
 * StockAlertsPanel (donde nació, para "reponer stock bajo mínimo") para
 * que ProductionOrderDetailPage lo reuse tal cual para "comprar insumos
 * faltantes de esta orden", mismo mecanismo exacto en los dos lugares. */
export default function BulkQuoteRequestModal({
  groups,
  currencyId,
  onClose,
  onDone,
}: {
  groups: GroupedPedido[];
  currencyId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      Promise.all(
        groups.map((g) =>
          quoteRequestsApi.create({
            supplierId: g.supplierId,
            currencyId,
            notes: g.notes,
            lines: g.lines.map((l) => ({ articleVariantId: l.articleVariantId, quantity: l.quantity })),
          }),
        ),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      onDone();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudieron crear los pedidos';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Crear {groups.length} pedido{groups.length !== 1 ? 's' : ''} de cotización
          </h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Un pedido independiente por proveedor, con estas líneas. Podés ajustar moneda, notas u otros
          datos después, editando cada pedido en Compras.
        </p>

        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.supplierId} className="rounded-lg border p-3">
              <p className="text-sm font-semibold">{g.supplierName}</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                {g.lines.map((l) => (
                  <li key={l.articleVariantId}>
                    {l.sku} — {l.articleName}
                    {l.variantLabel ? ` (${l.variantLabel})` : ''}: {l.quantity} u.
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {!currencyId && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            No hay ninguna moneda configurada todavía - no se puede crear el pedido.
          </p>
        )}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || !currencyId}>
            {mutation.isPending
              ? 'Creando...'
              : `Crear ${groups.length} pedido${groups.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
