'use client';

import AppShell from '@/components/AppShell';
import { PlexoLogo } from '@/components/ui/PlexoLogo';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/** La documentación es pública: quien ya ingresó la ve dentro de la app (con
 * el menú lateral), y quien no, con un encabezado simple para ir a la
 * landing o ingresar. La sesión sólo se conoce en el navegador (el token
 * vive en localStorage), así que el primer render es el público. */
export default function DocsFrame({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    try {
      setLoggedIn(Boolean(localStorage.getItem('token')));
    } catch {
      setLoggedIn(false);
    }
  }, []);

  if (loggedIn) return <AppShell>{children}</AppShell>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Oplex, ir al inicio">
            <PlexoLogo size={26} />
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/" className="hidden px-2 text-muted-foreground hover:text-foreground sm:inline">
              Conocé Oplex
            </Link>
            <Link href="/login" className="rounded-lg border px-3 py-1.5 font-medium hover:bg-muted">
              Ingresar
            </Link>
            <Link href="/signup" className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90">
              Empezá gratis
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-[1400px] px-4 py-6">{children}</div>
    </div>
  );
}
