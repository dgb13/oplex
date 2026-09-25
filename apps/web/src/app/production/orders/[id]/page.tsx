'use client';

import BulkQuoteRequestModal, { type GroupedPedido } from '@/app/purchases/BulkQuoteRequestModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Select from '@/components/ui/Select';
import { buildArticleVariantLookup, inventoryApi, resolveUploadUrl } from '@/lib/inventory';
import { invoicingApi } from '@/lib/invoicing';
import { productionApi, type ReservationStatus } from '@/lib/production';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { FileArchive, FileText, Package, ShoppingCart } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProductionPlanGateBanner, useProductionGate } from '../../ProductionPlanGate';
import { PRODUCTION_STATUS_COLORS, PRODUCTION_STATUS_LABELS } from '../../status';

// DRAFT/PLANNED/IN_PROGRESS todavía pueden llegar a necesitar estos
// insumos - DONE ya los consumió (ver "Consumo real") y CANCELLED liberó
// sus reservas, en ambos casos la barra de faltantes ya no tiene sentido.
const ACTIVE_STATUSES = new Set(['DRAFT', 'PLANNED', 'IN_PROGRESS']);

const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  ACTIVE: 'Reservado',
  CONSUMED: 'Consumido',
  RELEASED: 'Liberado',
};

