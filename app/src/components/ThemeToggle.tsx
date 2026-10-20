import { useT } from '../i18n';
import { setTheme, useTheme } from '../lib/theme';

export function ThemeToggle() {
  const t = useT();
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="btn btn-ghost theme-btn"
      aria-label={next === 'light' ? t('Switch to light mode') : t('Switch to dark mode')}
      title={next === 'light' ? t('Switch to light mode') : t('Switch to dark mode')}
      onClick={() => {
        const root = document.documentElement;
        // Cross-fade the switch rather than snapping.
        root.classList.add('theme-fade');
        setTheme(next);
        setTimeout(() => root.classList.remove('theme-fade'), 400);
      }}
    >
      {theme === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}
