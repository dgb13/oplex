'use client';

import ArticlePicker, { type ArticlePickerOption } from '@/components/ArticlePicker';
import CompanyFormModal from '@/components/CompanyFormModal';
import InvoiceTaxLinesEditor from '@/components/InvoiceTaxLinesEditor';
import ToggleSwitch from '@/components/ToggleSwitch';
import VatLineSummary from '@/components/VatLineSummary';
import VatRateSelect, { type VatKind } from '@/components/VatRateSelect';
import { companiesApi } from '@/lib/companies';
import { suggestDocumentLetter } from '@/lib/documentLetter';
import { inventoryApi } from '@/lib/inventory';
import { invoicingApi, type CreateSaleLineInput, type InvoiceTaxLineInput } from '@/lib/invoicing';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Props {
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const DOCUMENT_LETTERS = ['A', 'B', 'C', 'M'] as const;

export default function NewInvoiceModal({ onClose }: Props) {
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
  });
  const branchesQuery = useQuery({
    queryKey: ['companies', 'BRANCH'],
    queryFn: () => companiesApi.list('BRANCH'),
  });
  const warehousesQuery = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: inventoryApi.listWarehouses,
  });
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
  });
  // Same query key as Preferencias, so this reads the cached value there
  // instead of firing its own request most of the time.
  const tenantSettingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
  });

  const customers = customersQuery.data ?? [];
  const branches = branchesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const currencies = currenciesQuery.data ?? [];

  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [documentLetter, setDocumentLetter] = useState<(typeof DOCUMENT_LETTERS)[number]>('B');
  const [currencyId, setCurrencyId] = useState('');
  const [exchangeRateOverride, setExchangeRateOverride] = useState('');
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [lines, setLines] = useState<CreateSaleLineInput[]>([
    { articleVariantId: '', quantity: 1, unitPrice: 0, taxKind: 'GRAVADO', taxRate: 0 },
  ]);
  const [otherTaxLines, setOtherTaxLines] = useState<InvoiceTaxLineInput[]>([]);
  const [error, setError] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);

  const ready = !customersQuery.isLoading && !branchesQuery.isLoading && !warehousesQuery.isLoading;

  // Fill selects with their first option once data arrives, since a plain
  // <select> with no matching value shows blank instead of a placeholder.
  const firstCustomer = customers[0];
  const firstBranch = branches[0];
  const firstWarehouse = warehouses[0];
  const firstCurrency = currencies[0];
  if (ready && !customerId && firstCustomer) setCustomerId(firstCustomer.id);
  if (ready && !branchId && firstBranch) setBranchId(firstBranch.id);
  if (ready && !warehouseId && firstWarehouse) setWarehouseId(firstWarehouse.id);
  if (ready && !currencyId && firstCurrency) setCurrencyId(firstCurrency.id);

  // Letra de comprobante derivada de la condición IVA propia (Preferencias)
  // + la del cliente elegido (ver documentLetter.ts) - se re-sugiere cada
  // vez que cambia el cliente, sin pisar una corrección manual del usuario
  // mientras el cliente sigue siendo el mismo.
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedCurrency = currencies.find((c) => c.id === currencyId);
  // Limpia un override tipeado para OTRA moneda al cambiar de moneda - sólo
  // depende de currencyId (no de latestRate) para no pisar una corrección
  // manual del usuario si la cotización se actualiza de fondo (sync BNA)
  // mientras el modal sigue abierto en la misma moneda.
  useEffect(() => {
    setExchangeRateOverride('');
  }, [currencyId]);
  const letterSuggestion = suggestDocumentLetter(
    tenantSettingsQuery.data?.ownTaxCondition ?? null,
    selectedCustomer?.taxId ?? null,
    selectedCustomer?.taxCondition ?? null,
  );
  useEffect(() => {
    if (letterSuggestion.letter) setDocumentLetter(letterSuggestion.letter);
  }, [customerId, letterSuggestion.letter]);

  const mutation = useMutation({
    mutationFn: () =>
      invoicingApi.createSale({
        customerId,
        branchId,
        warehouseId,
        documentLetter,
        currencyId,
        exchangeRate:
          selectedCurrency && !selectedCurrency.isBase && exchangeRateOverride
            ? Number(exchangeRateOverride)
            : undefined,
        pricesIncludeTax,
        lines,
        otherTaxLines: otherTaxLines.filter((l) => l.concept.trim() && l.amount > 0),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo emitir la factura';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function updateLine(index: number, patch: Partial<CreateSaleLineInput>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      { articleVariantId: '', quantity: 1, unitPrice: 0, taxKind: 'GRAVADO', taxRate: 0 },
    ]);
  }

  // Al elegir un artículo, arrastra su precio y alícuota de catálogo a la
  // línea - el usuario los puede editar después (override), no se vuelven
  // a pisar si vuelve a tocar la misma línea sin cambiar de artículo.
  function selectArticle(index: number, variantId: string, option: ArticlePickerOption | null) {
    updateLine(index, {
      articleVariantId: variantId,
      unitPrice: option?.unitPrice ?? 0,
      taxKind: option?.taxKind ?? 'GRAVADO',
      taxRate: option?.taxRate ?? 0,
    });
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!customerId || !branchId || !warehouseId || !currencyId) {
      setError('Completá todos los campos');
      return;
    }
    if (lines.some((l) => !l.articleVariantId || l.quantity <= 0)) {
      setError('Cada línea necesita un artículo y una cantidad mayor a cero');
      return;
    }
    mutation.mutate();
  }

  // Clientes/sucursales ahora se pueden crear sin salir de este modal (ver
  // "+ nuevo cliente"/"+ nueva sucursal" arriba), así que sólo bloquea la
  // falta de depósito, que no tiene un atajo inline todavía.
  const missingData = ready && warehouses.length === 0;
  // undefined mientras carga (aún no sabemos) se trata como "no
  // configurado" - más seguro bloquear el submit un instante de más que
  // dejarlo habilitado y que el POST falle recién en el backend.
  const afipConfigured = tenantSettingsQuery.data?.afipConfigured ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nueva factura</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {!ready ? (
          <div className="py-10 text-center text-slate-500">Cargando...</div>
        ) : missingData ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Hace falta al menos un depósito antes de poder facturar (cliente y sucursal se pueden
            crear desde este mismo formulario).
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Field
                label="Cliente"
                action={
                  <button
                    type="button"
                    onClick={() => setCreatingCustomer(true)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    + nuevo cliente
                  </button>
                }
              >
                <select
                  className={inputClass}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Sucursal / PV"
                action={
                  <button
                    type="button"
                    onClick={() => setCreatingBranch(true)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    + nueva sucursal
                  </button>
                }
              >
                <select
                  className={inputClass}
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.pointOfSaleNumber ?? 'sin PV'})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Depósito">
                <select
                  className={inputClass}
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tipo de comprobante">
                <select
                  className={`${inputClass} disabled:opacity-70`}
                  value={documentLetter}
                  disabled={letterSuggestion.locked}
                  onChange={(e) => setDocumentLetter(e.target.value as typeof documentLetter)}
                >
                  {DOCUMENT_LETTERS.map((letter) => (
                    <option key={letter} value={letter}>
                      Factura {letter}
                    </option>
                  ))}
                </select>
                <p
                  className={`mt-1 text-xs ${letterSuggestion.locked ? 'text-slate-500' : 'text-amber-600 dark:text-amber-400'}`}
                >
                  {letterSuggestion.reason}
                </p>
              </Field>
              <Field label="Moneda">
                <select
                  className={inputClass}
                  value={currencyId}
                  onChange={(e) => setCurrencyId(e.target.value)}
                >
                  {currencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
                {selectedCurrency && !selectedCurrency.isBase && (
                  <input
                    type="number"
                    step="any"
                    min={0}
                    title="Cotización de este comprobante"
                    placeholder={
                      selectedCurrency.latestRate ? `Vigente: ${selectedCurrency.latestRate}` : 'Sin cotización cargada'
                    }
                    value={exchangeRateOverride}
                    onChange={(e) => setExchangeRateOverride(e.target.value)}
                    className={`${inputClass} mt-1 w-full`}
                  />
                )}
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-600 dark:text-slate-400">Líneas</label>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <ToggleSwitch
                    checked={pricesIncludeTax}
                    onChange={setPricesIncludeTax}
                    label="Precios con IVA incluido"
                  />
                  <span>Precios con IVA incluido</span>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {pricesIncludeTax
                  ? 'El precio unitario de cada línea es el precio final (con IVA) - se desglosa a neto solo.'
                  : 'El precio unitario de cada línea es neto (sin IVA) - se le suma el IVA de su alícuota.'}
              </p>
              {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2">
                  <ArticlePicker
                    className="flex-1"
                    value={line.articleVariantId}
                    onChange={(variantId, option) => selectArticle(index, variantId, option)}
                  />
                  <input
                    type="number"
                    min={1}
                    step="any"
                    title="Cantidad"
                    className={`${inputClass} w-20`}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    title="Precio unitario"
                    className={`${inputClass} w-28 text-right`}
                    value={line.unitPrice ?? 0}
                    onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
                  />
                  <VatRateSelect
                    value={{ taxKind: (line.taxKind ?? 'GRAVADO') as VatKind, taxRate: line.taxRate ?? 0 }}
                    onChange={(v) => updateLine(index, { taxKind: v.taxKind, taxRate: v.taxRate })}
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addLine}
                className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 transition hover:border-indigo-400 hover:bg-indigo-50 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30"
              >
                + Agregar línea
              </button>
              <VatLineSummary lines={lines} pricesIncludeTax={pricesIncludeTax} otherTaxLines={otherTaxLines} />
            </div>

            <InvoiceTaxLinesEditor lines={otherTaxLines} onChange={setOtherTaxLines} />

            {!afipConfigured && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Todavía no configuraste el certificado AFIP de esta empresa - la factura no va a
                poder pedir CAE hasta que lo cargues en{' '}
                <Link href="/preferences" className="font-medium underline">
                  Preferencias → Certificado AFIP
                </Link>
                .
              </p>
            )}

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mutation.isPending || !afipConfigured}
                title={!afipConfigured ? 'Configurá el certificado AFIP en Preferencias primero' : undefined}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {mutation.isPending ? 'Emitiendo...' : 'Emitir factura'}
              </button>
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
      {creatingBranch && (
        <CompanyFormModal
          lockedRole="BRANCH"
          onClose={() => setCreatingBranch(false)}
          onSaved={(c) => setBranchId(c.id)}
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
        <label className="text-sm text-slate-600 dark:text-slate-400">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}
