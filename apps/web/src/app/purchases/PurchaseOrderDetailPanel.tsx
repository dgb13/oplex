'use client';

import Select from '@/components/ui/Select';
import { buildVariantLabel, resolveUploadUrl } from '@/lib/inventory';
import { PDF_STYLES, purchaseOrdersApi, purchasePreferencesApi, type PdfStyle } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import ReceiveGoodsModal from './ReceiveGoodsModal';
import SendPurchaseOrderDialog from './SendPurchaseOrderDialog';
import SupplierReturnModal from './SupplierReturnModal';

interface Props {
  purchaseOrderId: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  CANCELLED: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted',
  SENT: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  CANCELLED: 'bg-muted text-muted-foreground',
};

const CHANNEL_LABELS: Record<string, string> = { EMAIL: 'Email', WHATSAPP: 'WhatsApp' };

export default function PurchaseOrderDetailPanel({ purchaseOrderId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('MODERNO');
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [returningReceiptId, setReturningReceiptId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

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
    queryKey: ['purchase-order-detail', purchaseOrderId],
    queryFn: () => purchaseOrdersApi.get(purchaseOrderId),
  });

  const cancelMutation = useMutation({
    mutationFn: () => purchaseOrdersApi.cancel(purchaseOrderId),
    onSuccess: () => {
      setConfirmingCancel(false);
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', purchaseOrderId] });
    },
  });
  const hasPartialReceipt = data?.lines.some((l) => Number(l.receivedQuantity) > 0) ?? false;

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
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[data.status]}`}>
                  {STATUS_LABELS[data.status] ?? data.status}
                </span>
              </Info>
              <Info label="Fecha">{new Date(data.createdAt).toLocaleDateString('es-AR')}</Info>
              {data.sentAt && (
                <Info label="Enviada">
                  {new Date(data.sentAt).toLocaleDateString('es-AR')} ·{' '}
                  {CHANNEL_LABELS[data.sentVia ?? ''] ?? data.sentVia}
                </Info>
              )}
              {data.quoteRequest && <Info label="Originada en pedido">{data.quoteRequest.number}</Info>}
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
                      <th className="p-2 text-right">Costo</th>
                      <th className="p-2 text-right">Recibido</th>
                      <th className="p-2 text-right">Pendiente</th>
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
                          ${Number(line.unitCost).toFixed(2)}
                        </td>
                        <td className="p-2 text-right">{line.receivedQuantity}</td>
                        <td
                          className={`p-2 text-right ${Number(line.pendingQuantity) > 0 ? 'text-amber-600 dark:text-amber-400' : ' '}`}
                        >
                          {line.pendingQuantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-right text-sm font-semibold">
                Total: ${Number(data.total).toFixed(2)} {data.currency.code}
              </p>
            </section>

            {data.notes && (
              <section>
                <h3 className="mb-1 text-sm font-medium text-muted-foreground">Notas</h3>
                <p className="text-sm">{data.notes}</p>
              </section>
            )}

            {data.receipts.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">Recepciones</h3>
                <div className="flex flex-col gap-2">
                  {data.receipts.map((receipt) => (
                    <div
                      key={receipt.id}
                      className="rounded-lg border p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <p className="">
                          {/* receivedAt comes from a date-only <input type="date"> (ReceiveGoodsModal),
                              stored as UTC midnight - display with timeZone: 'UTC' too, otherwise a
                              viewer behind UTC (e.g. Argentina) sees it roll back a day. Same pitfall
                              already fixed once for Reportes' date-range filters (see PROGRESS.md). */}
                          {new Date(receipt.receivedAt).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                          {receipt.supplierDocNumber && ` — Remito ${receipt.supplierDocNumber}`}
                        </p>
                        {receipt.attachmentUrl && (
                          <a
                            href={resolveUploadUrl(receipt.attachmentUrl) ?? '#'}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:text-primary"
                          >
                            Ver comprobante
                          </a>
                        )}
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {receipt.lines.length} línea{receipt.lines.length === 1 ? '' : 's'} · recibido por{' '}
                        {receipt.receivedBy.name ?? receipt.receivedBy.email}
                      </p>
                      {receipt.notes && <p className="mt-1 text-muted-foreground">{receipt.notes}</p>}

                      {receipt.returns.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
                          {receipt.returns.map((ret) => (
                            <p key={ret.id} className="text-amber-700 dark:text-amber-400">
                              Devuelto{' '}
                              {new Date(ret.createdAt).toLocaleDateString('es-AR', { timeZone: 'UTC' })}: {ret.reason}
                              {' · '}
                              {ret.returnedBy.name ?? ret.returnedBy.email}
                            </p>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => setReturningReceiptId(receipt.id)}
                        className="mt-2 text-destructive hover:text-destructive"
                      >
                        Devolver mercadería
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-2 border-t pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  className="w-40"
                  value={pdfStyle}
                  onChange={(v) => {
                    setPdfStyle(v as PdfStyle);
                    setStyleTouched(true);
                  }}
                  options={PDF_STYLES.map((s) => ({ value: s.value, label: s.label }))}
                />
                <button
                  type="button"
                  onClick={() => void purchaseOrdersApi.openPdf(purchaseOrderId, pdfStyle)}
                  className="rounded-lg border px-3 py-1.5 text-xs transition hover:bg-muted"
                >
                  Descargar PDF
                </button>
              </div>

              {data.status !== 'CANCELLED' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSending(true)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                  >
                    {data.sentAt ? 'Reenviar' : 'Enviar'}
                  </button>
                  {data.status === 'SENT' && data.lines.some((l) => Number(l.pendingQuantity) > 0) && (
                    <button
                      type="button"
                      onClick={() => setReceiving(true)}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-500"
                    >
                      Recibir mercadería
                    </button>
                  )}
                  {confirmingCancel ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        {hasPartialReceipt
                          ? 'Esta orden ya tiene mercadería recibida — cancelarla no revierte lo recibido, sólo impide seguir recibiendo lo pendiente. ¿Confirmás?'
                          : '¿Confirmás que querés cancelar esta orden?'}
                      </span>
                      <button
                        type="button"
                        onClick={() => cancelMutation.mutate()}
                        disabled={cancelMutation.isPending}
                        className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
                      >
                        {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelación'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingCancel(false)}
                        className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
                      >
                        Volver
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingCancel(true)}
                      className="rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                    >
                      Cancelar orden
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {sending && data && (
        <SendPurchaseOrderDialog
          purchaseOrder={{
            id: data.id,
            number: data.number,
            supplierId: data.supplier.id,
            supplierName: data.supplier.name,
            supplierEmail: data.supplier.email,
          }}
          onClose={() => {
            setSending(false);
            void queryClient.invalidateQueries({ queryKey: ['purchase-order-detail', purchaseOrderId] });
          }}
        />
      )}

      {receiving && data && <ReceiveGoodsModal purchaseOrder={data} onClose={() => setReceiving(false)} />}

      {returningReceiptId &&
        data &&
        (() => {
          const receipt = data.receipts.find((r) => r.id === returningReceiptId);
          return (
            receipt && (
              <SupplierReturnModal
                purchaseOrderId={purchaseOrderId}
                receipt={receipt}
                orderLines={data.lines}
                onClose={() => setReturningReceiptId(null)}
              />
            )
          );
        })()}
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
