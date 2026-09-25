'use client';

import InsumoThumb from '@/components/InsumoThumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { buildArticleVariantLookup, inventoryApi } from '@/lib/inventory';
import {
  dateInputToIso,
  isoToDateInput,
  productionApi,
  type ProductionHistoryOrder,
} from '@/lib/production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { ChevronRight, Package, Ruler } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import CreatedBy from '../CreatedBy';
import { ProductionPlanGateBanner, useProductionGate } from '../ProductionPlanGate';

const MONEY_FORMAT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

type Lookup = ReturnType<typeof buildArticleVariantLookup>;

/** Días de calendario entre dos fechas (en el día local), no horas/24 -
 * una orden creada a las 23:00 y terminada al otro día a las 8:00 tardó
 * "1 día", no "mismo día". */
function calendarDays(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function daysLabel(days: number): string {
  if (days <= 0) return 'mismo día';
  return days === 1 ? '1 día' : `${days} días`;
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('es-AR') : '—';
}

// Fabricación = inicio real → terminada (sólo si pasó por "Iniciar
// producción"; las órdenes de antes de ese botón no lo tienen). Total =
// creada → terminada, siempre conocido.
function fabricationDays(order: ProductionHistoryOrder): number | null {
  return order.startedAt && order.finishedAt ? calendarDays(order.startedAt, order.finishedAt) : null;
}
function totalDays(order: ProductionHistoryOrder): number {
  return order.finishedAt ? calendarDays(order.createdAt, order.finishedAt) : 0;
}
function unitCost(order: ProductionHistoryOrder): number | null {
  const primary = order.outputs.find((o) => o.isPrimary);
  if (!primary || Number(primary.quantityProduced) <= 0) return null;
  return Number(primary.cost) / Number(primary.quantityProduced);
}
function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

interface ProductGroup {
  articleVariantId: string;
  orders: ProductionHistoryOrder[];
  avgFabrication: number | null;
  avgTotal: number;
}

export default function ProductionHistoryPage() {
  const gate = useProductionGate();
  const [view, setView] = useState<'product' | 'all'>('product');
  const [search, setSearch] = useState('');
  // undefined = todavía no se eligió nada: se abre el primer producto, como
  // en el mockup; null = el usuario lo cerró a propósito.
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const [repeating, setRepeating] = useState<ProductionHistoryOrder | null>(null);

  const historyQuery = useQuery({
    queryKey: ['production-orders-history'],
    queryFn: productionApi.listOrderHistory,
    enabled: gate.enabled,
  });
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
    enabled: gate.enabled,
  });
  const lookup = useMemo(() => buildArticleVariantLookup(articlesQuery.data ?? []), [articlesQuery.data]);

  const filteredOrders = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (historyQuery.data ?? []).filter((order) => {
      if (words.length === 0) return true;
      const article = lookup[order.outputArticleVariantId];
      const haystack = `${article?.articleName ?? ''} ${article?.sku ?? ''} ${order.number}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [historyQuery.data, lookup, search]);

  // Agrupadas por producto, el que se terminó más recientemente primero
  // (las órdenes ya vienen ordenadas por finishedAt desc).
  const groups = useMemo<ProductGroup[]>(() => {
    const byProduct = new Map<string, ProductionHistoryOrder[]>();
    for (const order of filteredOrders) {
      const list = byProduct.get(order.outputArticleVariantId) ?? [];
      list.push(order);
      byProduct.set(order.outputArticleVariantId, list);
    }
    return Array.from(byProduct, ([articleVariantId, orders]) => ({
      articleVariantId,
      orders,
      avgFabrication: average(orders.map(fabricationDays).filter((d): d is number => d !== null)),
      avgTotal: average(orders.map(totalDays)) ?? 0,
    }));
  }, [filteredOrders]);
  const effectiveOpenId = openId === undefined ? (groups[0]?.articleVariantId ?? null) : openId;
  // Promedio de fabricación por producto - la etiqueta de cada orden se
  // pinta verde si tardó igual o menos que el promedio, ámbar si más.
  const avgFabricationByProduct = useMemo(
    () => new Map(groups.map((g) => [g.articleVariantId, g.avgFabrication])),
    [groups],
  );

  if (gate.isLoading) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Historial de producción</h1>
          <p className="text-sm text-muted-foreground">
            Lo que ya fabricaste, cuánto tardó y cuánto costó. Repetí una orden: se crea con número nuevo y la receta
            vigente.
          </p>
        </div>
        {gate.enabled && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Vista">
              {(
                [
                  ['product', 'Por producto'],
                  ['all', 'Todas las órdenes'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={`rounded-md px-3 py-1 text-sm transition ${
                    view === value ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <Input
              className="w-56 border-border bg-card"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto u orden..."
            />
          </div>
        )}
      </div>

      {!gate.enabled ? (
        <ProductionPlanGateBanner planName={gate.planName} />
      ) : !historyQuery.data ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {search ? 'No hay producciones terminadas que coincidan.' : 'Todavía no completaste ninguna orden de producción.'}
            </p>
          </CardContent>
        </Card>
      ) : view === 'product' ? (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <ProductCard
              key={group.articleVariantId}
              group={group}
              lookup={lookup}
              open={effectiveOpenId === group.articleVariantId}
              onToggle={() => setOpenId(effectiveOpenId === group.articleVariantId ? null : group.articleVariantId)}
              avgFabricationByProduct={avgFabricationByProduct}
              onRepeat={setRepeating}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent>
            <OrdersTable
              orders={filteredOrders}
              lookup={lookup}
              withProduct
              onRepeat={setRepeating}
              avgFabricationByProduct={avgFabricationByProduct}
            />
          </CardContent>
        </Card>
      )}

      {repeating && (
        <RepeatOrderDialog
          source={repeating}
          lookup={lookup}
          estimateDays={(() => {
            const group = groups.find((g) => g.articleVariantId === repeating.outputArticleVariantId);
            return group ? Math.round(group.avgFabrication ?? group.avgTotal) : null;
          })()}
          onClose={() => setRepeating(null)}
        />
      )}
    </div>
  );
}

