import { Fragment, createElement, useSyncExternalStore, type ReactNode } from 'react';

/**
 * The site's own languages. English is the source: every string in the code
 * is written in English and used as its own key, and a language that lacks a
 * string shows the English. The picker always lists English first, by its
 * own name, so it can be found from any language.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'fr', name: 'Français', english: 'French' },
  { code: 'es', name: 'Español', english: 'Spanish' },
  { code: 'pt', name: 'Português', english: 'Portuguese' },
  { code: 'de', name: 'Deutsch', english: 'German' },
  { code: 'tr', name: 'Türkçe', english: 'Turkish' },
  { code: 'ru', name: 'Русский', english: 'Russian' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'zh', name: '中文', english: 'Chinese' },
  { code: 'ja', name: '日本語', english: 'Japanese' },
  { code: 'ko', name: '한국어', english: 'Korean' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

type Catalog = Record<string, string>;
// en.json is the list of source strings, not a translation, so it is not loaded.
const loaders = import.meta.glob<Catalog>(['./locales/*.json', '!./locales/en.json'], { import: 'default' });
const STORAGE_KEY = 'hood-names-language';

const isCode = (c: string | null | undefined): c is LanguageCode => !!c && LANGUAGES.some((l) => l.code === c);

/** Set when the reader picked a language on this site. */
let chosen = false;

function initial(): LanguageCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isCode(saved)) {
      chosen = true;
      return saved;
    }
  } catch {
    /* storage can be unavailable */
  }
  for (const pref of typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []) {
    const base = pref?.toLowerCase().split('-')[0];
    if (isCode(base)) return base;
  }
  return 'en';
}

let current: LanguageCode = initial();
let catalog: Catalog = {};
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

function applyToDocument(code: LanguageCode) {
  if (typeof document === 'undefined') return;
  // The page says which language it is in, so the browser's own translator
  // stops offering to translate what is already in the reader's language.
  document.documentElement.lang = code;
  // Once the reader has picked a language here, the browser's translator is
  // kept off: it rewrites text in a way that stops the page updating it.
  if (chosen) document.documentElement.setAttribute('translate', 'no');
}

async function load(code: LanguageCode) {
  if (code === 'en') return {};
  const loader = loaders[`./locales/${code}.json`];
  return loader ? await loader() : {};
}

/** Switches the site's language. English needs nothing loaded, so switching back always works. */
export async function setLanguage(code: LanguageCode) {
  chosen = true;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* fine: the choice lasts for this visit */
  }
  const next = await load(code).catch(() => ({}));
  current = code;
  catalog = next;
  applyToDocument(code);
  notify();
}

/** Loads the starting language. Rendering waits for this so text does not flash. */
export const ready: Promise<void> = (async () => {
  applyToDocument(current);
  catalog = await load(current).catch(() => ({}));
  if (current !== 'en' && !Object.keys(catalog).length) current = 'en';
  applyToDocument(current);
})();

export const language = () => current;

/** The locale numbers and dates are written in. */
export const locale = () => (current === 'zh' ? 'zh-CN' : current === 'en' ? 'en-US' : current);

type Vars = Record<string, ReactNode>;

function fill(text: string, vars?: Vars): string | ReactNode {
  if (!vars) return text;
  const plain = Object.values(vars).every((v) => typeof v === 'string' || typeof v === 'number');
  if (plain) return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  const parts = text.split(/(\{\w+\})/g).filter(Boolean);
  return createElement(
    Fragment,
    null,
    ...parts.map((p, i) => {
      const m = /^\{(\w+)\}$/.exec(p);
      return createElement(Fragment, { key: i }, m && m[1] in vars ? vars[m[1]] : p);
    }),
  );
}

/**
 * Translates an English string. Placeholders such as {name} are filled from
 * `vars`; when a value is an element rather than text, the result is an
 * element too.
 */
export function t(text: string, vars?: Record<string, string | number>): string;
export function t(text: string, vars: Vars): ReactNode;
export function t(text: string, vars?: Vars): ReactNode {
  return fill(catalog[text] || text, vars);
}

/**
 * Marks a string for translation where it is defined, for strings that are
 * translated later with t() (tables of messages, labels in lists). Returns
 * the string unchanged; tools/extract-strings.mjs collects marked strings.
 */
export const mark = (text: string) => text;

/**
 * Picks the singular or the plural English string by the page language's
 * own plural rules, then translates it. Languages without a singular form
 * (Chinese, Japanese, Korean…) always use the second.
 */
export function tn(count: number, one: string, other: string, vars?: Record<string, string | number>): string {
  const form = new Intl.PluralRules(locale()).select(count);
  return t(form === 'one' ? one : other, vars);
}

/** Re-renders the component when the language changes, and returns t. */
export function useT() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return t;
}

export function useLanguage() {
  useT();
  return current;
}
