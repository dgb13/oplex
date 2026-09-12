'use client';

import { describePurchaseInvoiceStatus, purchaseInvoicesApi } from '@/lib/purchases';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import NewPurchaseInvoiceModal from './NewPurchaseInvoiceModal';
import PurchaseInvoiceDetailPanel from './PurchaseInvoiceDetailPanel';

export default function FacturasTab() {
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['purchase-invoices'],
    queryFn: () => purchaseInvoicesApi.list(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Nueva factura
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : !invoices || invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay facturas de compra</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="p-3">Número</th>
                <th className="p-3">Proveedor</th>
                <th className="p-3">Orden</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">Saldo</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const status = describePurchaseInvoiceStatus(inv.status);
                return (
                  <tr key={inv.id} className="border-b border-border/50">
                    <td className="p-3 font-mono text-xs">
                      {inv.supplierInvoiceNumber}
                    </td>
                    <td className="p-3">{inv.supplierName}</td>
                    <td className="p-3 text-muted-foreground">{inv.purchaseOrder?.number ?? '—'}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(inv.supplierInvoiceDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    </td>
                    <td className="p-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.colorClass}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      ${Number(inv.total).toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      ${Number(inv.balanceDue).toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setDetailId(inv.id)}
                        className="text-xs text-primary hover:text-primary"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <NewPurchaseInvoiceModal onClose={() => setCreating(false)} />}
      {detailId && <PurchaseInvoiceDetailPanel purchaseInvoiceId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
