'use client';

import { PlexoLogo } from '@/components/ui/PlexoLogo';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

const NAV_ENTRIES = [
  { href: '/admin', label: 'Tenants' },
  { href: '/admin/plans', label: 'Planes' },
  { href: '/admin/activity', label: 'Actividad' },
  { href: '/admin/errors', label: 'Errores' },
  { href: '/admin/mercadopago', label: 'Mercado Pago' },
  { href: '/admin/backups', label: 'Backups' },
  { href: '/admin/bna-sync', label: 'Cotizaciones USD' },
  { href: '/admin/price-index-sync', label: 'Índices de Inflación' },
  { href: '/admin/system-status', label: 'Configuración del sistema' },
];

/**
 * Shell propio del backoffice - deliberadamente NO envuelve AppShell (el
 * shell de tenant): esta es una zona de operador de plataforma, no de un
 * tenant en particular, y se ve distinta a propósito (fondo oscuro fijo)
 * para que nunca se confunda con la app normal, sobre todo durante una
 * impersonación activa.
 *
 * El gate real es el backend (PlatformAdminGuard, 403 si el email no está
 * en PLATFORM_ADMIN_EMAILS) - acá sólo se exige que exista una sesión
 * (mismo chequeo que AppShell). Un usuario logueado pero no-admin que entra
 * a mano ve cada página fallar sus fetches con 403 en vez de romper.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <PlexoLogo size={22} colorClassName="text-slate-100" />
            <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-900">
              Admin
            </span>
          </span>
          <nav className="flex items-center gap-4">
            {NAV_ENTRIES.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className={`text-sm transition ${
                  pathname === entry.href
                    ? 'font-medium text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {entry.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link href="/dashboard" className="text-xs text-slate-400 underline hover:text-slate-200">
          Volver a la app
        </Link>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
