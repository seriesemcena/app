'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Theme = 'dark' | 'light';
const THEME_KEY = 'sec_theme_v1';

function applyDocumentTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const color = theme === 'dark' ? '#0D0D0F' : '#F2F2F7';
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (!meta.media || window.matchMedia(meta.media).matches) meta.content = color;
  });
}

interface ThemeCtxValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeCtxValue>({
  theme: 'dark',
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  /* On mount, read the saved preference and apply it (default: dark) */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY) as Theme | null;
      const active = (saved === 'light' || saved === 'dark') ? saved : 'dark';
      setThemeState(active);
      applyDocumentTheme(active);
    } catch {}
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
      applyDocumentTheme(t);
    } catch {}
  };

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
