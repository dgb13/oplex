'use client';

import ArticlePicker from '@/components/ArticlePicker';
import CompanyFormModal from '@/components/CompanyFormModal';
import { companiesApi } from '@/lib/companies';
import { inventoryApi } from '@/lib/inventory';
import { invoicingApi } from '@/lib/invoicing';
import {
  quoteRequestsApi,
  type QuoteRequestDetail,
  type QuoteRequestLineInput,
} from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import CatalogSelectField from './CatalogSelectField';

interface Props {
  quoteRequest?: QuoteRequestDetail;
  onClose: () => void;
  // Prefill para crear un pedido a partir de una alerta de stock (ver
  // StockAlertsPanel) - sólo tiene efecto en modo creación, nunca en edición.
  initialLine?: { articleVariantId: string; quantity: number; estimatedUnitCost?: number };
  initialSupplierId?: string;
}

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export default function QuoteRequestFormModal({
  quoteRequest,
  onClose,
  initialLine,
  initialSupplierId,
}: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(quoteRequest);

  const suppliersQuery = useQuery({
    queryKey: ['companies', 'SUPPLIER'],
    queryFn: () => companiesApi.list('SUPPLIER'),
  });
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
  });
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
  });

  const suppliers = suppliersQuery.data ?? [];
  const currencies = currenciesQuery.data ?? [];

  const [supplierId, setSupplierId] = useState(quoteRequest?.supplier.id ?? initialSupplierId ?? '');
  const [currencyId, setCurrencyId] = useState(quoteRequest?.currency.id ?? '');
  const [transportModeId, setTransportModeId] = useState(quoteRequest?.transportMode?.id ?? '');
  const [paymentTermId, setPaymentTermId] = useState(quoteRequest?.paymentTerm?.id ?? '');
  const [deliveryTimeId, setDeliveryTimeId] = useState(quoteRequest?.deliveryTime?.id ?? '');
  const [validUntil, setValidUntil] = useState(
    quoteRequest?.validUntil ? quoteRequest.validUntil.slice(0, 10) : '',
  );
  const [notes, setNotes] = useState(quoteRequest?.notes ?? '');
  const [lines, setLines] = useState<QuoteRequestLineInput[]>(
    quoteRequest?.lines.map((l) => ({
      articleVariantId: '', // resolved below once el catálogo cargó - ver fallback sin efectos
      quantity: Number(l.quantity),
      estimatedUnitCost: l.estimatedUnitCost != null ? Number(l.estimatedUnitCost) : undefined,
      notes: l.notes ?? undefined,
    })) ?? [
      initialLine
        ? { ...initialLine }
        : { articleVariantId: '', quantity: 1 },
    ],
  );
  // articleVariantId isn't in QuoteRequestLineDetail (only sku/article name
  // are) - resolve it once by matching sku against the variant catalog, on
  // first render only (not on every keystroke elsewhere in the form). Only
  // patches articleVariantId into whatever is currently in state (via the
  // functional updater) instead of re-deriving the whole line from the
  // original quoteRequest prop - articlesQuery can resolve well after the
  // user already started typing into quantity/estimatedUnitCost/notes
  // (this modal doesn't wait on it, see `ready` below), and re-deriving the
  // full line here used to silently overwrite those edits with the stale
  // original value right before submit.
  const [linesResolved, setLinesResolved] = useState(!isEdit);
  if (!linesResolved && quoteRequest && (articlesQuery.data?.length ?? 0) > 0) {
    const bySku = new Map((articlesQuery.data ?? []).flatMap((a) => a.variants.map((v) => [v.sku, v.id])));
    setLines((prev) =>
      prev.map((line, i) => {
        const original = quoteRequest.lines[i];
        return original && !line.articleVariantId
          ? { ...line, articleVariantId: bySku.get(original.articleVariant.sku) ?? '' }
          : line;
      }),
    );
    setLinesResolved(true);
  }

  const [error, setError] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const ready = !suppliersQuery.isLoading && !currenciesQuery.isLoading;
  const firstSupplier = suppliers[0];
  const firstCurrency = currencies[0];
  if (ready && !supplierId && firstSupplier) setSupplierId(firstSupplier.id);
  if (ready && !currencyId && firstCurrency) setCurrencyId(firstCurrency.id);

  const mutation = useMutation({
    mutationFn: () => {
      const dto = {
        supplierId,
        currencyId,
        transportModeId: transportModeId || undefined,
        paymentTermId: paymentTermId || undefined,
        deliveryTimeId: deliveryTimeId || undefined,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
        lines,
      };
      return quoteRequest ? quoteRequestsApi.update(quoteRequest.id, dto) : quoteRequestsApi.create(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar el pedido';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function updateLine(index: number, patch: Partial<QuoteRequestLineInput>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { articleVariantId: '', quantity: 1 }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!supplierId || !currencyId) {
      setError('Completá proveedor y moneda');
      return;
    }
    if (lines.some((l) => !l.articleVariantId || l.quantity <= 0)) {
      setError('Cada línea necesita un artículo y una cantidad mayor a cero');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isEdit ? `Editar pedido ${quoteRequest?.number}` : 'Nuevo pedido de cotización'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        {!ready ? (
          <div className="py-10 text-center text-muted-foreground">Cargando...</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Field
                label="Proveedor"
                action={
                  <button
                    type="button"
                    onClick={() => setCreatingSupplier(true)}
                    className="text-xs text-primary hover:text-primary"
                  >
                    + nuevo proveedor
                  </button>
                }
              >
                <select className={inputClass} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Moneda">
                <select className={inputClass} value={currencyId} onChange={(e) => setCurrencyId(e.target.value)}>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </Field>
              <CatalogSelectField
                type="transport-modes"
                label="Modo de transporte"
                value={transportModeId}
                onChange={setTransportModeId}
              />
              <CatalogSelectField
                type="payment-terms"
                label="Forma de pago"
                value={paymentTermId}
                onChange={setPaymentTermId}
              />
              <CatalogSelectField
                type="delivery-times"
                label="Plazo de entrega"
                value={deliveryTimeId}
                onChange={setDeliveryTimeId}
              />
              <Field label="Válido hasta">
                <input
                  type="date"
                  className={inputClass}
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Notas">
              <textarea
                className={inputClass}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-muted-foreground">Líneas</label>
              {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2">
                  <ArticlePicker
                    className="flex-1"
                    value={line.articleVariantId}
                    onChange={(variantId) => updateLine(index, { articleVariantId: variantId })}
                  />
                  <input
                    type="number"
                    min={1}
                    step="any"
                    className={`${inputClass} w-20`}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                    title="Cantidad"
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className={`${inputClass} w-28`}
                    placeholder="Costo est."
                    value={line.estimatedUnitCost ?? ''}
                    onChange={(e) =>
                      updateLine(index, {
                        estimatedUnitCost: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    title="Costo estimado"
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addLine}
                className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed py-2.5 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/5"
              >
                + Agregar línea
              </button>
              <p className="text-xs text-muted-foreground">
                El costo estimado es opcional acá, pero hace falta en todas las líneas antes de poder
                emitir la Orden de Compra.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {mutation.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear pedido'}
              </button>
            </div>
          </form>
        )}
      </div>

      {creatingSupplier && (
        <CompanyFormModal
          lockedRole="SUPPLIER"
          onClose={() => setCreatingSupplier(false)}
          onSaved={(c) => setSupplierId(c.id)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-sm text-muted-foreground">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}
