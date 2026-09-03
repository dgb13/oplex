'use client';

import { useEffect } from 'react';

const THEME_STORAGE_KEY = 'plexo-theme';

/**
 * Fuerza tema claro en toda la sección /pos por legibilidad de mostrador
 * bajo luz natural, y restaura el tema guardado del usuario al salir.
 * ThemeProvider sólo tiene un modo global sin scope por sub-árbol (ver
 * apps/web/src/providers/ThemeProvider.tsx) - acá se toca la clase `dark`
 * de <html> directamente en vez de pasar por ese contexto, así no hace
 * falta tocar ThemeProvider para un caso de uso tan puntual.
 *
 * El MutationObserver (no sólo un toggle al montar) es necesario porque
 * ThemeProvider es ANCESTRO de este layout (envuelve toda la app) - los
 * efectos de React corren de hijo a padre, así que en una navegación dura
 * (recarga de página, URL tipeada a mano) el propio useEffect de
 * ThemeProvider corre DESPUÉS del de acá y reaplica `dark` desde
 * localStorage, pisando la remoción. El observer reafirma "sin dark" ante
 * cualquier reintento mientras la sección siga montada, sin importar el
 * orden de efectos.
 */
export default function PosLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    root.classList.remove('dark');

    const observer = new MutationObserver(() => {
      if (root.classList.contains('dark')) {
        root.classList.remove('dark');
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      const shouldBeDark = stored ? stored === 'dark' : wasDark;
      root.classList.toggle('dark', shouldBeDark);
    };
  }, []);

  return <>{children}</>;
}
