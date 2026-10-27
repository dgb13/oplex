'use client';

import type { TenantSettings } from '@/lib/tenantSettings';
import Link from 'next/link';

const DATE = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const SOON_MS = 30 * 86_400_000;

export type ArcaCertState =
  | { kind: 'ok'; expiresAt: Date | null }
  | { kind: 'soon'; expiresAt: Date }
  | { kind: 'expired'; expiresAt: Date }
  | { kind: 'missing' };

/** Estado del certificado ARCA de la empresa para emitir: ok, vence en menos
 * de 30 días (avisa sin bloquear), vencido o sin cargar (bloquean). */
export function arcaCertState(settings: TenantSettings | undefined): ArcaCertState {
  if (!settings?.afipConfigured) return { kind: 'missing' };
  if (!settings.afipCertExpiresAt) return { kind: 'ok', expiresAt: null };
  const expiresAt = new Date(settings.afipCertExpiresAt);
  const left = expiresAt.getTime() - Date.now();
  if (left <= 0) return { kind: 'expired', expiresAt };
  if (left < SOON_MS) return { kind: 'soon', expiresAt };
  return { kind: 'ok', expiresAt };
}

export const canIssueWith = (state: ArcaCertState) => state.kind === 'ok' || state.kind === 'soon';

/** Punto de color del encabezado de Nueva factura (mockup aprobado el 2026-10-15). */
export function ArcaCertPill({ state }: { state: ArcaCertState }) {
  const tone =
    state.kind === 'ok'
      ? { dot: 'bg-emerald-500 ring-emerald-500/20', border: '' }
      : state.kind === 'soon'
        ? { dot: 'bg-amber-500 ring-amber-500/20', border: '' }
        : { dot: 'bg-red-500 ring-red-500/20', border: 'border-red-500/40' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] text-muted-foreground ${tone.border}`}>
      <i className={`inline-block h-[9px] w-[9px] rounded-full ring-[3px] ${tone.dot}`} aria-hidden />
      {canIssueWith(state) ? (
        <>
          <b className="font-semibold text-foreground">ARCA conectado</b>
          {'expiresAt' in state && state.expiresAt && (
            <span>
              (certificado vence {DATE.format(state.expiresAt)}
              {state.kind === 'soon' ? ' · renovalo pronto' : ''})
            </span>
          )}
        </>
      ) : (
        <b className="font-semibold text-foreground">ARCA sin conectar</b>
      )}
    </span>
  );
}

/** Aviso rojo, estilo notificación, cuando no se puede emitir. */
export function ArcaCertAlert({ state }: { state: ArcaCertState }) {
  if (canIssueWith(state)) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-[10px] border border-red-500/35 bg-red-50 px-3.5 py-3 text-[13px] leading-normal text-red-700 dark:bg-red-950/40 dark:text-red-400"
    >
      <span aria-hidden>✕</span>
      <span>
        <b className="text-foreground">No podés emitir facturas todavía:</b>{' '}
        {state.kind === 'expired'
          ? `el certificado de ARCA venció el ${DATE.format(state.expiresAt)}.`
          : 'falta el certificado de ARCA de tu empresa.'}{' '}
        <Link href="/arca" className="font-bold underline underline-offset-2">
          Ir a Conexión con ARCA →
        </Link>
      </span>
    </div>
  );
}
