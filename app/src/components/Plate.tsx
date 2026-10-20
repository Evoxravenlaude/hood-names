import type { ReactNode } from 'react';
import { parentName } from '../config';

/**
 * A name on its enamel sign: white lettering, the ".hood" ending in neon,
 * a neon frame with a white hairline inside it. This is how a name looks
 * wherever it is the subject of the page. The optional top line carries
 * small print, such as the address the name points to.
 */
export function Plate({
  label,
  top,
  size = 'md',
  tone,
  className,
}: {
  label: string;
  top?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'good' | 'bad';
  className?: string;
}) {
  return (
    <span className={`plate plate-${size} ${className ?? ''}`} data-tone={tone} translate="no">
      {top && <span className="plate-top">{top}</span>}
      <span className="plate-name">
        <bdi>{label}</bdi>
        <span className="plate-end">.{parentName}</span>
      </span>
    </span>
  );
}
