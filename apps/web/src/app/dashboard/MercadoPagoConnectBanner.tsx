'use client';

import { MERCADOPAGO_NEEDS_RECONNECT, mercadoPagoApi } from '@/lib/mercadopago';
import { profileApi } from '@/lib/profile';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isOwnerOrAdmin } from '@/lib/team';

type Kind = 'connect' | 'reconnect';

// Ocultarlo es una comodidad de cada navegador (por eso localStorage); la
// clave lleva el tipo de aviso, así haber ocultado "Conectá" no esconde
// después "La conexión venció".
function dismissKey(kind: Kind): string {
  return `oplex.mercadopagoBanner.dismissed.${kind}`;
}

/** Aviso del Tablero para Dueño/Admin mientras Mercado Pago no está
 * conectado o venció (plan-seccion-mercadopago.md, etapa 1). */
export default function MercadoPagoConnectBanner() {
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const canManage = isOwnerOrAdmin(profile?.roles);
  const { data: status } = useQuery({
    queryKey: ['mercadopago-status'],
    queryFn: mercadoPagoApi.getStatus,
    enabled: canManage,
  });

  const kind: Kind | null = !status
    ? null
    : MERCADOPAGO_NEEDS_RECONNECT.includes(status.status)
      ? 'reconnect'
      : status.status === 'CONNECTED'
        ? null
        : 'connect';

  // Leído en un effect: localStorage no existe en el render del servidor.
  // Arranca oculto para no mostrarlo y sacarlo en el primer render.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    if (!kind) return;
    try {
      setDismissed(localStorage.getItem(dismissKey(kind)) === '1');
    } catch {
      setDismissed(false);
    }
  }, [kind]);

  if (!canManage || !kind || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      if (kind) localStorage.setItem(dismissKey(kind), '1');
    } catch {
      // Sin almacenamiento (ventana privada): se oculta sólo hasta recargar.
    }
  }

  const copy =
    kind === 'connect'
      ? { title: 'Cobrá con QR y links de pago', detail: 'Conectá Mercado Pago en un minuto.', action: 'Conectar' }
      : {
          title: 'La conexión con Mercado Pago venció',
          detail: 'Reconectala para seguir cobrando con QR y links.',
          action: 'Reconectar',
        };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <b className="text-sm">{copy.title}</b>
        <span className="text-sm text-muted-foreground">{copy.detail}</span>
      </div>
      <div className="flex items-center gap-1">
        <Link
          href="/mercadopago"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          {copy.action}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Ocultar aviso"
          className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
