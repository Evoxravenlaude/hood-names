import { useEffect, useRef, useState } from 'react';
import { LANGUAGES, language, setLanguage, useLanguage, useT, type LanguageCode } from '../i18n';

const Globe = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </svg>
);

/**
 * The site's language menu. English is always first and always named in
 * English, so it can be found whatever language the page is showing.
 */
export function LanguagePicker() {
  const t = useT();
  const code = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const choose = async (c: LanguageCode) => {
    setOpen(false);
    await setLanguage(c);
  };

  return (
    <div className="wallet lang" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost lang-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${t('Language')}: ${current.name}`}
        onClick={() => setOpen(!open)}
        translate="no"
      >
        <Globe />
        <span className="lang-name">{current.name}</span>
      </button>
      {open && (
        <div className="menu lang-menu" role="menu" translate="no">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              role="menuitemradio"
              aria-checked={l.code === code}
              type="button"
              lang={l.code}
              onClick={() => choose(l.code)}
            >
              <span className="grow">{l.name}</span>
              {l.code !== 'en' && <span className="small faint" lang="en">{l.english}</span>}
              {l.code === code && <span className="tick" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Notices when the browser's own translator has rewritten the page. That
 * rewrite freezes text the site later changes (a name in a search result
 * can stay on the previous name), so the site offers its own version of
 * the language instead.
 */
export function TranslationNotice() {
  const t = useT();
  const [lang, setLang] = useState<string | null>(null);
  useEffect(() => {
    const html = document.documentElement;
    const check = () => {
      const translated =
        /\btranslated-(ltr|rtl)\b/.test(html.className) || !!document.querySelector('font[style*="vertical-align"], #root font');
      if (!translated) return setLang(null);
      // Chrome sets the page's lang to the language it translated into.
      setLang(html.lang && html.lang !== language() ? html.lang.toLowerCase().split('-')[0] : 'other');
    };
    let queued = 0;
    const observer = new MutationObserver(() => {
      if (!queued) queued = window.setTimeout(() => ((queued = 0), check()), 300);
    });
    observer.observe(html, { attributes: true, attributeFilter: ['class', 'lang'] });
    observer.observe(document.body, { childList: true, subtree: true });
    check();
    return () => {
      observer.disconnect();
      clearTimeout(queued);
    };
  }, []);
  if (!lang) return null;
  const ours = LANGUAGES.find((l) => l.code === lang);
  const restart = async (code: LanguageCode) => {
    await setLanguage(code);
    window.location.reload();
  };
  return (
    // The explanation may be translated by the browser (it never changes);
    // the buttons may not, so each stays readable in its own language.
    <div className="page" style={{ paddingBottom: 0 }}>
      <div className="notice warn" role="alert">
        <p>
          <strong>{t('Your browser has translated this page.')}</strong>{' '}
          {t('Parts of a translated page can stop updating, so a name or amount could show an old value. Use this site’s own language menu instead.')}
        </p>
        {ours && ours.code !== 'en' && (
          <button type="button" className="btn btn-dark" lang={ours.code} translate="no" onClick={() => restart(ours.code)}>
            {ours.name}
          </button>
        )}
        <button type="button" className="btn btn-plain" lang="en" translate="no" onClick={() => restart('en')}>
          English
        </button>
      </div>
    </div>
  );
}
