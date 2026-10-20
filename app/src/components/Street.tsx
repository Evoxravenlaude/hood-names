import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { usePalette, useTheme, type Theme } from '../lib/theme';
import { paletteById, type PaletteId } from '../lib/palettes';
import { fullName } from '../lib/names';

/**
 * The block: a street of row houses under the sky. Every neon window is a
 * name someone has registered, newest first, so the street fills up as the
 * names do. Point at a window to read its name, click it to open the name.
 *
 * By night the windows glow and the streetlights are on; by day the houses
 * are white and drawn in ink, with a neon sun. The layout comes from a fixed
 * seed, so the street is the same on every visit and only the lights change.
 */

const W = 1600;
const H = 340;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


interface Win { x: number; y: number }
interface Layout {
  stars: { x: number; y: number; r: number; o: number }[];
  back: { x: number; y: number; w: number; h: number; wins: Win[] }[];
  houses: { x: number; y: number; w: number; h: number; face: number; roof: number; peak: number; door: number }[];
  wins: Win[];
  lamps: number[];
  order: number[];
  ambient: Set<number>;
}

const GROUND = H - 30;

function layout(): Layout {
  const r = rng(11);
  const stars = Array.from({ length: 80 }, () => ({ x: r() * W, y: r() * 120, r: r() * 1.1 + 0.35, o: r() * 0.55 + 0.25 }));
  const back: Layout['back'] = [];
  for (let x = -40; x < W + 40; ) {
    const w = 70 + r() * 120;
    const h = 150 + r() * 120;
    const wins: Win[] = [];
    for (let wy = GROUND - h + 18; wy < GROUND - 140; wy += 22)
      for (let wx = x + 12; wx < x + w - 14; wx += 16) if (r() < 0.22) wins.push({ x: wx, y: wy });
    back.push({ x, y: GROUND - h, w, h, wins });
    x += w + 4 + r() * 16;
  }
  const houses: Layout['houses'] = [];
  const wins: Win[] = [];
  const lamps: number[] = [];
  for (let x = -24; x < W + 24; ) {
    const w = Math.round(118 + r() * 96);
    const h = Math.round(128 + r() * 116);
    const y = GROUND - h;
    const house = { x, y, w, h, face: Math.floor(r() * 4), roof: r(), peak: 30 + r() * 20, door: r() < 0.5 ? 0.22 : 0.58 };
    houses.push(house);
    const cols = Math.max(2, Math.floor((w - 28) / 36));
    const rows = Math.max(1, Math.floor((h - 96) / 48));
    const gx = (w - cols * 20) / (cols + 1);
    for (let row = 0; row < rows; row++)
      for (let c = 0; c < cols; c++) wins.push({ x: x + gx + c * (20 + gx), y: y + 22 + row * 48 });
    if (r() < 0.3) lamps.push(x + w);
    x += w;
  }
  // The order windows light up in: spread out, the middle of the street first.
  const order = wins.map((_, i) => i).sort((a, b) => {
    const da = Math.abs(wins[a].x - W / 2) + r() * 900;
    const db = Math.abs(wins[b].x - W / 2) + r() * 900;
    return da - db;
  });
  const ambient = new Set(wins.map((_, i) => i).filter(() => r() < 0.2));
  return { stars, back, houses, wins, lamps, order, ambient };
}

export const LAYOUT = layout();
export { W as STREET_W, H as STREET_H, GROUND as STREET_GROUND };
export const STREET_WINDOWS = LAYOUT.wins.length;

export interface StreetName { label: string }

