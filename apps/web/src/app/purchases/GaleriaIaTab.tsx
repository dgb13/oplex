'use client';

import { companiesApi } from '@/lib/companies';
import { resolveUploadUrl } from '@/lib/inventory';
import { purchaseInvoicesApi, type ListPurchaseInvoicesFilters } from '@/lib/purchases';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import PurchaseInvoiceDetailPanel from './PurchaseInvoiceDetailPanel';

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const CONFIDENCE_LABELS: Record<'alta' | 'media' | 'baja', { label: string; className: string }> = {
  alta: { label: '🟢 Alta', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  media: { label: '🟡 Media', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  baja: { label: '🔴 Baja', className: 'bg-destructive/10 text-destructive dark:bg-destructive/10 dark:text-destructive' },
};

function confidenceLevelOf(confidence: string | null): 'alta' | 'media' | 'baja' | null {
  if (confidence === null) return null;
  const n = Number(confidence);
  return n >= 0.85 ? 'alta' : n >= 0.6 ? 'media' : 'baja';
}

/**
 * "Galería IA" - grilla filtrable de las facturas que vinieron de "Carga con
 * IA" (CargaIaTab), nunca las cargadas a mano (aiScannedOnly siempre true
 * acá - ver PurchaseInvoiceService.list()). Pensada para auditar de un
 * vistazo cuáles conviene revisar de nuevo (nivel de confianza) o cuáles el
 * usuario tuvo que corregir a mano (editado).
 */
export default function GaleriaIaTab() {
  const [supplierId, setSupplierId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [confidenceLevel, setConfidenceLevel] = useState<'' | 'alta' | 'media' | 'baja'>('');
  const [edited, setEdited] = useState<'' | 'true' | 'false'>('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const filters: ListPurchaseInvoicesFilters = {
    aiScannedOnly: true,
    supplierId: supplierId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    confidenceLevel: confidenceLevel || undefined,
    edited: edited === '' ? undefined : edited === 'true',
  };

  const suppliersQuery = useQuery({ queryKey: ['companies', 'SUPPLIER'], queryFn: () => companiesApi.list('SUPPLIER') });
  const invoicesQuery = useQuery({
    queryKey: ['purchase-invoices', 'galeria-ia', filters],
    queryFn: () => purchaseInvoicesApi.list(filters),
  });

  const invoices = invoicesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Proveedor</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
            <option value="">Todos</option>
            {(suppliersQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Desde</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={selectClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Hasta</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={selectClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Confianza</span>
          <select
            value={confidenceLevel}
            onChange={(e) => setConfidenceLevel(e.target.value as typeof confidenceLevel)}
            className={selectClass}
          >
            <option value="">Todas</option>
            <option value="alta">🟢 Alta</option>
            <option value="media">🟡 Media</option>
            <option value="baja">🔴 Baja</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Editada antes de confirmar</span>
          <select value={edited} onChange={(e) => setEdited(e.target.value as typeof edited)} className={selectClass}>
            <option value="">Todas</option>
            <option value="true">Sí, se corrigió algo</option>
            <option value="false">No, tal cual la leyó la IA</option>
          </select>
        </label>
        {(supplierId || dateFrom || dateTo || confidenceLevel || edited) && (
          <button
            type="button"
            onClick={() => {
              setSupplierId('');
              setDateFrom('');
              setDateTo('');
              setConfidenceLevel('');
              setEdited('');
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {invoicesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguna factura cargada con IA coincide con estos filtros.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {invoices.map((inv) => {
            const level = confidenceLevelOf(inv.aiScanConfidence);
            const thumbUrl = resolveUploadUrl(inv.attachmentUrl);
            return (
              <button
                key={inv.id}
                type="button"
                onClick={() => setDetailId(inv.id)}
                className="flex flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary"
              >
                <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt={inv.supplierInvoiceNumber} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-3xl">🧾</span>
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <p className="truncate text-sm font-medium">{inv.supplierName}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{inv.supplierInvoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(inv.supplierInvoiceDate).toLocaleDateString('es-AR', { timeZone: 'UTC' })} · $
                    {Number(inv.total).toLocaleString('es-AR')}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {level && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CONFIDENCE_LABELS[level].className}`}>
                        {CONFIDENCE_LABELS[level].label}
                      </span>
                    )}
                    {inv.aiScanEdited && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Editada
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detailId && <PurchaseInvoiceDetailPanel purchaseInvoiceId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
