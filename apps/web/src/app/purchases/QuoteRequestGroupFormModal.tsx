'use client';

import ArticlePicker from '@/components/ArticlePicker';
import CompanyFormModal from '@/components/CompanyFormModal';
import Select from '@/components/ui/Select';
import { companiesApi } from '@/lib/companies';
import { invoicingApi } from '@/lib/invoicing';
import { quoteRequestsApi, type QuoteRequestLineInput } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import CatalogSelectField from './CatalogSelectField';

interface Props {
  onClose: () => void;
}

const inputClass =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

/** "Pedir cotización a varios proveedores" - same lines/terms sent to N
 * suppliers at once (see QuoteRequestService.createGroup), so this is
 * QuoteRequestFormModal's fields minus the single supplierId select, plus a
 * checkbox list. No edit mode - a group is created once, then compared/
 * decided via QuoteRequestComparisonPanel, not edited in place. */
export default function QuoteRequestGroupFormModal({ onClose }: Props) {
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

  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [currencyId, setCurrencyId] = useState('');
  const [transportModeId, setTransportModeId] = useState('');
  const [paymentTermId, setPaymentTermId] = useState('');
  const [deliveryTimeId, setDeliveryTimeId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<QuoteRequestLineInput[]>([{ articleVariantId: '', quantity: 1 }]);
  const [error, setError] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const ready = !suppliersQuery.isLoading && !currenciesQuery.isLoading;
  const firstCurrency = currencies[0];
  if (ready && !currencyId && firstCurrency) setCurrencyId(firstCurrency.id);

  const mutation = useMutation({
    mutationFn: () =>
      quoteRequestsApi.createGroup({
        supplierIds,
        currencyId,
        transportModeId: transportModeId || undefined,
        paymentTermId: paymentTermId || undefined,
        deliveryTimeId: deliveryTimeId || undefined,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
        lines,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el pedido';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function toggleSupplier(id: string) {
    setSupplierIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

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
    if (supplierIds.length < 2) {
      setError('Elegí al menos dos proveedores para poder comparar');
      return;
    }
    if (!currencyId) {
      setError('Completá la moneda');
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
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Pedir cotización a varios proveedores
          </h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        {!ready ? (
          <div className="py-10 text-center text-muted-foreground">Cargando...</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">
                  Proveedores a cotizar ({supplierIds.length} elegidos)
                </label>
                <button
                  type="button"
                  onClick={() => setCreatingSupplier(true)}
                  className="text-xs text-primary hover:text-primary"
                >
                  + nuevo proveedor
                </button>
              </div>
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
                {suppliers.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={supplierIds.includes(s.id)}
                      onChange={() => toggleSupplier(s.id)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Líneas (mismas para todos)</label>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-xs text-primary hover:text-primary"
                >
                  + agregar línea
                </button>
              </div>
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
              <p className="text-xs text-muted-foreground">
                Se crea un pedido de cotización independiente por cada proveedor elegido, con estas
                mismas líneas. Cada proveedor carga su propio costo por artículo antes de comparar.
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
                {mutation.isPending ? 'Creando...' : 'Crear pedidos'}
              </button>
            </div>
          </form>
        )}
      </div>

      {creatingSupplier && (
        <CompanyFormModal
          lockedRole="SUPPLIER"
          onClose={() => setCreatingSupplier(false)}
          onSaved={(c) => setSupplierIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]))}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
