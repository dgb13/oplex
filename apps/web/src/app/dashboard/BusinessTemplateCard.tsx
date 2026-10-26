'use client';

import { businessProfileApi } from '@/lib/businessModules';
import { profileApi } from '@/lib/profile';
import { useQuery } from '@tanstack/react-query';
import { Store, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'oplex-business-template-card-dismissed';

/** Para los negocios que ya existían antes de los rubros: invitación
 * opcional a elegir el suyo. No se les cambia nada solo (decisión del
 * usuario, plan-rubros-fichas-ordenes-trabajo.md). */
export default function BusinessTemplateCard() {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
    } catch {
      setDismissed(false);
    }
  }, []);

  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const { data: business } = useQuery({ queryKey: ['business-profile'], queryFn: businessProfileApi.get });
  const canChoose = profile?.role === 'OWNER' || profile?.role === 'ADMIN';

  if (dismissed || !canChoose || !business || business.template || business.pending) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Sin localStorage la tarjeta vuelve a aparecer; no es grave.
    }
    setDismissed(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-card">
        <Store className="h-5 w-5 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-[1_1_260px]">
        <p className="text-sm font-semibold">¿A qué se dedica tu negocio?</p>
        <p className="text-sm text-muted-foreground">
          Elegí tu rubro y te sumamos lo que necesita. No se apaga nada de lo que ya usás.
        </p>
      </div>
      <Link
        href="/settings/modules"
        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
      >
        Elegir rubro
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Ocultar"
        className="rounded-md p-1 text-muted-foreground transition hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
