'use client';

import CompanyFormModal from '@/components/CompanyFormModal';
import CustomerPicker from '@/components/sales/CustomerPicker';
import { computeSalesTotals, newLineKey, type SalesLine } from '@/components/sales/salesDocument';
import SalesDocumentSheet, { LinkButton, SectionLabel, Segmented } from '@/components/sales/SalesDocumentSheet';
import SalesLinesEditor, { Kbd } from '@/components/sales/SalesLinesEditor';
import SalesTotalsPanel from '@/components/sales/SalesTotalsPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { companiesApi } from '@/lib/companies';
import { invoicingApi } from '@/lib/invoicing';
import { quotePreferencesApi, quotesApi, type QuoteDetail } from '@/lib/quotes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRef, useState } from 'react';

interface Props {
  quote?: QuoteDetail;
  onClose: () => void;
}

const VALIDITY_PRESETS = [7, 15, 30] as const;
const DEFAULT_VALIDITY_DAYS = 15;

/** Hoy + `days` como "2026-10-10" (día local, para el input type=date). */
function datePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function QuoteFormModal({ quote, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(quote);

  const customersQuery = useQuery({ queryKey: ['companies', 'CUSTOMER'], queryFn: () => companiesApi.list('CUSTOMER') });
  const currenciesQuery = useQuery({ queryKey: ['invoicing-currencies'], queryFn: invoicingApi.listCurrencies });
  const preferencesQuery = useQuery({
    queryKey: ['quote-preferences'],
    queryFn: quotePreferencesApi.get,
    enabled: !isEdit,
  });

  const customers = customersQuery.data ?? [];
  const currencies = currenciesQuery.data ?? [];

  // Cliente vacío en una cotización nueva - se elige a propósito, nunca "el
  // primero de la lista" (ver CustomerPicker).
  const [customerId, setCustomerId] = useState(quote?.customer.id ?? '');
  const [currencyId, setCurrencyId] = useState(quote?.currency.id ?? '');
  const [validUntil, setValidUntil] = useState(
    quote ? (quote.validUntil?.slice(0, 10) ?? '') : datePlusDays(DEFAULT_VALIDITY_DAYS),
  );
  const [notes, setNotes] = useState(quote?.notes ?? '');
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [lines, setLines] = useState<SalesLine[]>(
    () =>
      quote?.lines.map((l) => ({
        key: newLineKey(),
        articleVariantId: l.articleVariantId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        notes: l.notes ?? undefined,
        taxKind: l.taxKind ?? 'GRAVADO',
        taxRate: l.taxRate ? Number(l.taxRate) : 0,
      })) ?? [],
  );
  const [error, setError] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const addArticleRef = useRef<HTMLInputElement>(null);

  // Moneda base por defecto (ARS), no la primera que devuelva la API.
  const defaultCurrency = currencies.find((c) => c.isBase) ?? currencies[0];
  if (!currencyId && defaultCurrency) setCurrencyId(defaultCurrency.id);
  const currencyCode = currencies.find((c) => c.id === currencyId)?.code;

  const totals = computeSalesTotals(lines, pricesIncludeTax);
  const nextNumber = preferencesQuery.data
    ? `${preferencesQuery.data.quotePrefix}-${String(preferencesQuery.data.quoteNextNumber).padStart(6, '0')}`
    : null;
  const activePreset = VALIDITY_PRESETS.find((d) => validUntil === datePlusDays(d));

  const mutation = useMutation({
    mutationFn: () => {
      const dto = {
        customerId,
        currencyId,
        validUntil: validUntil || undefined,
        notes: notes.trim() || undefined,
        pricesIncludeTax,
        lines: lines.map((l) => ({
          articleVariantId: l.articleVariantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          notes: l.notes?.trim() || undefined,
          taxKind: l.taxKind,
          taxRate: l.taxRate,
        })),
      };
      return quote ? quotesApi.update(quote.id, dto) : quotesApi.create(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      void queryClient.invalidateQueries({ queryKey: ['quote-preferences'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la cotización';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit() {
    setError('');
    if (!customerId) {
      setError('Elegí a quién le cotizás.');
      return;
    }
    if (!currencyId) {
      setError('Elegí la moneda.');
      return;
    }
    if (lines.length === 0) {
      setError('Agregá al menos un artículo.');
      addArticleRef.current?.focus();
      return;
    }
    if (lines.some((l) => !(l.quantity > 0))) {
      setError('Cada artículo necesita una cantidad mayor a cero.');
      return;
    }
    // Un producto fabricado se puede crear sin precio (queda en $0, ver
    // NewManufacturedProductModal) - no dejar cotizarlo así por descuido.
    if (lines.some((l) => !(l.unitPrice > 0))) {
      setError('Hay líneas sin precio: cargalo en la línea marcada.');
      return;
    }
    mutation.mutate();
  }

  const loading = customersQuery.isLoading || currenciesQuery.isLoading;

  return (
    <>
      <SalesDocumentSheet
        title={isEdit ? 'Editar cotización' : 'Nueva cotización'}
        badge={
          (isEdit ? quote?.number : nextNumber) && (
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
              {isEdit ? quote?.number : nextNumber}
            </span>
          )
        }
        onClose={onClose}
        onSubmit={handleSubmit}
        main={
          loading ? (
            <p className="py-10 text-center text-muted-foreground">Cargando...</p>
          ) : (
            <>
              <section>
                <SectionLabel action={<LinkButton onClick={() => setCreatingCustomer(true)}>+ Nuevo cliente</LinkButton>}>
                  Cliente
                </SectionLabel>
                <CustomerPicker
                  customers={customers}
                  value={customerId}
                  onChange={setCustomerId}
                  autoFocus={!isEdit}
                  onPicked={() => addArticleRef.current?.focus()}
                />
              </section>

              <SalesLinesEditor
                lines={lines}
                onChange={setLines}
                pricesIncludeTax={pricesIncludeTax}
                onPricesIncludeTaxChange={setPricesIncludeTax}
                currencyCode={currencyCode}
                allowNotes
                addInputRef={addArticleRef}
              />
            </>
          )
        }
        side={
          <>
            <section>
              <SectionLabel>Moneda</SectionLabel>
              <Segmented
                value={currencyId}
                onChange={setCurrencyId}
                options={currencies.map((c) => ({ value: c.id, label: c.code === 'ARS' ? 'ARS $' : c.code }))}
              />
            </section>

            <section>
              <SectionLabel>Válida hasta</SectionLabel>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {VALIDITY_PRESETS.map((days) => (
                  <ValidityChip key={days} active={activePreset === days} onClick={() => setValidUntil(datePlusDays(days))}>
                    {days} días
                  </ValidityChip>
                ))}
                <ValidityChip active={!validUntil} onClick={() => setValidUntil('')}>
                  Sin vencimiento
                </ValidityChip>
              </div>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </section>

            <section>
              <SectionLabel>Notas para el cliente</SectionLabel>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Condiciones de pago, plazo de entrega, lo que quieras que figure en el PDF"
              />
            </section>

            <div className="mt-auto flex flex-col gap-3">
              <SalesTotalsPanel totals={totals} currencyCode={currencyCode} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending || loading}>
                {mutation.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cotización'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> para {isEdit ? 'guardar' : 'crear'}
              </p>
            </div>
          </>
        }
      />

      {creatingCustomer && (
        <CompanyFormModal
          lockedRole="CUSTOMER"
          onClose={() => setCreatingCustomer(false)}
          onSaved={(c) => setCustomerId(c.id)}
        />
      )}
    </>
  );
}

function ValidityChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${
        active ? 'border-primary bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
