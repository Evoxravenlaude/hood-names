/**
 * Avatars uploaded here are stored on-chain, in the name's avatar record, as
 * a small data URL. No server or pinning service is involved, so the picture
 * lives exactly as long as the record. Storage is paid in gas, so the image
 * is cropped square and shrunk to a few kilobytes first.
 */
export const MAX_AVATAR_BYTES = 8 * 1024;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

export async function toAvatarDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif|avif|heic|heif|bmp)$/i.test(file.type))
    throw new Error('Choose a photo or picture file (PNG, JPEG, WebP or GIF).');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That file is over 15 MB. Choose a smaller picture.');

  const bitmap = await load(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  for (const size of [192, 160, 128, 96]) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize pictures.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    for (const quality of [0.85, 0.72, 0.6, 0.48]) {
      for (const type of ['image/webp', 'image/jpeg']) {
        const url = canvas.toDataURL(type, quality);
        // Some browsers fall back to PNG when a type is unsupported.
        if (!url.startsWith(`data:${type}`)) continue;
        if (url.length <= MAX_AVATAR_BYTES) return url;
      }
    }
  }
  throw new Error('Could not make this picture small enough. Try a simpler one.');
}

async function load(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('That file could not be read as a picture.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The address an avatar record can be shown from, or undefined. Only plain
 * pictures are allowed: raster data URLs, https links and IPFS links.
 */
export function avatarSrc(record: string | undefined | null): string | undefined {
  if (!record) return undefined;
  const v = record.trim();
  if (/^data:image\/(png|jpeg|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(v)) return v;
  if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return v;
  const ipfs = v.match(/^ipfs:\/\/(?:ipfs\/)?([a-z0-9]+(?:\/[^\s"'<>]*)?)$/i);
  if (ipfs) return `https://ipfs.io/ipfs/${ipfs[1]}`;
  return undefined;
}
