import { useMemo } from 'react';
import { Mark, Wordmark } from '../components/Logo';
import { Plate } from '../components/Plate';
import { Street } from '../components/Street';
import { useToast } from '../components/Toast';
import { mark, useT } from '../i18n';
import { useRegisteredLabels } from '../lib/hooks';

const COLOURS = [
  { hex: '#1F3FA8', name: mark('Enamel'), use: mark('The sign, and accents by day') },
  { hex: '#CCFF00', name: mark('Robin Neon'), use: mark('The frame, the ending of a name, lit windows. Robinhood Chain’s colour.') },
  { hex: '#0B1030', name: mark('Midnight'), use: mark('The night sky, and ink by day') },
  { hex: '#121A44', name: mark('Night street'), use: mark('Panels at night') },
  { hex: '#E9EEF7', name: mark('Daylight'), use: mark('The day sky') },
  { hex: '#FFFFFF', name: mark('White'), use: mark('Lettering on the sign, houses by day') },
  { hex: '#FF8A3D', name: mark('Sodium'), use: mark('Warnings and refusals, like the orange streetlight') },
] as const;

/**
 * The brand, for anyone writing about or building with .hood names: the
 * story, the sign, the mark with files to download, colours, type and voice.
 */
export function Brand() {
  const t = useT();
  const toast = useToast();
  const registered = useRegisteredLabels();
  const names = useMemo(
    () => [...(registered.data?.values() ?? [])].sort((a, b) => Number(b.block - a.block)),
    [registered.data],
  );
  const copy = (hex: string) => {
    navigator.clipboard?.writeText(hex).then(() => toast(t('Copied {value}', { value: hex })), () => undefined);
  };

  return (
    <div className="page brand-page">
      <header className="brand-head">
        <h1 className="title">{t('The .hood names brand')}</h1>
        <p className="lede">{t('How the site looks and sounds, and the files to use when you write about it or build with it.')}</p>
      </header>

      <section className="brand-sec">
        <div className="brand-copy">
          <h2 className="section">{t('The block')}</h2>
          <p>{t('Every name is a street sign on Robinhood Chain, and every registered name is a lit window on the street. The same street is drawn at night and by day, and people choose which one they see.')}</p>
        </div>
        <div className="settings">
          <figure>
            <Street names={names} setting="dark" className="mini" />
            <figcaption><strong>{t('Night')}</strong> {t('Midnight sky, neon windows, streetlights on. The default.')}</figcaption>
          </figure>
          <figure>
            <Street names={names} setting="light" className="mini" />
            <figcaption><strong>{t('Day')}</strong> {t('White houses drawn in ink, blue glass, a neon sun.')}</figcaption>
          </figure>
        </div>
      </section>

      <section className="brand-sec">
        <div className="brand-copy">
          <h2 className="section">{t('The sign')}</h2>
          <p>{t('Wherever a name is the subject, it sits on its sign: enamel blue, white letters, the ending and the frame in Robin Neon, a white line inside the frame. The small line on top carries the address the name points to. The sign keeps its colours by day and by night, like a real one.')}</p>
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

      <section className="brand-sec">
        <div className="brand-copy">
          <h2 className="section">{t('The mark')}</h2>
          <p>{t('A small sign with “.h” on it. Use the mark alone where space is tight and the full wordmark everywhere else. Leave space around it at least the height of the dot, and never recolour, stretch or tilt it.')}</p>
          <div className="pills">
            <a className="btn btn-plain" href="/brand/mark.svg" download="hood-names-mark.svg">{t('Download the mark')}</a>
            <a className="btn btn-plain" href="/brand/wordmark-night.svg" download="hood-names-wordmark-night.svg">{t('Wordmark for dark backgrounds')}</a>
            <a className="btn btn-plain" href="/brand/wordmark-day.svg" download="hood-names-wordmark-day.svg">{t('Wordmark for light backgrounds')}</a>
          </div>
        </div>
        <div className="mark-specimens">
          <div className="ms night"><Mark size={88} /></div>
          <div className="ms day"><Mark size={88} /></div>
          <div className="ms night wide" data-setting="dark"><Wordmark size={46} /></div>
          <div className="ms day wide" data-setting="light"><Wordmark size={46} /></div>
        </div>
      </section>

      <section className="brand-sec">
        <div className="brand-copy">
          <h2 className="section">{t('Colours')}</h2>
          <p>{t('Robin Neon is Robinhood Chain’s own colour. Enamel blue is ours. Neon is never used for text on a light background: there it is a fill with dark text on top, and enamel blue does the job instead. Click a colour to copy it.')}</p>
        </div>
        <ul className="swatches">
          {COLOURS.map((c) => (
            <li key={c.hex}>
              <button type="button" onClick={() => copy(c.hex)} aria-label={t('Copy {value}', { value: c.hex })}>
                <span className="sw" style={{ background: c.hex }} />
                <span className="sw-name">{t(c.name)}</span>
                <span className="sw-hex mono" translate="no">{c.hex}</span>
                <span className="sw-use">{t(c.use)}</span>
              </button>
            </li>
          ))}
        </ul>
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
