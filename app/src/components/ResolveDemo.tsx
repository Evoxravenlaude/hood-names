import { useEffect, useRef, useState } from 'react';

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
 * The sign's idle state: while nothing is typed, it shows an address on its
 * top line and the name it resolves to, scrambling from the address into
 * the name, one example after another. That is the whole product in one
 * look. Stops while someone is typing, pauses when the tab is hidden, and
 * holds still for people who ask for reduced motion.
 */
export function useResolveDemo(active: boolean) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(EXAMPLES[0][0]);
  const [settled, setSettled] = useState(true);
  const timer = useRef<number>();
  const first = useRef(true);

  useEffect(() => {
    if (!active || reduced()) return;
    const cycle = window.setInterval(() => {
      if (document.hidden) return;
      setI((n) => (n + 1) % EXAMPLES.length);
    }, 3400);
    return () => clearInterval(cycle);
  }, [active]);

  useEffect(() => {
    const target = graphemes(EXAMPLES[i][0]);
    if (reduced() || first.current) {
      first.current = false;
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
  }, [i]);

  return { address: EXAMPLES[i][1], shown, settled };
}
