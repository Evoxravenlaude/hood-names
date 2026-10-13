// Generates the on-chain name tables and test vectors.
//
//   node tools/gen-name-tables.mjs
//
// Inputs
//   tools/data/confusables.txt   Unicode security data (confusables.txt), as shipped
//                                in the ICU repository; its date is in the file header.
//   @adraffy/ens-normalize       ENSIP-15 reference implementation, used to keep
//                                only characters that ENS-aware wallets accept.
// Outputs
//   nametables/page-N.hex        table pages, deployed as contract bytecode
//   nametables/meta.json         ranges, script groups, counts
//   nametables/vectors.json      label -> expected result, for the Solidity tests
//   nametables/skeleton.json     the same table for off-chain use (SDK)
//
// The rule the tables implement: every allowed character has a "prototype",
// the plainest character or characters it could be mistaken for. A name's
// skeleton is its prototypes joined together. Two names with the same
// skeleton look alike, and the registrar lets only one of them exist.

import fs from 'node:fs';
import { ens_tokenize } from '@adraffy/ens-normalize';

const confText = fs.readFileSync('tools/data/confusables.txt', 'utf8');
const confDate = /# Date: (\S+)/.exec(confText)?.[1] ?? 'unknown';
const conf = {};
for (const raw of confText.split(/\r?\n/)) {
  const line = raw.replace(/^\uFEFF/, '').split('#')[0].trim();
  if (!line) continue;
  const [from, to] = line.split(';').map((x) => x.trim());
  const str = (x) => x.split(/\s+/).map((h) => String.fromCodePoint(parseInt(h, 16))).join('');
  conf[str(from)] = str(to);
}

// Script ids are bit positions. 0 means "common" (digits, hyphen).
const SCRIPTS = [
  // fold: also strip accents, so that an accented letter and its plain form collide
  { id: 1, name: 'Latin', re: /^\p{Script=Latin}$/u, fold: true,
    explicit: [[0x61, 0x7a], [0xdf, 0x24f], [0x1e00, 0x1eff]] },
  { id: 2, name: 'Cyrillic', re: /^\p{Script=Cyrillic}$/u, fold: true,
    explicit: [[0x430, 0x4ff]] },
  { id: 3, name: 'Greek', re: /^\p{Script=Greek}$/u, fold: true,
    explicit: [[0x3ac, 0x3ce]] },
  { id: 4, name: 'Han', re: /^\p{Script=Han}$/u, fold: false,
    identity: [[0x4e00, 0x9fff]] },
  { id: 5, name: 'Hiragana', re: /^\p{Script=Hiragana}$/u, fold: false,
    explicit: [[0x3041, 0x3096]] },
  { id: 6, name: 'Katakana', re: /^\p{Script=Katakana}$/u, fold: false,
    explicit: [[0x30a1, 0x30fa]], extra: [0x30fc] },
  { id: 7, name: 'Hangul', re: /^\p{Script=Hangul}$/u, fold: false,
    identity: [[0xac00, 0xd7a3]] },
];
// Which scripts may appear together in one label.
const GROUPS = [
  ['Latin'], ['Cyrillic'], ['Greek'],
  ['Han', 'Hiragana', 'Katakana'], // Japanese, and Chinese (Han alone)
  ['Han', 'Hangul'],               // Korean
];
const MAX_PROTO_BYTES = 8;
const RECORD = 3 + 1 + 1 + MAX_PROTO_BYTES;
const MAX_PAGE_RECORDS = Math.floor((24576 - 1) / RECORD);

const enc = new TextEncoder();
const stripMarks = (s) => s.replace(/\p{M}/gu, '');

