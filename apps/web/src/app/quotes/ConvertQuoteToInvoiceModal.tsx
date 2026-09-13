'use client';

import { Button } from '@/components/ui/button';
import { companiesApi } from '@/lib/companies';
import type { DocumentLetter } from '@/lib/documentLetter';
import { inventoryApi } from '@/lib/inventory';
import { quotesApi, type QuoteDetail } from '@/lib/quotes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  quote: QuoteDetail;
  onClose: () => void;
  onConverted: (invoice: { id: string; number: string }) => void;
}

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

const DOCUMENT_LETTERS: DocumentLetter[] = ['A', 'B', 'C', 'M'];

export default function ConvertQuoteToInvoiceModal({ quote, onClose, onConverted }: Props) {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [documentLetter, setDocumentLetter] = useState<DocumentLetter>('B');
  const [error, setError] = useState('');

  const branchesQuery = useQuery({ queryKey: ['companies', 'BRANCH'], queryFn: () => companiesApi.list('BRANCH') });
  const warehousesQuery = useQuery({ queryKey: ['inventory-warehouses'], queryFn: inventoryApi.listWarehouses });
  const branches = branchesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];

  if (!branchId && branches[0]) setBranchId(branches[0].id);
  if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);

  const mutation = useMutation({
    mutationFn: () =>
      quotesApi.convertToInvoice(quote.id, { branchId, warehouseId, documentLetter }),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: ['quote-detail', quote.id] });
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      onConverted(invoice);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo convertir la cotización';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Convertir a factura</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          {quote.currency.code === 'ARS' ? (
            <>Se factura {quote.number} en {quote.currency.code} tal cual, sin conversión.</>
          ) : (
            <>
              {quote.number} está en {quote.currency.code} - la factura sale en la moneda base del tenant, convertida
              a la cotización vigente.
            </>
          )}
        </p>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Sucursal / PV</label>
            <select className={selectClass} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.pointOfSaleNumber ?? 'sin PV'})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Depósito</label>
            <select className={selectClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Tipo de comprobante</label>
            <select
              className={selectClass}
              value={documentLetter}
              onChange={(e) => setDocumentLetter(e.target.value as DocumentLetter)}
            >
              {DOCUMENT_LETTERS.map((l) => (
                <option key={l} value={l}>
                  Factura {l}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !branchId || !warehouseId}
            >
              {mutation.isPending ? 'Convirtiendo...' : 'Convertir a factura'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
