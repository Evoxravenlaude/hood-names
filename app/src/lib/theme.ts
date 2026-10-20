import { useSyncExternalStore } from 'react';

/**
 * Night (dark) or day (light) on the street. Night is the default; the
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#e9eef7' : '#0b1030');
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
