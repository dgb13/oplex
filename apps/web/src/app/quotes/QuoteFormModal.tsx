'use client';

import ArticlePicker from '@/components/ArticlePicker';
import CompanyFormModal from '@/components/CompanyFormModal';
import ToggleSwitch from '@/components/ToggleSwitch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { Textarea } from '@/components/ui/textarea';
import VatLineSummary from '@/components/VatLineSummary';
import VatRateSelect, { type VatKind } from '@/components/VatRateSelect';
import { companiesApi } from '@/lib/companies';
import { inventoryApi } from '@/lib/inventory';
import { invoicingApi } from '@/lib/invoicing';
import { quotesApi, type QuoteDetail, type QuoteLineInput } from '@/lib/quotes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  quote?: QuoteDetail;
  onClose: () => void;
}

export default function QuoteFormModal({ quote, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(quote);

  const customersQuery = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
  });
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
  });
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
  });

  const customers = customersQuery.data ?? [];
  const currencies = currenciesQuery.data ?? [];

  const [customerId, setCustomerId] = useState(quote?.customer.id ?? '');
  const [currencyId, setCurrencyId] = useState(quote?.currency.id ?? '');
  const [validUntil, setValidUntil] = useState(quote?.validUntil ? quote.validUntil.slice(0, 10) : '');
  const [notes, setNotes] = useState(quote?.notes ?? '');
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [lines, setLines] = useState<QuoteLineInput[]>(
    quote?.lines.map((l) => ({
      articleVariantId: '',
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      notes: l.notes ?? undefined,
      taxKind: l.taxKind ?? 'GRAVADO',
      taxRate: l.taxRate ? Number(l.taxRate) : 0,
    })) ?? [{ articleVariantId: '', quantity: 1, unitPrice: 0, taxKind: 'GRAVADO', taxRate: 0 }],
  );
  const [linesResolved, setLinesResolved] = useState(!isEdit);
  if (!linesResolved && quote && (articlesQuery.data?.length ?? 0) > 0) {
    const bySku = new Map((articlesQuery.data ?? []).flatMap((a) => a.variants.map((v) => [v.sku, v.id])));
    setLines((prev) =>
      prev.map((line, i) => {
        const original = quote.lines[i];
        return original && !line.articleVariantId
          ? { ...line, articleVariantId: bySku.get(original.articleVariant.sku) ?? '' }
          : line;
      }),
    );
    setLinesResolved(true);
  }

  const [error, setError] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const ready = !customersQuery.isLoading && !currenciesQuery.isLoading;
  const firstCustomer = customers[0];
  const firstCurrency = currencies[0];
  if (ready && !customerId && firstCustomer) setCustomerId(firstCustomer.id);
  if (ready && !currencyId && firstCurrency) setCurrencyId(firstCurrency.id);

  const mutation = useMutation({
    mutationFn: () => {
      const dto = {
        customerId,
        currencyId,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
        pricesIncludeTax,
        lines,
      };
      return quote ? quotesApi.update(quote.id, dto) : quotesApi.create(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la cotización';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function updateLine(index: number, patch: Partial<QuoteLineInput>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { articleVariantId: '', quantity: 1, unitPrice: 0, taxKind: 'GRAVADO', taxRate: 0 },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!customerId || !currencyId) {
      setError('Completá cliente y moneda');
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
            {isEdit ? `Editar cotización ${quote?.number}` : 'Nueva cotización'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground transition hover:text-foreground">
            ✕
          </button>
        </div>

        {!ready ? (
          <div className="py-10 text-center text-muted-foreground">Cargando...</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Cliente"
                action={
                  <button
                    type="button"
                    onClick={() => setCreatingCustomer(true)}
                    className="text-xs text-primary hover:text-primary/80"
                  >
                    + nuevo cliente
                  </button>
                }
              >
                <Select
                  value={customerId}
                  onChange={setCustomerId}
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Field>
              <Field label="Moneda">
                <Select
                  value={currencyId}
                  onChange={setCurrencyId}
                  options={currencies.map((c) => ({ value: c.id, label: c.code }))}
                />
              </Field>
              <Field label="Válida hasta">
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
            </div>

            <Field label="Notas">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Líneas</label>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ToggleSwitch
                      checked={pricesIncludeTax}
                      onChange={setPricesIncludeTax}
                      label="Precios con IVA incluido"
                    />
                    <span>Precios con IVA incluido</span>
                  </div>
                  <button type="button" onClick={addLine} className="text-xs text-primary hover:text-primary/80">
                    + agregar línea
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {pricesIncludeTax
                  ? 'El precio unitario de cada línea es el precio final (con IVA) - se desglosa a neto solo.'
                  : 'El precio unitario de cada línea es neto (sin IVA) - se le suma el IVA de su alícuota.'}
              </p>
              {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2">
                  <ArticlePicker
                    className="flex-1"
                    value={line.articleVariantId}
                    onChange={(variantId, option) =>
                      updateLine(index, {
                        articleVariantId: variantId,
                        unitPrice: option ? option.unitPrice : line.unitPrice,
                        taxKind: option?.taxKind ?? line.taxKind,
                        taxRate: option?.taxRate ?? line.taxRate,
                      })
                    }
                  />
                  <Input
                    type="number"
                    min={1}
                    step="any"
                    className="w-20"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                    title="Cantidad"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    className="w-28"
                    placeholder="Precio"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
                    title="Precio unitario"
                  />
                  <VatRateSelect
                    value={{ taxKind: (line.taxKind ?? 'GRAVADO') as VatKind, taxRate: line.taxRate ?? 0 }}
                    onChange={(v) => updateLine(index, { taxKind: v.taxKind, taxRate: v.taxRate })}
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
              <VatLineSummary lines={lines} pricesIncludeTax={pricesIncludeTax} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cotización'}
              </Button>
            </div>
          </form>
        )}
      </div>

      {creatingCustomer && (
        <CompanyFormModal
          lockedRole="CUSTOMER"
          onClose={() => setCreatingCustomer(false)}
          onSaved={(c) => setCustomerId(c.id)}
        />
      )}
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
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
