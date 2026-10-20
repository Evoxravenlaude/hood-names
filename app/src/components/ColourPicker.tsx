import { useEffect, useRef, useState } from 'react';
import { mark, useT } from '../i18n';
import { PALETTES, paletteById, type PaletteId } from '../lib/palettes';
import { rememberPalette, setPalette, usePalette, useTheme } from '../lib/theme';
import { reveal } from '../lib/reveal';
import { parentName } from '../config';

/** The names and notes in palettes.ts, listed here so they are translated. */
export const PALETTE_WORDS = [
  mark('Slate'), mark('Cool grey slate with the neon of Robinhood Chain. The default.'),
  mark('Brass'), mark('An ivory sign with a brass frame, on oat by day and espresso by night. The quietest.'),
  mark('Enamel blue'), mark('A blue enamel street sign, like the ones in old European cities.'),
  mark('Claret'), mark('Deep claret with gold lettering, like an old shopfront.'),
  mark('Onyx'), mark('Robinhood Chain’s own black, white and neon.'),
];

/**
 * The colour the street is painted in. Each choice shows its own sign, in
 * the setting (night or day) being viewed, so people pick by looking.
 */
export function ColourPicker() {
  const t = useT();
  const palette = usePalette();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = paletteById(palette);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    // Focus the chosen colour, so arrow keys and Enter work at once.
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const choose = (id: PaletteId) => {
    setOpen(false);
    if (id === palette) return;
    rememberPalette(id);
    reveal(button.current ?? document.body, () => setPalette(id));
    button.current?.focus();
  };

  const move = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <div className="wallet colours" ref={ref}>
      <button
        ref={button}
        type="button"
        className="swatch-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('Colour: {name}', { name: t(current.name) })}
        title={t('Colour: {name}', { name: t(current.name) })}
        onClick={() => setOpen(!open)}
      >
        <span className="swatch" aria-hidden="true" />
      </button>
      {open && (
        <div className="menu colour-menu" role="menu" aria-label={t('Colour')} onKeyDown={move}>
          <p className="menu-title">{t('Colour')}</p>
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitemradio"
              aria-checked={p.id === palette}
              onClick={() => choose(p.id)}
            >
              <span className="colour-sample" data-palette={p.id} data-theme={theme} aria-hidden="true" translate="no">
                <span className="cs-sign">
                  <span className="cs-name">a</span>
                  <span className="cs-end">.{parentName}</span>
                </span>
              </span>
              <span className="colour-words">
                <span className="colour-name">{t(p.name)}</span>
                <span className="colour-note">{t(p.note)}</span>
              </span>
              {p.id === palette && <span className="tick" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
