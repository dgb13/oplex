'use client';

import ArticlePicker from '@/components/ArticlePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { inventoryApi, MOVEMENT_TYPES, type MovementType, type Warehouse } from '@/lib/inventory';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  warehouses: Warehouse[];
  onClose: () => void;
}


/** Freeform stock entry - NOT the way to receive against an Orden de
 * Compra anymore (see PurchaseOrderDetailPanel's "Recibir mercadería" /
 * ReceiveGoodsModal, which caps quantity at what's actually pending and
 * reads cost from the order itself). This modal used to also offer an
 * "Orden de Compra (opcional)" picker for PURCHASE_IN - it let anyone
 * type any quantity against any order with no validation at all, which
 * is exactly the bug that flow was built to close, so it was removed
 * (2026-07-29) rather than left as a parallel, unguarded path. The
 * backend rejects purchaseOrderId/goodsReceiptLineId on this endpoint
 * too (InventoryController.recordMovement) - this isn't just a UI
 * change, the loophole is closed server-side. */
export default function StockMovementModal({ warehouses, onClose }: Props) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    articleVariantId: '',
    warehouseId: warehouses[0]?.id ?? '',
    type: 'PURCHASE_IN' as MovementType,
    quantity: '',
    unitCost: '',
  });
  const [error, setError] = useState('');

  const needsCost = form.type === 'PURCHASE_IN' || form.type === 'PRODUCTION_IN';

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.recordMovement({
        articleVariantId: form.articleVariantId,
        warehouseId: form.warehouseId,
        type: form.type,
        quantity: Number(form.quantity),
        unitCost: needsCost ? Number(form.unitCost) : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el movimiento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.articleVariantId || !form.warehouseId || !form.quantity) {
      setError('Completá todos los campos');
      return;
    }
    if (Number(form.quantity) === 0) {
      setError('La cantidad no puede ser cero');
      return;
    }
    if (needsCost && !form.unitCost) {
      setError('Ingresá el costo unitario de la compra');
      return;
    }
    mutation.mutate();
  }

  const isAdjustment = form.type === 'ADJUSTMENT';
  const isPurchase = form.type === 'PURCHASE_IN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nuevo movimiento de stock</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Artículo / variante">
            <ArticlePicker
              value={form.articleVariantId}
              onChange={(variantId) => setForm({ ...form, articleVariantId: variantId })}
              // LINEAL_1D (barras/recortes) no puede entrar por acá - el
              // backend lo rechaza igual (InventoryController.recordMovement),
              // esto sólo evita que el usuario llegue a intentarlo. Ver
              // "Recibir mercadería" (Compras) / Producción para esos
              // artículos, que sí crean la StockPiece física.
              filter={(o) => o.measurementType !== 'LINEAL_1D'}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Los artículos medidos por pieza (barras/recortes) no aparecen acá - registrá su entrada desde
            Compras &gt; Recibir mercadería, o su consumo desde una Orden de producción.
          </p>

          <Field label="Depósito">
            <Select
              value={form.warehouseId}
              onChange={(warehouseId) => setForm({ ...form, warehouseId })}
              disabled={warehouses.length === 0}
              placeholder="Sin depósitos cargados"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </Field>

          <Field label="Tipo de movimiento">
            <Select
              value={form.type}
              onChange={(type) => setForm({ ...form, type: type as MovementType })}
              options={MOVEMENT_TYPES}
            />
          </Field>

          <Field label={isAdjustment ? 'Cantidad (+ entrada / − salida)' : 'Cantidad'}>
            <Input
              type="number"
              step="any"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder={isAdjustment ? 'p. ej. -3 o 5' : 'p. ej. 10'}
            />
          </Field>

          {needsCost && (
            <Field label="Costo unitario">
              <Input
                type="number"
                step="any"
                min="0"
                value={form.unitCost}
                onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
                placeholder="p. ej. 100.50"
              />
            </Field>
          )}

          {isPurchase && (
            <p className="text-xs text-muted-foreground">
              ¿Esta compra viene de una Orden de Compra ya enviada? Usá "Recibir mercadería" desde el
              detalle de esa orden en Compras, no este formulario — ahí el sistema valida la cantidad
              contra lo pendiente y toma el costo de la orden.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || warehouses.length === 0}>
              {mutation.isPending ? 'Guardando...' : 'Registrar'}
            </Button>
          </div>
        </form>
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
