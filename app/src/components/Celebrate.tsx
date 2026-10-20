import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * A short burst of confetti in the brand's colours, for the moment a name
 * becomes yours. Drawn on one canvas for under two seconds, then removed.
 * Skipped for people who ask for reduced motion.
 */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    };
    resize();
    const colors = ['#ccff00', '#ffffff', '#1f3fa8', '#e5ff80'];
    const parts = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: innerHeight * 0.38,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 15 - 5,
      w: 6 + Math.random() * 7,
      h: 4 + Math.random() * 5,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const elapsed = now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - 1200) / 600);
      for (const p of parts) {
        p.vy += 0.45;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      }
      if (elapsed < 1800) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(frame);
    addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
    };
  }, []);
  return createPortal(<canvas ref={ref} className="confetti" aria-hidden="true" />, document.body);
}

/** The minute's wait as a ring that fills, with the seconds left in the middle. */
export function WaitRing({ left, total, label }: { left: number; total: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const done = total ? Math.min(1, 1 - left / total) : 0;
  return (
    <div className="wait-ring" role="timer" aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={r} className="track" />
        <circle cx="60" cy="60" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - done)} />
      </svg>
      <span className="wait-num">{left}</span>
    </div>
  );
}
