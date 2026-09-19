'use client';

import ArticlePicker from '@/components/ArticlePicker';
import CompanyFormModal from '@/components/CompanyFormModal';
import Select from '@/components/ui/Select';
import { companiesApi } from '@/lib/companies';
import { invoicingApi } from '@/lib/invoicing';
import { purchaseOrdersApi, type PurchaseOrderLineInput } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import CatalogSelectField from './CatalogSelectField';

interface Props {
  onClose: () => void;
}

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** Standalone Purchase Order creation - no Pedido de Cotización involved
 * (see QuoteRequestDetailPanel's "Emitir Orden de Compra" for the other
 * way one is born). Same shell as QuoteRequestFormModal but every line
 * needs a real unitCost, not an optional estimate. */
export default function PurchaseOrderFormModal({ onClose }: Props) {
  const queryClient = useQueryClient();

  const suppliersQuery = useQuery({
    queryKey: ['companies', 'SUPPLIER'],
    queryFn: () => companiesApi.list('SUPPLIER'),
  });
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
  });

  const suppliers = suppliersQuery.data ?? [];
  const currencies = currenciesQuery.data ?? [];

  const [supplierId, setSupplierId] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [transportModeId, setTransportModeId] = useState('');
  const [paymentTermId, setPaymentTermId] = useState('');
  const [deliveryTimeId, setDeliveryTimeId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseOrderLineInput[]>([
    { articleVariantId: '', quantity: 1, unitCost: 0 },
  ]);
  const [error, setError] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const ready = !suppliersQuery.isLoading && !currenciesQuery.isLoading;
  const firstSupplier = suppliers[0];
  const firstCurrency = currencies[0];
  if (ready && !supplierId && firstSupplier) setSupplierId(firstSupplier.id);
  if (ready && !currencyId && firstCurrency) setCurrencyId(firstCurrency.id);

  const mutation = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.create({
        supplierId,
        currencyId,
        transportModeId: transportModeId || undefined,
        paymentTermId: paymentTermId || undefined,
        deliveryTimeId: deliveryTimeId || undefined,
        notes: notes || undefined,
        lines,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la orden de compra';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function updateLine(index: number, patch: Partial<PurchaseOrderLineInput>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { articleVariantId: '', quantity: 1, unitCost: 0 }]);
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
    if (lines.some((l) => !l.articleVariantId || l.quantity <= 0 || l.unitCost < 0)) {
      setError('Cada línea necesita un artículo, cantidad mayor a cero y un costo válido');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nueva orden de compra</h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        {!ready ? (
          <div className="py-10 text-center text-muted-foreground">Cargando...</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
                <Select
                  value={supplierId}
                  onChange={setSupplierId}
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                />
              </Field>
              <Field label="Moneda">
                <Select
                  value={currencyId}
                  onChange={setCurrencyId}
                  options={currencies.map((c) => ({ value: c.id, label: c.code }))}
                />
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
            </div>

            <Field label="Notas">
              <textarea className={inputClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
                    placeholder="Costo unit."
                    value={line.unitCost}
                    onChange={(e) => updateLine(index, { unitCost: Number(e.target.value) })}
                    title="Costo unitario"
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
                {mutation.isPending ? 'Guardando...' : 'Crear orden de compra'}
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
