'use client';

import { adminConstanciaLinkApi, type ConstanciaLinkStatus, type SystemStatusItem } from '@/lib/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

const DATE_TIME = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const btn =
  'shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

const PILL: Record<NonNullable<ConstanciaLinkStatus['status']> | 'NONE', { label: string; pill: string; dot: string; box: string }> = {
  OK: { label: 'Responde', pill: 'bg-green-900/50 text-green-300', dot: 'bg-green-500', box: 'border-green-900/60 bg-green-950/30 text-green-300' },
  CHANGED: { label: 'Cambió', pill: 'bg-amber-900/50 text-amber-300', dot: 'bg-amber-500', box: 'border-amber-900/60 bg-amber-950/30 text-amber-300' },
  DOWN: { label: 'No responde', pill: 'bg-red-900/50 text-red-300', dot: 'bg-red-500', box: 'border-red-900/60 bg-red-950/30 text-red-300' },
  NONE: { label: 'Sin verificar', pill: 'bg-slate-800 text-slate-300', dot: 'bg-green-500', box: 'border-slate-800 bg-slate-900 text-slate-300' },
};

function apiError(err: unknown, fallback: string): string {
  const message = (err as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  return Array.isArray(message) ? message.join(', ') : (message ?? fallback);
}

/**
 * Enlace del botón "Abrir la consulta en ARCA" (Conexión con ARCA → paso 1),
 * mockup aprobado el 2026-10-15. Se puede cambiar si ARCA lo mueve, y
 * "Verificar enlace" abre la página desde el servidor (también se verifica
 * solo, una vez por día).
 */
export function ConstanciaLinkRow({ item }: { item: SystemStatusItem }) {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({ queryKey: ['admin-constancia-link'], queryFn: adminConstanciaLinkApi.getStatus });
  const [draft, setDraft] = useState<string | null>(null);
  const url = draft ?? status?.url ?? '';

  const onDone = (next: ConstanciaLinkStatus) => {
    queryClient.setQueryData(['admin-constancia-link'], next);
    queryClient.invalidateQueries({ queryKey: ['admin-system-status'] });
    setDraft(null);
  };
  const verify = useMutation({ mutationFn: adminConstanciaLinkApi.verify, onSuccess: onDone });
  const saveUrl = useMutation({ mutationFn: () => adminConstanciaLinkApi.setUrl(url), onSuccess: onDone });
  const busy = verify.isPending || saveUrl.isPending;

  const look = PILL[status?.status ?? 'NONE'];
  const subtitle = status?.checkedAt
    ? `El botón "Abrir la consulta en ARCA" del paso 1 lleva acá. Última verificación ${status.status === 'OK' ? 'OK' : 'con problemas'}: ${DATE_TIME.format(new Date(status.checkedAt))}`
    : 'El botón "Abrir la consulta en ARCA" del paso 1 lleva acá. Todavía sin verificar.';
  const mutationError = verify.error ?? saveUrl.error;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${look.dot}`} aria-hidden />
        <span className="text-sm font-medium text-slate-200">{item.label}</span>
        <span className="min-w-[220px] flex-1 text-xs text-slate-400">{subtitle}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${look.pill}`}>{look.label}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Enlace de la consulta de constancia"
          className="min-w-[240px] flex-1 rounded-[9px] border border-slate-700 bg-[#0b1222] px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-slate-500"
        />
        <button type="button" className={btn} disabled={busy} onClick={() => verify.mutate()}>
          {verify.isPending ? 'Verificando...' : 'Verificar enlace'}
        </button>
        <button type="button" className={btn} disabled={busy || draft === null || draft.trim() === status?.url} onClick={() => saveUrl.mutate()}>
          {saveUrl.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
      {status?.message && (
        <div className={`rounded-[9px] border px-2.5 py-2 text-xs leading-normal ${look.box}`}>
          {status.status === 'OK' ? '✓ ' : '✕ '}
          {status.message}
        </div>
      )}
      {mutationError && <p className="text-xs text-red-300">✕ {apiError(mutationError, 'No se pudo completar la acción.')}</p>}
      <p className="text-xs leading-normal text-slate-400">
        &quot;Verificar&quot; abre el enlace desde el servidor y controla dos cosas: que responda y que la página siga siendo la consulta
        de constancia. Si ARCA lo cambia, el resultado pasa a <b className="text-slate-200">&quot;Cambió&quot;</b> o{' '}
        <b className="text-slate-200">&quot;No responde&quot;</b> y la fila se pone en amarillo o rojo, igual que el resto de las
        integraciones. Se verifica también solo, una vez por día.
      </p>
    </div>
  );
}
