'use client';

import NewInvoiceModal from '@/app/invoicing/NewInvoiceModal';
import { newLineKey, type SalesLine } from '@/components/sales/salesDocument';
import { inventoryApi } from '@/lib/inventory';
import { storefrontApi, type StorefrontOrder, type StorefrontOrderStatus } from '@/lib/storefront';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

const STATUS: Record<StorefrontOrderStatus, { label: string; className: string }> = {
  NEW: { label: 'Nuevo', className: 'bg-primary/10 text-primary' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  DONE: { label: 'Entregado', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  CANCELLED: { label: 'Cancelado', className: 'bg-muted text-muted-foreground' },
};

const FILTERS: { key: 'OPEN' | 'ALL'; label: string }[] = [
  { key: 'OPEN', label: 'Por atender' },
  { key: 'ALL', label: 'Todos' },
];

function money(value: string | number): string {
  return `$ ${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Pedidos que llegan de la tienda online (etapa A: sin cobro). El negocio
 * los confirma por WhatsApp y los factura como siempre. */
export default function StorefrontOrdersPage() {
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['storefront-orders'], queryFn: storefrontApi.listOrders, refetchInterval: 60_000 });
  const [filter, setFilter] = useState<'OPEN' | 'ALL'>('OPEN');
  const [openId, setOpenId] = useState<string | null>(null);
  const [invoicing, setInvoicing] = useState<StorefrontOrder | null>(null);
  // IVA de cada artículo, para armar la factura del pedido.
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles({ includeInactive: true }),
    enabled: invoicing !== null,
  });

  function invoiceLines(order: StorefrontOrder): SalesLine[] {
    const byVariant = new Map((articlesQuery.data ?? []).flatMap((a) => a.variants.map((v) => [v.id, a] as const)));
    return order.lines.map((line) => {
      const article = byVariant.get(line.articleVariantId);
      return {
        key: newLineKey(),
        articleVariantId: line.articleVariantId,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        taxKind: article?.taxKind ?? 'GRAVADO',
        taxRate: article?.taxRate ?? 0,
      };
    });
  }

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: StorefrontOrderStatus }) => storefrontApi.updateOrderStatus(id, status),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['storefront-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['storefront-settings'] });
      toast.success(`Pedido #${order.number}: ${STATUS[order.status].label.toLowerCase()}`);
    },
    onError: () => toast.error('No se pudo actualizar el pedido'),
  });

  const orders = ordersQuery.data ?? [];
  const list = filter === 'OPEN' ? orders.filter((o) => o.status === 'NEW' || o.status === 'CONFIRMED') : orders;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pedidos de la tienda</h1>
          <p className="text-sm text-muted-foreground">Lo que arman tus clientes en la tienda online. No mueven stock ni se cobran solos: confirmalos y facturalos como siempre.</p>
        </div>
        <Link href="/storefront" className="rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-muted">
          Configurar tienda
        </Link>
      </div>

      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filter === f.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {ordersQuery.isLoading ? (
        <div className="py-16 text-center text-muted-foreground">Cargando...</div>
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">
          {orders.length === 0 ? 'Todavía no entró ningún pedido de la tienda.' : 'No hay pedidos por atender.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Pedido</th>
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {list.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  open={openId === order.id}
                  onToggle={() => setOpenId(openId === order.id ? null : order.id)}
                  onStatus={(status) => update.mutate({ id: order.id, status })}
                  onInvoice={() => setInvoicing(order)}
                  busy={update.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoicing && articlesQuery.isLoading && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 text-sm text-white">Armando la factura...</div>
      )}
      {invoicing && articlesQuery.isSuccess && (
        <NewInvoiceModal
          // Los precios del pedido son finales: con IVA incluido.
          initialLines={invoiceLines(invoicing)}
          initialPricesIncludeTax
          onCreated={() => {
            if (invoicing.status !== 'DONE') update.mutate({ id: invoicing.id, status: 'DONE' });
          }}
          onClose={() => setInvoicing(null)}
        />
      )}
    </div>
  );
}

function OrderRow({
  order,
  open,
  onToggle,
  onStatus,
  onInvoice,
  busy,
}: {
  order: StorefrontOrder;
  open: boolean;
  onToggle: () => void;
  onStatus: (status: StorefrontOrderStatus) => void;
  onInvoice: () => void;
  busy: boolean;
}) {
  const status = STATUS[order.status];
  const phoneDigits = (order.customerPhone ?? '').replace(/\D/g, '');
  return (
    <>
      <tr className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40" onClick={onToggle}>
        <td className="px-4 py-3 font-semibold tabular-nums">#{order.number}</td>
        <td className="px-4 py-3 tabular-nums text-muted-foreground">
          {new Date(order.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </td>
        <td className="px-4 py-3">
          {order.customerName}
          {order.customerPhone && <span className="block text-xs text-muted-foreground">{order.customerPhone}</span>}
        </td>
        <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(order.total)}</td>
        <td className="px-4 py-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
        </td>
        <td className="px-4 py-3 text-right text-xs text-primary">{open ? 'Ocultar' : 'Ver detalle'}</td>
      </tr>
      {open && (
        <tr className="border-b bg-muted/30 last:border-b-0">
          <td colSpan={6} className="px-4 py-4">
            <div className="flex flex-col gap-3">
              <table className="w-full max-w-2xl text-sm">
                <tbody>
                  {order.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-3 tabular-nums">{Number(line.quantity).toLocaleString('es-AR')} ×</td>
                      <td className="w-full py-1 pr-3">{line.description}</td>
                      <td className="py-1 pr-3 text-right tabular-nums text-muted-foreground">{money(line.unitPrice)} c/u</td>
                      <td className="py-1 text-right tabular-nums">{money(Number(line.unitPrice) * Number(line.quantity))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {order.note && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Nota del cliente:</span> {order.note}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {phoneDigits.length >= 8 && (
                  <a
                    href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(`Hola ${order.customerName}! Te escribimos por tu pedido #${order.number}.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold"
                  >
                    <MessageCircle className="h-4 w-4" /> Escribirle por WhatsApp
                  </a>
                )}
                {order.status !== 'CANCELLED' && (
                  <button onClick={onInvoice} className="rounded-lg border px-3 py-1.5 text-sm font-semibold">
                    Facturar
                  </button>
                )}
                {order.status === 'NEW' && (
                  <button disabled={busy} onClick={() => onStatus('CONFIRMED')} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    Marcar confirmado
                  </button>
                )}
                {(order.status === 'NEW' || order.status === 'CONFIRMED') && (
                  <>
                    <button disabled={busy} onClick={() => onStatus('DONE')} className="rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                      Marcar entregado
                    </button>
                    <button disabled={busy} onClick={() => onStatus('CANCELLED')} className="rounded-lg px-3 py-1.5 text-sm text-destructive disabled:opacity-50">
                      Cancelar pedido
                    </button>
                  </>
                )}
                {(order.status === 'DONE' || order.status === 'CANCELLED') && (
                  <button disabled={busy} onClick={() => onStatus('NEW')} className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground disabled:opacity-50">
                    Volver a “Nuevo”
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
