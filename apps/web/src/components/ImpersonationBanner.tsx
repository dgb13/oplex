'use client';

import { endImpersonation, impersonatedEmail } from '@/lib/impersonation';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Mounted in AppShell alongside TrialBanner, but visually louder (red, not
 * indigo) and rendered first - impersonation is an active platform-operator
 * action on someone else's data, it should never be mistaken for a routine
 * trial notice. Stays visible for as long as `adminToken` exists in
 * localStorage (see lib/impersonation.ts), which is exactly as long as an
 * impersonation session is active.
 *
 * The state starts at `null` (matching the server, which has no
 * localStorage) and is only read in a useEffect - reading it directly in
 * the initial useState causes a real hydration mismatch on every full page
 * load while impersonating (server renders null, client renders the
 * banner). Same fix as MembershipSessionBanner, found while testing that
 * component's identical pattern. */
export default function ImpersonationBanner() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setEmail(impersonatedEmail());
  }, []);

  if (!email) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-red-600 px-4 py-2 text-center text-xs font-semibold text-white">
      <span>
        ⚠ Estás impersonando a <span className="underline">{email}</span> — todo lo que hagas queda a nombre de
        este usuario.
      </span>
      <button
        onClick={() => endImpersonation(queryClient, router)}
        className="rounded bg-white/20 px-2 py-0.5 transition hover:bg-white/30"
      >
        Salir
      </button>
    </div>
  );
}
