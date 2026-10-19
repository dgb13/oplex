'use client';

import { assistantActionsApi, type AssistantActionCard as Card, type AssistantActionReply, type AssistantActionStatus } from '@/lib/assistant';
import type { AxiosError } from 'axios';
import { useState } from 'react';

const STATUS: Record<AssistantActionStatus, { label: string; className: string }> = {
  PENDING_CONFIRMATION: { label: 'Esperando tu confirmación', className: 'text-amber-700 dark:text-amber-400' },
  DONE: { label: 'Hecho', className: 'text-emerald-700 dark:text-emerald-400' },
  EXPIRED: { label: 'Venció sin confirmar', className: 'text-slate-500 dark:text-slate-400' },
  CANCELLED: { label: 'Cancelado', className: 'text-slate-500 dark:text-slate-400' },
  UNDONE: { label: 'Deshecho', className: 'text-slate-500 dark:text-slate-400' },
  FAILED: { label: 'No se pudo hacer', className: 'text-red-700 dark:text-red-400' },
};

/** Tarjeta de una acción que propuso el asistente (etapa 3 de
 * docs/planesdemodulos/plan-asistente-fase2-gestion-acciones.md). Los botones
 * sólo aparecen mientras espera el "SÍ"; el resultado lo decide el servidor,
 * que vuelve a validar todo al confirmar. */
export default function AssistantActionCard({
  card,
  onResolved,
}: {
  card: Card;
  onResolved: (result: AssistantActionReply) => void;
}) {
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState('');
  const expired = card.status === 'PENDING_CONFIRMATION' && card.expiresAt !== null && new Date(card.expiresAt) < new Date();
  const status = STATUS[expired ? 'EXPIRED' : card.status];
  const pending = card.status === 'PENDING_CONFIRMATION' && !expired;

  async function act(kind: 'confirm' | 'cancel') {
    setBusy(kind);
    setError('');
    try {
      onResolved(await (kind === 'confirm' ? assistantActionsApi.confirm(card.id) : assistantActionsApi.cancel(card.id)));
    } catch (err) {
      const message = (err as AxiosError<{ message?: string }>).response?.data?.message;
      setError(typeof message === 'string' ? message : 'No se pudo completar. Probá de nuevo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="w-full max-w-[85%] rounded-xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{card.label}</p>
      <p className="mt-1 text-slate-800 dark:text-slate-200">{card.summary}</p>
      <p className={`mt-1 text-xs font-medium ${status.className}`}>{status.label}</p>
      {pending && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => void act('confirm')}
            disabled={busy !== null}
            className="min-h-[36px] rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy === 'confirm' ? 'Confirmando…' : 'Confirmar'}
          </button>
          <button
            type="button"
            onClick={() => void act('cancel')}
            disabled={busy !== null}
            className="min-h-[36px] rounded-lg border border-slate-300 px-3 text-sm transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p>}
    </div>
  );
}
