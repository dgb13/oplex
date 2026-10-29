'use client';

import { pointOfSaleNotEnabled, PointOfSaleErrorNotice } from '@/components/arca/PointOfSaleErrorNotice';
import { PendingDeliveryDialog } from '@/components/sales/PendingDeliveryDialog';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/Select';
import { companiesApi } from '@/lib/companies';
import { suggestDocumentLetter, type DocumentLetter } from '@/lib/documentLetter';
import { inventoryApi } from '@/lib/inventory';
import { invoicingApi, type StockShortage } from '@/lib/invoicing';
import { quotesApi, type QuoteDetail } from '@/lib/quotes';
import { receivablesApi } from '@/lib/receivables';
import { tenantSettingsApi, type PointOfSaleNotEnabledError } from '@/lib/tenantSettings';
import { formatMoney } from '@/lib/vatCost';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

interface Props {
  quote: QuoteDetail;
  onClose: () => void;
  onConverted: (invoice: { id: string; number: string }) => void;
}

const DOCUMENT_LETTERS: DocumentLetter[] = ['A', 'B', 'C', 'M'];

export default function ConvertQuoteToInvoiceModal({ quote, onClose, onConverted }: Props) {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [documentLetter, setDocumentLetter] = useState<DocumentLetter>('B');
  const [error, setError] = useState('');
  const [pointOfSaleError, setPointOfSaleError] = useState<PointOfSaleNotEnabledError | null>(null);
  // Aviso "Falta stock para entregar todo" (null = cerrado).
  const [shortages, setShortages] = useState<StockShortage[] | null>(null);
  const [checkingStock, setCheckingStock] = useState(false);

  // La letra se sugiere igual que en la Caja y en Nueva factura (condición
  // IVA propia + la del cliente) - antes arrancaba siempre en "B", y un
  // Monotributo que no la cambiaba emitía una B que no le corresponde.
  const tenantSettingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  const customersQuery = useQuery({ queryKey: ['companies', 'CUSTOMER'], queryFn: () => companiesApi.list('CUSTOMER') });
  const customer = (customersQuery.data ?? []).find((c) => c.id === quote.customer.id);
  const letterSuggestion = suggestDocumentLetter(
    tenantSettingsQuery.data?.ownTaxCondition ?? null,
    customer?.taxId ?? quote.customer.taxId,
    customer?.taxCondition ?? null,
  );
  useEffect(() => {
    if (letterSuggestion.letter) setDocumentLetter(letterSuggestion.letter);
  }, [letterSuggestion.letter]);

  const branchesQuery = useQuery({ queryKey: ['companies', 'BRANCH'], queryFn: () => companiesApi.list('BRANCH') });
  const warehousesQuery = useQuery({ queryKey: ['inventory-warehouses'], queryFn: inventoryApi.listWarehouses });
  const branches = branchesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];

  // Límite de crédito: sólo avisa (igual que Nueva factura). Los saldos están
  // en pesos, así que sólo se compara una cotización en ARS.
  const balancesQuery = useQuery({
    queryKey: ['receivables-balances'],
    queryFn: receivablesApi.listCustomerBalances,
    retry: false,
  });
  const customerBalance = balancesQuery.data?.find((b) => b.customerId === quote.customer.id);
  const creditLimit = Number(customerBalance?.creditLimit ?? 0);
  const owedAfter = Number(customerBalance?.outstanding ?? 0) + Number(quote.total);
  const exceedsCreditLimit = quote.currency.code === 'ARS' && creditLimit > 0 && owedAfter > creditLimit;

  if (!branchId && branches[0]) setBranchId(branches[0].id);
  if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);

  const mutation = useMutation({
    mutationFn: (allowPendingDelivery: boolean) =>
      quotesApi.convertToInvoice(quote.id, { branchId, warehouseId, documentLetter, allowPendingDelivery }),
    onSuccess: (invoice) => {
      void queryClient.invalidateQueries({ queryKey: ['quote-detail', quote.id] });
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      onConverted(invoice);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setShortages(null);
      setPointOfSaleError(pointOfSaleNotEnabled(err));
      const message = err.response?.data?.message ?? 'No se pudo convertir la cotización';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  // Igual que Nueva factura: si falta stock, se avisa y se puede seguir.
  function convert() {
    setError('');
    setPointOfSaleError(null);
    setCheckingStock(true);
    invoicingApi
      .checkStock({ warehouseId, quoteId: quote.id })
      .then((result) => {
        if (result.shortages.length > 0) setShortages(result.shortages);
        else mutation.mutate(false);
      })
      .catch(() => mutation.mutate(false))
      .finally(() => setCheckingStock(false));
  }

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
            <Select
              value={branchId}
              onChange={setBranchId}
              options={branches.map((b) => ({ value: b.id, label: `${b.name} (${b.pointOfSaleNumber ?? 'sin PV'})` }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Depósito</label>
            <Select
              value={warehouseId}
              onChange={setWarehouseId}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-muted-foreground">Tipo de comprobante</label>
            <Select
              value={documentLetter}
              onChange={(l) => setDocumentLetter(l as DocumentLetter)}
              options={DOCUMENT_LETTERS.map((l) => ({ value: l, label: `Factura ${l}` }))}
              disabled={letterSuggestion.locked}
            />
            <p
              className={`text-xs ${letterSuggestion.locked ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}
            >
              {letterSuggestion.reason}
            </p>
          </div>

          {exceedsCreditLimit && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Con esta factura, {quote.customer.name} queda debiendo {formatMoney(owedAfter)} y su límite de crédito es{' '}
              {formatMoney(creditLimit)}. Podés facturar igual; el límite se cambia en la ficha del cliente.
            </p>
          )}
          {pointOfSaleError ? (
            <PointOfSaleErrorNotice error={pointOfSaleError} />
          ) : (
            error && <p className="text-sm text-destructive">{error}</p>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={convert}
              disabled={mutation.isPending || checkingStock || !branchId || !warehouseId}
            >
              {mutation.isPending ? 'Convirtiendo...' : checkingStock ? 'Revisando stock...' : 'Convertir a factura'}
            </Button>
          </div>
        </div>
      </div>
      {shortages && (
        <PendingDeliveryDialog
          shortages={shortages}
          pending={mutation.isPending}
          onBack={() => setShortages(null)}
          onConfirm={() => mutation.mutate(true)}
        />
      )}
    </div>
  );
}
