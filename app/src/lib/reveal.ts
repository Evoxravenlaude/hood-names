import { flushSync } from 'react-dom';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Changes the look of the page with the new look opening as a circle from
 * `from` (the control that was used), where the browser can do that; the
 * colours cross-fade elsewhere, and switch at once for reduced motion.
 */
export function reveal(from: Element, change: () => void) {
  const root = document.documentElement;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !reduced()) {
    const r = from.getBoundingClientRect();
    root.style.setProperty('--vt-x', `${r.left + r.width / 2}px`);
    root.style.setProperty('--vt-y', `${r.top + r.height / 2}px`);
    doc.startViewTransition(() => flushSync(change));
    return;
  }
  root.classList.add('theme-fade');
  change();
  setTimeout(() => root.classList.remove('theme-fade'), 400);
}
