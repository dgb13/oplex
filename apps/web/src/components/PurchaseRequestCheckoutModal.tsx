'use client';

import Select from '@/components/ui/Select';
import { api } from '@/lib/api';
import { companiesApi } from '@/lib/companies';
import { cartCheckoutApi, type CartLine, type PurchaseRequestGroupInput } from '@/lib/inventoryCart';
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

/** "Pedido de costos" checkout: each cart line gets its own supplier
 * assignment (decision with the user, 2026-08-03 - "repartir ítems por
 * proveedor", not the same list sent to every supplier) and its own
 * editable estimated cost, defaulted from the article's own unitPrice.
 * Submitting groups the assigned lines by supplier and creates one
 * QuoteRequest per supplier (see inventory-cart-checkout.service.ts) - the
 * cart itself is untouched either way, per the "same list can seed more
 * than one document" decision. */
export default function PurchaseRequestCheckoutModal({ lines, onClose }: Props) {
  const [supplierByLine, setSupplierByLine] = useState<Record<string, string>>({});
  const [costByLine, setCostByLine] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.id, l.unitPrice])),
  );
  const [currencyId, setCurrencyId] = useState('');

  const { data: suppliers } = useQuery({
    queryKey: ['companies', 'SUPPLIER'],
    queryFn: () => companiesApi.list('SUPPLIER'),
  });
  const { data: currencies } = useQuery({
    queryKey: ['currencies'],
    queryFn: () => api.get<CurrencyRef[]>('/invoicing/currencies').then((r) => r.data),
  });

  const checkout = useMutation({
    mutationFn: (groups: PurchaseRequestGroupInput[]) => cartCheckoutApi.purchaseRequests(groups),
  });

  const assignedLines = lines.filter((l) => supplierByLine[l.id]);
  const groupsPreview = new Map<string, CartLine[]>();
  for (const line of assignedLines) {
    const supplierId = supplierByLine[line.id];
    groupsPreview.set(supplierId, [...(groupsPreview.get(supplierId) ?? []), line]);
  }

  function submit() {
    if (!currencyId || assignedLines.length === 0) return;
    const groups: PurchaseRequestGroupInput[] = Array.from(groupsPreview.entries()).map(
      ([supplierId, groupLines]) => ({
        supplierId,
        currencyId,
        lines: groupLines.map((l) => ({
          articleVariantId: l.articleVariantId,
          quantity: l.quantity,
          estimatedUnitCost: costByLine[l.id],
        })),
      }),
    );
    checkout.mutate(groups);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pedido de costos</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            ✕
          </button>
        </div>

        {checkout.isSuccess ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Se generaron {checkout.data.length} Pedido{checkout.data.length !== 1 ? 's' : ''} de Cotización:
            </p>
            <ul className="list-inside list-disc text-sm text-slate-700 dark:text-slate-300">
              {checkout.data.map((qr: { id: string; number: string }) => (
                <li key={qr.id}>{qr.number}</li>
              ))}
            </ul>
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
            <div className="mb-4">
              <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">Moneda</label>
              <Select
                className="w-48"
                buttonClassName={CHECKOUT_SELECT_LOOK}
                value={currencyId}
                onChange={setCurrencyId}
                placeholder="Elegí moneda..."
                options={(currencies ?? []).map((c) => ({ value: c.id, label: c.code }))}
              />
            </div>

            <div className="space-y-2">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="grid grid-cols-[1fr_7rem_10rem] items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 p-2"
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
                    value={costByLine[line.id] ?? 0}
                    onChange={(e) =>
                      setCostByLine((prev) => ({ ...prev, [line.id]: Number(e.target.value) }))
                    }
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                    aria-label="Costo estimado"
                  />
                  <Select
                    className="min-w-0"
                    buttonClassName="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-slate-100"
                    value={supplierByLine[line.id] ?? ''}
                    onChange={(supplierId) => setSupplierByLine((prev) => ({ ...prev, [line.id]: supplierId }))}
                    options={[
                      { value: '', label: 'Sin asignar' },
                      ...(suppliers ?? []).map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                </div>
              ))}
            </div>

            {groupsPreview.size > 0 && (
              <div className="mt-4 rounded-lg bg-slate-200/60 dark:bg-slate-800/60 p-3 text-sm text-slate-700 dark:text-slate-300">
                {Array.from(groupsPreview.entries()).map(([supplierId, groupLines]) => {
                  const supplier = (suppliers ?? []).find((s) => s.id === supplierId);
                  return (
                    <p key={supplierId}>
                      {supplier?.name ?? supplierId}: {groupLines.length} ítem
                      {groupLines.length !== 1 ? 's' : ''}
                    </p>
                  );
                })}
              </div>
            )}

            {checkout.isError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                No se pudo generar el pedido. Revisá los datos e intentá de nuevo.
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={onClose} className="text-sm text-slate-600 dark:text-slate-400">
                Cancelar
              </button>
              <button
                onClick={submit}
                disabled={!currencyId || assignedLines.length === 0 || checkout.isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {checkout.isPending ? 'Generando...' : `Generar ${groupsPreview.size || ''} pedido(s)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
