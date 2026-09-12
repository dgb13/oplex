'use client';

import {
  describeQuoteRequestStatus,
  PDF_STYLES,
  purchasePreferencesApi,
  quoteRequestsApi,
  type PdfStyle,
  type PurchaseOrderDetail,
  type QuoteRequestDetail,
} from '@/lib/purchases';
import { buildVariantLabel } from '@/lib/inventory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

interface Props {
  quoteRequestId: string;
  onClose: () => void;
  onEdit: (detail: QuoteRequestDetail) => void;
  onConverted: (purchaseOrder: PurchaseOrderDetail) => void;
}

// Only for the "Órdenes de Compra" list below, which shows each linked
// order's OWN status (DRAFT/SENT/CANCELLED) - a different enum than the
// Pedido's own status, unrelated to describeQuoteRequestStatus's
// Borrador/Comprado/Enviado/Cancelado (used for the header badge above it).
const PURCHASE_ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  CANCELLED: 'Cancelada',
};

export default function QuoteRequestDetailPanel({ quoteRequestId, onClose, onEdit, onConverted }: Props) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('MODERNO');
  const [error, setError] = useState('');

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Defaults the style picker to the user's own saved preference, without
  // fighting a manual change they make afterward in this same panel.
  const { data: preferences } = useQuery({
    queryKey: ['purchase-preferences'],
    queryFn: purchasePreferencesApi.get,
  });
  const [styleTouched, setStyleTouched] = useState(false);
  useEffect(() => {
    if (!styleTouched && preferences) setPdfStyle(preferences.purchaseDocumentPdfStyle);
  }, [preferences, styleTouched]);

  const { data, isLoading } = useQuery({
    queryKey: ['quote-request-detail', quoteRequestId],
    queryFn: () => quoteRequestsApi.get(quoteRequestId),
  });

  const cloneMutation = useMutation({
    mutationFn: () => quoteRequestsApi.clone(quoteRequestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo clonar el pedido';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => quoteRequestsApi.cancel(quoteRequestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['quote-request-detail', quoteRequestId] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo cancelar el pedido';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const convertMutation = useMutation({
    mutationFn: () => quoteRequestsApi.convert(quoteRequestId),
    onSuccess: (purchaseOrder) => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onConverted(purchaseOrder);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo emitir la orden de compra';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div
        className={`flex h-full w-full max-w-lg flex-col overflow-y-auto border-l bg-card p-6 shadow-2xl transition-transform duration-200 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{data?.number ?? '...'}</h2>
            {data && <p className="text-xs text-muted-foreground">{data.supplier.name}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        {isLoading || !data ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">Cargando...</div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Estado">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${describeQuoteRequestStatus(data).colorClass}`}
                >
                  {describeQuoteRequestStatus(data).label}
                </span>
              </Info>
              <Info label="Fecha">{new Date(data.createdAt).toLocaleDateString('es-AR')}</Info>
              {data.validUntil && (
                <Info label="Válido hasta">{new Date(data.validUntil).toLocaleDateString('es-AR')}</Info>
              )}
              {data.transportMode && <Info label="Transporte">{data.transportMode.name}</Info>}
              {data.paymentTerm && <Info label="Forma de pago">{data.paymentTerm.name}</Info>}
              {data.deliveryTime && <Info label="Plazo de entrega">{data.deliveryTime.name}</Info>}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Líneas</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                      <th className="p-2">Artículo</th>
                      <th className="p-2 text-right">Cant.</th>
                      <th className="p-2 text-right">Costo est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line) => (
                      <tr key={line.id} className="border-b border-border/50">
                        <td className="p-2">
                          <p className="">
                            {line.articleVariant.article.name}
                            {buildVariantLabel(line.articleVariant) && (
                              <span className="text-muted-foreground"> · {buildVariantLabel(line.articleVariant)}</span>
                            )}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">{line.articleVariant.sku}</p>
                        </td>
                        <td className="p-2 text-right">{line.quantity}</td>
                        <td className="p-2 text-right">
                          {line.estimatedUnitCost != null ? `$${Number(line.estimatedUnitCost).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-right text-sm font-semibold">
                Total estimado: {data.estimatedTotal != null ? `$${Number(data.estimatedTotal).toFixed(2)}` : 'incompleto'}
              </p>
            </section>

            {data.notes && (
              <section>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">Notas</h3>
                <p className="text-sm">{data.notes}</p>
              </section>
            )}

            {data.purchaseOrders.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Órdenes de Compra</h3>
                <ul className="flex flex-col gap-1 text-sm">
                  {data.purchaseOrders.map((po) => (
                    <li key={po.id}>
                      {po.number} — {PURCHASE_ORDER_STATUS_LABELS[po.status] ?? po.status}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="flex flex-col gap-2 border-t pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border bg-muted px-2 py-1.5 text-xs"
                  value={pdfStyle}
                  onChange={(e) => {
                    setPdfStyle(e.target.value as PdfStyle);
                    setStyleTouched(true);
                  }}
                >
                  {PDF_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void quoteRequestsApi.openPdf(quoteRequestId, pdfStyle)}
                  className="rounded-lg border px-3 py-1.5 text-xs transition hover:bg-muted"
                >
                  Descargar PDF
                </button>
                <button
                  type="button"
                  onClick={() => cloneMutation.mutate()}
                  disabled={cloneMutation.isPending}
                  className="rounded-lg border px-3 py-1.5 text-xs transition hover:bg-muted disabled:opacity-50"
                >
                  {cloneMutation.isPending ? 'Clonando...' : 'Clonar'}
                </button>
              </div>

              {data.status === 'DRAFT' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(data)}
                    className="rounded-lg border px-3 py-1.5 text-xs transition hover:bg-muted"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Cancelar pedido
                  </button>
                  <button
                    type="button"
                    onClick={() => convertMutation.mutate()}
                    disabled={convertMutation.isPending}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {convertMutation.isPending ? 'Emitiendo...' : 'Emitir Orden de Compra'}
                  </button>
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="">{children}</p>
    </div>
  );
}
