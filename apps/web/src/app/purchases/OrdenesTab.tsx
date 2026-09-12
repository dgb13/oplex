'use client';

import { describeReceiptStatus, purchaseOrdersApi } from '@/lib/purchases';
import { useQuery } from '@tanstack/react-query';
import { PackageCheck } from 'lucide-react';
import { useState } from 'react';
import PurchaseOrderDetailPanel from './PurchaseOrderDetailPanel';
import PurchaseOrderFollowUpModal from './PurchaseOrderFollowUpModal';
import PurchaseOrderFormModal from './PurchaseOrderFormModal';
import ReceiveGoodsModal from './ReceiveGoodsModal';
import SendPurchaseOrderDialog from './SendPurchaseOrderDialog';
import SentViaBadge from './SentViaBadge';

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

export default function OrdenesTab() {
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [resendId, setResendId] = useState<string | null>(null);
  const [followUpId, setFollowUpId] = useState<string | null>(null);

  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: () => purchaseOrdersApi.list(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Nueva orden
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : !purchaseOrders || purchaseOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay órdenes de compra</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="p-3">Número</th>
                <th className="p-3">Proveedor</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Enviada vía</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id} className="border-b border-border/50">
                  <td className="p-3 font-mono text-xs">{po.number}</td>
                  <td className="p-3">{po.supplier.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(po.createdAt).toLocaleDateString('es-AR')}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[po.status]}`}>
                        {STATUS_LABELS[po.status] ?? po.status}
                      </span>
                      {(() => {
                        const receipt = describeReceiptStatus(po);
                        if (!receipt) return null;
                        if (receipt.percent >= 100) {
                          return (
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${receipt.colorClass}`}>
                              {receipt.label}
                            </span>
                          );
                        }
                        return (
                          <span
                            className="relative overflow-hidden rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                            title={`${receipt.percent}% recibido`}
                          >
                            <span
                              className="absolute inset-y-0 left-0 z-0 bg-primary/30"
                              style={{ width: `${receipt.percent}%` }}
                            />
                            <span className="relative z-10">{receipt.label}</span>
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="p-3">
                    <SentViaBadge
                      order={po}
                      onResend={() => setResendId(po.id)}
                      onFollowUp={() => setFollowUpId(po.id)}
                    />
                  </td>
                  <td className="p-3 text-right">
                    ${Number(po.total).toFixed(2)} {po.currency.code}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-2 text-xs">
                      {po.status === 'SENT' && po.lines.some((l) => Number(l.pendingQuantity) > 0) && (
                        <button
                          onClick={() => setReceivingId(po.id)}
                          title="Recibir mercadería"
                          className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                        >
                          <PackageCheck className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDetailId(po.id)}
                        className="text-primary hover:text-primary"
                      >
                        Ver
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <PurchaseOrderFormModal onClose={() => setCreating(false)} />}
      {detailId && <PurchaseOrderDetailPanel purchaseOrderId={detailId} onClose={() => setDetailId(null)} />}
      {receivingId && <ReceiveGoodsLoader purchaseOrderId={receivingId} onClose={() => setReceivingId(null)} />}
      {resendId &&
        (() => {
          const po = purchaseOrders?.find((p) => p.id === resendId);
          return (
            po && (
              <SendPurchaseOrderDialog
                purchaseOrder={{
                  id: po.id,
                  number: po.number,
                  supplierId: po.supplier.id,
                  supplierName: po.supplier.name,
                  supplierEmail: po.supplier.email,
                }}
                onClose={() => setResendId(null)}
              />
            )
          );
        })()}
      {followUpId &&
        (() => {
          const po = purchaseOrders?.find((p) => p.id === followUpId);
          return po && <PurchaseOrderFollowUpModal order={po} onClose={() => setFollowUpId(null)} />;
        })()}
    </div>
  );
}

/** El ícono de "Recibir mercadería" del listado sólo tiene el resumen de la
 * orden (sin líneas con articleVariant/unitCost) - ReceiveGoodsModal necesita
 * el detalle completo, así que lo trae primero. Misma queryKey que usa
 * PurchaseOrderDetailPanel/ReceiveGoodsModal, así que si la orden ya se vio
 * en esta sesión sale de caché al instante. */
function ReceiveGoodsLoader({ purchaseOrderId, onClose }: { purchaseOrderId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['purchase-order-detail', purchaseOrderId],
    queryFn: () => purchaseOrdersApi.get(purchaseOrderId),
  });

  if (isLoading || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <p className="text-sm">Cargando...</p>
      </div>
    );
  }

  return <ReceiveGoodsModal purchaseOrder={data} onClose={onClose} />;
}
