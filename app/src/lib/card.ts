import { parentName } from '../config';
import { LAYOUT, STREET_GROUND, STREET_H, STREET_W } from '../components/Street';
import type { Theme } from './theme';
import { paletteById, settingVars, type PaletteId } from './palettes';
import { markSvg } from '../components/Logo';

/**
 * A picture of a name on its sign, over the street, to save or post:
 * 1200 by 630, the size link previews use. Drawn on a canvas with the
 * site's own fonts, in the setting the reader is looking at.
 */
export async function nameCard(label: string, address: string | undefined, theme: Theme, palette: PaletteId): Promise<Blob> {
  await document.fonts.ready;
  const Wd = 1200;
  const Ht = 630;
  const c = document.createElement('canvas');
  c.width = Wd * 2;
  c.height = Ht * 2;
  const x = c.getContext('2d')!;
  x.scale(2, 2);
  const day = theme === 'light';
  const look = paletteById(palette);
  const pal = look[theme].street;
  const t = settingVars(look, theme);
  const [skyTop, skyBottom] = pal.sky;
  const ink = t.ink;

  // Sky
  const g = x.createLinearGradient(0, 0, 0, Ht);
  g.addColorStop(0, skyTop);
  g.addColorStop(1, skyBottom);
  x.fillStyle = g;
  x.fillRect(0, 0, Wd, Ht);

  // The street along the bottom, the middle part of it.
  const s = 0.86;
  const ox = (Wd - STREET_W * s) / 2;
  const oy = Ht - STREET_H * s;
  x.save();
  x.translate(ox, oy);
  x.scale(s, s);
  x.lineWidth = 1.6;
  x.strokeStyle = pal.stroke ?? '#000';
  x.lineJoin = 'round';
  const shape = (draw: () => void, fill: string) => {
    x.beginPath();
    draw();
    x.fillStyle = fill;
    x.fill();
    if (day) x.stroke();
  };
  if (!day) {
    x.fillStyle = '#ffffff';
    for (const st of LAYOUT.stars) {
      x.globalAlpha = st.o;
      x.beginPath();
      x.arc(st.x, st.y - 40, st.r * 1.4, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
  }
  for (const b of LAYOUT.back) {
    x.fillStyle = pal.back;
    x.fillRect(b.x, b.y, b.w, b.h);
    x.fillStyle = pal.backWin;
    for (const w of b.wins) x.fillRect(w.x, w.y, 7, 10);
  }
  for (const h of LAYOUT.houses) {
    const face = pal.face[h.face];
    shape(() => x.rect(h.x, h.y, h.w, h.h), face);
    if (h.roof < 0.34)
      shape(() => {
        x.moveTo(h.x - 6, h.y);
        x.lineTo(h.x + h.w / 2, h.y - h.peak);
        x.lineTo(h.x + h.w + 6, h.y);
        x.closePath();
      }, pal.roof);
    else if (h.roof < 0.62) {
      const q = h.w / 5;
      shape(() => {
        x.moveTo(h.x, h.y);
        x.lineTo(h.x, h.y - 10);
        x.lineTo(h.x + q, h.y - 10);
        x.lineTo(h.x + q, h.y - 22);
        x.lineTo(h.x + 2 * q, h.y - 22);
        x.lineTo(h.x + 2 * q, h.y - 34);
        x.lineTo(h.x + 3 * q, h.y - 34);
        x.lineTo(h.x + 3 * q, h.y - 22);
        x.lineTo(h.x + 4 * q, h.y - 22);
        x.lineTo(h.x + 4 * q, h.y - 10);
        x.lineTo(h.x + h.w, h.y - 10);
        x.lineTo(h.x + h.w, h.y);
        x.closePath();
      }, face);
    } else shape(() => x.rect(h.x - 4, h.y - 10, h.w + 8, 10), pal.cap);
    const dx = h.x + h.w * h.door;
    shape(() => x.rect(dx, STREET_GROUND - 40, 30, 40), pal.door);
    shape(() => x.arc(dx + 15, STREET_GROUND - 40, 15, Math.PI, 0), pal.door);
  }
  LAYOUT.wins.forEach((w, i) => {
    const lit = LAYOUT.order.indexOf(i) % 3 === 0;
    shape(() => x.roundRect(w.x, w.y, 20, 28, 2), lit ? pal.lit[0] : !day && LAYOUT.ambient.has(i) ? pal.ambient : pal.off);
  });
  x.fillStyle = pal.ground;
  x.fillRect(-200, STREET_GROUND, STREET_W + 400, STREET_H - STREET_GROUND + 200);
  x.fillStyle = pal.kerb;
  x.fillRect(-200, STREET_GROUND, STREET_W + 400, 2);
  x.restore();

  // The sign, centred above the street.
  const name = label;
  const end = `.${parentName}`;
  let size = 96;
  const font = (px: number) => `800 ${px}px "Archivo Variable", "Geist Variable", system-ui, sans-serif`;
  const ctx = x as CanvasRenderingContext2D & { fontStretch?: string };
  ctx.fontStretch = 'semi-expanded';
  x.font = font(size);
  while (size > 40 && x.measureText(name + end).width > Wd - 260) x.font = font((size -= 4));
  const tw = x.measureText(name).width;
  const ew = x.measureText(end).width;
  const pw = tw + ew + 96;
  const ph = size * 1.25 + 70;
  const px = (Wd - pw) / 2;
  const py = 150;
  if (!day) {
    x.shadowColor = `rgba(${t['frame-rgb']}, 0.35)`;
    x.shadowBlur = 60;
  } else {
    x.fillStyle = t.ink;
    x.beginPath();
    x.roundRect(px, py + 5, pw, ph, 26);
    x.fill();
  }
  x.fillStyle = t.frame;
  x.beginPath();
  x.roundRect(px, py, pw, ph, 26);
  x.fill();
  x.shadowBlur = 0;
  x.fillStyle = t['sign-bg'];
  x.beginPath();
  x.roundRect(px + 8, py + 8, pw - 16, ph - 16, 19);
  x.fill();
  x.strokeStyle = t['sign-hair'];
  x.lineWidth = 2.5;
  x.beginPath();
  x.roundRect(px + 17, py + 17, pw - 34, ph - 34, 12);
  x.stroke();
  x.textBaseline = 'alphabetic';
  if (address) {
    x.font = '500 18px "Geist Mono Variable", ui-monospace, monospace';
    x.fillStyle = t['sign-sub'];
    x.fillText(`${address.slice(0, 6)}…${address.slice(-4)}`, px + 48, py + 52);
  }
  x.font = font(size);
  x.fillStyle = t['sign-ink'];
  const base = py + ph - 44;
  x.fillText(name, px + 48, base);
  x.fillStyle = t['sign-end'];
  x.fillText(end, px + 48 + tw, base);

  // Wordmark, top left: the mark, then the name of the site.
  const mark = new Image();
  mark.src = 'data:image/svg+xml,' + encodeURIComponent(markSvg(palette, theme));
  await mark.decode().catch(() => undefined);
  if (mark.complete && mark.naturalWidth) x.drawImage(mark, 52, 38, 46, 46);
  const wx = 108;
  x.font = '850 30px "Archivo Variable", system-ui, sans-serif';
  ctx.fontStretch = 'expanded';
  x.fillStyle = t['accent-ink'];
  x.fillText('.', wx, 74);
  const dw = x.measureText('.').width;
  x.fillStyle = ink;
  x.fillText(parentName, wx + dw, 74);
  const hw = x.measureText(parentName).width;
  ctx.fontStretch = 'condensed';
  x.font = '600 19px "Archivo Variable", system-ui, sans-serif';
  x.fillStyle = t.faint;
  x.fillText('names', wx + dw + hw + 10, 74);
  ctx.fontStretch = 'normal';
  x.font = '500 18px "Archivo Variable", system-ui, sans-serif';
  x.textAlign = 'right';
  x.fillText('Robinhood Chain', Wd - 56, 74);

  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('No picture'))), 'image/png'));
}

/** Save the picture, or hand it to the phone's share sheet where there is one. */
export async function saveNameCard(label: string, address: string | undefined, theme: Theme, palette: PaletteId) {
  const blob = await nameCard(label, address, theme, palette);
  const file = new File([blob], `${label}.${parentName}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch {
      /* cancelled: fall back to a download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
