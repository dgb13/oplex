'use client';

import { invoicingApi } from '@/lib/invoicing';
import { formatPaidAt, posApi, type UnclaimedQrCharge } from '@/lib/pos';
import { useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState, type ReactNode } from 'react';

interface Props {
  charges: UnclaimedQrCharge[];
  /** Se abrió desde "Cerrar turno": el turno no se puede cerrar hasta
   * resolverlos (PosService.closeSession lo exige). */
  closingShift: boolean;
  onClose: () => void;
  /** Una venta se confirmó: refrescar el aviso y el arqueo. */
  onResolved: () => void;
}

const secondaryButton =
  'rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-50 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-dark:hover:bg-slate-700 pos-contrast:bg-slate-900 pos-contrast:text-white pos-contrast:hover:bg-slate-800 pos-emerald:bg-emerald-50 pos-emerald:text-slate-800 pos-emerald:hover:bg-emerald-100';
const primaryButton =
  'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500';
const ghostButton =
  'rounded-lg px-4 py-2 text-sm text-slate-600 transition hover:text-slate-800 pos-dark:text-slate-300 pos-dark:hover:text-slate-100 pos-contrast:text-slate-200 pos-contrast:hover:text-white pos-emerald:text-slate-600 pos-emerald:hover:text-slate-800';
const mutedText = 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500';
const titleText = 'text-lg font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900';
const panel =
  'rounded-lg bg-slate-100 px-3 py-2 text-sm pos-dark:bg-slate-800 pos-contrast:bg-slate-900 pos-emerald:bg-emerald-50';
const paidPill =
  'inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 pos-dark:bg-green-950 pos-dark:text-green-300 pos-contrast:bg-green-950 pos-contrast:text-green-300';
const warnBox =
  'rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 pos-dark:bg-amber-950 pos-dark:text-amber-300 pos-contrast:bg-amber-950 pos-contrast:text-amber-300 pos-emerald:bg-amber-50 pos-emerald:text-amber-800';

function apiMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

