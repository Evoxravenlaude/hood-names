import { useT } from '../i18n';
import { rememberTheme, setTheme, useTheme } from '../lib/theme';
import { reveal } from '../lib/reveal';

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
        // Kept straight away; the page itself changes inside the transition.
        rememberTheme(next);
        reveal(e.currentTarget, () => setTheme(next));
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
