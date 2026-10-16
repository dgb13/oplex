'use client';

import { subscriptionsApi } from '@/lib/subscriptions';
import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cloneElement, isValidElement, useEffect, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';

export const READ_ONLY_TITLE = 'Tu cuenta está en sólo lectura';

/** Cuenta vencida o dada de baja: se puede ver todo pero no cargar nada
 * (la API lo frena igual, ver SubscriptionReadOnlyGuard). Mismo queryKey que
 * TrialBanner, así no suma pedidos. */
export function useReadOnly(): boolean {
  const { data } = useQuery({ queryKey: ['subscription-me'], queryFn: subscriptionsApi.getCurrent });
  return data?.status === 'EXPIRED' || data?.status === 'CANCELLED';
}

/**
 * Pone el candado en un botón de carga ("Nueva factura", "Nuevo artículo"…)
 * cuando la cuenta está en sólo lectura: lo deshabilita, le antepone el
 * candado y deja el motivo en el tooltip. Con la cuenta activa devuelve el
 * botón tal cual.
 */
export function ReadOnlyLock({ children }: { children: ReactElement<{ disabled?: boolean; className?: string; children?: ReactNode }> }) {
  const readOnly = useReadOnly();
  if (!readOnly || !isValidElement(children)) return children;
  return (
    <span title={READ_ONLY_TITLE} className="inline-flex cursor-not-allowed">
      {cloneElement(children, {
        disabled: true,
        'aria-disabled': true,
        className: `${children.props.className ?? ''} pointer-events-none opacity-60`,
        children: (
          <>
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {children.props.children}
          </>
        ),
      } as Record<string, unknown>)}
    </span>
  );
}

/** Evento que dispara lib/api.ts cuando la API responde que la cuenta está
 * en sólo lectura (código SUBSCRIPTION_READ_ONLY). */
export const READ_ONLY_EVENT = 'oplex:read-only';

/** Aviso flotante "Tu cuenta está en sólo lectura" con "Ver planes", una
 * sola vez aunque fallen varias cargas seguidas. Va en AppShell. */
export function ReadOnlyNotice() {
  const router = useRouter();
  useEffect(() => {
    function show() {
      toast.custom(
        (id) => (
          <div role="status" className="flex w-[380px] max-w-full flex-col gap-2.5 rounded-xl bg-[#1b1530] p-4 text-white shadow-xl">
            <strong className="text-sm">Tu cuenta está en sólo lectura</strong>
            <span className="text-[13px] leading-snug text-[#d9d6e6]">
              Para volver a cargar, elegí un plan. Si pagás ahora, se reactiva en el momento y no perdés nada de lo cargado.
            </span>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(id);
                router.push('/settings/billing');
              }}
              className="self-start rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-[#1b1530] hover:bg-white/90"
            >
              Ver planes
            </button>
          </div>
        ),
        { id: 'read-only', duration: 8000 },
      );
    }
    window.addEventListener(READ_ONLY_EVENT, show);
    return () => window.removeEventListener(READ_ONLY_EVENT, show);
  }, [router]);
  return null;
}