// ---- Folds added on top of the Unicode data ---------------------------------
//
// STRONG: treated exactly like Unicode's own entries.
const STRONG = {
  w: 'vv',            // as m -> rn in the Unicode data
  'ß': 'ss',          // uppercase of both is SS; ENS interfaces map one to the other
  'ς': 'σ',           // final sigma: the same letter
  'ー': '-', '一': '-', // long-vowel mark and the numeral one against a hyphen
  // Hiragana and katakana drawn the same way.
  'へ': 'ヘ', 'り': 'リ', 'べ': 'ベ', 'ぺ': 'ペ',
};
// Small kana against their full-size forms.
const SMALL_KANA = 'ぁあぃいぅうぇえぉおっつゃやゅゆょよゎわゕかゖけァアィイゥウェエォオッツャヤュユョヨヮワヵカヶケ';
for (let i = 0; i < [...SMALL_KANA].length; i += 2) STRONG[[...SMALL_KANA][i]] = [...SMALL_KANA][i + 1];
// Where Unicode already relates a pair in the other direction, its entry wins.
for (const [k, v] of Object.entries(STRONG)) if (conf[v] === k || conf[k] !== undefined && conf[k] !== v && [...v].length === 1 && conf[v] === undefined && false) delete STRONG[k];

// WEAK: letters of another alphabet that pass for a Latin letter at a glance
// without being drawn identically. Unicode maps them to small capitals or to
// themselves. A name using one of these shares its skeleton with the Latin
// spelling (so the two cannot coexist), but is not refused outright the way
// an exact imitation is, because these letters are needed to write ordinary
// words. Keys are the Unicode prototypes these letters arrive at.
const WEAK = {
  'ĸ': 'k', // Cyrillic к, Greek κ
  'ᴛ': 't', // Cyrillic т, Greek τ
  'ʍ': 'm', // Cyrillic м
  'ʙ': 'b', // Cyrillic в
  'ʜ': 'h', // Cyrillic н
  'ɜ': '3', // Cyrillic з
  'ꞓ': 'e', // Greek ε
  'χ': 'x', 'ω': 'w', 'ш': 'w', 'η': 'n',
};

/** Prototype of a string, and whether a weak fold was used to reach it.
 *  1. For alphabetic scripts, drop accents from the character itself, so an
 *     accented letter and its plain form collide.
 *  2. Apply the confusable mapping and lowercase, repeatedly, until nothing
 *     changes. For Latin letters, a stroke through the letter is dropped too
 *     (l-stroke, o-slash); for other alphabets it is kept, since it is what
 *     tells theta from o. */
function prototype(s, script) {
  const fold = script.fold ?? true;
  const latin = script.name === 'Latin';
  let weak = false;
  const nfd = (x) => (fold ? x.normalize('NFD') : x);
  const mapChar = (c) => {
    if (STRONG[c] !== undefined) return STRONG[c];
    if (WEAK[c] !== undefined && !latin) { weak = true; return WEAK[c]; }
    return conf[c] ?? c;
  };
  if (fold) s = stripMarks(s.normalize('NFD'));
  for (let i = 0; i < 12; i++) {
    let t = nfd([...nfd(s)].map(mapChar).join('').toLowerCase());
    if (latin) t = t.replace(/[\u0335-\u0338]/g, '');
    if (t === s) return { proto: s, weak };
    s = t;
  }
  throw new Error('prototype did not settle: ' + s);
}

function ensValid(ch) {
  try {
    const t = ens_tokenize(ch);
    if (t.length !== 1) return false;
    if (t[0].type === 'valid') return true;
    // Precomposed letters come back as an NFC token that composes to themselves.
    return t[0].type === 'nfc' && t[0].cps.length === 1 && t[0].cps[0] === ch.codePointAt(0);
  } catch { return false; }
}

