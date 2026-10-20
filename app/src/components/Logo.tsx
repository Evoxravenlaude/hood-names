import { parentName } from '../config';

/**
 * The mark: a small enamel street sign with ".h" on it. Enamel blue, a neon
 * frame, a white hairline inside the frame, as on the big signs. Drawn with
 * paths only, so it needs no font and reads the same everywhere.
 */
export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="2" y="5" width="36" height="30" rx="8" fill="#1F3FA8" stroke="#CCFF00" stroke-width="3"/><rect x="6.5" y="9.5" width="27" height="21" rx="4.5" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="13.5" cy="24.5" r="3" fill="#CCFF00"/><path d="M20 13.5v12.5M20 19.5c0-2 1.6-3.2 3.4-3.2s3.2 1.2 3.2 3.2V26" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

export function Mark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg className={'mark ' + (className ?? '')} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2" y="5" width="36" height="30" rx="8" fill="#1F3FA8" stroke="#CCFF00" strokeWidth="3" />
      <rect x="6.5" y="9.5" width="27" height="21" rx="4.5" fill="none" stroke="#fff" strokeWidth="1.4" />
      <circle className="mark-dot" cx="13.5" cy="24.5" r="3" fill="#CCFF00" />
      <path d="M20 13.5v12.5M20 19.5c0-2 1.6-3.2 3.4-3.2s3.2 1.2 3.2 3.2V26" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
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
