'use client';

import { buildVariantLabel, inventoryApi, resolveUploadUrl, type Article } from '@/lib/inventory';
import { posApi } from '@/lib/pos';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, LogOut, Minus, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import CashMovementModal from './CashMovementModal';
import CheckoutModal from './CheckoutModal';
import CloseSessionModal from './CloseSessionModal';
import { computeTotals, type TicketLine } from './types';

interface ProductOption {
  id: string;
  articleName: string;
  variantLabel: string | null;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  totalStock: number;
  taxRate: number | null;
  taxKind: 'GRAVADO' | 'EXENTO' | 'NO_GRAVADO';
}

function flatten(articles: Article[]): ProductOption[] {
  return articles.flatMap((article) =>
    article.variants.map((variant) => ({
      id: variant.id,
      articleName: article.name,
      variantLabel: buildVariantLabel(variant),
      sku: variant.sku,
      imageUrl: article.imageUrl,
      unitPrice: variant.unitPrice,
      totalStock: variant.totalStock,
      taxRate: article.taxRate,
      taxKind: article.taxKind,
    })),
  );
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

  const registersQuery = useQuery({ queryKey: ['pos-registers'], queryFn: () => posApi.listRegisters() });
  const openSessionsQuery = useQuery({
    queryKey: ['pos-open-sessions'],
    queryFn: posApi.listOpenSessions,
    refetchInterval: 15000,
  });
  const articlesQuery = useQuery({ queryKey: ['inventory-articles'], queryFn: () => inventoryApi.listArticles() });

  const register = (registersQuery.data ?? []).find((r) => r.id === registerId);
  const session = (openSessionsQuery.data ?? []).find((s) => s.registerId === registerId);

  const sessionSummaryQuery = useQuery({
    queryKey: ['pos-session-summary', session?.id],
    queryFn: () => posApi.getSessionSummary(session?.id ?? ''),
    enabled: !!session,
    refetchInterval: 15000,
  });

  const products = useMemo(() => flatten(articlesQuery.data ?? []), [articlesQuery.data]);
  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return products;
    const words = normalized.split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      const haystack = `${p.articleName} ${p.sku} ${p.variantLabel ?? ''}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [products, search]);

  const totals = computeTotals(lines);

  function addProduct(product: ProductOption) {
    setLines((prev) => {
      const existing = prev.find((l) => l.articleVariantId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.articleVariantId === product.id ? { ...l, quantity: l.quantity + 1 } : l,
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
        },
      ];
    });
  }

  function updateQuantity(articleVariantId: string, quantity: number) {
    if (quantity <= 0) {
      setLines((prev) => prev.filter((l) => l.articleVariantId !== articleVariantId));
      return;
    }
    setLines((prev) => prev.map((l) => (l.articleVariantId === articleVariantId ? { ...l, quantity } : l)));
  }

  function refetchSession() {
    void queryClient.invalidateQueries({ queryKey: ['pos-session-summary', session?.id] });
    void queryClient.invalidateQueries({ queryKey: ['pos-open-sessions'] });
  }

  if (!registerId || (!registersQuery.isLoading && !register)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Caja no encontrada.</p>
      </div>
    );
  }

  if (!openSessionsQuery.isLoading && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <p className="text-sm text-slate-500">Esta caja no tiene un turno abierto.</p>
        <button
          onClick={() => router.push('/pos')}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Volver al selector de cajas
        </button>
      </div>
    );
  }

  const expectedAmount = sessionSummaryQuery.data?.expectedAmount;

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <ShoppingBasket className="h-5 w-5 text-indigo-600" />
          <div>
            <p className="text-sm font-semibold">{register?.name}</p>
            <p className="text-xs text-slate-500">{register?.branch.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {expectedAmount !== undefined && (
            <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm">
              <span className="text-slate-500">Efectivo esperado: </span>
              <span className="font-semibold">${Number(expectedAmount).toFixed(2)}</span>
            </div>
          )}
          <button
            onClick={() => setCashMovement('CASH_IN')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-green-700 transition hover:bg-green-50"
          >
            <ArrowDownCircle className="h-4 w-4" />
            Ingreso
          </button>
          <button
            onClick={() => setCashMovement('CASH_OUT')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-amber-700 transition hover:bg-amber-50"
          >
            <ArrowUpCircle className="h-4 w-4" />
            Egreso
          </button>
          <button
            onClick={() => setClosingSession(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Cerrar turno
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-2/3 flex-col gap-4 overflow-hidden p-5">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar artículo, SKU o escanear código de barras..."
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500"
          />
          <div className="grid flex-1 auto-rows-min grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5">
            {filtered.map((product) => (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                disabled={product.totalStock <= 0}
                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm transition hover:border-indigo-300 hover:shadow-md disabled:opacity-40"
              >
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                  {product.imageUrl ? (
                    <img src={resolveUploadUrl(product.imageUrl) ?? undefined} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ShoppingBasket className="h-6 w-6 text-slate-400" />
                  )}
                </div>
                <p className="line-clamp-2 text-xs font-medium">
                  {product.articleName}
                  {product.variantLabel && <span className="text-slate-500"> · {product.variantLabel}</span>}
                </p>
                <p className="text-sm font-semibold text-indigo-700">${product.unitPrice.toFixed(2)}</p>
              </button>
            ))}
            {!articlesQuery.isLoading && filtered.length === 0 && (
              <p className="col-span-full text-sm text-slate-500">Sin artículos que coincidan</p>
            )}
          </div>
        </div>

        <div className="flex w-1/3 flex-col border-l border-slate-200 bg-white">
          <div className="flex-1 overflow-y-auto p-4">
            {lines.length === 0 ? (
              <p className="mt-8 text-center text-sm text-slate-400">Todavía no agregaste ningún artículo</p>
            ) : (
              <div className="flex flex-col gap-3">
                {lines.map((line) => (
                  <div key={line.articleVariantId} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {line.articleName}
                        {line.variantLabel && <span className="text-slate-500"> · {line.variantLabel}</span>}
                      </p>
                      <p className="text-xs text-slate-500">${line.unitPrice.toFixed(2)} c/u</p>
                    </div>
                    <button
                      onClick={() => updateQuantity(line.articleVariantId, line.quantity - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm">{line.quantity}</span>
                    <button
                      onClick={() => updateQuantity(line.articleVariantId, line.quantity + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <p className="w-16 text-right text-sm font-semibold">
                      ${(line.unitPrice * line.quantity).toFixed(2)}
                    </p>
                    <button
                      onClick={() => updateQuantity(line.articleVariantId, 0)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-4">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span>
              <span>${totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-500">
              <span>IVA</span>
              <span>${totals.taxTotal.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>${totals.total.toFixed(2)}</span>
            </div>
            <button
              onClick={() => setCheckingOut(true)}
              disabled={lines.length === 0}
              className="mt-4 w-full rounded-lg bg-indigo-600 py-3 text-base font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
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
          type={cashMovement}
          onClose={() => setCashMovement(null)}
          onDone={() => {
            setCashMovement(null);
            refetchSession();
          }}
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
