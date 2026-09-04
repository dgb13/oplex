'use client';

import { endMembershipSession, isMembershipSession, membershipClientName } from '@/lib/membership-session';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Montado en AppShell junto a ImpersonationBanner, con color propio
 * (indigo, no rojo) - a diferencia de una impersonación, esto es la
 * identidad REAL del contador operando con alcance acotado en un cliente de
 * su cartera (ver docs/plan_modulo_contadores.txt, punto 2), no un usuario
 * prestado. Visible mientras exista `membershipHomeToken` en localStorage.
 *
 * El estado arranca en `false`/`null` (igual que el server, que no tiene
 * localStorage) y recién se lee en un useEffect - leerlo directo en el
 * useState inicial produce un mismatch de hidratación real en cada carga de
 * página completa mientras la sesión de membership está activa (server
 * renderiza null, cliente renderiza el banner). */
export default function MembershipSessionBanner() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [clientName, setClientName] = useState<string | null>(null);

  useEffect(() => {
    setActive(isMembershipSession());
    setClientName(membershipClientName());
  }, []);

  if (!active) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-indigo-700 px-4 py-2 text-center text-xs font-semibold text-white">
      <span>
        📋 Estás operando en {clientName ? <span className="underline">{clientName}</span> : 'un cliente de tu cartera'} como
        contador externo — queda auditado con tu propia identidad.
      </span>
      <button
        onClick={() => endMembershipSession(queryClient, router)}
        className="rounded bg-white/20 px-2 py-0.5 transition hover:bg-white/30"
      >
        Volver a mi cartera
      </button>
    </div>
  );
}
