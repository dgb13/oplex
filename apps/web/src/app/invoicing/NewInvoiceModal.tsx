'use client';

import CompanyFormModal from '@/components/CompanyFormModal';
import InvoiceTaxLinesEditor from '@/components/InvoiceTaxLinesEditor';
import { ArcaCertAlert, ArcaCertPill, arcaCertState, canIssueWith } from '@/components/sales/ArcaCertStatus';
import CustomerPicker from '@/components/sales/CustomerPicker';
import { PendingDeliveryDialog } from '@/components/sales/PendingDeliveryDialog';
import { computeSalesTotals, type SalesLine } from '@/components/sales/salesDocument';
import SalesDocumentSheet, { LinkButton, SectionLabel, Segmented } from '@/components/sales/SalesDocumentSheet';
import SalesLinesEditor, { Kbd } from '@/components/sales/SalesLinesEditor';
import SalesTotalsPanel from '@/components/sales/SalesTotalsPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Select from '@/components/ui/Select';
import { Textarea } from '@/components/ui/textarea';
import { companiesApi } from '@/lib/companies';
import { suggestDocumentLetter } from '@/lib/documentLetter';
import { inventoryApi } from '@/lib/inventory';
import { invoicingApi, type InvoiceTaxLineInput, type StockShortage } from '@/lib/invoicing';
import { receivablesApi } from '@/lib/receivables';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { formatMoney } from '@/lib/vatCost';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useCompanyPermissions } from '@/components/useCompanyPermissions';

interface Props {
  onClose: () => void;
  // Factura armada desde otro lado (ej. un pedido de la tienda online):
  // líneas ya cargadas, con precios finales (IVA incluido).
  initialLines?: SalesLine[];
  initialPricesIncludeTax?: boolean;
  // Factura que dejó preparada el asistente (/invoicing?asistente=<id>).
  initialCustomerId?: string;
  initialNotes?: string;
  onCreated?: () => void;
}

const DOCUMENT_LETTERS = ['A', 'B', 'C', 'M'] as const;
type Letter = (typeof DOCUMENT_LETTERS)[number];

