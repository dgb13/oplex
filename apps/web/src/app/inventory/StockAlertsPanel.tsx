'use client';

import BulkQuoteRequestModal, { type GroupedPedido } from '@/app/purchases/BulkQuoteRequestModal';
import QuoteRequestFormModal from '@/app/purchases/QuoteRequestFormModal';
import { Button } from '@/components/ui/button';
import { inventoryApi, resolveUploadUrl, type ReorderSuggestion } from '@/lib/inventory';
import { invoicingApi } from '@/lib/invoicing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShoppingBasket } from 'lucide-react';
import { useState } from 'react';

/** Junta las alertas seleccionadas por proveedor preferido, sumando
 * cantidad si el mismo artículo aparece en más de un depósito elegido a
 * la vez (una Pedido de Cotización no tiene noción de depósito por línea,
 * sólo "cuánto pedirle al proveedor de este artículo"). Alertas sin
 * proveedor preferido quedan afuera - no hay a quién agruparlas, siguen
 * resolviéndose una por una con el botón "Pedir cotización" de su fila. */
function buildGroups(alerts: ReorderSuggestion[], selectedKeys: Set<string>): GroupedPedido[] {
  const bySupplier = new Map<string, GroupedPedido>();
  for (const a of alerts) {
    const key = `${a.warehouseId}:${a.articleVariantId}`;
    if (!selectedKeys.has(key) || !a.preferredSupplierId) continue;
    let group = bySupplier.get(a.preferredSupplierId);
    if (!group) {
      group = { supplierId: a.preferredSupplierId, supplierName: a.preferredSupplierName ?? '', lines: [] };
      bySupplier.set(a.preferredSupplierId, group);
    }
    const existingLine = group.lines.find((l) => l.articleVariantId === a.articleVariantId);
    if (existingLine) {
      existingLine.quantity += a.suggestedQuantity;
    } else {
      group.lines.push({
        articleVariantId: a.articleVariantId,
        sku: a.sku,
        articleName: a.articleName,
        variantLabel: a.variantLabel,
        quantity: a.suggestedQuantity,
      });
    }
  }
  return Array.from(bySupplier.values());
}

/** Sugerencias de reposición (GET /inventory/reorder-suggestions) - antes
 * un endpoint huérfano sin ningún consumidor en el frontend (ver
 * PROGRESS.md). Compara mínimo vs. stock actual por DEPÓSITO individual
 * (mismo criterio que ya usa el widget "Alertas de stock" del Tablero) -
 * a diferencia de la vista Tabla de esta misma página, que resalta en
 * rojo comparando el TOTAL agregado entre depósitos, así que un artículo
 * puede aparecer acá sin estar marcado en rojo en la tabla (compensación
 * entre depósitos) y viceversa. */
