import { useSyncExternalStore } from 'react';

/**
 * Dark or light. Dark is the default, in Robinhood Chain's own colours; the
 * reader's choice is kept in this browser. index.html applies the saved
 * choice before anything is drawn, so the page never flashes the other one.
 */
export type Theme = 'dark' | 'light';
const KEY = 'hood-names-theme';
const listeners = new Set<() => void>();

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  // The phone's browser bar follows the page.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f2ee' : '#110e08');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* kept for this visit only */
  }
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    currentTheme,
    () => 'dark',
  );
}
