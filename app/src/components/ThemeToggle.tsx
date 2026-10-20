import { flushSync } from 'react-dom';
import { useT } from '../i18n';
import { setTheme, useTheme } from '../lib/theme';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Day or night on the street. The new setting opens as a circle from the
 * switch where the browser can do that; elsewhere the colours cross-fade.
 */
export function ThemeToggle() {
  const t = useT();
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? t('Switch to light mode') : t('Switch to dark mode');
  return (
    <button
      type="button"
      className="daynight"
      aria-label={label}
      title={label}
      onClick={(e) => {
        const root = document.documentElement;
        const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
        if (doc.startViewTransition && !reduced()) {
          const r = e.currentTarget.getBoundingClientRect();
          root.style.setProperty('--vt-x', `${r.left + r.width / 2}px`);
          root.style.setProperty('--vt-y', `${r.top + r.height / 2}px`);
          // Kept straight away; the page itself changes inside the transition.
          try {
            localStorage.setItem('hood-names-theme', next);
          } catch {
            /* kept for this visit only */
          }
          doc.startViewTransition(() => flushSync(() => setTheme(next)));
          return;
        }
        root.classList.add('theme-fade');
        setTheme(next);
        setTimeout(() => root.classList.remove('theme-fade'), 400);
      }}
    >
      <span className="dn-icon dn-sun" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </span>
      <span className="dn-icon dn-moon" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
      </span>
      <span className="dn-thumb" aria-hidden="true">
        {theme === 'dark' ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        )}
      </span>
    </button>
  );
}