const entries = new Map(); // cp -> { script, proto }
const dropped = [];
function consider(cp, script, allowAnyCategory = false) {
  const ch = String.fromCodePoint(cp);
  if (script.id && !script.re.test(ch) && !allowAnyCategory) return;
  if (!allowAnyCategory && !/^[\p{Ll}\p{Lo}]$/u.test(ch)) return;
  if (ch.normalize('NFC') !== ch || ch.normalize('NFKC') !== ch) return;
  if (ch.toLowerCase() !== ch) return;
  if (!ensValid(ch)) { dropped.push([cp, 'not valid under ENSIP-15']); return; }
  const { proto, weak } = prototype(ch, script);
  if (enc.encode(proto).length > MAX_PROTO_BYTES || proto.length === 0) {
    dropped.push([cp, 'prototype too long']);
    return;
  }
  // Every Latin letter must reduce to plain ASCII. One that does not has a
  // shape this table cannot place, so it is left out instead of let through.
  if (script.name === 'Latin' && !/^[\x00-\x7f]+$/.test(proto)) {
    dropped.push([cp, 'Latin letter without an ASCII prototype']);
    return;
  }
  entries.set(cp, { script: script.id, proto, weak });
}

// Common: digits and hyphen.
const COMMON = { id: 0, fold: true, name: 'Common' };
for (let cp = 0x30; cp <= 0x39; cp++) consider(cp, COMMON, true);
consider(0x2d, COMMON, true);

const ranges = [];
for (const s of SCRIPTS) {
  for (const [a, b] of s.explicit ?? []) for (let cp = a; cp <= b; cp++) consider(cp, s);
  for (const cp of s.extra ?? []) consider(cp, s, true);
  for (const [a, b] of s.identity ?? []) {
    // Everything in an identity range maps to itself, except characters the
    // confusables data maps elsewhere, which get explicit entries, and
    // characters ENS does not accept, which split the range.
    let start = null;
    const close = (end) => { if (start !== null) { ranges.push({ start, end, script: s.id }); start = null; } };
    for (let cp = a; cp <= b; cp++) {
      const ch = String.fromCodePoint(cp);
      const ok = s.re.test(ch) && ch.normalize('NFKC') === ch && ensValid(ch);
      if (!ok) { close(cp - 1); dropped.push([cp, 'excluded from range']); continue; }
      if (prototype(ch, s).proto !== ch) consider(cp, s);
      if (start === null) start = cp;
    }
    close(b);
  }
}

// A character must not be its own lookalike under two different entries
// for nothing: report how many classes have more than one member.
const classes = new Map();
for (const [cp, e] of entries) {
  if (!classes.has(e.proto)) classes.set(e.proto, []);
  classes.get(e.proto).push(cp);
}

// Pages: sorted records  [cp:3][script:1][len:1][proto:8]
const sorted = [...entries.entries()].sort((x, y) => x[0] - y[0]);
const pages = [];
for (let i = 0; i < sorted.length; i += MAX_PAGE_RECORDS) pages.push(sorted.slice(i, i + MAX_PAGE_RECORDS));
fs.rmSync('nametables', { recursive: true, force: true });
fs.mkdirSync('nametables', { recursive: true });
pages.forEach((page, n) => {
  const buf = Buffer.alloc(1 + page.length * RECORD); // leading 0x00 = STOP
  page.forEach(([cp, e], i) => {
    const o = 1 + i * RECORD;
    buf.writeUIntBE(cp, o, 3);
    buf[o + 3] = e.script | (e.weak ? 0x80 : 0);
    const p = enc.encode(e.proto);
    buf[o + 4] = p.length;
    buf.set(p, o + 5);
  });
  fs.writeFileSync(`nametables/page-${n}.hex`, '0x' + buf.toString('hex'));
});