export function Street({ names, className, setting, palette }: { names: StreetName[]; className?: string; setting?: Theme; palette?: PaletteId }) {
  const t = useT();
  const current = useTheme();
  const theme = setting ?? current;
  const currentPalette = usePalette();
  const pal = paletteById(palette ?? currentPalette);
  const navigate = useNavigate();
  const p = pal[theme].street;
  const L = LAYOUT;
  const day = theme === 'light';
  const sw = day ? 1.6 : 0;
  const ink = p.stroke ?? '#000';
  const stroke = day ? { stroke: ink, strokeWidth: sw, strokeLinejoin: 'round' as const } : {};

  // Window index -> name. Newest names take the first windows in the order.
  const byWindow = useMemo(() => {
    const m = new Map<number, string>();
    names.slice(0, L.order.length).forEach((n, k) => m.set(L.order[k], n.label));
    return m;
  }, [names, L.order]);

  // The first lights switch on in a wave; any window lit after that flickers on.
  const seen = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const before = seen.current;
    const f = new Set<string>();
    if (before) for (const n of names) if (!before.has(n.label)) f.add(n.label);
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names]);
  useEffect(() => {
    if (names.length) seen.current = new Set(names.map((n) => n.label));
  }, [names]);
  const [firstWave, setFirstWave] = useState(true);
  const any = names.length > 0;
  useEffect(() => {
    if (!any) return;
    const id = setTimeout(() => setFirstWave(false), 2800);
    return () => clearTimeout(id);
  }, [any]);

  const uid = useId().replace(/:/g, '');
  const [tip, setTip] = useState<{ x: number; y: number; label: string } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const windowAt = (target: EventTarget | null) => {
    const el = (target as Element | null)?.closest?.('[data-name]');
    return el ? el.getAttribute('data-name') : null;
  };

  return (
    <div className={'street ' + (className ?? '')} data-theme-art={theme} style={{ ['--glow-rgb' as string]: p.glow, ['--win-hover' as string]: day ? p.face[0] : '#ffffff' }}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        role="img"
        aria-label={names.length ? t('A street where every neon window is a registered name.') : t('A street of houses at night.')}
        onPointerMove={(e) => {
          const label = windowAt(e.target);
          setTip(label ? { x: e.clientX, y: e.clientY, label } : null);
        }}
        onPointerLeave={() => setTip(null)}
        onClick={(e) => {
          const label = windowAt(e.target);
          if (label) navigate(`/name/${encodeURIComponent(label)}`);
        }}
      >
        <defs>
          <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={p.sky[0]} />
            <stop offset="1" stopColor={p.sky[1]} />
          </linearGradient>
          <radialGradient id={`glow${uid}`}>
            <stop offset="0" stopColor={`rgb(${p.glow})`} stopOpacity="0.5" />
            <stop offset="0.35" stopColor={`rgb(${p.glow})`} stopOpacity="0.14" />
            <stop offset="1" stopColor={`rgb(${p.glow})`} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#sky${uid})`} />
        {day ? (
          <g className="sun">
            <circle cx={W * 0.84} cy={88} r={38} fill={p.orb} stroke={ink} strokeWidth={1.6} />
          </g>
        ) : (
          <>
            <g className="stars">
              {L.stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />)}
            </g>
            <g className="moon">
              <circle cx={W * 0.84} cy={72} r={24} fill={p.orb} />
              <circle cx={W * 0.84 + 10} cy={65} r={22} fill={p.sky[0]} />
            </g>
          </>
        )}
        <g>
          {L.back.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={p.back} />
              {b.wins.map((w, k) => <rect key={k} x={w.x} y={w.y} width={7} height={10} fill={p.backWin} />)}
            </g>
          ))}
        </g>
        {!day && L.lamps.map((x) => <circle key={x} cx={x} cy={GROUND - 150} r={95} fill={`url(#glow${uid})`} />)}
        <g>
          {L.houses.map((h, i) => {
            const face = p.face[h.face];
            const dx = h.x + h.w * h.door;
            return (
              <g key={i}>
                <rect x={h.x} y={h.y} width={h.w} height={h.h} fill={face} {...stroke} />
                {h.roof < 0.34 ? (
                  <path d={`M${h.x - 6} ${h.y} L${h.x + h.w / 2} ${h.y - h.peak} L${h.x + h.w + 6} ${h.y} Z`} fill={p.roof} {...stroke} />
                ) : h.roof < 0.62 ? (
                  <path d={`M${h.x} ${h.y} v-10 h${h.w / 5} v-12 h${h.w / 5} v-12 h${h.w / 5} v12 h${h.w / 5} v12 h${h.w / 5} v10 Z`} fill={face} {...stroke} />
                ) : (
                  <rect x={h.x - 4} y={h.y - 10} width={h.w + 8} height={10} fill={p.cap} {...stroke} />
                )}
                <rect x={dx} y={GROUND - 54} width={30} height={54} rx={0} fill={p.door} {...stroke} />
                <path d={`M${dx} ${GROUND - 40} a15 15 0 0 1 30 0`} fill={p.door} {...stroke} />
                <rect x={dx - 4} y={GROUND - 74} width={38} height={12} rx={2.5} fill={p.doorSign[0]} stroke={p.doorSign[1]} strokeWidth={1.6} />
              </g>
            );
          })}
        </g>
        <g>
          {L.wins.map((w, i) => {
            const name = byWindow.get(i);
            if (name) {
              const k = L.order.indexOf(i);
              const cls = 'win named' + (fresh.has(name) ? ' fresh' : firstWave ? ' wave' : '');
              return (
                <rect
                  key={i}
                  className={cls}
                  data-name={name}
                  x={w.x}
                  y={w.y}
                  width={20}
                  height={28}
                  rx={2}
                  fill={k % 5 === 0 ? p.lit[1] : p.lit[0]}
                  style={firstWave ? { animationDelay: `${Math.min(1.4, 0.25 + k * 0.03)}s` } : undefined}
                  {...stroke}
                />
              );
            }
            return (
              <g key={i}>
                <rect
                  x={w.x}
                  y={w.y}
                  width={20}
                  height={28}
                  rx={2}
                  fill={!day && L.ambient.has(i) ? p.ambient : p.off}
                  {...stroke}
                />
                {day && <path d={`M${w.x + 4} ${w.y + 20} l8 -14`} stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.7} />}
              </g>
            );
          })}
        </g>
        <rect x={0} y={GROUND} width={W} height={H - GROUND} fill={p.ground} />
        <rect x={0} y={GROUND} width={W} height={day ? 1.6 : 2} fill={p.kerb} />
        {L.lamps.map((x) => (
          <g key={x}>
            <rect x={x - 2} y={GROUND - 150} width={4} height={150} fill={p.lamp} />
            <rect x={x - 10} y={GROUND - 158} width={20} height={10} rx={3} fill={p.lamp} />
            <rect x={x - 6} y={GROUND - 149} width={12} height={4} rx={2} fill={p.bulb} {...(day ? { stroke: ink, strokeWidth: 1.2 } : {})} />
          </g>
        ))}
      </svg>
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }} role="presentation" translate="no">
          <strong><bdi>{fullName(tip.label)}</bdi></strong>
          {t('Open this name')}
        </div>
      )}
    </div>
  );
}

export type { Theme };