function ProductThumb({ articleVariantId, lookup, size }: { articleVariantId: string; lookup: Lookup; size?: 'sm' | 'lg' }) {
  const article = lookup[articleVariantId];
  return (
    <InsumoThumb
      size={size}
      imageUrl={article?.imageUrl}
      name={article?.articleName}
      icon={article?.stockUnit === 'mm' ? Ruler : Package}
    />
  );
}

function ProductCard({
  group,
  lookup,
  open,
  onToggle,
  onRepeat,
  avgFabricationByProduct,
}: {
  group: ProductGroup;
  lookup: Lookup;
  open: boolean;
  onToggle: () => void;
  onRepeat: (order: ProductionHistoryOrder) => void;
  avgFabricationByProduct: Map<string, number | null>;
}) {
  const article = lookup[group.articleVariantId];
  const last = group.orders[0];
  const lastCost = unitCost(last);
  // Mini barras: una por orden, de la más vieja a la más nueva, alto
  // proporcional a lo que tardó (fabricación si se conoce, si no total).
  const durations = [...group.orders].reverse().map((o) => fabricationDays(o) ?? totalDays(o));
  const maxDuration = Math.max(...durations, 1);

  return (
    <Card className="gap-0 py-0">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 p-4 lg:grid-cols-[auto_minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_11rem]">
        <ProductThumb articleVariantId={group.articleVariantId} lookup={lookup} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {article ? `${article.articleName}${article.variantLabel ? ` (${article.variantLabel})` : ''}` : group.articleVariantId}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">{article?.sku}</p>
        </div>
        <div className="col-span-full grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-4 lg:col-start-3 lg:row-start-1">
          <Stat label="Veces" value={String(group.orders.length)} />
          <Stat label="Última" value={formatDate(last.finishedAt)} />
          <Stat
            label={group.avgFabrication !== null ? 'Fabricación prom.' : 'Demora prom.'}
            value={daysLabel(Math.round(group.avgFabrication ?? group.avgTotal))}
          >
            <div className="mt-1 flex h-5 items-end gap-0.5" aria-hidden="true">
              {durations.map((d, i) => (
                <span
                  key={i}
                  className={`w-1.5 rounded-sm bg-primary ${i === durations.length - 1 ? '' : 'opacity-50'}`}
                  style={{ height: `${4 + Math.round((16 * d) / maxDuration)}px` }}
                />
              ))}
            </div>
          </Stat>
          <Stat label="Costo unit. últ." value={lastCost !== null ? MONEY_FORMAT.format(lastCost) : '—'} />
        </div>
        <div className="col-start-3 row-start-1 flex items-center justify-end gap-1 lg:col-start-7">
          <Button size="sm" onClick={() => onRepeat(last)}>
            Repetir última
          </Button>
          <Button size="sm" variant="ghost" onClick={onToggle} aria-expanded={open} aria-label="Ver órdenes">
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
            {group.orders.length}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t px-4 pb-3">
          <OrdersTable
            orders={group.orders}
            lookup={lookup}
            onRepeat={onRepeat}
            avgFabricationByProduct={avgFabricationByProduct}
          />
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
      {children}
    </div>
  );
}

