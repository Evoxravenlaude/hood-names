// Checks every colour and setting in src/lib/palettes.ts for readable text.
//   node scripts/palettes.mjs     exits non-zero if a pairing is too faint
import fs from 'node:fs';
import { PALETTES, settingVars } from '../src/lib/palettes.ts';

const rgb = (c, under = [255, 255, 255]) => {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (m) {
    const [r, g, b, a = 1] = m[1].split(',').map(Number);
    return [r, g, b].map((v, i) => v * a + under[i] * (1 - a));
  }
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
};
const lum = (c) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => {
  const B = rgb(bg);
  const F = rgb(fg, B);
  const [a, b] = [lum(F), lum(B)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

// [text, background, minimum]
const PAIRS = [
  ['ink', 'paper', 7], ['ink', 'surface', 7], ['ink-2', 'surface', 7], ['muted', 'surface', 4.5], ['muted', 'paper', 4.5],
  ['faint', 'surface', 4.5], ['faint', 'paper', 4.5], ['accent-ink', 'surface', 4.5], ['accent-ink', 'paper', 4.5],
  ['on-accent', 'accent', 4.5], ['on-inverse', 'inverse', 4.5], ['warn', 'surface', 4.5], ['good', 'surface', 4.5],
  ['sign-ink', 'sign-bg', 4.5], ['sign-end', 'sign-bg', 3], ['sign-sub', 'sign-bg', 4.5], ['sign-bad', 'sign-bg', 3],
  ['single', 'surface', 3], ['night-ink', 'night', 7],
];
let bad = 0;
for (const p of PALETTES)
  for (const mode of ['dark', 'light']) {
    const t = settingVars(p, mode);
    const fails = [];
    for (const [fg, bg, min] of PAIRS) {
      const r = ratio(t[fg], t[bg]);
      if (r < min) fails.push(`${fg} on ${bg} ${r.toFixed(2)} < ${min}`);
    }
    console.log(`${p.id} ${mode}: ${fails.length ? 'FAIL ' + fails.join('; ') : 'ok'}`);
    bad += fails.length;
  }
// Every colour's name and note must be up for translation (ColourPicker lists them).
const en = JSON.parse(fs.readFileSync(new URL('../src/i18n/locales/en.json', import.meta.url), 'utf8'));
for (const p of PALETTES)
  for (const w of [p.name, p.note])
    if (!(w in en)) {
      console.log(`not translated: "${w}" (add it to PALETTE_WORDS in ColourPicker.tsx)`);
      bad++;
    }
if (bad) process.exit(1);

// The page's first paint (index.html) carries a small copy of the colours: the
// phone browser bar and the loading screen. `--write` refreshes that copy;
// without it, a stale copy is an error.
const html = new URL('../index.html', import.meta.url);
const bar = {};
const boot = [];
for (const p of PALETTES)
  for (const mode of ['dark', 'light']) {
    const t = settingVars(p, mode);
    bar[`${p.id}-${mode}`] = p[mode].bar;
    const sel = `html[data-palette='${p.id}'][data-theme='${mode}']`;
    boot.push(`      ${p.id === 'slate' && mode === 'dark' ? 'html, ' : ''}${sel} { --b-bg: ${t.paper}; --b-sign: ${t['sign-bg']}; --b-frame: ${t.frame}; --b-ink: ${t['sign-ink']}; --b-dot: ${t['sign-end']}; --b-lit: ${p[mode].street.lit[0]}; --off: ${p[mode].street.backWin}; --b-glow: ${t['frame-rgb']}; }`);
  }
let page = fs.readFileSync(html, 'utf8');
const fresh = page
  .replace(/\/\* palettes:bar \*\/[^\n]*/, `/* palettes:bar */ var BAR = ${JSON.stringify(bar)};`)
  .replace(/( *)\/\* palettes:boot \*\/\n(?:      html[^\n]*\n)*/, `      /* palettes:boot */\n${boot.join('\n')}\n`);
if (process.argv.includes('--write')) fs.writeFileSync(html, fresh);
else if (fresh !== page) {
  console.log('index.html has an old copy of the colours: run node scripts/palettes.mjs --write');
  process.exit(1);
}