const QUANTITY_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
const MONEY_FORMAT = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Cantidad con la unidad de stock del artículo ("2.000 gr", "10 un.") -
// sin unidad, "2000.00" no decía si eran gramos, mililitros o unidades.
function formatQuantity(value: number | string, unit: string | undefined): string {
  const formatted = QUANTITY_FORMAT.format(Number(value));
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatMoney(value: number | string): string {
  return `$${MONEY_FORMAT.format(Number(value))}`;
}

interface InsumoRow {
  articleVariantId: string;
  requerido: number;
  reservado: number;
  falta: number;
  pct: number;
}

// El backend calcula "requerido" con Prisma.Decimal (precisión exacta,
// truncada a 3 decimales) y acá se recalcula con floats de JS - el mismo
// número real puede diferir en un epsilon minúsculo entre las dos
// aritméticas (ej. 0.3 reservado contra un requerido que en realidad es
// 0.30000000000000004). Sin esta tolerancia, "cubierto del todo" mostraba
// "Faltan 0.00" y la barra quedaba ámbar en vez de verde.
const EPSILON = 0.005;

function computeInsumoRows(order: {
  quantity: string;
  bom: { lines: { inputArticleVariantId: string; quantity: string; expectedWastePercent: string }[] } | null;
  reservations: { inputArticleVariantId: string; quantityReserved: string; status: string }[];
}): InsumoRow[] {
  const lines = order.bom?.lines ?? [];
  const orderQuantity = Number(order.quantity);
  // Un mismo insumo puede aparecer en más de una línea de la receta (ej.
  // el mismo material cortado a dos medidas distintas) - se agrupa acá
  // para que cada insumo tenga una sola fila con el requerido sumado, en
  // vez de una fila por línea (que duplicaba la key de React y mostraba
  // el reservado total del insumo repetido en cada una de sus líneas).
  const requeridoByInsumo = new Map<string, number>();
  for (const line of lines) {
    const requerido = Number(line.quantity) * orderQuantity * (1 + Number(line.expectedWastePercent) / 100);
    requeridoByInsumo.set(
      line.inputArticleVariantId,
      (requeridoByInsumo.get(line.inputArticleVariantId) ?? 0) + requerido,
    );
  }
  return Array.from(requeridoByInsumo.entries()).map(([articleVariantId, requerido]) => {
    const reservado = order.reservations
      .filter((r) => r.inputArticleVariantId === articleVariantId && r.status !== 'RELEASED')
      .reduce((sum, r) => sum + Number(r.quantityReserved), 0);
    const diff = Math.max(0, requerido - reservado);
    // Redondeado a 3 decimales (misma precisión que StockReservation en
    // la base) - sin esto, el ruido de punto flotante de la resta viajaba
    // tal cual hasta la cantidad del Pedido de Cotización (ej. "0.6000000000000001 u.").
    const falta = diff < EPSILON ? 0 : Math.round(diff * 1000) / 1000;
    const pct = requerido > 0 ? Math.min(100, (reservado / requerido) * 100) : 100;
    return { articleVariantId, requerido, reservado, falta, pct };
  });
}

/** Barra que anima su ancho desde 0% al montar - Tailwind/CSS transition
 * no dispara si el elemento ya nace en su ancho final, así que arranca en
 * 0 y un microtask después pasa a `pct`, dando el efecto de "llenado". */
function ProgressBar({ pct, colorClass }: { pct: number; colorClass: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-muted">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${colorClass}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default function ProductionOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const gate = useProductionGate();
  const [error, setError] = useState('');
  const [confirmWarehouseId, setConfirmWarehouseId] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);

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
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
    enabled: gate.enabled,
  });
  const lookup = useMemo(() => buildArticleVariantLookup(articlesQuery.data ?? []), [articlesQuery.data]);
  const warehouseLookup = useMemo(
    () => Object.fromEntries((warehousesQuery.data ?? []).map((w) => [w.id, w.name])),
    [warehousesQuery.data],
  );
  const bomId = orderQuery.data?.bomId;
  const attachmentsQuery = useQuery({
    queryKey: ['production-bom-attachments', bomId],
    queryFn: () => productionApi.listBomAttachments(bomId as string),
    enabled: gate.enabled && !!bomId,
  });

  const order = orderQuery.data;
  const article = order ? lookup[order.outputArticleVariantId] : undefined;
  const insumoRows = order ? computeInsumoRows(order) : [];
  const showInsumos = !!order && ACTIVE_STATUSES.has(order.status) && insumoRows.length > 0;

  function buildMissingGroups(): GroupedPedido[] {
    if (!order) return [];
    const bySupplier = new Map<string, GroupedPedido>();
    for (const row of insumoRows) {
      if (row.falta <= 0) continue;
      const insumo = lookup[row.articleVariantId];
      if (!insumo?.preferredSupplierId) continue;
      let group = bySupplier.get(insumo.preferredSupplierId);
      if (!group) {
        group = {
          supplierId: insumo.preferredSupplierId,
          supplierName: insumo.preferredSupplierName ?? '',
          lines: [],
          notes: `Solicitado por Orden de producción ${order.number} (${article?.articleName ?? order.outputArticleVariantId})`,
        };
        bySupplier.set(insumo.preferredSupplierId, group);
      }
      // El faltante está en unidad de stock (gr, ml, mm) pero el Pedido de
      // Cotización va en unidad de compra (hormas, potes, barras) - sin
      // convertir, faltar 2000 gr de jamón pedía 2000 hormas. Redondeado
      // para arriba: no se compra media horma.
      const quantity = insumo.purchaseUnitSize ? Math.ceil(row.falta / insumo.purchaseUnitSize) : row.falta;
      group.lines.push({
        articleVariantId: row.articleVariantId,
        sku: insumo.sku,
        articleName: insumo.articleName,
        variantLabel: insumo.variantLabel,
        quantity,
      });
    }
    return Array.from(bySupplier.values());
  }
  const missingGroups = buildMissingGroups();
  const missingWithoutSupplier = insumoRows.filter(
    (row) => row.falta > 0 && !lookup[row.articleVariantId]?.preferredSupplierId,
  ).length;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['production-order', id] });
    void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    // confirm/retryReservation/complete/cancel mueven o liberan stock
    // (StockLedger.quantity) - sin esto, Inventario (['inventory-articles'],
    // el mismo query key que invalida StockMovementModal tras un movimiento
    // manual) queda mostrando cantidades viejas hasta un F5, aunque el
    // backend ya haya actualizado todo.
    void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
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
  const retryReservationMutation = useAction(() => productionApi.retryReservation(id, confirmWarehouseId));
  const completeMutation = useAction(() => productionApi.completeOrder(id));
  const cancelMutation = useAction(() => productionApi.cancelOrder(id));

  // Si ya hay algo reservado, todas las reservas de esta orden comparten
  // depósito a la fuerza (ver retryReservation en el backend) - precarga
  // ese mismo depósito en vez de dejar que el usuario elija uno distinto
  // y se encuentre con el 400 recién al tocar "Reintentar".
  const existingReservationWarehouseId = order?.reservations.find((r) => r.status === 'ACTIVE')?.warehouseId;
  useEffect(() => {
    if (existingReservationWarehouseId && !confirmWarehouseId) {
      setConfirmWarehouseId(existingReservationWarehouseId);
    }
  }, [existingReservationWarehouseId, confirmWarehouseId]);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Orden de producción{order ? ` ${order.number}` : ''}</h1>
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
              <div className="flex items-start justify-between gap-4">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
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
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
                  {article?.imageUrl ? (
                    <img src={resolveUploadUrl(article.imageUrl) ?? undefined} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-5 w-5" />
                  )}
                </div>
              </div>
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

              {(attachmentsQuery.data?.length ?? 0) > 0 && (
                <div className="flex flex-col gap-1.5 border-t pt-4">
                  <p className="text-xs text-muted-foreground">Documentos de la receta</p>
                  <ul className="flex flex-wrap gap-2">
                    {attachmentsQuery.data?.map((att) => (
                      <li key={att.id}>
                        <a
                          href={resolveUploadUrl(att.fileUrl) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-lg border bg-muted/20 px-2.5 py-1.5 text-sm text-primary hover:underline"
                        >
                          {att.fileType === 'PDF' ? (
                            <FileText className="h-4 w-4 shrink-0 text-red-500" />
                          ) : (
                            <FileArchive className="h-4 w-4 shrink-0 text-amber-600" />
                          )}
                          {att.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              {order.status === 'DRAFT' && (
                <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm text-muted-foreground">Depósito para reservar</label>
                    <Select
                      value={confirmWarehouseId}
                      onChange={setConfirmWarehouseId}
                      placeholder="Elegir depósito..."
                      options={(warehousesQuery.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
                    />
                  </div>
                  <Button
                    onClick={() => confirmMutation.mutate()}
                    disabled={!confirmWarehouseId || confirmMutation.isPending}
                  >
                    {confirmMutation.isPending ? 'Confirmando...' : 'Confirmar y reservar'}
                  </Button>
                </div>
              )}

              {order.status === 'PLANNED' && order.isShortOnMaterials && (
                <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                  {existingReservationWarehouseId ? (
                    <p className="text-sm text-muted-foreground">
                      Depósito: <span className="font-medium text-foreground">{warehouseLookup[existingReservationWarehouseId] ?? existingReservationWarehouseId}</span>
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <label className="text-sm text-muted-foreground">Depósito para reservar</label>
                      <Select
                        value={confirmWarehouseId}
                        onChange={setConfirmWarehouseId}
                        placeholder="Elegir depósito..."
                        options={(warehousesQuery.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
                      />
                    </div>
                  )}
                  <Button
                    onClick={() => retryReservationMutation.mutate()}
                    disabled={!confirmWarehouseId || retryReservationMutation.isPending}
                  >
                    {retryReservationMutation.isPending ? 'Reintentando...' : 'Reintentar reserva'}
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

          {showInsumos && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Insumos</CardTitle>
                  {missingGroups.length > 0 && (
                    <Button size="sm" onClick={() => setBulkOpen(true)}>
                      <ShoppingCart className="mr-1.5 h-4 w-4" />
                      Pedir cotización por faltantes
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {insumoRows.map((row) => {
                  const insumo = lookup[row.articleVariantId];
                  const colorClass =
                    row.falta <= 0 ? 'bg-green-500' : row.reservado > 0 ? 'bg-amber-500' : 'bg-red-500';
                  return (
                    <div key={row.articleVariantId} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium">{insumo?.articleName ?? row.articleVariantId}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {QUANTITY_FORMAT.format(row.reservado)} / {formatQuantity(row.requerido, insumo?.stockUnit)}
                        </span>
                      </div>
                      <ProgressBar pct={row.pct} colorClass={colorClass} />
                      {row.falta > 0 && (
                        <p
                          className={`text-xs ${row.reservado > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'}`}
                        >
                          Faltan {formatQuantity(row.falta, insumo?.stockUnit)}
                          {insumo?.preferredSupplierName ? ` — proveedor preferido: ${insumo.preferredSupplierName}` : ' — sin proveedor preferido'}
                        </p>
                      )}
                    </div>
                  );
                })}
                {missingWithoutSupplier > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {missingWithoutSupplier} insumo{missingWithoutSupplier !== 1 ? 's' : ''} faltante
                    {missingWithoutSupplier !== 1 ? 's' : ''} sin proveedor preferido - asignale uno en Inventario
                    para poder pedirle cotización de un click.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

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
                    {
                      header: 'Cantidad',
                      render: (r) => formatQuantity(r.quantityReserved, lookup[r.inputArticleVariantId]?.stockUnit),
                    },
                    { header: 'Estado', render: (r) => RESERVATION_STATUS_LABELS[r.status] ?? r.status },
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
                    {
                      header: 'Cantidad',
                      render: (r) => formatQuantity(r.quantityConsumed, lookup[r.inputArticleVariantId]?.stockUnit),
                    },
                    {
                      header: 'Merma',
                      render: (r) => formatQuantity(r.wasteAmount, lookup[r.inputArticleVariantId]?.stockUnit),
                    },
                    { header: 'Costo', render: (r) => formatMoney(r.cost) },
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
                    {
                      header: 'Cantidad',
                      render: (r) => formatQuantity(r.quantityProduced, lookup[r.articleVariantId]?.stockUnit),
                    },
                    { header: 'Costo', render: (r) => formatMoney(r.cost) },
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {bulkOpen && (
        <BulkQuoteRequestModal
          groups={missingGroups}
          currencyId={currenciesQuery.data?.[0]?.id ?? ''}
          onClose={() => setBulkOpen(false)}
          onDone={() => setBulkOpen(false)}
        />
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
