'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { type Theme, themeStorageKey } from './theme';

const ThemeContext = createContext({
  theme: 'light' as Theme,
  ready: false,
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      let preference: string | null = null;
      try {
        preference = window.localStorage.getItem(themeStorageKey);
      } catch {
        // Keep the theme initialized before paint if storage is unavailable.
        setTheme(
          document.documentElement.classList.contains('dark')
            ? 'dark'
            : 'light',
        );
        setReady(true);
        return;
      }
      const next =
        preference === 'dark' || (preference !== 'light' && media.matches)
          ? 'dark'
          : 'light';
      applyTheme(next);
      setTheme(next);
      setReady(true);
    };
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null) sync();
    };
    media.addEventListener('change', sync);
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(themeStorageKey, next);
    } catch {
      // The toggle still works for this page when storage is blocked.
    }
    applyTheme(next);
    setTheme(next);
  }
  return (
    <ThemeContext.Provider value={{ theme, ready, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', theme === 'dark' ? '#101b16' : '#14513f');
}

export function useTheme() {
  return useContext(ThemeContext);
}