function formatAmount(value: string | number): string {
  return `$${Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortOperation(id: string | null): string | null {
  return id ? (id.length > 12 ? `${id.slice(0, 12)}…` : id) : null;
}

function SaleLines({ sale }: { sale: NonNullable<UnclaimedQrCharge['sale']> }) {
  return (
    <div className={`${panel} flex flex-col gap-1`}>
      <span className={`text-xs ${mutedText}`}>
        {sale.customerName} · Factura {sale.documentLetter}
      </span>
      {sale.lines.map((line, i) => (
        <div key={i} className="flex justify-between gap-3">
          <span>
            {line.quantity} × {line.articleName}
          </span>
          {line.unitPrice !== null && <span>{formatAmount(line.unitPrice * line.quantity)}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * "Cobros con QR sin venta" (mockup aprobado 2026-10-01, sin "Devolver el
 * dinero" por decisión del usuario - queda para después): cobros QR que se
 * acreditaron y no llegaron a ser venta. Los que tienen la venta guardada se
 * confirman acá; los viejos se usan desde el formulario de Cobrar.
 */
export default function UnclaimedQrChargesModal({ charges, closingShift, onClose, onResolved }: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [done, setDone] = useState<{ charge: UnclaimedQrCharge; invoice: { id: string; documentLetter: string; number: string } } | null>(
    null,
  );

  const confirm = useMutation({
    mutationFn: (charge: UnclaimedQrCharge) => posApi.confirmQrSale(charge.id),
    onSuccess: (invoice, charge) => {
      setConfirmingId(null);
      setDone({ charge, invoice });
      onResolved();
    },
  });

  const confirming = charges.find((c) => c.id === confirmingId) ?? null;

  let body: ReactNode;
  if (done) {
    body = (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-lg font-semibold text-green-700 pos-dark:text-green-400 pos-contrast:text-green-400 pos-emerald:text-green-700">
          Venta confirmada
        </p>
        <p className={paidPill}>
          Mercado Pago · pago acreditado
          {done.charge.externalPaymentId ? ` · operación #${done.charge.externalPaymentId}` : ''}
        </p>
        <p className={`text-sm ${mutedText}`}>
          {done.invoice.documentLetter}-{done.invoice.number}
        </p>
        <div className="flex gap-3">
          <button type="button" className={secondaryButton} onClick={() => invoicingApi.openPdf(done.invoice.id, 'TICKET')}>
            Imprimir ticket
          </button>
          <button type="button" className={primaryButton} onClick={() => (charges.length > 0 ? setDone(null) : onClose())}>
            {charges.length > 0 ? 'Ver los demás' : 'Listo'}
          </button>
        </div>
      </div>
    );
  } else if (confirming?.sale) {
    const sale = confirming.sale;
    body = (
      <div className="flex flex-col gap-3">
        <p className={titleText}>Confirmar venta</p>
        <SaleLines sale={sale} />
        <div className="flex justify-between border-y border-slate-200 py-2 text-base font-semibold pos-dark:border-slate-700 pos-contrast:border-slate-700 pos-emerald:border-emerald-100">
          <span>Total</span>
          <span>{formatAmount(confirming.amount)}</span>
        </div>
        <p className={`${paidPill} self-start`}>
          Pagado con Mercado Pago
          {confirming.externalPaymentId ? ` · operación #${shortOperation(confirming.externalPaymentId)}` : ''}
        </p>
        {confirm.isError ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-red-600 pos-dark:text-red-400 pos-contrast:text-red-400">
              {apiMessage(confirm.error, 'No se pudo confirmar la venta')}
            </p>
            <p className={`text-xs ${mutedText}`}>
              El cobro sigue acreditado y pendiente: no se emitió factura ni se le vuelve a cobrar al cliente. Resolvé
              el problema y reintentá.
            </p>
          </div>
        ) : (
          <p className={`text-xs ${mutedText}`}>
            Se emite la factura con CAE y se descuenta el stock. No se le cobra de nuevo al cliente.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className={ghostButton}
            disabled={confirm.isPending}
            onClick={() => {
              confirm.reset();
              setConfirmingId(null);
            }}
          >
            Volver
          </button>
          <button type="button" className={primaryButton} disabled={confirm.isPending} onClick={() => confirm.mutate(confirming)}>
            {confirm.isPending ? 'Confirmando...' : confirm.isError ? 'Reintentar' : 'Confirmar venta'}
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <p className={titleText}>{closingShift ? 'Antes de cerrar el turno' : 'Cobros con QR sin venta'}</p>
        {closingShift ? (
          <p className={warnBox}>
            {charges.length === 1
              ? 'Hay un cobro con QR acreditado sin venta. El cliente pagó y no hay factura: confirmá la venta antes de cerrar el turno.'
              : `Hay ${charges.length} cobros con QR acreditados sin venta. Los clientes pagaron y no hay factura: confirmá las ventas antes de cerrar el turno.`}
          </p>
        ) : (
          <p className={`text-sm ${mutedText}`}>El cliente ya pagó. Confirmá la venta para emitir la factura.</p>
        )}
        <div className="flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
          {charges.map((charge) => (
            <div
              key={charge.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 pos-dark:border-slate-700 pos-contrast:border-slate-700 pos-emerald:border-emerald-100"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xl font-semibold">{formatAmount(charge.amount)}</span>
                <span className={paidPill}>Pago acreditado</span>
              </div>
              <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${mutedText}`}>
                {charge.paidAt && <span>Pagado {formatPaidAt(charge.paidAt)}</span>}
                {charge.externalPaymentId && <span>Operación #{shortOperation(charge.externalPaymentId)}</span>}
                {charge.createdByName && <span>QR generado por {charge.createdByName}</span>}
              </div>
              {charge.sale ? (
                <>
                  <SaleLines sale={charge.sale} />
                  <div className="flex justify-end">
                    <button type="button" className={primaryButton} onClick={() => setConfirmingId(charge.id)}>
                      Confirmar venta
                    </button>
                  </div>
                </>
              ) : (
                <p className={warnBox}>
                  Este cobro no tiene la venta guardada. Cargá los artículos en la Caja y, al cobrar con Mercado Pago,
                  elegí <b>Usar el cobro ya acreditado</b>.
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button type="button" className={ghostButton} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl pos-dark:border-slate-700 pos-dark:bg-slate-900 pos-contrast:border-slate-700 pos-contrast:bg-black pos-emerald:border-emerald-100 pos-emerald:bg-white"
      >
        {body}
      </div>
    </div>
  );
}
