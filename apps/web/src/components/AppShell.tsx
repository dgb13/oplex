'use client';

import { initials, profileApi } from '@/lib/profile';
import { PlexoLogo } from '@/components/ui/PlexoLogo';
import AssistantWidget from './AssistantWidget';
import CartButton from './CartButton';
import ImpersonationBanner from './ImpersonationBanner';
import MembershipSessionBanner from './MembershipSessionBanner';
import TrialBanner from './TrialBanner';
import { disconnectSocket, getSocket } from '@/lib/socket';
import { useDensity } from '@/providers/DensityProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  Calculator,
  ChevronDown,
  LayoutDashboard,
  PanelLeft,
  Package,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface NavLink {
  href: string;
  label: string;
}

interface NavLeaf extends NavLink {
  kind: 'link';
  icon: LucideIcon;
}

interface NavGroup {
  kind: 'group';
  label: string;
  icon: LucideIcon;
  items: NavLink[];
}

type NavEntry = NavLeaf | NavGroup;

const NAV_ENTRIES: NavEntry[] = [
  { kind: 'link', href: '/dashboard', label: 'Tablero', icon: LayoutDashboard },
  { kind: 'link', href: '/inventory', label: 'Inventario', icon: Package },
  { kind: 'link', href: '/pos', label: 'Caja', icon: ShoppingBasket },
  {
    kind: 'group',
    label: 'Ventas',
    icon: ShoppingCart,
    items: [
      { href: '/invoicing', label: 'Facturación' },
      { href: '/quotes', label: 'Cotizaciones' },
      { href: '/receivables', label: 'Cuentas a Cobrar' },
      { href: '/clients', label: 'Clientes' },
    ],
  },
  {
    kind: 'group',
    label: 'Compras',
    icon: ShoppingBag,
    items: [
      { href: '/purchases', label: 'Compras' },
      { href: '/payables', label: 'Cuentas a Pagar' },
      { href: '/suppliers', label: 'Proveedores' },
    ],
  },
  {
    kind: 'group',
    label: 'Contabilidad',
    icon: Calculator,
    items: [
      { href: '/accounting', label: 'Contabilidad' },
      { href: '/taxes', label: 'Impuestos' },
      { href: '/treasury', label: 'Cartera de Cheques' },
      { href: '/reports', label: 'Reportes' },
    ],
  },
  { kind: 'link', href: '/companies', label: 'Empresas', icon: Building2 },
  { kind: 'link', href: '/accountants', label: 'Contadores', icon: Briefcase },
];

interface PresenceUser {
  userId: string;
  name: string | null;
  email: string;
}

/** Decodes the JWT payload client-side just to read `sub` - no signature
 * check needed here, the token's validity is the API's problem; this is
 * only used to filter "myself" out of the online-colleagues list. */
