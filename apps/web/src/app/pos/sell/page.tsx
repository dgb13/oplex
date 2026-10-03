'use client';

import { buildVariantLabel, inventoryApi, resolveUploadUrl, type Article } from '@/lib/inventory';
import { formatPaidAt, posApi } from '@/lib/pos';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, LogOut, Minus, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import CashMovementModal from './CashMovementModal';
import CheckoutModal from './CheckoutModal';
import CloseSessionModal from './CloseSessionModal';
import { computeTotals, type TicketLine } from './types';
import UnclaimedQrChargesModal from './UnclaimedQrChargesModal';
import PosThemePicker from '../PosThemePicker';

interface ProductOption {
  id: string;
  articleName: string;
  variantLabel: string | null;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  // Disponible para vender en el depósito de ESTA caja (no la suma de todos
  // los depósitos): físico menos lo reservado para producción, el mismo
  // número que controla PosService antes de cobrar.
  stock: number;
  // Lo reservado para producción en ese depósito, para explicar un "sin
  // stock" con unidades físicas.
  reserved: number;
  taxRate: number | null;
  taxKind: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
}

function flatten(articles: Article[], warehouseId: string | undefined): ProductOption[] {
  return articles.flatMap((article) =>
    article.variants.map((variant) => {
      const row = variant.stockByWarehouse.find((r) => r.warehouseId === warehouseId);
      const reserved = row?.reserved ?? 0;
      return {
        id: variant.id,
        articleName: article.name,
        variantLabel: buildVariantLabel(variant),
        sku: variant.sku,
        imageUrl: article.imageUrl,
        unitPrice: variant.unitPrice,
        stock: Math.max((row?.quantity ?? 0) - reserved, 0),
        reserved,
        taxRate: article.taxRate,
        taxKind: article.taxKind,
      };
    }),
  );
}

