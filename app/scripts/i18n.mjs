// Collects every string the site translates and checks the translations.
//
//   node scripts/i18n.mjs            writes src/i18n/locales/en.json and reports gaps
//   node scripts/i18n.mjs --check    exits non-zero if a language misses strings,
//                                    has placeholders that differ from English,
//                                    or the code shows English text outside t()
//
// Strings are written in English in the code, inside t('…') or mark('…').
// en.json lists them; each other language file maps the English to its own.
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const src = path.join(root, '..', 'src');
const out = path.join(src, 'i18n', 'locales');

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f.name)) files.push(p);
  }
})(src);

const keys = new Set();
const loose = [];
const call = /\b(?:t|mark)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
const unescape = (s) => s.replace(/\\(.)/g, '$1');
const plural = /\btn\(\s*[^,]+,\s*'((?:[^'\\\n]|\\.)*)',\s*'((?:[^'\\\n]|\\.)*)'/g;
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(call)) keys.add(unescape(m[1] ?? m[2] ?? m[3]));
  for (const m of text.matchAll(plural)) {
    keys.add(unescape(m[1]));
    keys.add(unescape(m[2]));
  }
  if (f.endsWith('.tsx')) {
    // English words between tags, outside any {…}: probably a string that
    // was never wrapped in t().
    text.split('\n').forEach((line, i) => {
      const m = />\s*([A-Za-z][A-Za-z ,.'’!?-]{2,})\s*</.exec(line);
      const ignore = /translate="no"|NameText|Promise|className="word"/.test(line);
      if (m && !ignore && /[a-z]{3}/.test(m[1])) loose.push(`${path.relative(src, f)}:${i + 1}: ${m[1].trim()}`);
      // A line of plain words inside JSX.
      const bare = /^\s+([A-Z][a-z]+(?: [A-Za-z,.'’]+){2,}[.?!]?)\s*$/.exec(line);
      if (bare && !ignore) loose.push(`${path.relative(src, f)}:${i + 1}: ${bare[1]}`);
    });
  }
}
const sorted = [...keys].sort();
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'en.json'), JSON.stringify(Object.fromEntries(sorted.map((k) => [k, k])), null, 1) + '\n');

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
let problems = 0;
for (const f of fs.readdirSync(out).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
  const cat = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
  const missing = sorted.filter((k) => !cat[k]);
  const bad = sorted.filter((k) => cat[k] && placeholders(cat[k]) !== placeholders(k));
  const extra = Object.keys(cat).filter((k) => !keys.has(k));
  console.log(`${f}: ${sorted.length - missing.length}/${sorted.length} translated${bad.length ? `, ${bad.length} with wrong placeholders` : ''}${extra.length ? `, ${extra.length} unused` : ''}`);
  for (const k of bad.slice(0, 5)) console.log('   placeholders differ:', JSON.stringify(k));
  problems += missing.length + bad.length;
}
console.log(`${sorted.length} strings.`);
if (loose.length) {
  console.log(`${loose.length} possible untranslated text nodes:`);
  for (const l of loose.slice(0, 40)) console.log('  ', l);
}
if (process.argv.includes('--check') && (problems || loose.length)) process.exit(1);
