'use client';

import { Button } from '@/components/ui/button';
import { legalApi } from '@/lib/legal';
import { profileApi } from '@/lib/profile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

/**
 * Pide aceptar el contrato de uso a quien no aceptó la versión vigente:
 * usuarios de antes de que existiera, invitados, altas por Google/Microsoft
 * y todos cuando cambia la versión. Bloquea la app hasta aceptar; la
 * aceptación queda registrada (usuario, fecha, versión, IP) en el servidor.
 */
export function TermsGate() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });
  const [checked, setChecked] = useState(false);
  const accept = useMutation({
    mutationFn: legalApi.accept,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['profile-me'] }),
  });

  if (!profile || profile.acceptedTermsVersion === profile.currentTermsVersion) {
    return null;
  }
  const isUpdate = !!profile.acceptedTermsVersion;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="terms-title">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl">
        <h2 id="terms-title" className="text-lg font-semibold">
          {isUpdate ? 'Actualizamos el contrato de uso' : 'Contrato de uso de Oplex'}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isUpdate
            ? 'Para seguir usando Oplex, revisá y aceptá la nueva versión.'
            : 'Para usar Oplex necesitamos que leas y aceptes estos documentos.'}
        </p>
        <ul className="mt-4 flex flex-col gap-1.5 text-sm">
          <li>
            <Link href="/legal/terminos" target="_blank" className="text-primary underline">
              Términos y Condiciones
            </Link>
          </li>
          <li>
            <Link href="/legal/privacidad" target="_blank" className="text-primary underline">
              Política de Privacidad
            </Link>
          </li>
          <li>
            <Link href="/legal/tratamiento-de-datos" target="_blank" className="text-primary underline">
              Acuerdo de Tratamiento de Datos
            </Link>
          </li>
        </ul>
        <label className="mt-5 flex items-start gap-2 text-sm" htmlFor="terms-accept">
          <input id="terms-accept" type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          Leí y acepto los Términos y Condiciones, la Política de Privacidad y el Acuerdo de Tratamiento de Datos (versión {profile.currentTermsVersion}).
        </label>
        {accept.isError && <p className="mt-2 text-sm text-destructive">No pudimos registrar la aceptación. Probá de nuevo.</p>}
        <Button className="mt-5 w-full" disabled={!checked || accept.isPending} onClick={() => accept.mutate()}>
          {accept.isPending ? 'Guardando...' : 'Aceptar y continuar'}
        </Button>
      </div>
    </div>
  );
}
