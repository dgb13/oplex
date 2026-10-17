'use client';

import ArticlePicker, { type ArticlePickerOption } from '@/components/ArticlePicker';
import InsumoThumb from '@/components/InsumoThumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { buildArticleVariantLookup, inventoryApi } from '@/lib/inventory';
import { dateInputToIso, isoToDateInput, productionApi, type BomLine } from '@/lib/production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Package, Ruler } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductionPlanGateBanner, useProductionGate } from '../../ProductionPlanGate';

const QUANTITY_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

/** Qué pieza de ese insumo lleva cada unidad: el mismo perfil aparece una
 * vez por largo de corte, y sin esto se ven filas repetidas. */
function pieceLabel(line: BomLine, perUnit: number, unit: string | undefined): string {
  const mm = (v: string) => QUANTITY_FORMAT.format(Number(v));
  if (line.width && line.length) return `${line.cutsCount ?? 1} × ${mm(line.width)} × ${mm(line.length)} mm`;
  if (line.length) return `${line.cutsCount ?? 1} × ${mm(line.length)} mm`;
  return `${QUANTITY_FORMAT.format(perUnit)}${unit ? ` ${unit}` : ''} por unidad`;
}

export default function NewProductionOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const gate = useProductionGate();

  const [outputArticleVariantId, setOutputArticleVariantId] = useState('');
  const [outputOption, setOutputOption] = useState<ArticlePickerOption | null>(null);
  // 1,5 mesas no existe; 1,5 kg de un producto que se vende por kilo sí.
  const byUnit = !outputOption || (outputOption.measurementType === 'DISCRETE' && outputOption.unitOfMeasure !== 'KG');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('1');
  // Hoy por defecto - se puede programar para más adelante (la semana que
  // viene); los insumos se reservan igual al crear la orden.
  const [scheduledStart, setScheduledStart] = useState(() => isoToDateInput(new Date().toISOString()));
  const [error, setError] = useState('');
  // El aviso es del intento anterior: al corregir un campo deja de aplicar.
  useEffect(() => setError(''), [outputArticleVariantId, warehouseId, quantity]);

  const warehousesQuery = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: inventoryApi.listWarehouses,
    enabled: gate.enabled,
  });
  // Con un solo depósito no hay nada que elegir.
  const onlyWarehouseId = warehousesQuery.data?.length === 1 ? warehousesQuery.data[0].id : '';
  useEffect(() => {
    if (onlyWarehouseId) setWarehouseId((current) => current || onlyWarehouseId);
  }, [onlyWarehouseId]);
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
        scheduledStartAt: scheduledStart ? dateInputToIso(scheduledStart) : undefined,
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
    if (byUnit && !Number.isInteger(Number(quantity))) {
      setError('Este producto se fabrica por unidad: ingresá una cantidad entera');
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
                  onChange={(id, option) => {
                    setOutputArticleVariantId(id);
                    setOutputOption(option);
                  }}
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
                    min={byUnit ? 1 : undefined}
                    step={byUnit ? 1 : 'any'}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm text-muted-foreground">Inicio programado</label>
                  <Input type="date" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Los insumos se reservan al crear la orden.</p>
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
  lookup: Record<
    string,
    { articleName: string; variantLabel: string | null; sku: string; stockUnit: string; imageUrl?: string | null }
  >;
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
            <div key={entry.line.id} className="flex items-center gap-3">
              <InsumoThumb
                size="sm"
                imageUrl={article?.imageUrl}
                name={article?.articleName}
                icon={article?.stockUnit === 'mm' ? Ruler : Package}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className={`truncate ${isBottleneck ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}>
                    {article ? article.articleName : entry.line.inputArticleVariantId}
                    <span className="font-normal text-muted-foreground"> · {pieceLabel(entry.line, requeridoPorUnidad, article?.stockUnit)}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
