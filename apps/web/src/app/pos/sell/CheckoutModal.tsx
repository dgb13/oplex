'use client';

import { companiesApi, type AfipPadronData } from '@/lib/companies';
import { formatCuitInput, normalizeCuit } from '@/lib/cuit';
import { suggestDocumentLetter, type DocumentLetter } from '@/lib/documentLetter';
import { invoicingApi } from '@/lib/invoicing';
import { posApi, POS_PAYMENT_METHODS, type CheckoutPaymentInput } from '@/lib/pos';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useMemo, useState } from 'react';
import type { TicketLine } from './types';

interface Props {
  registerId: string;
  lines: TicketLine[];
  totals: { subtotal: number; taxTotal: number; total: number };
  onClose: () => void;
  onCompleted: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 pos-dark:border-slate-600 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-dark:focus:border-indigo-400 pos-contrast:border-slate-600 pos-contrast:bg-slate-900 pos-contrast:text-white pos-contrast:focus:border-amber-400 pos-emerald:border-emerald-200 pos-emerald:bg-emerald-50 pos-emerald:text-slate-900 pos-emerald:focus:border-emerald-500';

interface PaymentRow {
  method: string;
  amount: string;
  // Sólo tiene sentido para method: 'CASH' - lo que el cliente entregó en
  // mano, nunca viaja a posApi.checkout. amount sigue siendo lo único que
  // se manda como pago real; el vuelto de la fila es pagaCon - amount,
  // calculado en el cliente solamente (ver rowChange).
  pagaCon?: string;
}

/** Sólo lectura de "Consumidor Final" en pantalla si no se elige otro
 * cliente - el placeholder real (Company sin CUIT) lo crea el backend la
 * primera vez que hace falta, ver PosService.resolveDefaultCustomer. */
export default function CheckoutModal({ registerId, lines, totals, onClose, onCompleted }: Props) {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: 'CASH', amount: totals.total.toFixed(2) }]);
  const [error, setError] = useState('');
  const [completedInvoice, setCompletedInvoice] = useState<{ id: string; documentLetter: string; number: string } | null>(
    null,
  );

  // Alta rápida de cliente por CUIT sin salir del modal de Cobrar - mismo
  // lookup que "Buscar en AFIP" de CompanyFormModal, pero sin abrir otro
  // modal encima: si el CUIT ya es cliente, lo selecciona directo; si no,
  // muestra lo que devolvió AFIP y un botón para crearlo con un click.
  const [cuitInput, setCuitInput] = useState('');
  const [afipResult, setAfipResult] = useState<AfipPadronData | null>(null);
  const [cuitMessage, setCuitMessage] = useState('');
  const [cuitError, setCuitError] = useState('');

  const customersQuery = useQuery({ queryKey: ['companies', 'CUSTOMER'], queryFn: () => companiesApi.list('CUSTOMER') });
  const currenciesQuery = useQuery({ queryKey: ['invoicing-currencies'], queryFn: invoicingApi.listCurrencies });
  const tenantSettingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });

  const selectedCustomer = (customersQuery.data ?? []).find((c) => c.id === customerId);
  const baseCurrency = (currenciesQuery.data ?? []).find((c) => c.isBase) ?? currenciesQuery.data?.[0];

  const letterSuggestion = suggestDocumentLetter(
    tenantSettingsQuery.data?.ownTaxCondition ?? null,
    selectedCustomer?.taxId ?? null,
    selectedCustomer?.taxCondition ?? null,
  );
  const documentLetter: DocumentLetter = letterSuggestion.letter ?? 'B';

  const cuitLookup = useMutation({
    mutationFn: async (): Promise<{ kind: 'existing'; company: { id: string; name: string } } | { kind: 'new'; data: AfipPadronData }> => {
      const normalized = normalizeCuit(cuitInput);
      const existing = (customersQuery.data ?? []).find((c) => c.taxId && normalizeCuit(c.taxId) === normalized);
      if (existing) return { kind: 'existing', company: existing };
      const data = await companiesApi.lookupAfip(normalized);
      return { kind: 'new', data };
    },
    onSuccess: (result) => {
      setCuitError('');
      if (result.kind === 'existing') {
        setCustomerId(result.company.id);
        setCuitMessage(`Cliente ya cargado: ${result.company.name}`);
        setAfipResult(null);
        setCuitInput('');
      } else {
        setAfipResult(result.data);
        setCuitMessage('');
      }
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setAfipResult(null);
      setCuitMessage('');
      const message = err.response?.data?.message ?? 'No se pudo consultar AFIP';
      setCuitError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const createCustomer = useMutation({
    mutationFn: () => {
      if (!afipResult) throw new Error('Nada para crear');
      return companiesApi.create({
        name: afipResult.name,
        taxId: normalizeCuit(cuitInput),
        taxCondition: afipResult.taxCondition ?? undefined,
        fiscalAddress: afipResult.fiscalAddress ?? undefined,
        roles: ['CUSTOMER'],
      });
    },
    onSuccess: (company) => {
      void queryClient.invalidateQueries({ queryKey: ['companies', 'CUSTOMER'] });
      setCustomerId(company.id);
      setCuitMessage(`Cliente creado: ${company.name}`);
      setAfipResult(null);
      setCuitInput('');
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el cliente';
      setCuitError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  // Lo que realmente se va a mandar como pago (posApi.checkout) - "Paga
  // con" de cada fila en efectivo es aparte, nunca entra acá.
  const appliedTotal = useMemo(
    () => payments.reduce((sum, p) => sum + (Number(p.amount.replace(',', '.')) || 0), 0),
    [payments],
  );

  // Vuelto de UNA fila en efectivo: lo que el cliente entregó menos lo que
  // esa fila efectivamente aplica al pago. Nunca cambia `amount` - eso es
  // justo lo que antes rompía el cobro (ver comentario en handleConfirm).
  function rowChange(p: PaymentRow): number {
    const pagaCon = Number((p.pagaCon ?? '').replace(',', '.')) || 0;
    const amount = Number(p.amount.replace(',', '.')) || 0;
    return pagaCon - amount;
  }

  const mutation = useMutation({
    mutationFn: () => {
      const paymentsInput: CheckoutPaymentInput[] = payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({ method: p.method, amount: Number(p.amount.replace(',', '.')) }));
      return posApi.checkout({
        registerId,
        customerId: customerId || undefined,
        documentLetter,
        currencyId: baseCurrency?.id ?? '',
        lines: lines.map((l) => ({
          articleVariantId: l.articleVariantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxKind: l.taxKind,
          taxRate: l.taxRate ?? undefined,
        })),
        payments: paymentsInput,
      });
    },
    onSuccess: (invoice) => {
      setCompletedInvoice(invoice);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo completar el cobro';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function addPaymentRow() {
    const remaining = Math.max(totals.total - appliedTotal, 0);
    setPayments((prev) => [...prev, { method: 'CASH', amount: remaining > 0 ? remaining.toFixed(2) : '' }]);
  }

  function updatePayment(index: number, patch: Partial<PaymentRow>) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  function handleConfirm() {
    setError('');
    // El backend valida Σpayments.amount === Invoice.total exacto (ver
    // PosService.checkout) - antes acá se dejaba pasar un monto de más
    // "para ver el vuelto" y el cobro se rechazaba recién al confirmar.
    // Ahora el vuelto sale de "Paga con" (rowChange), amount nunca se
    // toca por eso, así que esta comparación siempre puede ser exacta.
    if (Math.abs(appliedTotal - totals.total) > 0.004) {
      setError(
        appliedTotal < totals.total
          ? 'El total pagado es menor al total de la venta'
          : 'El monto de los pagos supera el total - usá "Paga con" para calcular el vuelto, no cambies el monto del pago',
      );
      return;
    }
    const shortRow = payments.find((p) => p.method === 'CASH' && p.pagaCon && rowChange(p) < -0.004);
    if (shortRow) {
      setError('Lo que paga el cliente en efectivo es menor al monto de esa fila');
      return;
    }
    mutation.mutate();
  }

  if (completedInvoice) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white p-6 text-center shadow-2xl pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-contrast:border-slate-700 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white">
          <p className="mb-1 text-lg font-semibold text-green-700 pos-dark:text-green-400 pos-contrast:text-green-400 pos-emerald:text-green-700">
            Venta confirmada
          </p>
          <p className="mb-4 text-sm text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
            {completedInvoice.documentLetter}-{completedInvoice.number}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => invoicingApi.openPdf(completedInvoice.id, 'TICKET')}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-dark:hover:bg-slate-700 pos-contrast:bg-slate-900 pos-contrast:text-white pos-contrast:hover:bg-slate-800 pos-emerald:bg-emerald-50 pos-emerald:text-slate-800 pos-emerald:hover:bg-emerald-100"
            >
              Imprimir ticket
            </button>
            <button
              onClick={onCompleted}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
            >
              Nueva venta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-2xl pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-contrast:border-slate-700 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white">
        <h2 className="mb-4 text-lg font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900">
          Cobrar
        </h2>

        <div className="mb-4 flex flex-col gap-1">
          <label className="text-sm text-slate-600 pos-dark:text-slate-300 pos-contrast:text-slate-200 pos-emerald:text-slate-600">
            Cliente
          </label>
          <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Consumidor Final</option>
            {(customersQuery.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-400 pos-dark:text-slate-500 pos-contrast:text-slate-400 pos-emerald:text-slate-400">
            Factura {documentLetter} - {letterSuggestion.reason}
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-1">
          <label className="text-sm text-slate-600 pos-dark:text-slate-300 pos-contrast:text-slate-200 pos-emerald:text-slate-600">
            Cargar cliente por CUIT
          </label>
          <div className="flex gap-2">
            <input
              className={`${inputClass} flex-1`}
              value={cuitInput}
              onChange={(e) => setCuitInput(formatCuitInput(e.target.value))}
              placeholder="30-71659554-9"
            />
            <button
              type="button"
              onClick={() => cuitLookup.mutate()}
              disabled={cuitLookup.isPending || !cuitInput.trim()}
              className="shrink-0 rounded-lg border border-indigo-500 px-3 py-2 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50 pos-dark:text-indigo-400 pos-dark:hover:bg-indigo-950 pos-contrast:border-amber-400 pos-contrast:text-amber-400 pos-contrast:hover:bg-amber-950 pos-emerald:text-emerald-600 pos-emerald:hover:bg-emerald-50"
            >
              {cuitLookup.isPending ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
          {cuitMessage && (
            <p className="text-xs text-slate-600 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-600">
              {cuitMessage}
            </p>
          )}
          {cuitError && (
            <p className="text-xs text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600">
              {cuitError}
            </p>
          )}
          {afipResult && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-xs pos-dark:border-slate-700 pos-contrast:border-slate-700 pos-emerald:border-emerald-200">
              <span>
                {afipResult.name}
                {afipResult.taxCondition ? ` — ${afipResult.taxCondition}` : ''}
              </span>
              <button
                type="button"
                onClick={() => createCustomer.mutate()}
                disabled={createCustomer.isPending}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
              >
                {createCustomer.isPending ? 'Creando...' : 'Usar este cliente'}
              </button>
            </div>
          )}
        </div>

        <div className="mb-2 flex items-center justify-between text-lg font-semibold">
          <span>Total</span>
          <span>${totals.total.toFixed(2)}</span>
        </div>

        <div className="flex flex-col gap-2">
          {payments.map((payment, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <select
                  className={`${inputClass} flex-1`}
                  value={payment.method}
                  onChange={(e) => updatePayment(i, { method: e.target.value })}
                >
                  {POS_PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  className={`${inputClass} w-24`}
                  value={payment.amount}
                  onChange={(e) => updatePayment(i, { amount: e.target.value })}
                />
                {payments.length > 1 && (
                  <button
                    onClick={() => removePayment(i)}
                    className="text-slate-400 hover:text-red-600 pos-dark:text-slate-500 pos-dark:hover:text-red-400 pos-contrast:text-slate-400 pos-contrast:hover:text-red-400 pos-emerald:text-slate-400 pos-emerald:hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
              {payment.method === 'CASH' && (
                <div className="flex items-center gap-2 pl-1">
                  <label className="text-xs text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500">
                    Paga con
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="$"
                    className={`${inputClass} w-24`}
                    value={payment.pagaCon ?? ''}
                    onChange={(e) => updatePayment(i, { pagaCon: e.target.value })}
                  />
                  {rowChange(payment) > 0.004 && (
                    <span className="text-xs font-medium text-blue-600 pos-dark:text-blue-400 pos-contrast:text-blue-400 pos-emerald:text-blue-600">
                      Vuelto: ${rowChange(payment).toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          <button
            onClick={addPaymentRow}
            className="text-left text-xs font-medium text-indigo-600 hover:text-indigo-500 pos-dark:text-indigo-400 pos-dark:hover:text-indigo-300 pos-contrast:text-amber-400 pos-contrast:hover:text-amber-300 pos-emerald:text-emerald-600 pos-emerald:hover:text-emerald-500"
          >
            + Agregar otro método de pago
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400 pos-emerald:text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-800 pos-dark:text-slate-300 pos-dark:hover:text-slate-100 pos-contrast:text-slate-200 pos-contrast:hover:text-white pos-emerald:text-slate-600 pos-emerald:hover:text-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={mutation.isPending || !baseCurrency}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500"
          >
            {mutation.isPending ? 'Confirmando...' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </div>
  );
}
