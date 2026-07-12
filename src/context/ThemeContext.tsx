'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Theme = 'dark' | 'light';
const THEME_KEY = 'sec_theme_v1';

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
      document.documentElement.setAttribute('data-theme', active);
    } catch {}
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
      document.documentElement.setAttribute('data-theme', t);
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