export default function StockAlertsPanel() {
  const alertsQuery = useQuery({
    queryKey: ['inventory-reorder-suggestions'],
    queryFn: inventoryApi.listReorderSuggestions,
  });
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
  });
  const [quoteRequestFor, setQuoteRequestFor] = useState<ReorderSuggestion | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const alerts = alertsQuery.data ?? [];
  const selectableAlerts = alerts.filter((a) => a.preferredSupplierId);

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelectedKeys((prev) =>
      prev.size === selectableAlerts.length
        ? new Set()
        : new Set(selectableAlerts.map((a) => `${a.warehouseId}:${a.articleVariantId}`)),
    );
  }

  if (alertsQuery.isLoading) {
    return <div className="flex h-40 items-center justify-center text-muted-foreground">Cargando alertas...</div>;
  }

  if (alertsQuery.error) {
    return (
      <div className="flex h-40 items-center justify-center text-destructive">
        Error al cargar las alertas de stock
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        Sin alertas — todo está por encima del mínimo configurado en cada depósito.
      </div>
    );
  }

  const groups = buildGroups(alerts, selectedKeys);

  return (
    <>
      {selectableAlerts.length > 0 && (
        <div className="mb-3 flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={selectedKeys.size > 0 && selectedKeys.size === selectableAlerts.length}
              onChange={toggleAll}
              className="h-4 w-4 accent-primary"
            />
            Seleccionar todas con proveedor ({selectableAlerts.length})
          </label>
          {selectedKeys.size > 0 && (
            <Button size="sm" className="ml-auto" onClick={() => setBulkOpen(true)}>
              Crear pedidos de cotización ({selectedKeys.size})
            </Button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {alerts.map((a) => {
          const key = `${a.warehouseId}:${a.articleVariantId}`;
          return (
            <AlertRow
              key={key}
              alert={a}
              selected={selectedKeys.has(key)}
              onToggleSelect={() => toggleKey(key)}
              onQuoteRequest={() => setQuoteRequestFor(a)}
            />
          );
        })}
      </div>

      {quoteRequestFor && (
        <QuoteRequestFormModal
          initialLine={{
            articleVariantId: quoteRequestFor.articleVariantId,
            quantity: quoteRequestFor.suggestedQuantity,
          }}
          initialSupplierId={quoteRequestFor.preferredSupplierId ?? undefined}
          onClose={() => setQuoteRequestFor(null)}
        />
      )}

      {bulkOpen && (
        <BulkQuoteRequestModal
          groups={groups}
          currencyId={currenciesQuery.data?.[0]?.id ?? ''}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            setSelectedKeys(new Set());
          }}
        />
      )}
    </>
  );
}

function AlertRow({
  alert: a,
  selected,
  onToggleSelect,
  onQuoteRequest,
}: {
  alert: ReorderSuggestion;
  selected: boolean;
  onToggleSelect: () => void;
  onQuoteRequest: () => void;
}) {
  const queryClient = useQueryClient();
  const toggleAuto = useMutation({
    mutationFn: () =>
      inventoryApi.setMinimumStock({
        warehouseId: a.warehouseId,
        articleVariantId: a.articleVariantId,
        minimumQuantity: a.minimumQuantity,
        autoReplenish: !a.autoReplenish,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-reorder-suggestions'] });
    },
  });

  return (
    <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        disabled={!a.preferredSupplierId}
        title={a.preferredSupplierId ? undefined : 'Sin proveedor preferido - asignalo en Inventario'}
        className="h-4 w-4 shrink-0 accent-primary disabled:opacity-30"
      />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        {a.imageUrl ? (
          <img src={resolveUploadUrl(a.imageUrl) ?? undefined} alt="" className="h-full w-full object-cover" />
        ) : (
          <ShoppingBasket className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {a.articleName}
          {a.variantLabel && <span className="text-muted-foreground"> · {a.variantLabel}</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {a.sku} · {a.warehouseName}
        </p>
        {a.preferredSupplierName && (
          <p className="truncate text-xs text-muted-foreground">Proveedor preferido: {a.preferredSupplierName}</p>
        )}
      </div>
      <div className="shrink-0 text-right text-xs text-destructive">
        <p>
          {a.currentQuantity} / {a.minimumQuantity} mín
        </p>
        <p className="font-semibold">Pedir {a.suggestedQuantity}</p>
      </div>
      <label
        className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
        title={
          a.preferredSupplierId
            ? 'Crea el pedido de cotización solo, una vez por día, sin que nadie entre a esta pantalla'
            : 'Sin proveedor preferido - asignalo en Inventario para poder activar esto'
        }
      >
        <input
          type="checkbox"
          checked={a.autoReplenish}
          onChange={() => toggleAuto.mutate()}
          disabled={!a.preferredSupplierId || toggleAuto.isPending}
          className="h-4 w-4 accent-primary disabled:opacity-30"
        />
        Automático
      </label>
      <Button size="sm" className="shrink-0" onClick={onQuoteRequest}>
        Pedir cotización
      </Button>
    </div>
  );
}