const PRICE_NEUTRAL = new Set(['ss', 'ae']);
const scriptId = Object.fromEntries(SCRIPTS.map((s) => [s.name, s.id]));
const groups = GROUPS.map((g) => g.reduce((m, n) => m | (1 << scriptId[n]), 0));
const meta = {
  source: `Unicode confusables.txt dated ${confDate}; ENSIP-15 via @adraffy/ens-normalize 1.11.1; generated with Node ${process.version}, Unicode ${process.versions.unicode}`,
  // Prototypes longer than one character. A name is priced by the shortest
  // name that shares its skeleton, so each of these counts as one character.
  // Two are left out because they are spelling equivalents, not lookalikes:
  // "ss" (for ß) and "ae" (for æ). Counting them would price every word
  // containing "ss" or "ae" one character shorter than it is.
  patterns: [...new Set([...entries.values()].map((e) => e.proto).filter((p) => [...p].length > 1 && !PRICE_NEUTRAL.has(p)))]
    .sort((x, y) => enc.encode(y).length - enc.encode(x).length || (x < y ? -1 : 1))
    .map((p) => '0x' + Buffer.from(enc.encode(p)).toString('hex')),
  recordBytes: RECORD,
  pages: pages.map((p, n) => ({ file: `nametables/page-${n}.hex`, records: p.length, first: p[0][0], last: p[p.length - 1][0] })),
  // Flat arrays, which is the shape the deploy script reads.
  pageFiles: pages.map((_, n) => `nametables/page-${n}.hex`),
  rangeStarts: ranges.map((r) => r.start),
  rangeEnds: ranges.map((r) => r.end),
  rangeScripts: ranges.map((r) => r.script),
  ranges,
  groups,
  latinBit: 1 << scriptId.Latin,
  scripts: SCRIPTS.map((s) => ({ id: s.id, name: s.name })),
  counts: { entries: entries.size, lookalikeClasses: [...classes.values()].filter((c) => c.length > 1).length, dropped: dropped.length },
};
fs.writeFileSync('nametables/meta.json', JSON.stringify(meta, null, 1));
fs.writeFileSync('nametables/skeleton.json', JSON.stringify({
  entries: Object.fromEntries(sorted.map(([cp, e]) => [cp, [e.script, e.proto, e.weak ? 1 : 0]])), ranges, groups,
  patterns: meta.patterns, latinBit: meta.latinBit,
}));

// ---- reference implementation, used for the vectors and mirrored on-chain
const patternBytes = meta.patterns.map((h) => Buffer.from(h.slice(2), 'hex'));
function lookup(cp) {
  const e = entries.get(cp);
  if (e) return e;
  for (const r of ranges) if (cp >= r.start && cp <= r.end) return { script: r.script, proto: String.fromCodePoint(cp), weak: false };
  return null;
}
/** Characters in the shortest name with this skeleton: a multi-character
 *  prototype counts once. */
function units(skelBytes) {
  let i = 0, n = 0;
  outer: while (i < skelBytes.length) {
    for (const p of patternBytes) {
      if (skelBytes.subarray(i, i + p.length).equals(p)) { i += p.length; n++; continue outer; }
    }
    const b = skelBytes[i];
    i += b < 0x80 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : 4;
    n++;
  }
  return n;
}
/** "ox" followed only by hex digits as they appear in a skeleton (0 -> o, 1 -> l). */
const addressLike = (skeleton) => /^ox[ol2-9a-f]{8,}$/.test(skeleton);
export function check(label) {
  const cps = [...label].map((c) => c.codePointAt(0));
  if (cps.length < 3 || cps.length > 63) return { ok: false };
  if (enc.encode(label).length > 255) return { ok: false };
  if (cps[0] === 0x2d || cps[cps.length - 1] === 0x2d) return { ok: false };
  if (cps[2] === 0x2d && cps[3] === 0x2d) return { ok: false };
  let mask = 0, skeleton = '', exact = true;
  for (const cp of cps) {
    const e = lookup(cp);
    if (!e) return { ok: false };
    if (e.script) {
      mask |= 1 << e.script;
      if (e.weak || !/^[\x00-\x7f]*$/.test(e.proto)) exact = false;
    }
    skeleton += e.proto;
  }
  if (mask && !groups.some((g) => (mask & ~g) === 0)) return { ok: false };
  // A name in another alphabet whose every letter is an exact double of a
  // Latin letter is an imitation, and is refused outright.
  if (exact && (mask & ~meta.latinBit) !== 0) return { ok: false };
  if (addressLike(skeleton)) return { ok: false };
  const u = units(Buffer.from(enc.encode(skeleton)));
  return { ok: true, skeleton, length: cps.length, priceLength: Math.min(cps.length, u) };
}

