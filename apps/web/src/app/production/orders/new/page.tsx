'use client';

import ArticlePicker from '@/components/ArticlePicker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { buildArticleVariantLookup, inventoryApi } from '@/lib/inventory';
import { productionApi } from '@/lib/production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductionPlanGateBanner, useProductionGate } from '../../ProductionPlanGate';

const QUANTITY_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

export default function NewProductionOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const gate = useProductionGate();

  const [outputArticleVariantId, setOutputArticleVariantId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState('');

  const warehousesQuery = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: inventoryApi.listWarehouses,
    enabled: gate.enabled,
  });
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
    enabled: gate.enabled,
  });
  const lookup = useMemo(() => buildArticleVariantLookup(articlesQuery.data ?? []), [articlesQuery.data]);

  const producibleQuery = useQuery({
    queryKey: ['production-producible', outputArticleVariantId, warehouseId],
    queryFn: () => productionApi.computeProducible(outputArticleVariantId, warehouseId),
    enabled: gate.enabled && !!outputArticleVariantId && !!warehouseId,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const order = await productionApi.createOrder({
        outputArticleVariantId,
        quantity: Number(quantity),
      });
      return productionApi.confirmOrder(order.id, warehouseId);
    },
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      router.push(`/production/orders/${order.id}`);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear la orden';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!outputArticleVariantId) {
      setError('Elegí qué producto vas a producir');
      return;
    }
    if (!warehouseId) {
      setError('Elegí el depósito');
      return;
    }
    if (!Number(quantity) || Number(quantity) <= 0) {
      setError('Ingresá una cantidad válida');
      return;
    }
    mutation.mutate();
  }

  if (gate.isLoading) {
    return null;
  }

  const maxProducible = producibleQuery.data ? Number(producibleQuery.data.maxProducible) : null;
  const shortOnMaterials = maxProducible !== null && Number(quantity) > maxProducible;
  const noRecipe =
    producibleQuery.isError &&
    ((producibleQuery.error as AxiosError)?.response?.status === 404);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Nueva orden de producción</h1>

      {!gate.enabled ? (
        <ProductionPlanGateBanner planName={gate.planName} />
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Datos de la orden</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-muted-foreground">Producto a fabricar</label>
                <ArticlePicker
                  value={outputArticleVariantId}
                  onChange={(id) => setOutputArticleVariantId(id)}
                  placeholder="Buscar producto..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted-foreground">Depósito</label>
                  <Select
                    value={warehouseId}
                    onChange={setWarehouseId}
                    placeholder="Elegir depósito..."
                    options={(warehousesQuery.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted-foreground">Cantidad a producir</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
              </div>

              {outputArticleVariantId && warehouseId && (
                <ProducibilityPreview
                  isLoading={producibleQuery.isLoading}
                  noRecipe={noRecipe}
                  data={producibleQuery.data}
                  lookup={lookup}
                  desiredQuantity={Number(quantity) || 0}
                />
              )}

              {shortOnMaterials && !noRecipe && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Sólo hay materiales para {maxProducible} unidad{maxProducible === 1 ? '' : 'es'} - la orden se va a
                  crear igual, reservando lo disponible, y va a quedar marcada &quot;esperando insumos&quot;.
                </p>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="mt-2 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => router.push('/production')}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending || noRecipe}>
                  {mutation.isPending ? 'Creando...' : 'Crear orden'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProducibilityPreview({
  isLoading,
  noRecipe,
  data,
  lookup,
  desiredQuantity,
}: {
  isLoading: boolean;
  noRecipe: boolean;
  data: import('@/lib/production').ProducibleResult | undefined;
  lookup: Record<string, { articleName: string; variantLabel: string | null; sku: string; stockUnit: string }>;
  desiredQuantity: number;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Calculando disponibilidad...</p>;
  }
  if (noRecipe) {
    return (
      <p className="text-sm text-muted-foreground">
        Este producto todavía no tiene una receta activa.{' '}
        <a href="/production/bom" className="font-medium text-primary">
          Creá una en Recetas
        </a>
        .
      </p>
    );
  }
  if (!data) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm">
        Con el stock actual se pueden producir hasta{' '}
        <span className="font-semibold tabular-nums">{Number(data.maxProducible)}</span> unidades.
      </p>
      <div className="flex flex-col gap-2">
        {data.perLine.map((entry) => {
          const article = lookup[entry.line.inputArticleVariantId];
          const disponible = Number(entry.disponible);
          const requeridoPorUnidad = Number(entry.requerido);
          const requeridoTotal = requeridoPorUnidad * Math.max(1, desiredQuantity);
          const percent = requeridoTotal > 0 ? Math.min(100, (disponible / requeridoTotal) * 100) : 100;
          const isBottleneck = data.bottleneck?.id === entry.line.id;
          return (
            <div key={entry.line.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className={isBottleneck ? 'font-medium text-amber-700 dark:text-amber-400' : ''}>
                  {article ? article.articleName : entry.line.inputArticleVariantId}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {QUANTITY_FORMAT.format(disponible)}
                  {article?.stockUnit ? ` ${article.stockUnit}` : ''} disponibles
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${percent >= 100 ? 'bg-emerald-500' : isBottleneck ? 'bg-amber-500' : 'bg-primary'}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
