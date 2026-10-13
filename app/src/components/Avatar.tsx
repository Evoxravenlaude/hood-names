import { useState } from 'react';
import { avatarSrc } from '../lib/image';
import { useAvatar } from '../lib/hooks';

/**
 * A name's picture, or its first letter when it has none.
 * @param remote Load pictures hosted elsewhere. Off where the name is someone
 *        else's, so its owner cannot learn who looked it up from their server's logs.
 */
export function Avatar({ label, record, size = 72, remote = true }: { label: string; record?: string | null; size?: number; remote?: boolean }) {
  const fromChain = useAvatar(record === undefined ? label : null);
  const any = avatarSrc(record === undefined ? fromChain.data : record);
  const src = any && (remote || any.startsWith('data:')) ? any : undefined;
  const [broken, setBroken] = useState<string | null>(null);
  const show = src && broken !== src;
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, borderRadius: size >= 48 ? 18 : size / 3, fontSize: Math.round(size * 0.42) }}
    >
      {show ? (
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(src)} />
      ) : (
        [...label][0]
      )}
    </span>
  );
}