const hex = (s) => '0x' + Buffer.from(enc.encode(s)).toString('hex');
const samples = [
  // plain
  'alice', 'bob', 'abc', 'alice-2', '7eleven', 'a-b-c',
  // too short / long / hyphens
  'ab', '-alice', 'alice-', 'ab--cd', '0xabc', 'a'.repeat(63), 'a'.repeat(64),
  // case and symbols are not accepted as written
  'Alice', 'al ice', 'al.ice', 'al_ice', 'alice!',
  // accents fold to the plain letter
  'café', 'cafe', 'señor', 'senor', 'über', 'uber', 'zoë', 'zoe', 'ångström', 'việt',
  // digits that pass for letters, and letter pairs that pass for one letter
  'g00gle', 'google', 'paypa1', 'paypal', 'modern', 'modem', 'vvave', 'wave',
  // other alphabets
  'привет', 'москва', 'αθήνα', 'ελλάδα', '東京都', 'こんにちは', 'カタカナ', '東京タワー', '서울특별시', '한국어',
  // lookalikes across alphabets: refused, because they read as Latin
  'рое', 'аррӏе', 'ροε', 'сосо', 'хохо',
  // mixed alphabets in one name
  'aliсe', 'αlice', 'tokyo東京', 'привет世界',
  // invisible characters and compatibility forms
  'ali​ce', 'ali‍ce', 'alice﻿', 'ａｌｉｃｅ', 'école', 'école',
  // emoji and unsupported scripts
  'alice😀', 'مرحبا', 'नमस्ते',
  // brand lookalikes
  'robinhood', 'r0binhood', 'robinh00d', 'rоbinhood', 'robínhood', 'nvda', 'nvdа', 'support', 'supp0rt',
  // Japanese lookalikes between scripts
  'カロエ', '力口工', 'ニハト', 'カード', 'カ-ド', 'りんご', 'リんご', 'きょう', 'きよう', '日本語', '曰本語', 'ムラ田', '厶ラ田',
  // strokes, sharp s, final sigma
  'røbinhood', 'robinhøød', 'wałłet', 'wallet', 'paypał', 'straße', 'strasse', 'οδος', 'οδοσ',
  // other alphabets passing for Latin: exact doubles are refused, near doubles collide
  'соке', 'coke', 'окх', 'okx', 'теѕӏа', 'tesla', 'мета', 'meta', 'з00', '300', 'мама', 'mama', 'ναι', 'ωοω',
  // address-like
  'oxd8da6bf26964af9d7eed9e03e53415d37aa96045', 'oxford', 'oxbedface', 'oxbedfaced1',
  // priced by the shortest name with the same look
  'www', 'vvvvvv', 'moon', 'rnoon', 'burn', 'bum',
];
const vectors = samples.map((label) => {
  const r = check(label);
  return { label: hex(label), length: r.ok ? r.length : 0, ok: r.ok, priceLength: r.ok ? r.priceLength : 0, skeleton: r.ok ? hex(r.skeleton) : '0x' };
});
fs.writeFileSync('nametables/vectors.json', JSON.stringify({ vectors }, null, 1));

if (process.argv.includes('--report')) {
  console.log(JSON.stringify(meta.counts), 'pages', pages.length, 'ranges', ranges.length);
  const show = (l) => { const r = check(l); console.log(l.padEnd(14), r.ok ? `ok   ${r.skeleton}  (${r.length}/${r.priceLength})` : 'refused'); };
  samples.forEach(show);
  const multi = [...classes.entries()].filter(([, c]) => c.length > 1).slice(0, 12);
  for (const [p, c] of multi) console.log('class', JSON.stringify(p), c.map((x) => String.fromCodePoint(x)).join(' '));
  const by = {}; for (const [, why] of dropped) by[why] = (by[why] ?? 0) + 1; console.log(by);
}