export default function NewInvoiceModal({
  onClose,
  initialLines,
  initialPricesIncludeTax,
  initialCustomerId,
  initialNotes,
  onCreated,
}: Props) {
  const perms = useCompanyPermissions();
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
  const [customerId, setCustomerId] = useState(initialCustomerId ?? '');
  const [branchId, setBranchId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [documentLetter, setDocumentLetter] = useState<Letter>('B');
  const [currencyId, setCurrencyId] = useState('');
  const [exchangeRateOverride, setExchangeRateOverride] = useState('');
  const [pricesIncludeTax, setPricesIncludeTax] = useState(initialPricesIncludeTax ?? false);
  const [lines, setLines] = useState<SalesLine[]>(initialLines ?? []);
  const [otherTaxLines, setOtherTaxLines] = useState<InvoiceTaxLineInput[]>([]);
  const [showOtherTaxes, setShowOtherTaxes] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [error, setError] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [creatingBranch, setCreatingBranch] = useState(false);
  // Aviso "Falta stock para entregar todo" (null = cerrado).
  const [shortages, setShortages] = useState<StockShortage[] | null>(null);
  const [checkingStock, setCheckingStock] = useState(false);
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
  // Factura C (emisor Monotributo/Exento): sin IVA, igual que el backend.
  const withoutVat = documentLetter === 'C';
  const totals = computeSalesTotals(lines, pricesIncludeTax, validOtherTaxLines, withoutVat);

  // Límite de crédito del cliente: sólo avisa, no frena la venta (decisión
  // del usuario). Los saldos están en moneda base, así que sólo se compara
  // con una factura en moneda base. Sin permiso para ver saldos no se avisa.
  const balancesQuery = useQuery({
    queryKey: ['receivables-balances'],
    queryFn: receivablesApi.listCustomerBalances,
    retry: false,
  });
  const customerBalance = balancesQuery.data?.find((b) => b.customerId === customerId);
  const creditLimit = Number(customerBalance?.creditLimit ?? 0);
  const outstanding = Number(customerBalance?.outstanding ?? 0);
  const exceedsCreditLimit =
    Boolean(selectedCurrency?.isBase) && creditLimit > 0 && outstanding + totals.total > creditLimit;

  const mutation = useMutation({
    mutationFn: (allowPendingDelivery: boolean) =>
      invoicingApi.createSale({
        allowPendingDelivery,
        customerId,
        branchId,
        warehouseId,
        documentLetter,
        currencyId,
        exchangeRate:
          selectedCurrency && !selectedCurrency.isBase && exchangeRateOverride
            ? Number(exchangeRateOverride)
            : undefined,
        pricesIncludeTax: pricesIncludeTax && !withoutVat,
        notes: notes.trim() || undefined,
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
      onCreated?.();
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setShortages(null);
      const message = err.response?.data?.message ?? 'No se pudo emitir la factura';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  // undefined mientras carga (aún no sabemos) se trata como "no
  // configurado" - más seguro bloquear el submit un instante de más que
  // dejarlo habilitado y que el POST falle recién en el backend. Un
  // certificado vencido también bloquea (ARCA lo rechazaría).
  const certState = arcaCertState(tenantSettingsQuery.data);
  const afipConfigured = canIssueWith(certState);
  // Sin condición frente al IVA no se sabe qué letra corresponde (antes
  // quedaba B por defecto, mal para un monotributista).
  const missingTaxCondition = tenantSettingsQuery.isSuccess && !tenantSettingsQuery.data?.ownTaxCondition;
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
    if (missingTaxCondition) {
      setError('Cargá tu condición frente al IVA en Contabilidad → Conexión con ARCA → Datos de la empresa antes de emitir.');
      return;
    }
    if (!afipConfigured) {
      setError('Configurá el certificado ARCA en Contabilidad → Conexión con ARCA antes de emitir.');
      return;
    }
    // Si falta stock, se avisa y se deja seguir: lo que falta queda
    // pendiente de entrega (ver PendingDeliveryDialog).
    setCheckingStock(true);
    invoicingApi
      .checkStock({ warehouseId, lines: lines.map((l) => ({ articleVariantId: l.articleVariantId, quantity: l.quantity })) })
      .then((result) => {
        if (result.shortages.length > 0) setShortages(result.shortages);
        else mutation.mutate(false);
      })
      // Si el control previo falla, se emite como siempre: el backend vuelve a
      // controlar el stock al descontarlo.
      .catch(() => mutation.mutate(false))
      .finally(() => setCheckingStock(false));
  }

  return (
    <>
      <SalesDocumentSheet
        title="Nueva factura"
        badge={
          <>
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Factura {documentLetter}
            </span>
            {tenantSettingsQuery.isSuccess && <ArcaCertPill state={certState} />}
          </>
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
              {tenantSettingsQuery.isSuccess && <ArcaCertAlert state={certState} />}
              <section>
                <SectionLabel action={perms.can('CUSTOMER') ? <LinkButton onClick={() => setCreatingCustomer(true)}>+ Nuevo cliente</LinkButton> : undefined}>
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
                withoutVat={withoutVat}
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

              <section>
                <SectionLabel>Observaciones</SectionLabel>
                <Textarea
                  id="invoice-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="Opcional. Sale en el PDF: orden de compra del cliente, remito, aclaraciones..."
                />
              </section>
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
              <SectionLabel action={perms.can('BRANCH') ? <LinkButton onClick={() => setCreatingBranch(true)}>+ Nueva</LinkButton> : undefined}>
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
              <SalesTotalsPanel totals={totals} currencyCode={selectedCurrency?.code} withoutVat={withoutVat} />
              {missingTaxCondition && (
                <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Antes de emitir, cargá tu condición frente al IVA en{' '}
                  <Link href="/accounting/arca" className="font-medium underline">
                    Contabilidad → Conexión con ARCA → Datos de la empresa
                  </Link>
                  : sin ella no se puede saber si corresponde Factura A, B o C.
                </p>
              )}
              {exceedsCreditLimit && (
                <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  Con esta factura, {selectedCustomer?.name ?? 'el cliente'} queda debiendo{' '}
                  {formatMoney(outstanding + totals.total)} y su límite de crédito es {formatMoney(creditLimit)}. Podés
                  emitirla igual; el límite se cambia en la ficha del cliente.
                </p>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={mutation.isPending || checkingStock || !ready || missingWarehouse || !afipConfigured || missingTaxCondition}
                title={!afipConfigured ? 'Configurá el certificado ARCA en Contabilidad → Conexión con ARCA primero' : undefined}
              >
                {mutation.isPending ? 'Emitiendo...' : checkingStock ? 'Revisando stock...' : 'Emitir factura'}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd> para emitir
              </p>
            </div>
          </>
        }
      />

      {shortages && (
        <PendingDeliveryDialog
          shortages={shortages}
          pending={mutation.isPending}
          onBack={() => setShortages(null)}
          onConfirm={() => mutation.mutate(true)}
        />
      )}
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
