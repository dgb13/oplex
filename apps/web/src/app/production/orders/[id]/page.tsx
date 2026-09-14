'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildArticleVariantLookup, inventoryApi } from '@/lib/inventory';
import { productionApi } from '@/lib/production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProductionPlanGateBanner, useProductionGate } from '../../ProductionPlanGate';
import { PRODUCTION_STATUS_COLORS, PRODUCTION_STATUS_LABELS } from '../../status';

export default function ProductionOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const gate = useProductionGate();
  const [error, setError] = useState('');
  const [confirmWarehouseId, setConfirmWarehouseId] = useState('');

  const orderQuery = useQuery({
    queryKey: ['production-order', id],
    queryFn: () => productionApi.getOrder(id),
    enabled: gate.enabled,
  });
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
    enabled: gate.enabled,
  });
  const warehousesQuery = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: inventoryApi.listWarehouses,
    enabled: gate.enabled,
  });
  const lookup = useMemo(() => buildArticleVariantLookup(articlesQuery.data ?? []), [articlesQuery.data]);
  const warehouseLookup = useMemo(
    () => Object.fromEntries((warehousesQuery.data ?? []).map((w) => [w.id, w.name])),
    [warehousesQuery.data],
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['production-order', id] });
    void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
  }

  function useAction(fn: () => Promise<unknown>) {
    return useMutation({
      mutationFn: fn,
      onSuccess: invalidate,
      onError: (err: AxiosError<{ message?: string | string[] }>) => {
        const message = err.response?.data?.message ?? 'La acción no se pudo completar';
        setError(Array.isArray(message) ? message.join(', ') : message);
      },
    });
  }

  const confirmMutation = useAction(() => productionApi.confirmOrder(id, confirmWarehouseId));
  const completeMutation = useAction(() => productionApi.completeOrder(id));
  const cancelMutation = useAction(() => productionApi.cancelOrder(id));

  if (gate.isLoading) {
    return null;
  }
  if (!gate.enabled) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Orden de producción</h1>
        <ProductionPlanGateBanner planName={gate.planName} />
      </div>
    );
  }

  const order = orderQuery.data;
  const article = order ? lookup[order.outputArticleVariantId] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Orden de producción</h1>
        <Button variant="ghost" onClick={() => router.push('/production')}>
          Volver
        </Button>
      </div>

      {!order ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {article ? `${article.articleName}${article.variantLabel ? ` (${article.variantLabel})` : ''}` : order.outputArticleVariantId}
                <Badge className={PRODUCTION_STATUS_COLORS[order.status]}>
                  {PRODUCTION_STATUS_LABELS[order.status]}
                </Badge>
                {order.status === 'PLANNED' && order.isShortOnMaterials && (
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                    Esperando insumos
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Cantidad</p>
                  <p className="font-medium tabular-nums">{Number(order.quantity)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Creada</p>
                  <p className="font-medium">{new Date(order.createdAt).toLocaleString('es-AR')}</p>
                </div>
                {order.finishedAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">Completada</p>
                    <p className="font-medium">{new Date(order.finishedAt).toLocaleString('es-AR')}</p>
                  </div>
                )}
                {order.cancelledAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">Cancelada</p>
                    <p className="font-medium">{new Date(order.cancelledAt).toLocaleString('es-AR')}</p>
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              {order.status === 'DRAFT' && (
                <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-muted-foreground">Depósito para reservar</label>
                    <select
                      value={confirmWarehouseId}
                      onChange={(e) => setConfirmWarehouseId(e.target.value)}
                      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">Elegir depósito...</option>
                      {(warehousesQuery.data ?? []).map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    onClick={() => confirmMutation.mutate()}
                    disabled={!confirmWarehouseId || confirmMutation.isPending}
                  >
                    {confirmMutation.isPending ? 'Confirmando...' : 'Confirmar y reservar'}
                  </Button>
                </div>
              )}

              {order.status === 'PLANNED' && (
                <div className="flex gap-3 border-t pt-4">
                  <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
                    {completeMutation.isPending ? 'Completando...' : 'Completar orden'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                  >
                    Cancelar orden
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {order.reservations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Insumos reservados</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  rows={order.reservations}
                  columns={[
                    { header: 'Insumo', render: (r) => lookup[r.inputArticleVariantId]?.articleName ?? r.inputArticleVariantId },
                    { header: 'Depósito', render: (r) => warehouseLookup[r.warehouseId] ?? r.warehouseId },
                    { header: 'Cantidad', render: (r) => Number(r.quantityReserved).toFixed(2) },
                    { header: 'Estado', render: (r) => r.status },
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {order.consumptions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Consumo real</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  rows={order.consumptions}
                  columns={[
                    { header: 'Insumo', render: (r) => lookup[r.inputArticleVariantId]?.articleName ?? r.inputArticleVariantId },
                    { header: 'Cantidad', render: (r) => Number(r.quantityConsumed).toFixed(2) },
                    { header: 'Merma', render: (r) => Number(r.wasteAmount).toFixed(2) },
                    { header: 'Costo', render: (r) => `$${Number(r.cost).toFixed(2)}` },
                  ]}
                />
              </CardContent>
            </Card>
          )}

          {order.outputs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Producido</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleTable
                  rows={order.outputs}
                  columns={[
                    { header: 'Producto', render: (r) => lookup[r.articleVariantId]?.articleName ?? r.articleVariantId },
                    { header: 'Tipo', render: (r) => (r.isPrimary ? 'Principal' : 'Subproducto') },
                    { header: 'Cantidad', render: (r) => Number(r.quantityProduced).toFixed(2) },
                    { header: 'Costo', render: (r) => `$${Number(r.cost).toFixed(2)}` },
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SimpleTable<T>({ rows, columns }: { rows: T[]; columns: { header: string; render: (row: T) => React.ReactNode }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {columns.map((c) => (
              <th key={c.header} className="py-2 pr-3 font-medium">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {columns.map((c) => (
                <td key={c.header} className="py-2 pr-3">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
