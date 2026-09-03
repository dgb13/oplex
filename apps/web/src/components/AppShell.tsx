'use client';

import { initials, profileApi } from '@/lib/profile';
import { PlexoLogo } from '@/components/ui/PlexoLogo';
import CartButton from './CartButton';
import ImpersonationBanner from './ImpersonationBanner';
import TrialBanner from './TrialBanner';
import { disconnectSocket, getSocket } from '@/lib/socket';
import { useDensity } from '@/providers/DensityProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Calculator,
  ChevronDown,
  LayoutDashboard,
  Package,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-3">
        <div className="flex items-center gap-6">
          <PlexoLogo size={22} />
          <nav className="flex items-center gap-4">
            {NAV_ENTRIES.map((entry) =>
              entry.kind === 'link' ? (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className={`flex items-center gap-1.5 text-sm transition ${
                    pathname?.startsWith(entry.href)
                      ? 'font-medium text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <entry.icon className="h-4 w-4" />
                  {entry.label}
                </Link>
              ) : (
                <NavDropdown key={entry.label} group={entry} active={pathname ?? ''} />
              ),
            )}
          </nav>
        </div>
        <div className="flex items-center gap-5">
          <OnlineColleagues users={online} />
          <CartButton />
          <UserMenu />
        </div>
      </header>
      <ImpersonationBanner />
      <TrialBanner />
      <main className="p-6">{children}</main>
    </div>
  );
}

function NavDropdown({ group, active }: { group: NavGroup; active: string }) {
  const isActive = group.items.some((item) => active.startsWith(item.href));

  return (
    <Menu as="div" className="relative">
      <MenuButton
        className={`flex items-center gap-1.5 text-sm transition ${
          isActive
            ? 'font-medium text-slate-900 dark:text-slate-100'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
        }`}
      >
        <group.icon className="h-4 w-4" />
        {group.label}
        <ChevronDown className="h-3.5 w-3.5" />
      </MenuButton>
      <MenuItems
        anchor="bottom start"
        className="z-20 mt-2 w-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 shadow-xl focus:outline-none"
      >
        {group.items.map((item) => (
          <MenuItem key={item.href}>
            {({ focus }) => (
              <Link
                href={item.href}
                className={`block px-4 py-2 text-sm transition ${
                  active.startsWith(item.href)
                    ? 'font-medium text-slate-900 dark:text-slate-100'
                    : 'text-slate-700 dark:text-slate-300'
                } ${focus ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
              >
                {item.label}
              </Link>
            )}
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
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
        className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
      >
        <span className="h-2 w-2 rounded-full bg-green-500" />
        {users.length} compañero{users.length !== 1 ? 's' : ''} en línea
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 shadow-xl">
          <p className="px-4 pb-2 text-xs font-medium text-slate-500 dark:text-slate-500">
            En línea ahora
          </p>
          {users.map((u) => (
            <div key={u.userId} className="flex items-center gap-3 px-4 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-semibold text-white">
                {initials(u.name, u.email)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800 dark:text-slate-200">
                  {u.name || u.email}
                </p>
                {u.name && (
                  <p className="truncate text-xs text-slate-500">{u.email}</p>
                )}
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
        className="flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-transparent transition hover:ring-indigo-500/50"
        aria-label="Menú de usuario"
      >
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-9 w-9 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            {profile ? initials(profile.name, profile.email) : '·'}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 shadow-xl">
          {profile && (
            <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {profile.name || profile.email}
              </p>
              <p className="truncate text-xs text-slate-600 dark:text-slate-400">{profile.email}</p>
            </div>
          )}

          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Perfil
          </Link>

          <Link
            href="/settings/billing"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
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
              className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Equipo
            </Link>
          )}

          {/* Tenant-wide business policy, not a personal preference - same
           * write restriction as PATCH /tenant-settings (OWNER/ADMIN), so
           * this only shows to roles that can actually save a change here. */}
          {(profile?.role === 'OWNER' || profile?.role === 'ADMIN') && (
            <Link
              href="/preferences"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Preferencias
            </Link>
          )}

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="flex w-full items-center gap-3 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>

          <button
            onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
            aria-label={density === 'compact' ? 'Cambiar a vista cómoda' : 'Cambiar a vista compacta'}
            title={density === 'compact' ? 'Cambiar a vista cómoda' : 'Cambiar a vista compacta'}
            className="flex w-full items-center gap-3 px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {density === 'compact' ? <CompactRowsIcon /> : <ComfortableRowsIcon />}
          </button>

          <div className="mt-1 border-t border-slate-200 dark:border-slate-800 pt-1">
            <button
              onClick={handleLogout}
              className="block w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
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
