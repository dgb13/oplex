'use client';

import { supplierReturnsApi, type GoodsReceiptDetail, type PurchaseOrderLineDetail } from '@/lib/purchases';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  purchaseOrderId: string;
  receipt: GoodsReceiptDetail;
  orderLines: PurchaseOrderLineDetail[];
  onClose: () => void;
}

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** Devolución al proveedor (p. ej. unidades defectuosas) de una recepción
 * puntual - no de la OC en general, siempre se elige de qué remito
 * concreto vinieron. Reabre "pendiente" en la OC (el backend resta lo
 * devuelto de lo recibido, ver GoodsReceiptService.getReceivedQuantitiesByLine),
 * así que después de esto "Recibir mercadería" puede volver a aparecer. */
export default function SupplierReturnModal({ purchaseOrderId, receipt, orderLines, onClose }: Props) {
  const queryClient = useQueryClient();

  const alreadyReturnedByLine = new Map<string, number>();
  for (const ret of receipt.returns) {
    for (const line of ret.lines) {
      alreadyReturnedByLine.set(
        line.goodsReceiptLineId,
        (alreadyReturnedByLine.get(line.goodsReceiptLineId) ?? 0) + Number(line.quantity),
      );
    }
  }

  const returnableLines = receipt.lines
    .map((line) => {
      const orderLine = orderLines.find((ol) => ol.id === line.purchaseOrderLine.id);
      const alreadyReturned = alreadyReturnedByLine.get(line.id) ?? 0;
      const available = Number(line.quantity) - alreadyReturned;
      return { line, orderLine, available };
    })
    .filter((l) => l.available > 0);

  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const lines = returnableLines
        .map((l) => ({ goodsReceiptLineId: l.line.id, quantity: quantities[l.line.id] ?? 0 }))
        .filter((l) => l.quantity > 0);
      return supplierReturnsApi.create({
        goodsReceiptId: receipt.id,
        reason,
        notes: notes || undefined,
        lines,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', purchaseOrderId] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar la devolución';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!reason.trim()) {
      setError('Ingresá el motivo de la devolución');
      return;
    }
    const toReturn = returnableLines.filter((l) => (quantities[l.line.id] ?? 0) > 0);
    if (toReturn.length === 0) {
      setError('Ingresá una cantidad mayor a cero en al menos una línea');
      return;
    }
    const overLine = toReturn.find((l) => (quantities[l.line.id] ?? 0) > l.available);
    if (overLine) {
      setError(
        `${overLine.orderLine?.articleVariant.article.name ?? 'Artículo'}: no podés devolver más de lo disponible (${overLine.available})`,
      );
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Devolver mercadería</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        {returnableLines.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">No queda nada disponible para devolver de esta recepción.</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Motivo">
              <textarea
                className={inputClass}
                rows={2}
                placeholder="p. ej. tapa en mal estado"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>

            <Field label="Notas (opcional)">
              <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">
                Líneas de esta recepción — la cantidad no puede superar lo disponible
              </label>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                      <th className="p-2">Artículo</th>
                      <th className="p-2 text-right">Recibido</th>
                      <th className="p-2 text-right">Disponible</th>
                      <th className="p-2 text-right">A devolver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnableLines.map(({ line, orderLine, available }) => (
                      <tr key={line.id} className="border-b border-border/50">
                        <td className="p-2">
                          <p className="">
                            {orderLine?.articleVariant.article.name ?? '—'}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">{orderLine?.articleVariant.sku}</p>
                        </td>
                        <td className="p-2 text-right">{line.quantity}</td>
                        <td className="p-2 text-right">{available}</td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={available}
                            step="any"
                            className={`${inputClass} w-24 text-right`}
                            value={quantities[line.id] ?? 0}
                            onChange={(e) =>
                              setQuantities((prev) => ({ ...prev, [line.id]: Number(e.target.value) }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
              >
                {mutation.isPending ? 'Registrando...' : 'Registrar devolución'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
