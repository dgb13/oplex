'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { inventoryApi } from '@/lib/inventory';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  variant: {
    id: string;
    sku: string;
    articleId: string;
    articleName: string;
    unitPrice: number;
    markupPercent: number | null;
  };
  onClose: () => void;
}

/** Historial de precios (siempre visible) + edición de precio de venta y
 * % de remarca del artículo (antes no existía NINGUNA UI para editar el
 * precio de un artículo ya existente - PATCH /inventory/article-variants/
 * :id/price existía en el backend sin ningún consumidor en el frontend,
 * ver PROGRESS.md). El costo mostrado es sólo informativo (el más
 * reciente de PriceHistory) - nunca editable acá, el costo real sólo se
 * actualiza vía movimientos PURCHASE_IN/PRODUCTION_IN reales. El % de
 * remarca sólo PRE-COMPLETA el precio sugerido al tocar "Usar sugerido" -
 * nunca sobreescribe el precio de venta solo. */
export default function ArticlePriceHistoryModal({ variant, onClose }: Props) {
  const queryClient = useQueryClient();
  const historyQuery = useQuery({
    queryKey: ['price-history', variant.id],
    queryFn: () => inventoryApi.getPriceHistory(variant.id),
  });
  const settingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  const entries = historyQuery.data ?? [];
  const latestCost = entries.find((e) => e.costPrice !== null)?.costPrice ?? null;

  const [markupInput, setMarkupInput] = useState(variant.markupPercent?.toString() ?? '');
  const [priceInput, setPriceInput] = useState(variant.unitPrice.toString());
  const [error, setError] = useState('');

  const effectiveMarkup = markupInput.trim() !== '' ? Number(markupInput) : settingsQuery.data?.defaultMarkupPercent;
  const suggestedPrice =
    latestCost !== null && effectiveMarkup != null && !Number.isNaN(effectiveMarkup)
      ? Number(latestCost) * (1 + effectiveMarkup / 100)
      : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const newMarkup = markupInput.trim() === '' ? null : Number(markupInput);
      if (newMarkup !== variant.markupPercent) {
        await inventoryApi.updateArticle(variant.articleId, { markupPercent: newMarkup });
      }
      const newPrice = Number(priceInput);
      if (newPrice !== variant.unitPrice) {
        await inventoryApi.updateArticleVariantPrice(variant.id, newPrice);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      void queryClient.invalidateQueries({ queryKey: ['price-history', variant.id] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar el precio';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (priceInput.trim() === '' || Number(priceInput) <= 0) {
      setError('Ingresá un precio de venta válido');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-card p-6 text-card-foreground shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Precio</h2>
            <p className="text-xs text-muted-foreground">
              {variant.articleName} · <span className="font-mono">{variant.sku}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="mb-6 flex flex-col gap-3 rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">
            Costo actual:{' '}
            {latestCost !== null ? (
              <span className="font-medium text-foreground">${Number(latestCost).toFixed(2)}</span>
            ) : (
              'sin costo registrado todavía (ninguna compra real todavía)'
            )}{' '}
            — informativo, se actualiza solo con una compra real.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">% de remarca del artículo</span>
              <Input
                type="number"
                min={0}
                step="any"
                value={markupInput}
                onChange={(e) => setMarkupInput(e.target.value)}
                placeholder={
                  settingsQuery.data?.defaultMarkupPercent != null
                    ? `Default: ${settingsQuery.data.defaultMarkupPercent}`
                    : 'Sin default configurado'
                }
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Precio de venta</span>
              <Input type="number" min={0} step="any" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
            </label>
          </div>

          {suggestedPrice !== null && (
            <p className="text-xs text-muted-foreground">
              Sugerido según costo × remarca: <span className="font-medium">${suggestedPrice.toFixed(2)}</span>{' '}
              <button type="button" onClick={() => setPriceInput(suggestedPrice.toFixed(2))} className="text-primary hover:underline">
                Usar sugerido
              </button>
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>

        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Historial</h3>
        {historyQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">Cargando...</div>
        ) : entries.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            Sin registros de precio todavía
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Fecha</th>
                  <th className="pb-2 pr-4 text-right">Precio venta</th>
                  <th className="pb-2 pr-4 text-right">Costo</th>
                  <th className="pb-2">Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/50">
                    <td className="py-2 pr-4 text-muted-foreground">
                      {new Date(entry.effectiveAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-2 pr-4 text-right">${Number(entry.unitPrice).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">
                      {entry.costPrice !== null ? `$${Number(entry.costPrice).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 text-muted-foreground">{entry.purchaseOrderNumber ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
