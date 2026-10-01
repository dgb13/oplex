'use client';

import { posApi, type QrCharge } from '@/lib/pos';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';

interface Props {
  registerId: string;
  /** "Caja 1 · Sucursal Centro" */
  registerLabel: string;
  amount: number;
  /** El pago se acreditó: CheckoutModal confirma la venta con este cobro. */
  onPaid: (charge: QrCharge) => void;
  /** Volver al formulario de Cobrar, ya con el cobro cancelado. */
  onBack: (opts?: { changeMethod?: boolean }) => void;
}

const POLL_MS = 3000;

const secondaryButton =
  'rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 disabled:opacity-50 pos-dark:bg-slate-800 pos-dark:text-slate-100 pos-dark:hover:bg-slate-700 pos-contrast:bg-slate-900 pos-contrast:text-white pos-contrast:hover:bg-slate-800 pos-emerald:bg-emerald-50 pos-emerald:text-slate-800 pos-emerald:hover:bg-emerald-100';
const primaryButton =
  'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 pos-dark:bg-indigo-500 pos-dark:hover:bg-indigo-400 pos-contrast:bg-amber-400 pos-contrast:text-black pos-contrast:hover:bg-amber-300 pos-emerald:bg-emerald-600 pos-emerald:hover:bg-emerald-500';
const mutedText = 'text-slate-500 pos-dark:text-slate-400 pos-contrast:text-slate-300 pos-emerald:text-slate-500';
const titleText = 'text-lg font-semibold text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900';

function apiMessage(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  if (!message) return fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

function formatAmount(n: number): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function mmss(totalSeconds: number): string {
  const s = Math.max(totalSeconds, 0);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Cobro con el QR de Mercado Pago de la caja (mockup aprobado 2026-10-01):
 * crea la orden apenas se abre, muestra el QR con la cuenta regresiva y
 * consulta el estado cada 3 segundos - el backend también le pregunta a MP,
 * así que esto funciona aunque el webhook no llegue.
 */
export default function QrChargePanel({ registerId, registerLabel, amount, onPaid, onBack }: Props) {
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(false);
  const paidNotified = useRef(false);
  const latest = useRef<QrCharge | null>(null);

  const create = useMutation({
    mutationFn: () => posApi.createQrCharge(registerId, amount),
    onSuccess: (charge) => {
      latest.current = charge;
      setChargeId(charge.id);
    },
  });

  const chargeQuery = useQuery({
    queryKey: ['pos-qr-charge', chargeId],
    queryFn: () => posApi.getQrCharge(chargeId as string),
    enabled: Boolean(chargeId),
    initialData: create.data && create.data.id === chargeId ? create.data : undefined,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.status === 'PENDING' && !data.rejected ? POLL_MS : false;
    },
  });
  const charge = chargeQuery.data ?? null;

  const cancel = useMutation({
    mutationFn: (id: string) => posApi.cancelQrCharge(id),
  });

  // Crear la orden una sola vez al abrir (el ref evita la doble creación
  // del doble montaje de React en desarrollo).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    create.mutate();
  }, [create]);

  useEffect(() => {
    latest.current = charge;
    if (charge?.status === 'PAID' && !paidNotified.current) {
      paidNotified.current = true;
      onPaid(charge);
    }
  }, [charge, onPaid]);

  // Si el modal se cierra con el QR esperando, la orden no queda abierta.
  useEffect(() => {
    return () => {
      const current = latest.current;
      if (current && current.status === 'PENDING' && !paidNotified.current) {
        posApi.cancelQrCharge(current.id).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function cancelAndBack(opts?: { changeMethod?: boolean }) {
    const current = latest.current;
    if (current && current.status === 'PENDING') {
      const result = await cancel.mutateAsync(current.id).catch(() => null);
      if (result) {
        latest.current = result;
        if (result.status === 'PAID') {
          // Pagó justo mientras se cancelaba: la venta sigue igual.
          paidNotified.current = true;
          onPaid(result);
          return;
        }
      }
    }
    onBack(opts);
  }

  function retry() {
    paidNotified.current = false;
    setChargeId(null);
    create.mutate();
  }

  if (create.isError) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className={titleText}>No se pudo generar el QR</p>
        <p className={`text-sm ${mutedText}`}>{apiMessage(create.error, 'Mercado Pago no respondió. Probá de nuevo.')}</p>
        <div className="flex justify-center gap-3">
          <button type="button" className={secondaryButton} onClick={() => onBack()}>
            Volver
          </button>
          <button type="button" className={primaryButton} onClick={retry}>
            Probar de nuevo
          </button>
        </div>
      </div>
    );
  }

  const finished = charge && (charge.status === 'EXPIRED' || charge.status === 'CANCELLED' || charge.status === 'ERROR');
  if (charge && (charge.rejected || finished)) {
    const rejected = charge.rejected;
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-red-100 text-2xl font-extrabold text-red-700 pos-dark:bg-red-950 pos-dark:text-red-400 pos-contrast:bg-red-950 pos-contrast:text-red-400">
          !
        </div>
        <p className={titleText}>{rejected ? 'El pago fue rechazado' : 'El QR venció'}</p>
        <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 pos-dark:bg-red-950 pos-dark:text-red-400 pos-contrast:bg-red-950 pos-contrast:text-red-400">
          {rejected ? 'Mercado Pago rechazó el pago' : 'Pasaron 10 minutos sin pago'}
        </span>
        <p className={`max-w-xs text-sm ${mutedText}`}>
          {rejected
            ? 'El cliente puede intentar con otra tarjeta o con saldo. La venta sigue abierta, no se emitió factura.'
            : 'La venta sigue abierta y no se emitió factura. Podés generar un QR nuevo o cobrar con otro medio.'}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <button type="button" className={secondaryButton} onClick={() => void cancelAndBack({ changeMethod: true })}>
            Cambiar medio de pago
          </button>
          <button type="button" className={primaryButton} onClick={retry}>
            Generar QR nuevo
          </button>
        </div>
      </div>
    );
  }

  const secondsLeft = charge?.expiresAt ? Math.round((new Date(charge.expiresAt).getTime() - now) / 1000) : null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className={titleText}>Escaneá con la app de Mercado Pago</h2>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid aspect-square w-52 max-w-full place-items-center rounded-xl border border-slate-200 bg-white p-3 pos-dark:border-slate-700 pos-contrast:border-slate-700">
          {charge?.qrCodeBase64 ? (
            <img src={charge.qrCodeBase64} alt="QR para pagar con Mercado Pago" className="h-full w-full" />
          ) : (
            <span className="text-sm text-slate-500">{create.isPending ? 'Generando QR...' : 'Usá el QR impreso de la caja'}</span>
          )}
        </div>
        <p className="font-mono text-3xl font-semibold tabular-nums text-slate-900 pos-dark:text-slate-100 pos-contrast:text-white pos-emerald:text-slate-900">
          {formatAmount(amount)}
        </p>
        <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 pos-dark:bg-amber-950 pos-dark:text-amber-300 pos-contrast:bg-amber-950 pos-contrast:text-amber-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
          Esperando pago
          {secondsLeft !== null && <span className="font-mono tabular-nums">· {mmss(secondsLeft)}</span>}
        </span>
        <div className={`flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs ${mutedText}`}>
          <span>{registerLabel}</span>
          <span>También sirve el QR impreso de la caja</span>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          className={secondaryButton}
          disabled={cancel.isPending}
          onClick={() => void cancelAndBack()}
        >
          {cancel.isPending ? 'Cancelando...' : 'Cancelar cobro'}
        </button>
      </div>
    </div>
  );
}