function currentUserId(): string | null {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return (JSON.parse(atob(payload)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Sin persistir en localStorage a propósito: cada sección de primer nivel
  // tiene su propio layout.tsx que monta un AppShell nuevo (mismo motivo que
  // el estado de los grupos del nav, ver NavGroupSection más abajo), así que
  // ya se resetea solo en cada navegación - persistirlo requeriría leer
  // localStorage durante el render inicial, que es justo el patrón que causó
  // el bug de hidratación que se arregló antes en esta misma sesión.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Un solo botón/ícono (PanelLeft) sirve para las dos cosas, como el
  // SidebarTrigger de shadcn: en desktop colapsa/expande la columna fija, en
  // mobile abre/cierra el drawer superpuesto - cuál de las dos depende del
  // breakpoint real en el momento del click, no de un estado guardado.
  function toggleSidebar() {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setSidebarCollapsed((v) => !v);
    } else {
      setMobileNavOpen((v) => !v);
    }
  }

  // Mismo queryKey que UserMenu's propio useQuery - react-query lo dedupe,
  // no dispara un segundo fetch.
  const { data: profile } = useQuery({ queryKey: ['profile-me'], queryFn: profileApi.getMe });

  useEffect(() => {
    if (profile?.mustChangePassword && pathname !== '/profile') {
      router.replace('/profile');
    }
  }, [profile, pathname, router]);

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.replace('/login');
      return;
    }

    const socket = getSocket();
    const selfId = currentUserId();

    socket.on('presence.snapshot', (data: { online: PresenceUser[] }) => {
      setOnline(data.online.filter((u) => u.userId !== selfId));
    });
    socket.on('presence.online', (user: PresenceUser) => {
      if (user.userId === selfId) return;
      setOnline((prev) => (prev.some((u) => u.userId === user.userId) ? prev : [...prev, user]));
    });
    socket.on('presence.offline', ({ userId }: { userId: string }) => {
      setOnline((prev) => prev.filter((u) => u.userId !== userId));
    });

    return () => {
      socket.off('presence.snapshot');
      socket.off('presence.online');
      socket.off('presence.offline');
    };
  }, [router]);

  // Cierra el drawer mobile al navegar - sin esto, tocar un link en celular
  // deja el overlay abierto tapando la pantalla de destino.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ImpersonationBanner />
      <MembershipSessionBanner />
      <TrialBanner />

      <div className="flex min-h-0 flex-1">
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-4 text-sidebar-foreground transition-all duration-200 md:static md:z-auto md:translate-x-0 ${
            mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
          } ${sidebarCollapsed ? 'md:w-16 md:px-2' : ''}`}
        >
          <div className="flex items-center justify-between px-1">
            <PlexoLogo size={22} iconOnly={sidebarCollapsed} />
            <button
              onClick={() => setMobileNavOpen(false)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-muted md:hidden"
              aria-label="Cerrar menú"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
            {NAV_ENTRIES.map((entry) =>
              entry.kind === 'link' ? (
                <Link
                  key={entry.href}
                  href={entry.href}
                  title={sidebarCollapsed ? entry.label : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                    sidebarCollapsed ? 'md:justify-center md:px-2' : ''
                  } ${
                    pathname?.startsWith(entry.href)
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <entry.icon className="h-4 w-4 shrink-0" />
                  <span className={sidebarCollapsed ? 'md:hidden' : ''}>{entry.label}</span>
                </Link>
              ) : (
                <NavGroupSection
                  key={entry.label}
                  group={entry}
                  active={pathname ?? ''}
                  collapsed={sidebarCollapsed}
                  onExpandSidebar={() => setSidebarCollapsed(false)}
                />
              ),
            )}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 md:px-6">
            <button
              onClick={toggleSidebar}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Mostrar u ocultar barra lateral"
              title="Mostrar u ocultar barra lateral"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <div className="flex flex-1 items-center justify-end gap-5">
              <OnlineColleagues users={online} />
              <CartButton />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>

      <AssistantWidget />
    </div>
  );
}

function NavGroupSection({
  group,
  active,
  collapsed,
  onExpandSidebar,
}: {
  group: NavGroup;
  active: string;
  collapsed: boolean;
  onExpandSidebar: () => void;
}) {
  const isActiveGroup = group.items.some((item) => active.startsWith(item.href));
  // Se inicializa abierto si el grupo contiene la pantalla actual - cada
  // segmento de primer nivel tiene su propio layout.tsx que monta un
  // AppShell nuevo (ver taxes/layout.tsx, reports/layout.tsx, etc.), así que
  // este componente se remonta en cada navegación entre secciones y este
  // valor inicial siempre refleja la ruta real, sin necesitar un useEffect.
  const [open, setOpen] = useState(isActiveGroup);

  // Riel de íconos (sidebar colapsado en desktop): un grupo no tiene link
  // propio al que navegar, así que acá el click sólo reabre el sidebar en
  // vez de desplegar la lista - no hay espacio para mostrarla angosto, y un
  // flyout flotante es más complejidad de la que esta pantalla necesita hoy.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onExpandSidebar}
        title={group.label}
        className={`hidden md:flex w-full items-center justify-center rounded-lg px-2 py-2 text-sm transition ${
          isActiveGroup ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <group.icon className="h-4 w-4 shrink-0" />
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
          isActiveGroup ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
        aria-expanded={open}
      >
        <group.icon className="h-4 w-4 shrink-0" />
        {group.label}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-[1.15rem] flex flex-col gap-0.5 border-l py-0.5 pl-3">
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-2.5 py-1.5 text-sm transition ${
                active.startsWith(item.href)
                  ? 'font-medium text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function OnlineColleagues({ users }: { users: PresenceUser[] }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  // Closing this if the list empties out (last colleague went offline
  // mid-dropdown) avoids leaving an open panel with nothing in it.
  useEffect(() => {
    if (users.length === 0) setOpen(false);
  }, [users.length]);

  if (users.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
      >
        <span className="h-2 w-2 rounded-full bg-green-500" />
        <span className="hidden sm:inline">
          {users.length} compañero{users.length !== 1 ? 's' : ''} en línea
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border bg-popover py-2 text-popover-foreground shadow-xl">
          <p className="px-4 pb-2 text-xs font-medium text-muted-foreground">En línea ahora</p>
          {users.map((u) => (
            <div key={u.userId} className="flex items-center gap-3 px-4 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {initials(u.name, u.email)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm">{u.name || u.email}</p>
                {u.name && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { density, setDensity } = useDensity();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery({
    queryKey: ['profile-me'],
    queryFn: profileApi.getMe,
  });

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('tenantId');
    // If this fires mid-impersonation (logging out via the normal menu
    // instead of ImpersonationBanner's "Salir"), the stashed admin token
    // must not survive into the next, unrelated login - otherwise
    // ImpersonationBanner would wrongly show "impersonating" on a fresh
    // session that never impersonated anyone.
    localStorage.removeItem('adminToken');
    localStorage.removeItem('impersonationExpiresAt');
    disconnectSocket();
    router.replace('/login');
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-transparent transition hover:ring-ring/50"
        aria-label="Menú de usuario"
      >
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {profile ? initials(profile.name, profile.email) : '·'}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border bg-popover py-2 text-popover-foreground shadow-xl">
          {profile && (
            <div className="border-b px-4 py-3">
              <p className="truncate text-sm font-medium">{profile.name || profile.email}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            </div>
          )}

          <Link href="/profile" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-muted">
            Perfil
          </Link>

          <Link
            href="/settings/billing"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-muted"
          >
            Planes y facturación
          </Link>

          {/* Mismo gate que /preferences abajo: gestionar el equipo es
           * política del tenant, no algo personal - sólo tiene sentido
           * mostrarlo a quien puede invitar/suspender gente. */}
          {(profile?.role === 'OWNER' || profile?.role === 'ADMIN') && (
            <Link
              href="/settings/team"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm hover:bg-muted"
            >
              Equipo
            </Link>
          )}

          {/* Mismo gate que "Equipo" arriba: administrar cajas es política
           * del tenant, sólo tiene sentido para quien puede crear/desactivar. */}
          {(profile?.role === 'OWNER' || profile?.role === 'ADMIN') && (
            <Link
              href="/settings/pos"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm hover:bg-muted"
            >
              Cajas (POS)
            </Link>
          )}

          {/* Tenant-wide business policy, not a personal preference - same
           * write restriction as PATCH /tenant-settings (OWNER/ADMIN), so
           * this only shows to roles that can actually save a change here. */}
          {(profile?.role === 'OWNER' || profile?.role === 'ADMIN') && (
            <Link
              href="/preferences"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm hover:bg-muted"
            >
              Preferencias
            </Link>
          )}

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="flex w-full items-center gap-3 px-4 py-2 hover:bg-muted"
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>

          <button
            onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
            aria-label={density === 'compact' ? 'Cambiar a vista cómoda' : 'Cambiar a vista compacta'}
            title={density === 'compact' ? 'Cambiar a vista cómoda' : 'Cambiar a vista compacta'}
            className="flex w-full items-center gap-3 px-4 py-2 hover:bg-muted"
          >
            {density === 'compact' ? <CompactRowsIcon /> : <ComfortableRowsIcon />}
          </button>

          <div className="mt-1 border-t pt-1">
            <button onClick={handleLogout} className="block w-full px-4 py-2 text-left text-sm hover:bg-muted">
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M20.354 15.354A9 9 0 0 1 8.646 3.646 9.003 9.003 0 1 0 20.354 15.354Z" />
    </svg>
  );
}

function ComfortableRowsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CompactRowsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
      <path d="M4 4h16M4 9h16M4 14h16M4 19h16" />
    </svg>
  );
}
