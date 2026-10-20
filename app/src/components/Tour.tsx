import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chain, parentName } from '../config';
import { useT } from '../i18n';

const KEY = 'hood-names-intro';
export const tourSeen = () => {
  try {
    return localStorage.getItem(KEY) === 'seen';
  } catch {
    return true;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(KEY, 'seen');
  } catch {
    /* fine */
  }
};

/**
 * A four-card tour for first-timers: what a name is, what you need, how
 * buying works, and why it is safe. Opened from the hero; never forced.
 */
export function Tour({ open, onClose, onFinish }: { open: boolean; onClose: () => void; onFinish: () => void }) {
  const t = useT();
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<Element | null>(null);
  // Finishing hands focus to the search box, so it is not given back.
  const keepFocus = useRef(false);

  useEffect(() => {
    if (!open) return;
    setI(0);
    keepFocus.current = false;
    before.current = document.activeElement;
    box.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, 3));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (!keepFocus.current) (before.current as HTMLElement | null)?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const close = () => {
    markSeen();
    onClose();
  };
  const cards = [
    {
      title: t('A name instead of an address'),
      body: t('Wallet addresses are long and easy to get wrong. A name like {name} points to yours, so people can send to the name.', { name: `sage.${parentName}` }),
      art: (
        <div className="tour-art art-resolve">
          <span className="mono">0x7099…79C8</span>
          <span className="arrow" aria-hidden="true">↓</span>
          <span className="nm" translate="no">sage<span className="dim">.{parentName}</span></span>
        </div>
      ),
    },
    {
      title: t('What you need'),
      body: chain.testnet
        ? t('A wallet app such as MetaMask or Rabby, and a little test ETH for fees. Test ETH is free on the Test tokens page.')
        : t('A wallet app such as MetaMask or Rabby, and a little ETH for fees and the name itself.'),
      art: (
        <div className="tour-art art-need">
          <span className="chipart">{t('Wallet')}</span>
          <span className="plus" aria-hidden="true">+</span>
          <span className="chipart">ETH</span>
        </div>
      ),
    },
    {
      title: t('Two quick confirmations'),
      body: t('First you reserve the name privately, then wait about a minute, then confirm and pay. The wait stops anyone from copying your choice.'),
      art: (
        <div className="tour-art art-steps">
          <span className="s on">1</span>
          <span className="ring" aria-hidden="true" />
          <span className="s">2</span>
        </div>
      ),
    },
    {
      title: t('Nobody can pose as you'),
      body: t('Names that only look like yours, with a swapped digit or a letter from another alphabet, are refused while you hold yours.'),
      art: (
        <div className="tour-art art-safe">
          <span className="nm" translate="no"><s>a1ice</s></span>
          <span className="nm ok" translate="no">alice</span>
        </div>
      ),
    },
  ];
  const last = i === cards.length - 1;
  const c = cards[i];
  // Rendered at the top of the document, above the sticky header.
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog tour" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1} ref={box} style={{ outline: 'none' }}>
        <div key={i} className="tour-card">
          {c.art}
          <h2 id="tour-title">{c.title}</h2>
          <p>{c.body}</p>
        </div>
        <div className="tour-foot">
          <div className="tour-dots" role="tablist" aria-label={t('Tour')}>
            {cards.map((_, k) => (
              <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={t('Card {n} of {total}', { n: k + 1, total: cards.length })} onClick={() => setI(k)} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {i === 0 ? (
              <button type="button" className="btn btn-ghost" onClick={close}>{t('Skip')}</button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setI(i - 1)}>{t('Back')}</button>
            )}
            {last ? (
              <button type="button" className="btn btn-primary" onClick={() => { markSeen(); keepFocus.current = true; onFinish(); }}>{t('Find my name')}</button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setI(i + 1)}>{t('Next')}</button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
