'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type PosTheme = 'light' | 'dark' | 'contrast' | 'emerald';

const STORAGE_KEY = 'plexo-pos-theme';

const POS_THEMES: PosTheme[] = ['light', 'dark', 'contrast', 'emerald'];

const PosThemeContext = createContext<{
  theme: PosTheme;
  setTheme: (theme: PosTheme) => void;
} | null>(null);

/**
 * Tema propio del POS, scoped por atributo `data-pos-theme` en un wrapper
 * `display:contents` - totalmente desacoplado del `ThemeProvider` global
 * (que sólo maneja el par light/dark de `.dark` en `<html>`, ver
 * apps/web/src/providers/ThemeProvider.tsx). El picker de 4 estilos vive
 * sólo dentro de /pos, /pos/sell y /pos/history (ver PosThemePicker.tsx).
 */
export function PosThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<PosTheme>('light');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as PosTheme | null;
    if (stored && POS_THEMES.includes(stored)) {
      setThemeState(stored);
    }
  }, []);

  const setTheme = useCallback((next: PosTheme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return (
    <PosThemeContext.Provider value={{ theme, setTheme }}>
      <div className="contents" data-pos-theme={theme}>
        {children}
      </div>
    </PosThemeContext.Provider>
  );
}

export function usePosTheme() {
  const ctx = useContext(PosThemeContext);
  if (!ctx) throw new Error('usePosTheme must be used within PosThemeProvider');
  return ctx;
}
