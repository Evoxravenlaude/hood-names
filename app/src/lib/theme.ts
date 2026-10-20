import { useSyncExternalStore } from 'react';
import { DEFAULT_PALETTE, PALETTES, paletteById, paletteCss, type PaletteId } from './palettes';

/**
 * How the street looks: a setting, night (dark) or day (light), and a colour
 * (see palettes.ts). Night and Slate are the defaults; the reader's choices
 * are kept in this browser. index.html applies them before anything is drawn,
 * so the page never flashes another look.
 */
export type Theme = 'dark' | 'light';
const KEY = 'hood-names-theme';
const PALETTE_KEY = 'hood-names-palette';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Puts every colour's tokens on the page, once, before the first render. */
export function installPalettes() {
  if (document.getElementById('palettes')) return;
  const style = document.createElement('style');
  style.id = 'palettes';
  style.textContent = paletteCss();
  document.head.prepend(style);
  // A colour that no longer exists falls back to the default.
  const root = document.documentElement;
  if (!PALETTES.some((p) => p.id === root.dataset.palette)) root.dataset.palette = DEFAULT_PALETTE;
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function currentPalette(): PaletteId {
  return paletteById(document.documentElement.dataset.palette).id;
}

const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* kept for this visit only */
  }
};

/** The phone's browser bar follows the page. */
function paintBar() {
  const bar = paletteById(currentPalette())[currentTheme()].bar;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar);
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  save(KEY, theme);
  paintBar();
  notify();
}

export function setPalette(id: PaletteId) {
  document.documentElement.dataset.palette = id;
  save(PALETTE_KEY, id);
  paintBar();
  notify();
}

/** The choice is saved straight away, for changes that run inside a transition. */
export function rememberTheme(theme: Theme) {
  save(KEY, theme);
}
export function rememberPalette(id: PaletteId) {
  save(PALETTE_KEY, id);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'dark');
}

export function usePalette(): PaletteId {
  return useSyncExternalStore(subscribe, currentPalette, () => DEFAULT_PALETTE);
}
