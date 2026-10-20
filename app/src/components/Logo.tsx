import { parentName } from '../config';
import { DEFAULT_PALETTE, paletteById, settingVars, type Mode, type PaletteId } from '../lib/palettes';

/**
 * The mark: a small street sign with ".h" on it, a frame with a fine line
 * inside it, and a dot like a porch light. The shape never changes; it is
 * painted in the chosen colour, like the signs. Paths only, so it needs no
 * font and reads the same everywhere.
 */
export function markSvg(palette: PaletteId = DEFAULT_PALETTE, mode: Mode = 'dark') {
  const t = settingVars(paletteById(palette), mode);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="2" y="5" width="36" height="30" rx="8" fill="${t['sign-bg']}" stroke="${t.frame}" stroke-width="3"/><rect x="6.5" y="9.5" width="27" height="21" rx="4.5" fill="none" stroke="${t['sign-ink']}" stroke-opacity="0.85" stroke-width="1.4"/><circle cx="13.5" cy="24.5" r="3" fill="${t['sign-end']}"/><path d="M20 13.5v12.5M20 19.5c0-2 1.6-3.2 3.4-3.2s3.2 1.2 3.2 3.2V26" stroke="${t['sign-ink']}" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
}
export const MARK_SVG = markSvg();

/** The mark in the page's colour (or the colour of the nearest preview). */
export function Mark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg className={'mark ' + (className ?? '')} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2" y="5" width="36" height="30" rx="8" strokeWidth="3" style={{ fill: 'var(--sign-bg)', stroke: 'var(--frame)' }} />
      <rect x="6.5" y="9.5" width="27" height="21" rx="4.5" fill="none" strokeOpacity="0.85" strokeWidth="1.4" style={{ stroke: 'var(--sign-ink)' }} />
      <circle className="mark-dot" cx="13.5" cy="24.5" r="3" style={{ fill: 'var(--sign-end)' }} />
      <path d="M20 13.5v12.5M20 19.5c0-2 1.6-3.2 3.4-3.2s3.2 1.2 3.2 3.2V26" strokeWidth="3" fill="none" strokeLinecap="round" style={{ stroke: 'var(--sign-ink)' }} />
    </svg>
  );
}

/** ".hood names": the mark, then the ending set wide and heavy, then "names" narrow. */
export function Wordmark({ size = 36 }: { size?: number }) {
  return (
    <span className="wordmark" translate="no" style={{ fontSize: size * 0.68 }}>
      <Mark size={size} />
      <span className="wm-text" translate="no">
        <span className="wm-dot">.</span>{parentName}<span className="wm-names" translate="no">names</span>
      </span>
    </span>
  );
}
