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
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Nueva factura
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : !invoices || invoices.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-600">Todavía no hay facturas de compra</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left text-slate-500">
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
                  <tr key={inv.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="p-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {inv.supplierInvoiceNumber}
                    </td>
                    <td className="p-3 text-slate-800 dark:text-slate-200">{inv.supplierName}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">{inv.purchaseOrder?.number ?? '—'}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">
                      {new Date(inv.supplierInvoiceDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                    </td>
                    <td className="p-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.colorClass}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="p-3 text-right text-slate-800 dark:text-slate-200">
                      ${Number(inv.total).toFixed(2)}
                    </td>
                    <td className="p-3 text-right text-slate-800 dark:text-slate-200">
                      ${Number(inv.balanceDue).toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setDetailId(inv.id)}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
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
