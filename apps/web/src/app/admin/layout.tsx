'use client';

import { PlexoLogo } from '@/components/ui/PlexoLogo';
import { decodeToken } from '@/lib/jwt';
import {
  Activity,
  ArrowLeft,
  Bot,
  Building2,
  ChartLine,
  CircleAlert,
  CreditCard,
  Database,
  DollarSign,
  Landmark,
  Menu,
  Repeat,
  ScanLine,
  Server,
  Settings,
  TrendingUp,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAdminNavStatus } from './AdminNavStatus';

interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_GROUPS: Array<{ label: string; entries: NavEntry[] }> = [
  {
    label: 'Negocio',
    entries: [
      { href: '/admin', label: 'Tenants', icon: Building2 },
      { href: '/admin/plans', label: 'Planes', icon: CreditCard },
      { href: '/admin/subscriptions', label: 'Suscripciones', icon: Repeat },
      { href: '/admin/visits', label: 'Visitas', icon: ChartLine },
    ],
  },
  {
    label: 'Operación',
    entries: [
      { href: '/admin/activity', label: 'Actividad', icon: Activity },
      { href: '/admin/errors', label: 'Errores', icon: CircleAlert },
      { href: '/admin/backups', label: 'Backups', icon: Database },
      { href: '/admin/server', label: 'Servidor', icon: Server },
      { href: '/admin/system-status', label: 'Configuración del sistema', icon: Settings },
    ],
  },
  {
    label: 'Integraciones',
    entries: [
      { href: '/admin/mercadopago', label: 'Mercado Pago', icon: Landmark },
      { href: '/admin/bna-sync', label: 'Cotizaciones USD', icon: DollarSign },
      { href: '/admin/price-index-sync', label: 'Índices de Inflación', icon: TrendingUp },
      { href: '/admin/ai-invoice-scan', label: 'Escaneo IA', icon: ScanLine },
      { href: '/admin/assistant', label: 'Asistente de IA', icon: Bot },
      { href: '/admin/membership-settings', label: 'Sesión de contadores', icon: UserCheck },
    ],
  },
];

const CHIP_CLASS = {
  ok: 'bg-green-900/50 text-green-300',
  warn: 'bg-amber-900/50 text-amber-300',
  bad: 'bg-red-900/50 text-red-300',
} as const;

// /admin es Tenants; el resto marca su sección también en sub-páginas.
function isActive(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

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
 *
 * Navegación: barra lateral agrupada (Negocio / Operación / Integraciones)
 * con un estado al lado de las pantallas que lo tienen (ver
 * useAdminNavStatus) - boceto aprobado, opción B. En el celular la barra se
 * abre con el botón "Menú".
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const chips = useAdminNavStatus();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/login');
      return;
    }
    setEmail(decodeToken(token)?.email ?? null);
  }, [router]);

  // Al navegar en el celular, la barra se cierra sola.
  useEffect(() => setMobileOpen(false), [pathname]);

  const currentGroup = NAV_GROUPS.find((g) => g.entries.some((e) => isActive(pathname, e.href)));
  const currentEntry = currentGroup?.entries.find((e) => isActive(pathname, e.href));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 md:grid md:grid-cols-[236px_minmax(0,1fr)]">
      <aside
        // Celular: con el menú abierto, la barra tapa el contenido debajo del
        // encabezado (top-14 = alto del encabezado), sin empujarlo.
        className={`border-slate-800 bg-slate-950 px-2.5 py-3.5 md:sticky md:inset-auto md:top-0 md:z-auto md:flex md:h-screen md:flex-col md:gap-3.5 md:overflow-y-auto md:border-r ${
          mobileOpen ? 'fixed inset-x-0 bottom-0 top-14 z-30 flex flex-col gap-3.5 overflow-y-auto' : 'hidden'
        }`}
      >
        <span className="hidden items-center gap-2 px-2 pb-1.5 md:flex">
          <PlexoLogo size={22} colorClassName="text-white" />
          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-900">
            Admin
          </span>
        </span>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <h3 className="mb-1 px-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{group.label}</h3>
            {group.entries.map((entry) => {
              const active = isActive(pathname, entry.href);
              const chip = chips[entry.href];
              const Icon = entry.icon;
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition ${
                    active ? 'bg-indigo-500/15 font-semibold text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 leading-tight">{entry.label}</span>
                  {chip && (
                    <span className={`ml-auto shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold ${CHIP_CLASS[chip.tone]}`}>
                      {chip.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
        <Link
          href="/dashboard"
          className="mt-auto flex items-center gap-2 px-2 py-2 text-xs text-slate-400 underline hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Volver a la app
        </Link>
      </aside>

      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 md:hidden"
            >
              {mobileOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
              Menú
            </button>
            <span className="md:hidden">
              <PlexoLogo size={20} colorClassName="text-white" />
            </span>
            {currentGroup && currentEntry && (
              <span className="truncate text-[13px] text-slate-500">
                {currentGroup.label} › <b className="font-medium text-slate-200">{currentEntry.label}</b>
              </span>
            )}
          </div>
          {email && <span className="hidden truncate text-xs text-slate-500 sm:inline">{email}</span>}
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