function formatStock(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

/** "$100.000,00" - con separador de miles, legible con muchos dígitos. */
function formatMoney(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PosSellScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registerId = searchParams.get('registerId') ?? '';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [cashMovement, setCashMovement] = useState<'CASH_IN' | 'CASH_OUT' | null>(null);
  const [closingSession, setClosingSession] = useState(false);
  // null = cerrado; 'browse' desde el aviso; 'closing' desde "Cerrar turno".
  const [unclaimedView, setUnclaimedView] = useState<'browse' | 'closing' | null>(null);

  const registersQuery = useQuery({ queryKey: ['pos-registers'], queryFn: () => posApi.listRegisters() });
  const openSessionsQuery = useQuery({
    queryKey: ['pos-open-sessions'],
    queryFn: posApi.listOpenSessions,
    refetchInterval: 15000,
  });
  const articlesQuery = useQuery({ queryKey: ['inventory-articles'], queryFn: () => inventoryApi.listArticles() });
  // Cobros QR acreditados que no llegaron a ser venta - mismo intervalo que
  // el arqueo de arriba.
  const unclaimedQuery = useQuery({
    queryKey: ['pos-unclaimed-qr', registerId],
    queryFn: () => posApi.listUnclaimedQrCharges(registerId),
    enabled: !!registerId,
    refetchInterval: 15000,
  });
  const unclaimed = unclaimedQuery.data ?? [];

  const register = (registersQuery.data ?? []).find((r) => r.id === registerId);
  const session = (openSessionsQuery.data ?? []).find((s) => s.registerId === registerId);

  const sessionSummaryQuery = useQuery({
    queryKey: ['pos-session-summary', session?.id],
    queryFn: () => posApi.getSessionSummary(session?.id ?? ''),
    enabled: !!session,
    refetchInterval: 15000,
  });

  const products = useMemo(
    () => flatten(articlesQuery.data ?? [], register?.warehouseId),
    [articlesQuery.data, register?.warehouseId],
  );
  // Línea del ticket que intentó pasarse del stock: muestra el aviso abajo
  // de esa línea hasta que se baje la cantidad o se agregue otra cosa.
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return products;
    const words = normalized.split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      const haystack = `${p.articleName} ${p.sku} ${p.variantLabel ?? ''}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [products, search]);

  // Emisor Monotributo/Exento: factura C, sin IVA (mismo criterio que el
  // backend, que es el que factura).
  const tenantSettingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  const withoutVat =
    tenantSettingsQuery.data?.ownTaxCondition === 'MONOTRIBUTO' ||
    tenantSettingsQuery.data?.ownTaxCondition === 'EXENTO';
  const totals = computeTotals(lines, withoutVat);

  function addProduct(product: ProductOption) {
    const existing = lines.find((l) => l.articleVariantId === product.id);
    if ((existing?.quantity ?? 0) + 1 > product.stock) {
      setStockWarning(product.id);
      return;
    }
    setStockWarning(null);
    setLines((prev) => {
      const existing = prev.find((l) => l.articleVariantId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.articleVariantId === product.id ? { ...l, quantity: l.quantity + 1, stock: product.stock } : l,
        );
      }
      return [
        ...prev,
        {
          articleVariantId: product.id,
          articleName: product.articleName,
          variantLabel: product.variantLabel,
          sku: product.sku,
          unitPrice: product.unitPrice,
          quantity: 1,
          taxRate: product.taxRate,
          taxKind: product.taxKind,
          stock: product.stock,
        },
      ];
    });
  }

  function updateQuantity(articleVariantId: string, quantity: number) {
    const line = lines.find((l) => l.articleVariantId === articleVariantId);
    if (line && quantity > line.stock) {
      setStockWarning(articleVariantId);
      return;
    }
    setStockWarning(null);
    if (quantity <= 0) {
      setLines((prev) => prev.filter((l) => l.articleVariantId !== articleVariantId));
      return;
    }
    setLines((prev) => prev.map((l) => (l.articleVariantId === articleVariantId ? { ...l, quantity } : l)));
  }

  function refetchSession() {
    void queryClient.invalidateQueries({ queryKey: ['pos-session-summary', session?.id] });
    void queryClient.invalidateQueries({ queryKey: ['pos-open-sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['pos-unclaimed-qr', registerId] });
  }

  // Un cobro QR sin venta es plata que entró sin factura: el turno no se
  // cierra hasta resolverlo (el backend también lo exige).
  function startClosingSession() {
    if (unclaimed.length > 0) {
      setUnclaimedView('closing');
      return;
    }
    setClosingSession(true);
  }

  if (!registerId || (!registersQuery.isLoading && !register)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 pos-dark:bg-slate-950 pos-contrast:bg-black pos-emerald:bg-emerald-50">
        <p className="text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
          Caja no encontrada.
        </p>
      </div>
    );
  }

  if (!openSessionsQuery.isLoading && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 pos-dark:bg-slate-950 pos-contrast:bg-black pos-emerald:bg-emerald-50">
        <p className="text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
          Esta caja no tiene un turno abierto.
        </p>
        <button
          onClick={() => router.push('/pos')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
        >
          Volver al selector de cajas
        </button>
      </div>
    );
  }

  const expectedAmount = sessionSummaryQuery.data?.expectedAmount;

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900 pos-dark:bg-slate-950 pos-dark:text-slate-100 pos-contrast:bg-black pos-contrast:text-white pos-emerald:bg-emerald-50 pos-emerald:text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3 pos-dark:border-slate-800 pos-dark:bg-slate-900 pos-contrast:border-slate-800 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white">
        <div className="flex items-center gap-3">
          <ShoppingBasket className="h-5 w-5 text-indigo-600 pos-dark:text-indigo-400 pos-contrast:text-amber-400 pos-emerald:text-emerald-600" />
          <div>
            <p className="text-sm font-semibold">{register?.name}</p>
            <p className="text-xs text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
              {register?.branch.name}
            </p>
          </div>
          <PosThemePicker />
        </div>
        <div className="flex items-center gap-4">
          {expectedAmount !== undefined && (
            <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm pos-dark:bg-slate-800 pos-contrast:bg-slate-900 pos-emerald:bg-emerald-100">
              <span className="text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-600">
                Efectivo esperado:{' '}
              </span>
              <span className="font-semibold tabular-nums">{formatMoney(Number(expectedAmount))}</span>
            </div>
          )}
          <button
            onClick={() => setCashMovement('CASH_IN')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-green-700 transition hover:bg-green-50 pos-dark:text-green-400 pos-dark:hover:bg-green-950 pos-contrast:text-green-400 pos-contrast:hover:bg-green-950 pos-emerald:text-green-700 pos-emerald:hover:bg-green-50"
          >
            <ArrowDownCircle className="h-4 w-4" />
            Ingreso
          </button>
          <button
            onClick={() => setCashMovement('CASH_OUT')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-amber-700 transition hover:bg-amber-50 pos-dark:text-amber-400 pos-dark:hover:bg-amber-950 pos-contrast:text-amber-400 pos-contrast:hover:bg-amber-950 pos-emerald:text-amber-700 pos-emerald:hover:bg-amber-50"
          >
            <ArrowUpCircle className="h-4 w-4" />
            Egreso
          </button>
          <button
            onClick={startClosingSession}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 pos-dark:text-slate-300 pos-dark:hover:bg-slate-800 pos-contrast:text-slate-200 pos-contrast:hover:bg-slate-900 pos-emerald:text-slate-600 pos-emerald:hover:bg-emerald-100"
          >
            <LogOut className="h-4 w-4" />
            Cerrar turno
          </button>
        </div>
      </header>

      {unclaimed.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-sm text-amber-800 pos-dark:border-amber-900 pos-dark:bg-amber-950 pos-dark:text-amber-300 pos-contrast:border-amber-900 pos-contrast:bg-amber-950 pos-contrast:text-amber-300 pos-emerald:border-amber-200 pos-emerald:bg-amber-50 pos-emerald:text-amber-800"
        >
          <span>
            <span className="font-semibold">
              {unclaimed.length === 1
                ? '1 cobro con QR acreditado sin venta'
                : `${unclaimed.length} cobros con QR acreditados sin venta`}
            </span>
            {' · '}
            {formatMoney(unclaimed.reduce((sum, c) => sum + Number(c.amount), 0))}
            {unclaimed[0].paidAt && ` · ${formatPaidAt(unclaimed[0].paidAt)}`}. El cliente ya pagó y falta confirmar la
            venta.
          </span>
          <button
            onClick={() => setUnclaimedView('browse')}
            className="rounded-lg border border-current px-3 py-1 text-sm font-semibold transition hover:bg-amber-100 pos-dark:hover:bg-amber-900 pos-contrast:hover:bg-amber-900 pos-emerald:hover:bg-amber-100"
          >
            Resolver
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-2/3 flex-col gap-4 overflow-hidden p-5">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar artículo, SKU o escanear código de barras..."
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500 pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-dark:text-slate-100 pos-dark:focus:border-indigo-400 pos-contrast:border-slate-700 pos-contrast:bg-black pos-contrast:text-white pos-contrast:focus:border-amber-400 pos-emerald:border-emerald-200 pos-emerald:bg-white pos-emerald:focus:border-emerald-500"
          />
          <div className="grid flex-1 auto-rows-min grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5">
            {filtered.map((product) => (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                // Sin precio (producto fabricado creado desde Recetas sin
                // precio todavía) no se puede vender desde la caja - acá el
                // precio no se edita, se carga en Inventario.
                disabled={product.stock <= 0 || !(product.unitPrice > 0)}
                title={
                  !(product.unitPrice > 0)
                    ? 'Sin precio de venta - cargalo en Inventario'
                    : product.stock <= 0
                      ? `Sin stock disponible en ${register?.warehouse.name ?? 'el depósito de esta caja'}${product.reserved > 0 ? ` (${formatStock(product.reserved)} reservadas para producción)` : ''}`
                      : undefined
                }
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:border-indigo-300 hover:shadow-md disabled:opacity-40 pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-dark:hover:border-indigo-500 pos-contrast:border-slate-700 pos-contrast:bg-black pos-contrast:hover:border-amber-400 pos-emerald:border-emerald-100 pos-emerald:bg-white pos-emerald:hover:border-emerald-300"
              >
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-slate-100 pos-dark:bg-slate-800 pos-contrast:bg-slate-900 pos-emerald:bg-emerald-50">
                  {product.imageUrl ? (
                    <img src={resolveUploadUrl(product.imageUrl) ?? undefined} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ShoppingBasket className="h-6 w-6 text-slate-400 pos-dark:text-slate-500 pos-contrast:text-slate-400 pos-emerald:text-slate-400" />
                  )}
                </div>
                <p className="line-clamp-2 text-xs font-medium">
                  {product.articleName}
                  {product.variantLabel && (
                    <span className="text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                      {' '}
                      · {product.variantLabel}
                    </span>
                  )}
                </p>
                {product.unitPrice > 0 ? (
                  <p className="text-sm font-semibold text-indigo-700 pos-dark:text-indigo-400 pos-contrast:text-amber-400 pos-emerald:text-emerald-700">
                    {formatMoney(product.unitPrice)}
                  </p>
                ) : (
                  <p className="text-xs font-semibold text-amber-700 pos-dark:text-amber-400 pos-contrast:text-amber-400 pos-emerald:text-amber-700">
                    Sin precio
                  </p>
                )}
                <p
                  className={`text-xs ${
                    product.stock <= 0
                      ? 'font-semibold text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600'
                      : 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500'
                  }`}
                >
                  {product.stock <= 0 ? 'Sin stock' : `Stock: ${formatStock(product.stock)}`}
                  {product.reserved > 0 && ` · ${formatStock(product.reserved)} reservad${product.reserved === 1 ? 'a' : 'as'} p/ producción`}
                </p>
              </button>
            ))}
            {!articlesQuery.isLoading && filtered.length === 0 && (
              <p className="col-span-full text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                Sin artículos que coincidan
              </p>
            )}
          </div>
        </div>

        <div className="flex w-1/3 flex-col border-l border-slate-200 bg-white pos-dark:border-slate-800 pos-dark:bg-slate-900 pos-contrast:border-slate-800 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white">
          <div className="flex-1 overflow-y-auto p-4">
            {lines.length === 0 ? (
              <p className="mt-8 text-center text-sm text-slate-400 pos-dark:text-slate-500 pos-contrast:text-slate-400 pos-emerald:text-slate-400">
                Todavía no agregaste ningún artículo
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {lines.map((line) => (
                  <div key={line.articleVariantId} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {line.articleName}
                          {line.variantLabel && (
                            <span className="text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                              {' '}
                              · {line.variantLabel}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                          {formatMoney(line.unitPrice)} c/u
                        </p>
                      </div>
                      {/* Cantidad e importe crecen con su contenido (shrink-0):
                          antes tenían ancho fijo y con muchos dígitos se
                          encimaban con los botones. Lo que cede es el nombre,
                          que ya se recorta con "…". */}
                      <button
                        onClick={() => updateQuantity(line.articleVariantId, line.quantity - 1)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 pos-dark:bg-slate-800 pos-dark:hover:bg-slate-700 pos-contrast:bg-slate-900 pos-contrast:hover:bg-slate-800 pos-emerald:bg-emerald-50 pos-emerald:hover:bg-emerald-100"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-7 shrink-0 text-center text-sm tabular-nums">{formatStock(line.quantity)}</span>
                      <button
                        onClick={() => updateQuantity(line.articleVariantId, line.quantity + 1)}
                        disabled={line.quantity >= line.stock}
                        title={line.quantity >= line.stock ? `No hay más stock (${formatStock(line.stock)})` : undefined}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-40 pos-dark:bg-slate-800 pos-dark:hover:bg-slate-700 pos-contrast:bg-slate-900 pos-contrast:hover:bg-slate-800 pos-emerald:bg-emerald-50 pos-emerald:hover:bg-emerald-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <p className="min-w-28 shrink-0 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
                        {formatMoney(line.unitPrice * line.quantity)}
                      </p>
                      <button
                        onClick={() => updateQuantity(line.articleVariantId, 0)}
                        className="shrink-0 text-slate-400 hover:text-red-600 pos-dark:text-slate-500 pos-dark:hover:text-red-400 pos-contrast:text-slate-400 pos-contrast:hover:text-red-400 pos-emerald:text-slate-400 pos-emerald:hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {stockWarning === line.articleVariantId && (
                      <p
                        role="status"
                        className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 pos-dark:bg-amber-950 pos-dark:text-amber-300 pos-contrast:bg-amber-950 pos-contrast:text-amber-300 pos-emerald:bg-amber-50 pos-emerald:text-amber-800"
                      >
                        No hay más stock disponible: {formatStock(line.stock)} en {register?.warehouse.name ?? 'el depósito de esta caja'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4 pos-dark:border-slate-800 pos-contrast:border-slate-800 pos-emerald:border-emerald-100">
            <div className="flex justify-between text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(totals.subtotal)}</span>
            </div>
            {!withoutVat && (
              <div className="flex justify-between text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                <span>IVA</span>
                <span className="tabular-nums">{formatMoney(totals.taxTotal)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(totals.total)}</span>
            </div>
            <button
              onClick={() => setCheckingOut(true)}
              disabled={lines.length === 0}
              className="mt-4 w-full rounded-lg bg-indigo-600 py-3 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
            >
              Cobrar
            </button>
          </div>
        </div>
      </div>

      {checkingOut && session && (
        <CheckoutModal
          registerId={registerId}
          lines={lines}
          totals={totals}
          onClose={() => setCheckingOut(false)}
          onCompleted={() => {
            setLines([]);
            setCheckingOut(false);
            refetchSession();
          }}
        />
      )}

      {cashMovement && session && (
        <CashMovementModal
          sessionId={session.id}
          registerId={registerId}
          type={cashMovement}
          onClose={() => setCashMovement(null)}
          onDone={() => {
            setCashMovement(null);
            refetchSession();
          }}
        />
      )}

      {unclaimedView && (
        <UnclaimedQrChargesModal
          charges={unclaimed}
          closingShift={unclaimedView === 'closing'}
          onClose={() => setUnclaimedView(null)}
          onResolved={refetchSession}
        />
      )}

      {closingSession && session && (
        <CloseSessionModal
          sessionId={session.id}
          expectedAmount={Number(expectedAmount ?? session.openingAmount)}
          onClose={() => setClosingSession(false)}
          onClosed={() => router.push('/pos')}
        />
      )}
    </div>
  );
}

export default function PosSellPage() {
  return (
    <Suspense fallback={null}>
      <PosSellScreen />
    </Suspense>
  );
}
