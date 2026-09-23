'use client';

import { ParticleCanvasBackground } from '@/components/auth/ParticleCanvasBackground';
import { PlexoLogo } from '@/components/ui/PlexoLogo';
import { useTheme } from '@/providers/ThemeProvider';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { Toaster } from 'sonner';

/**
 * Shared shell for every page under app/(auth) - login, signup,
 * verify-email, forgot/reset-password, oauth callback screens. A route
 * group (parens don't add a URL segment, so /login stays /login) rather
 * than one page with client-side tab state: OAuth callbacks need a real
 * browser redirect target, and password-reset needs a bookmarkable/
 * shareable link with query params - neither works as React state.
 *
 * Split-screen on desktop (decorative panel + particle canvas on the
 * left, form on the right); on mobile the canvas becomes a dimmed full-
 * page background behind a single centered column, per the brief.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 lg:grid lg:grid-cols-2">
      {/* Mobile: dimmed full-page background */}
      <div className="absolute inset-0 opacity-30 lg:hidden">
        <ParticleCanvasBackground />
      </div>

      {/* Desktop: decorative left panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-950 to-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <ParticleCanvasBackground />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10"
        >
          {/* Fixed-dark panel regardless of the app's own light/dark
              toggle - overrides PlexoLogo's default indigo (assumes a
              normal page background) with plain white for contrast. */}
          <PlexoLogo size={32} colorClassName="text-white" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative z-10 max-w-md"
        >
          <h2 className="text-3xl font-semibold leading-tight text-white">
            El ERP que crece con tu negocio
          </h2>
          <p className="mt-3 text-sm text-slate-300">
            Facturación, inventario, compras y contabilidad en un solo lugar — con aislamiento
            multi-tenant real y ARCA integrado.
          </p>
        </motion.div>
      </div>

      {/* Form panel */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4 sm:p-8">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="absolute right-4 top-4 rounded-full p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 transition"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="mb-6 lg:hidden">
          <PlexoLogo size={26} />
        </div>

        {children}
      </div>

      <Toaster richColors position="top-center" theme={theme} />
    </div>
  );
}
