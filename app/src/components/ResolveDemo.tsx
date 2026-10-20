import { useEffect, useRef, useState } from 'react';
import { parentName } from '../config';
import { useT } from '../i18n';

/** Example names in several alphabets, each with a made-up address. */
const EXAMPLES: [string, string][] = [
  ['sage', '0x7099…79C8'],
  ['नमस्ते', '0x3C44…93BC'],
  ['привет', '0x90F7…b906'],
  ['東京タワー', '0x15d3…6A65'],
  ['ሰላም', '0x9965…A4dc'],
  ['café', '0x976E…0aa9'],
];
const HEX = '0123456789abcdef';
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const graphemes = (s: string) =>
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment)
    : [...s];

/**
 * The hero's one moving part: a wallet address that resolves into a name.
 * The address scrambles and settles, left to right, into the name, which is
 * the whole product in one look. Pauses when the tab is hidden; shows a
 * still pair for people who ask for reduced motion.
 */
export function ResolveDemo() {
  const t = useT();
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(EXAMPLES[0][0]);
  const [settled, setSettled] = useState(true);
  const timer = useRef<number>();

  useEffect(() => {
    if (reduced()) return;
    const cycle = window.setInterval(() => {
      if (document.hidden) return;
      setI((n) => (n + 1) % EXAMPLES.length);
    }, 3400);
    return () => clearInterval(cycle);
  }, []);

  useEffect(() => {
    const target = graphemes(EXAMPLES[i][0]);
    if (reduced() || i === 0 && shown === EXAMPLES[0][0]) {
      setShown(EXAMPLES[i][0]);
      return;
    }
    // Scramble: each position runs through random characters, then locks
    // in turn. Non-Latin names scramble with their own characters so every
    // frame stays in a font that can draw it.
    const pool = /^[a-z0-9é]+$/.test(EXAMPLES[i][0]) ? HEX.split('') : target;
    const start = performance.now();
    const total = 520 + target.length * 70;
    setSettled(false);
    const step = (now: number) => {
      const p = (now - start) / total;
      const locked = Math.floor(p * target.length * 1.2);
      setShown(target.map((c, k) => (k < locked ? c : pool[Math.floor(Math.random() * pool.length)])).join(''));
      if (p < 1) timer.current = requestAnimationFrame(step);
      else {
        setShown(target.join(''));
        setSettled(true);
      }
    };
    timer.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(timer.current!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  const [, address] = EXAMPLES[i];
  return (
    <div className="resolve" aria-label={t('An example: a long wallet address becomes a short name.')} role="img">
      <span className="resolve-from mono" translate="no" key={address}>{address}</span>
      <span className="resolve-arrow" aria-hidden="true">
        <svg width="40" height="14" viewBox="0 0 40 14" fill="none"><path d="M0 7h36m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span className={'resolve-to' + (settled ? ' settled' : '')} translate="no" aria-hidden="true">
        <bdi>{shown}</bdi>
        <span className="dim">.{parentName}</span>
      </span>
    </div>
  );
}
