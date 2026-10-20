import { useMemo, type MouseEvent } from 'react';
import { Mark, Wordmark } from '../components/Logo';
import { Plate } from '../components/Plate';
import { Street } from '../components/Street';
import { useToast } from '../components/Toast';
import { useT } from '../i18n';
import { useRegisteredLabels } from '../lib/hooks';
import { PALETTES, paletteById, settingVars, type PaletteId } from '../lib/palettes';
import { rememberPalette, setPalette, usePalette, useTheme } from '../lib/theme';
import { reveal } from '../lib/reveal';

/**
 * The brand, for anyone writing about or building with .hood names: the
 * story, the sign, the mark with files to download, the colours, type and
 * voice. Everything on the page is shown in the colour the reader chose.
 */
export function Brand() {
  const t = useT();
  const toast = useToast();
  const palette = usePalette();
  const theme = useTheme();
  const current = paletteById(palette);
  const registered = useRegisteredLabels();
  const names = useMemo(
    () => [...(registered.data?.values() ?? [])].sort((a, b) => Number(b.block - a.block)),
    [registered.data],
  );
  const copy = (hex: string) => {
    navigator.clipboard?.writeText(hex).then(() => toast(t('Copied {value}', { value: hex })), () => undefined);
  };
  const use = (id: PaletteId, e: MouseEvent<HTMLButtonElement>) => {
    rememberPalette(id);
    reveal(e.currentTarget, () => setPalette(id));
  };
  const files = `/brand/${palette}`;

  return (
    <div className="page brand-page">
      <header className="brand-head">
        <h1 className="title">{t('The .hood names brand')}</h1>
        <p className="lede">{t('How the site looks and sounds, and the files to use when you write about it or build with it.')}</p>
      </header>

      <section className="brand-sec">
        <div className="brand-copy">
          <h2 className="section">{t('The block')}</h2>
          <p>{t('Every name is a street sign on Robinhood Chain, and every registered name is a lit window on the street. The same street is drawn at night and by day, in the colour each person chooses.')}</p>
        </div>
        <div className="settings">
          <figure>
            <Street names={names} setting="dark" className="mini" />
            <figcaption><strong>{t('By night')}</strong> {t('Dark sky, lit windows, streetlights on. The default.')}</figcaption>
          </figure>
          <figure>
            <Street names={names} setting="light" className="mini" />
            <figcaption><strong>{t('By day')}</strong> {t('Pale sky, houses drawn in ink, the sun out.')}</figcaption>
          </figure>
        </div>
      </section>

      <section className="brand-sec">
        <div className="brand-copy">
          <h2 className="section">{t('The sign')}</h2>
          <p>{t('Wherever a name is the subject, it sits on its sign: a painted plate, a frame with a fine line inside it, the ending in the frame’s colour, and the address the name points to in small type on top. The shape is the same in every colour, and a sign keeps its paint by day and by night, like a real one.')}</p>
        </div>
        <div className="sign-specimens">
          <Plate label="sage" top="0x7099…79C8" size="xl" />
          <div className="pills">
            <Plate label="नमस्ते" size="sm" />
            <Plate label="привет" size="sm" />
            <Plate label="東京タワー" size="sm" />
            <Plate label="ሰላም" size="sm" />
          </div>
        </div>
      </section>

      <section className="brand-sec" id="colours">
        <div className="brand-copy">
          <h2 className="section">{t('Colours')}</h2>
          <p>{t('Slate is the main colour. Brass, Enamel blue, Claret and Onyx are there for anyone who prefers them, from the swatch next to the day and night switch. Each has a night and a day setting. Click a colour to copy it.')}</p>
          <p>{t('Robin Neon (#CCFF00) is Robinhood Chain’s own colour. Slate, Enamel blue and Onyx carry it on the sign; Brass and Claret use brass and gold instead. Neon is never text on a light background: there it is a fill with dark text on top.')}</p>
        </div>
        <ul className="palettes">
          {PALETTES.map((p) => {
            const v = settingVars(p, theme);
            const night = settingVars(p, 'dark');
            const day = settingVars(p, 'light');
            const swatches: [string, string][] = [
              [t('Sign'), v['sign-bg']],
              [t('Frame'), v.frame],
              [t('Ending'), v['sign-end']],
              [t('By night'), night.paper],
              [t('By day'), day.paper],
            ];
            return (
              <li key={p.id} className="palette" data-palette={p.id} data-theme={theme} aria-current={p.id === palette ? 'true' : undefined}>
                <div className="palette-head">
                  <Plate label="sage" size="sm" />
                  <div className="palette-words">
                    <strong>{t(p.name)}</strong>
                    <span>{t(p.note)}</span>
                  </div>
                </div>
                <div className="palette-chips">
                  {swatches.map(([label, hex]) => (
                    <button key={label} type="button" className="chip-swatch" onClick={() => copy(hex.toUpperCase())} aria-label={t('Copy {value}', { value: `${label} ${hex.toUpperCase()}` })}>
                      <i style={{ background: hex }} />
                      <span>{label}</span>
                      <span className="mono" translate="no">{hex.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
                {p.id === palette ? (
                  <span className="palette-using">{t('In use')}</span>
                ) : (
                  <button type="button" className="btn btn-plain palette-use" onClick={(e) => use(p.id, e)}>
                    {t('Use {name}', { name: t(p.name) })}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="brand-sec">
        <div className="brand-copy">
          <h2 className="section">{t('The mark')}</h2>
          <p>{t('A small sign with “.h” on it. It is painted in whichever colour is chosen; its shape never changes. Use the mark alone where space is tight and the full wordmark everywhere else. Leave space around it at least the height of the dot, and never stretch, tilt or outline it.')}</p>
          <p className="small faint">{t('The files below are in {name}. Choose another colour to download it in that one.', { name: t(current.name) })}</p>
          <div className="pills">
            <a className="btn btn-plain" href={`${files}/mark.svg`} download={`hood-names-mark-${palette}.svg`}>{t('Download the mark')}</a>
            <a className="btn btn-plain" href={`${files}/wordmark-night.svg`} download={`hood-names-wordmark-${palette}-night.svg`}>{t('Wordmark for dark backgrounds')}</a>
            <a className="btn btn-plain" href={`${files}/wordmark-day.svg`} download={`hood-names-wordmark-${palette}-day.svg`}>{t('Wordmark for light backgrounds')}</a>
          </div>
        </div>
        <div className="mark-specimens">
          <div className="ms" data-palette={palette} data-theme="dark"><Mark size={88} /></div>
          <div className="ms" data-palette={palette} data-theme="light"><Mark size={88} /></div>
          <div className="ms wide" data-palette={palette} data-theme="dark"><Wordmark size={46} /></div>
          <div className="ms wide" data-palette={palette} data-theme="light"><Wordmark size={46} /></div>
        </div>
      </section>

      <section className="brand-sec">
        <div className="brand-copy">
          <h2 className="section">{t('Type')}</h2>
          <p>{t('One family, Archivo, used across its widths: wide and heavy for headlines and signs, normal width for reading. Addresses are set in Geist Mono so every character is easy to check.')}</p>
        </div>
        <div className="type-specimens">
          <div className="ts ts-wide" translate="no">Aa .hood</div>
          <p className="ts-label">{t('Headlines and signs: Archivo, wide, extra bold')}</p>
          <div className="ts ts-read">{t('Send to a name instead of a long address.')}</div>
          <p className="ts-label">{t('Reading: Archivo, normal width')}</p>
          <div className="ts ts-mono mono" translate="no">0x7099…79C8</div>
          <p className="ts-label">{t('Addresses: Geist Mono')}</p>
        </div>
      </section>

      <section className="brand-sec">
        <div className="brand-copy">
          <h2 className="section">{t('How we write')}</h2>
        </div>
        <ul className="voice">
          <li>
            <strong>{t('Plain words')}</strong>
            <span>{t('Write for someone who has never used a wallet. “Name”, not “domain”. “Points to”, not “resolves”.')}</span>
          </li>
          <li>
            <strong>{t('Say what happens')}</strong>
            <span>{t('A button names its result: “Register sage.hood”, never “Submit”. The confirmation uses the same words.')}</span>
          </li>
          <li>
            <strong>{t('Problems come with a way out')}</strong>
            <span>{t('Say what went wrong and what to do next, without apologising or blaming.')}</span>
          </li>
        </ul>
      </section>

      <section className="brand-sec">
        <div className="notice info">
          <p>{t('Robin Neon is used as Robinhood Chain’s brand guidelines allow. .hood names does not use the Robinhood logo or feather, writes “Robinhood Chain” in full, and is an independent project, not affiliated with Robinhood.')}</p>
        </div>
      </section>
    </div>
  );
}
