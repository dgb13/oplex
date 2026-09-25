'use client';

import Select from '@/components/ui/Select';
import { api } from '@/lib/api';
import { companiesApi } from '@/lib/companies';
import { cartCheckoutApi, type CartLine } from '@/lib/inventoryCart';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

const CHECKOUT_SELECT_LOOK =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100';

interface CurrencyRef {
  id: string;
  code: string;
}

interface Props {
  lines: CartLine[];
  onClose: () => void;
}

/** "Proponer venta" checkout: the whole cart becomes one Quote to one
 * customer, price editable per line (default ArticleVariant.unitPrice,
 * already resolved on each CartLine). The cart itself is untouched - see
 * PurchaseRequestCheckoutModal's doc comment for why. */
export default function QuoteCheckoutModal({ lines, onClose }: Props) {
  const [customerId, setCustomerId] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [priceByLine, setPriceByLine] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.id, l.unitPrice])),
  );

  const { data: customers } = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
  });
  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => api.get<CurrencyRef[]>('/invoicing/currencies').then((r) => r.data),
  });

  const checkout = useMutation({
    mutationFn: () =>
      cartCheckoutApi.quote({
        customerId,
        currencyId,
        validUntil: validUntil || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          articleVariantId: l.articleVariantId,
          quantity: l.quantity,
          unitPrice: priceByLine[l.id] ?? l.unitPrice,
        })),
      }),
  });

  const total = lines.reduce((sum, l) => sum + l.quantity * (priceByLine[l.id] ?? l.unitPrice), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Proponer venta</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            ✕
          </button>
        </div>

        {checkout.isSuccess ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Se generó la cotización <span className="font-medium">{checkout.data.number}</span>. La vas a
              encontrar en Ventas → Cotizaciones.
            </p>
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">Cliente</label>
                <Select
                  buttonClassName={CHECKOUT_SELECT_LOOK}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="Elegí cliente..."
                  options={(customers ?? []).map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">Moneda</label>
                <Select
                  buttonClassName={CHECKOUT_SELECT_LOOK}
                  value={currencyId}
                  onChange={setCurrencyId}
                  placeholder="Elegí moneda..."
                  options={(currencies ?? []).map((c) => ({ value: c.id, label: c.code }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">Válida hasta</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">Notas</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[1fr_7rem_7rem] items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {line.articleName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {line.sku} · Cant. {line.quantity}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={priceByLine[line.id] ?? 0}
                    onChange={(e) =>
                      setPriceByLine((prev) => ({ ...prev, [line.id]: Number(e.target.value) }))
                    }
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                    aria-label="Precio unitario"
                  />
                  <span className="text-right text-sm text-slate-700 dark:text-slate-300">
                    ${(line.quantity * (priceByLine[line.id] ?? 0)).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end text-sm font-medium text-slate-900 dark:text-slate-100">
              Total: ${total.toFixed(2)}
            </div>

            {checkout.isError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                No se pudo generar la cotización. Revisá los datos e intentá de nuevo.
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={onClose} className="text-sm text-slate-600 dark:text-slate-400">
                Cancelar
              </button>
              <button
                onClick={() => checkout.mutate()}
                disabled={!customerId || !currencyId || checkout.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {checkout.isPending ? 'Generando...' : 'Generar cotización'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