function OrdersTable({
  orders,
  lookup,
  withProduct,
  onRepeat,
  avgFabricationByProduct,
}: {
  orders: ProductionHistoryOrder[];
  lookup: Lookup;
  withProduct?: boolean;
  onRepeat: (order: ProductionHistoryOrder) => void;
  avgFabricationByProduct: Map<string, number | null>;
}) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b text-left text-[11px] tracking-wide text-muted-foreground uppercase">
            {withProduct && <th className="py-2.5 pr-3 font-semibold">Producto</th>}
            <th className="py-2.5 pr-3 font-semibold">Orden</th>
            <th className="py-2.5 pr-3 font-semibold">Inició</th>
            <th className="py-2.5 pr-3 font-semibold">Terminó</th>
            <th className="py-2.5 pr-3 font-semibold">Fabricación</th>
            <th className="py-2.5 pr-3 font-semibold">Espera previa</th>
            <th className="py-2.5 pr-3 font-semibold">Total</th>
            <th className="py-2.5 pr-3 text-right font-semibold">Cantidad</th>
            <th className="py-2.5 pr-3 text-right font-semibold">Costo unit.</th>
            <th className="py-2.5 pr-3 font-semibold">Receta</th>
            <th className="py-2.5 pr-3 font-semibold">Creó</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const article = lookup[order.outputArticleVariantId];
            const fabrication = fabricationDays(order);
            const wait = order.startedAt ? calendarDays(order.createdAt, order.startedAt) : null;
            const avgFabrication = avgFabricationByProduct.get(order.outputArticleVariantId) ?? null;
            const cost = unitCost(order);
            const recipeChanged =
              order.bomVersion !== null && order.activeBomVersion !== null && order.activeBomVersion !== order.bomVersion;
            return (
              <tr key={order.id} className="border-b last:border-0">
                {withProduct && (
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <ProductThumb articleVariantId={order.outputArticleVariantId} lookup={lookup} size="sm" />
                      <span>{article?.articleName ?? order.outputArticleVariantId}</span>
                    </div>
                  </td>
                )}
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    className="font-mono font-medium text-primary hover:underline"
                    onClick={() => router.push(`/production/orders/${order.id}`)}
                  >
                    {order.number}
                  </button>
                </td>
                <td className="py-2 pr-3 tabular-nums">{formatDate(order.startedAt)}</td>
                <td className="py-2 pr-3 tabular-nums">{formatDate(order.finishedAt)}</td>
                <td className="py-2 pr-3">
                  {fabrication !== null ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        avgFabrication === null || fabrication <= avgFabrication
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                      }`}
                      title={avgFabrication !== null ? `Promedio: ${daysLabel(Math.round(avgFabrication))}` : undefined}
                    >
                      {daysLabel(fabrication)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{wait !== null && wait > 0 ? daysLabel(wait) : '—'}</td>
                <td className="py-2 pr-3 text-muted-foreground">{daysLabel(totalDays(order))}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {Number(order.quantity)} {article?.stockUnit ?? ''}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{cost !== null ? MONEY_FORMAT.format(cost) : '—'}</td>
                <td
                  className={`py-2 pr-3 text-xs ${recipeChanged ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                >
                  {order.bomVersion ? `v${order.bomVersion}` : '—'}
                  {recipeChanged && ` (hoy v${order.activeBomVersion})`}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  <CreatedBy user={order.createdBy} size={20} />
                </td>
                <td className="py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => onRepeat(order)}>
                    Repetir
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Crea una orden nueva copiando producto y cantidad de `source`, con la
 * receta vigente HOY (no la congelada de la orden original) - mismo
 * create + confirm que "Nueva orden", así que reserva los insumos al
 * crearla, programada o no. */
function RepeatOrderDialog({
  source,
  lookup,
  estimateDays,
  onClose,
}: {
  source: ProductionHistoryOrder;
  lookup: Lookup;
  estimateDays: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const article = lookup[source.outputArticleVariantId];
  const [quantity, setQuantity] = useState(String(Number(source.quantity)));
  const [warehouseId, setWarehouseId] = useState(source.reservations[0]?.warehouseId ?? '');
  const [scheduledStart, setScheduledStart] = useState(() => isoToDateInput(new Date().toISOString()));
  const [error, setError] = useState('');

  const warehousesQuery = useQuery({ queryKey: ['inventory-warehouses'], queryFn: inventoryApi.listWarehouses });
  const bomQuery = useQuery({
    queryKey: ['production-bom', source.outputArticleVariantId],
    queryFn: () => productionApi.getBom(source.outputArticleVariantId),
    retry: false,
  });
  const producibleQuery = useQuery({
    queryKey: ['production-producible', source.outputArticleVariantId, warehouseId],
    queryFn: () => productionApi.computeProducible(source.outputArticleVariantId, warehouseId),
    enabled: !!warehouseId && bomQuery.isSuccess,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const order = await productionApi.createOrder({
        outputArticleVariantId: source.outputArticleVariantId,
        quantity: Number(quantity),
        scheduledStartAt: scheduledStart ? dateInputToIso(scheduledStart) : undefined,
      });
      return productionApi.confirmOrder(order.id, warehouseId);
    },
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      router.push(`/production/orders/${order.id}`);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear la orden';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const noRecipe = bomQuery.isError;
  const activeVersion = bomQuery.data?.version;
  const recipeChanged = activeVersion !== undefined && source.bomVersion !== null && activeVersion !== source.bomVersion;
  const maxProducible = producibleQuery.data ? Number(producibleQuery.data.maxProducible) : null;
  const qty = Number(quantity) || 0;

  const estimatedEnd = (() => {
    if (!scheduledStart || estimateDays === null) return null;
    const date = new Date(`${scheduledStart}T12:00:00`);
    date.setDate(date.getDate() + estimateDays);
    return date.toLocaleDateString('es-AR');
  })();

  function handleCreate() {
    setError('');
    if (!qty || qty <= 0) {
      setError('Ingresá una cantidad válida');
      return;
    }
    if (!warehouseId) {
      setError('Elegí el depósito');
      return;
    }
    mutation.mutate();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <ProductThumb articleVariantId={source.outputArticleVariantId} lookup={lookup} size="lg" />
            <div className="min-w-0">
              <DialogTitle>Repetir {source.number}</DialogTitle>
              <p className="truncate text-sm text-muted-foreground">{article?.articleName}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Cantidad a producir</label>
            <Input type="number" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Depósito</label>
            <Select
              value={warehouseId}
              onChange={setWarehouseId}
              placeholder="Elegir depósito..."
              options={(warehousesQuery.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Inicio programado</label>
            <Input type="date" value={scheduledStart} onChange={(e) => setScheduledStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Terminaría aprox.</label>
            <p className="flex h-8 items-center text-sm tabular-nums">
              {estimatedEnd ? `${estimatedEnd} (prom. ${daysLabel(estimateDays ?? 0)})` : '—'}
            </p>
          </div>
        </div>

        {noRecipe ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Este producto ya no tiene una receta activa - activá una en Recetas para poder repetirlo.
          </p>
        ) : recipeChanged ? (
          <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            La receta cambió desde esta orden: se usó la v{source.bomVersion} y hoy está vigente la v{activeVersion}. La
            nueva orden se arma con la v{activeVersion}.
          </p>
        ) : activeVersion !== undefined ? (
          <p className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Misma receta que la orden original (v{activeVersion}).
          </p>
        ) : null}

        {maxProducible !== null &&
          (maxProducible >= qty ? (
            <p className="text-sm text-muted-foreground">
              Hay insumos para {maxProducible} unidad{maxProducible === 1 ? '' : 'es'}. Se reservan al crear la orden.
            </p>
          ) : (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Sólo alcanzan los insumos para {maxProducible} unidad{maxProducible === 1 ? '' : 'es'}. La orden se crea
              igual, reservando lo disponible, y queda &quot;Esperando insumos&quot;.
            </p>
          ))}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={mutation.isPending || noRecipe || bomQuery.isLoading}>
            {mutation.isPending ? 'Creando...' : 'Crear orden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
