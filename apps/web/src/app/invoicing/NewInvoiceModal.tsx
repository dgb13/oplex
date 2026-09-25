'use client';

import CompanyFormModal from '@/components/CompanyFormModal';
import InvoiceTaxLinesEditor from '@/components/InvoiceTaxLinesEditor';
import CustomerPicker from '@/components/sales/CustomerPicker';
import { computeSalesTotals, type SalesLine } from '@/components/sales/salesDocument';
import SalesDocumentSheet, { LinkButton, SectionLabel, Segmented } from '@/components/sales/SalesDocumentSheet';
import SalesLinesEditor, { Kbd } from '@/components/sales/SalesLinesEditor';
import SalesTotalsPanel from '@/components/sales/SalesTotalsPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { companiesApi } from '@/lib/companies';
import { suggestDocumentLetter } from '@/lib/documentLetter';
import { inventoryApi } from '@/lib/inventory';
import { invoicingApi, type InvoiceTaxLineInput } from '@/lib/invoicing';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

interface Props {
  onClose: () => void;
}

const DOCUMENT_LETTERS = ['A', 'B', 'C', 'M'] as const;
type Letter = (typeof DOCUMENT_LETTERS)[number];

export default function NewInvoiceModal({ onClose }: Props) {
  const queryClient = useQueryClient();

  const customersQuery = useQuery({ queryKey: ['companies', 'CUSTOMER'], queryFn: () => companiesApi.list('CUSTOMER') });
  const branchesQuery = useQuery({ queryKey: ['companies', 'BRANCH'], queryFn: () => companiesApi.list('BRANCH') });
  const warehousesQuery = useQuery({ queryKey: ['inventory-warehouses'], queryFn: inventoryApi.listWarehouses });
  const currenciesQuery = useQuery({ queryKey: ['invoicing-currencies'], queryFn: invoicingApi.listCurrencies });
  // Same query key as Preferencias, so this reads the cached value there
  // instead of firing its own request most of the time.
  const tenantSettingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });

  const customers = customersQuery.data ?? [];
  const branches = branchesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const currencies = currenciesQuery.data ?? [];

  // Cliente vacío a propósito (ver CustomerPicker); sucursal y depósito sí
  // arrancan en el primero - suele haber uno solo de cada uno.
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [documentLetter, setDocumentLetter] = useState<Letter>('B');
  const [currencyId, setCurrencyId] = useState('');
  const [exchangeRateOverride, setExchangeRateOverride] = useState('');
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);
  const [lines, setLines] = useState<SalesLine[]>([]);
  const [otherTaxLines, setOtherTaxLines] = useState<InvoiceTaxLineInput[]>([]);
  const [showOtherTaxes, setShowOtherTaxes] = useState(false);
  const [error, setError] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const addArticleRef = useRef<HTMLInputElement>(null);

  const ready = !customersQuery.isLoading && !branchesQuery.isLoading && !warehousesQuery.isLoading;

  const firstBranch = branches[0];
  const firstWarehouse = warehouses[0];
  const defaultCurrency = currencies.find((c) => c.isBase) ?? currencies[0];
  if (ready && !branchId && firstBranch) setBranchId(firstBranch.id);
  if (ready && !warehouseId && firstWarehouse) setWarehouseId(firstWarehouse.id);
  if (!currencyId && defaultCurrency) setCurrencyId(defaultCurrency.id);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedCurrency = currencies.find((c) => c.id === currencyId);
  // Limpia un override tipeado para OTRA moneda al cambiar de moneda - sólo
  // depende de currencyId (no de latestRate) para no pisar una corrección
  // manual del usuario si la cotización se actualiza de fondo (sync BNA)
  // mientras el formulario sigue abierto en la misma moneda.
  useEffect(() => {
    setExchangeRateOverride('');
  }, [currencyId]);

  // Letra de comprobante derivada de la condición IVA propia (Preferencias)
  // + la del cliente elegido (ver documentLetter.ts) - se re-sugiere cada
  // vez que cambia el cliente, sin pisar una corrección manual del usuario
  // mientras el cliente sigue siendo el mismo.
  const letterSuggestion = suggestDocumentLetter(
    tenantSettingsQuery.data?.ownTaxCondition ?? null,
    selectedCustomer?.taxId ?? null,
    selectedCustomer?.taxCondition ?? null,
  );
  useEffect(() => {
    if (letterSuggestion.letter) setDocumentLetter(letterSuggestion.letter);
  }, [customerId, letterSuggestion.letter]);

  const validOtherTaxLines = otherTaxLines.filter((l) => l.concept.trim() && l.amount > 0);
  const totals = computeSalesTotals(lines, pricesIncludeTax, validOtherTaxLines);

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
        lines: lines.map((l) => ({
          articleVariantId: l.articleVariantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxKind: l.taxKind,
          taxRate: l.taxRate,
        })),
        otherTaxLines: validOtherTaxLines,
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

  // undefined mientras carga (aún no sabemos) se trata como "no
  // configurado" - más seguro bloquear el submit un instante de más que
  // dejarlo habilitado y que el POST falle recién en el backend.
  const afipConfigured = tenantSettingsQuery.data?.afipConfigured ?? false;
  // Clientes/sucursales se pueden crear desde acá mismo; lo único sin
  // atajo inline es el depósito.
  const missingWarehouse = ready && warehouses.length === 0;

  function handleSubmit() {
    setError('');
    if (!customerId) {
      setError('Elegí a quién le facturás.');
      return;
    }
    if (!branchId || !warehouseId || !currencyId) {
      setError('Completá sucursal, depósito y moneda.');
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
    // NewManufacturedProductModal) - no dejar facturarlo así por descuido.
    if (lines.some((l) => !(l.unitPrice > 0))) {
      setError('Hay líneas sin precio: cargalo en la línea marcada.');
      return;
    }
    if (!afipConfigured) {
      setError('Configurá el certificado ARCA en Preferencias antes de emitir.');
      return;
    }
    mutation.mutate();
  }

  return (
    <>
      <SalesDocumentSheet
        title="Nueva factura"
        badge={
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Factura {documentLetter}
          </span>
        }
        onClose={onClose}
        onSubmit={handleSubmit}
        main={
          !ready ? (
            <p className="py-10 text-center text-muted-foreground">Cargando...</p>
          ) : missingWarehouse ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Hace falta al menos un depósito antes de poder facturar (cliente y sucursal se pueden crear desde este mismo
              formulario).
            </p>
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
                  autoFocus
                  onPicked={() => addArticleRef.current?.focus()}
                />
              </section>

              <SalesLinesEditor
                lines={lines}
                onChange={setLines}
                pricesIncludeTax={pricesIncludeTax}
                onPricesIncludeTaxChange={setPricesIncludeTax}
                currencyCode={selectedCurrency?.code}
                addInputRef={addArticleRef}
              />

              {showOtherTaxes || otherTaxLines.length > 0 ? (
                <section className="rounded-xl border p-4">
                  <InvoiceTaxLinesEditor lines={otherTaxLines} onChange={setOtherTaxLines} />
                </section>
              ) : (
                <div>
                  <LinkButton onClick={() => setShowOtherTaxes(true)}>+ Agregar percepciones / otros tributos</LinkButton>
                </div>
              )}
            </>
          )
        }
        side={
          <>
            <section>
              <SectionLabel>Comprobante</SectionLabel>
              <Segmented
                value={documentLetter}
                onChange={setDocumentLetter}
                disabled={letterSuggestion.locked}
                options={DOCUMENT_LETTERS.map((l) => ({ value: l, label: l }))}
              />
              <p
                className={`mt-1.5 text-xs ${letterSuggestion.locked ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400'}`}
              >
                {letterSuggestion.reason}
              </p>
            </section>

            <section>
              <SectionLabel action={<LinkButton onClick={() => setCreatingBranch(true)}>+ Nueva</LinkButton>}>
                Sucursal / Punto de venta
              </SectionLabel>
              <Select
                value={branchId}
                onChange={setBranchId}
                placeholder="Elegir sucursal..."
                options={branches.map((b) => ({ value: b.id, label: `${b.name} (PV ${b.pointOfSaleNumber ?? 'sin número'})` }))}
              />
            </section>

            <section>
              <SectionLabel>Depósito</SectionLabel>
              <Select
                value={warehouseId}
                onChange={setWarehouseId}
                placeholder="Elegir depósito..."
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">De acá sale el stock de lo que facturás.</p>
            </section>

            <section>
              <SectionLabel>Moneda</SectionLabel>
              <Segmented
                value={currencyId}
                onChange={setCurrencyId}
                options={currencies.map((c) => ({ value: c.id, label: c.code === 'ARS' ? 'ARS $' : c.code }))}
              />
              {selectedCurrency && !selectedCurrency.isBase && (
                <div className="mt-2 flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Cotización de este comprobante</label>
                  <Input
                    type="number"
                    step="any"
                    min={0}
                    placeholder={
                      selectedCurrency.latestRate ? `Vigente: ${selectedCurrency.latestRate}` : 'Sin cotización cargada'
                    }
                    value={exchangeRateOverride}
                    onChange={(e) => setExchangeRateOverride(e.target.value)}
                  />
                </div>
              )}
            </section>

            <div className="mt-auto flex flex-col gap-3">
              <SalesTotalsPanel totals={totals} currencyCode={selectedCurrency?.code} />
              {!afipConfigured && (
                <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Todavía no configuraste el certificado ARCA - la factura no va a poder pedir CAE hasta que lo cargues en{' '}
                  <Link href="/preferences" className="font-medium underline">
                    Preferencias → Certificado ARCA
                  </Link>
                  .
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={mutation.isPending || !ready || missingWarehouse || !afipConfigured}
                title={!afipConfigured ? 'Configurá el certificado ARCA en Preferencias primero' : undefined}
              >
                {mutation.isPending ? 'Emitiendo...' : 'Emitir factura'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> para emitir
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
      {creatingBranch && (
        <CompanyFormModal
          lockedRole="BRANCH"
          onClose={() => setCreatingBranch(false)}
          onSaved={(c) => setBranchId(c.id)}
        />
      )}
    </>
  );
}
