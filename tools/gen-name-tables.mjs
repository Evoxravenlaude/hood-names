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
// Indic vowels written two ways. The Unicode Standard lists, for each of
// these scripts, sequences that must not be used because they draw the same
// as a single character ("do not use" tables in chapter 12). Each pair is
// folded together here so the two spellings share a skeleton.
Object.assign(STRONG, {
  // Devanagari: the vowel signs built on aa, and independent vowels on a and e
  'ॉ': 'ाॅ', 'ॊ': 'ाॆ', 'ो': 'ाे', 'ौ': 'ाै',
  'आ': 'अा', 'ऄ': 'अॆ', 'ऑ': 'अॉ', 'ऒ': 'अॊ', 'ओ': 'अो', 'औ': 'अौ', 'ॲ': 'अॅ',
  'ॳ': 'अऺ', 'ॴ': 'अऻ', 'ॵ': 'अॏ', 'ॶ': 'अॖ', 'ॷ': 'अॗ',
  'ऍ': 'एॅ', 'ऎ': 'एॆ', 'ऐ': 'एे',
  // Gujarati
  'ૉ': 'ાૅ', 'ો': 'ાે', 'ૌ': 'ાૈ',
  'આ': 'અા', 'ઍ': 'અૅ', 'એ': 'અે', 'ઐ': 'અૈ', 'ઑ': 'અૉ', 'ઓ': 'અો', 'ઔ': 'અૌ',
  // Gurmukhi: vowels on the bearers a, i and u
  'ਆ': 'ਅਾ', 'ਐ': 'ਅੈ', 'ਔ': 'ਅੌ',
  'ਇ': 'ੲਿ', 'ਈ': 'ੲੀ', 'ਏ': 'ੲੇ',
  'ਉ': 'ੳੁ', 'ਊ': 'ੳੂ', 'ਓ': 'ੳੋ',
});
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
  // Scripts with vowel signs are decomposed (a two-part vowel sign into its
  // parts) but keep their marks, which are letters there, not accents.
  const nfd = (x) => (fold || script.marks ? x.normalize('NFD') : x);
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
function consider(cp, script, allowAnyCategory = false, target = entries) {
  const ch = String.fromCodePoint(cp);
  if (script.id && !script.re.test(ch) && !allowAnyCategory) return;
  // Scripts written with vowel signs and other combining marks list those
  // marks as characters of their own.
  const letter = script.marks ? /^[\p{Ll}\p{Lo}\p{Mn}\p{Mc}]$/u : /^[\p{Ll}\p{Lo}]$/u;
  if (!allowAnyCategory && !letter.test(ch)) return;
  if (ch.normalize('NFC') !== ch || ch.normalize('NFKC') !== ch) return;
  if (ch.toLowerCase() !== ch) return;
  if (!ensValid(ch)) { dropped.push([cp, 'not valid under ENSIP-15']); return; }
  const { proto, weak } = prototype(ch, script);
  // Extension prototypes are shortened afterwards, and checked then.
  if ((!script.deferLength && enc.encode(proto).length > MAX_PROTO_BYTES) || proto.length === 0) {
    dropped.push([cp, 'prototype too long']);
    return;
  }
  // Every Latin letter must reduce to plain ASCII. One that does not has a
  // shape this table cannot place, so it is left out instead of let through.
  if (script.name === 'Latin' && !/^[\x00-\x7f]+$/.test(proto)) {
    dropped.push([cp, 'Latin letter without an ASCII prototype']);
    return;
  }
  target.set(cp, { script: script.id, proto, weak, mark: !!script.marks && /^[\p{Mn}\p{Mc}]$/u.test(ch) });
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

// ---- Extensions ---------------------------------------------------------------
//
// Alphabets added after launch. The launch tables above are sealed on-chain,
// so each extension may only add characters that do not resolve yet and
// script groups made of scripts no group uses yet. Every name that was
// allowed stays exactly as it was; names that were refused because they
// used one of these alphabets become possible.
//
// The same files are applied to a fresh deployment after it is sealed, so a
// new deployment and an extended old one end up with identical tables.
//
// Two kinds of alphabet need rules only HoodNameRules version 2 enforces,
// and their extensions are skipped on the launch contract:
//  - scripts written with combining marks (vowel signs, tone marks). Marks
//    typed in another order, doubled, or with nothing to sit on can draw
//    exactly like the proper spelling, so version 2 accepts marks only in
//    Unicode's canonical order. Each mark's record carries its rank;
//  - right-to-left scripts: no digits or hyphens in a right-to-left name,
//    since "abc123" and "123abc" written in Arabic letters display
//    identically next to ".hood".
const RTL_FLAG = 0x40;
const MARK_FLAG = 0x20;
const EXTENSIONS = [
  {
    id: 1,
    title: 'Georgian, Armenian and Ethiopic',
    scripts: [
      { id: 20, name: 'Georgian', label: 'Georgian', range: [0x10d0, 0x10ff], fold: true },
      { id: 21, name: 'Armenian', label: 'Armenian', range: [0x0560, 0x058f], fold: true },
      { id: 22, name: 'Ethiopic', label: 'Amharic, Tigrinya', range: [0x1200, 0x139f], fold: false },
    ],
    samples: ['გამარჯობა', 'բարեւ', 'ሰላም'],
  },
  {
    id: 2,
    title: 'Indic scripts, Thai and Lao',
    requiresVersion: 2,
    scripts: [
      { id: 8, name: 'Devanagari', label: 'Hindi, Marathi, Nepali', range: [0x0900, 0x097f], marks: true, fold: false },
      { id: 9, name: 'Bengali', label: 'Bengali, Assamese', range: [0x0980, 0x09ff], marks: true, fold: false },
      { id: 10, name: 'Gurmukhi', label: 'Punjabi', range: [0x0a00, 0x0a7f], marks: true, fold: false },
      { id: 11, name: 'Gujarati', label: 'Gujarati', range: [0x0a80, 0x0aff], marks: true, fold: false },
      { id: 12, name: 'Oriya', label: 'Odia', range: [0x0b00, 0x0b7f], marks: true, fold: false },
      { id: 13, name: 'Tamil', label: 'Tamil', range: [0x0b80, 0x0bff], marks: true, fold: false },
      { id: 14, name: 'Telugu', label: 'Telugu', range: [0x0c00, 0x0c7f], marks: true, fold: false },
      { id: 15, name: 'Kannada', label: 'Kannada', range: [0x0c80, 0x0cff], marks: true, fold: false },
      { id: 16, name: 'Malayalam', label: 'Malayalam', range: [0x0d00, 0x0d7f], marks: true, fold: false },
      { id: 17, name: 'Sinhala', label: 'Sinhala', range: [0x0d80, 0x0dff], marks: true, fold: false },
      { id: 18, name: 'Thai', label: 'Thai', range: [0x0e00, 0x0e7f], marks: true, fold: false },
      { id: 19, name: 'Lao', label: 'Lao', range: [0x0e80, 0x0eff], marks: true, fold: false },
    ],
    samples: ['नमस्ते', 'বাংলা', 'ਪੰਜਾਬ', 'ગુજરાત', 'ଓଡ଼ିଆ', 'தமிழ்', 'తెలుగు', 'ಕನ್ನಡ', 'മലയാളം', 'සිංහල', 'สวัสดี', 'ສະບາຍດີ'],
  },
  {
    id: 3,
    title: 'Right-to-left alphabets',
    requiresVersion: 2,
    scripts: [
      { id: 23, name: 'Arabic', label: 'Arabic, Persian, Urdu', range: [0x0620, 0x06ff], fold: true, rtl: true },
      { id: 24, name: 'Hebrew', label: 'Hebrew', range: [0x05d0, 0x05ef], fold: false, rtl: true },
    ],
    samples: ['مرحبا', 'سلام', 'שלום'],
  },
];
for (const ext of EXTENSIONS) for (const s of ext.scripts) {
  s.re = new RegExp(`^\\p{Script=${s.name}}$`, 'u');
  s.deferLength = true;
}

/** Where a codepoint resolves in the tables built so far, if anywhere. */
const resolvesAlready = (cp, extra) =>
  entries.has(cp) || extra.has(cp) || ranges.some((r) => cp >= r.start && cp <= r.end);

// Characters any prototype already uses as a symbol. Those are left alone
// when prototypes are shortened below, so launch characters keep colliding
// with whatever they collided with.
const launchSymbols = new Set([...entries.values()].flatMap((e) => [...e.proto]));

// Two-byte codes for extension symbols: U+0080..U+017F. No launch prototype
// uses them (Latin-1 and Latin Extended-A letters fold to plain ASCII), so
// they never occur in the skeleton of a name that existed before an
// extension. HoodNameRules v2 accepts a pattern after sealing only if it
// starts with one of these, so such a pattern cannot reprice an older name.
const COMPACT_CODES = 0x100;
const isCompactCode = (c) => c.codePointAt(0) >= 0x80 && c.codePointAt(0) <= 0x17f;
for (const sym of launchSymbols) if (isCompactCode(sym)) throw new Error('U+0080..U+017F already used by a launch prototype');
const compact = new Map(); // symbol -> two-byte code, shared by all extensions

// Canonical combining class, as an order. Only the order matters to the
// rule on-chain, so marks are ranked 1, 2, 3… by comparing pairs with the
// platform's own Unicode normalisation (which sorts marks by class).
const HIGH_MARK = 'ͅ'; // class 240, above every mark used here
const firstOf = (m) => m.normalize('NFD');
const hasClass = (m) => ('a' + HIGH_MARK + firstOf(m)).normalize('NFD') !== 'a' + HIGH_MARK + firstOf(m);
const before = (a, b) => ('a' + firstOf(b) + firstOf(a)).normalize('NFD') === 'a' + firstOf(a) + firstOf(b) && firstOf(a) !== firstOf(b);
function rankMarks(marks) {
  const classed = marks.filter(hasClass);
  const sorted = [...classed].sort((a, b) => (before(a, b) ? -1 : before(b, a) ? 1 : 0));
  const rank = new Map();
  let r = 0;
  sorted.forEach((m, i) => {
    if (i === 0 || before(sorted[i - 1], m)) r++;
    rank.set(m, r);
  });
  if (r > 15) throw new Error('more than 15 mark classes');
  return rank;
}

const extEntries = new Map(); // every extension's characters, cp -> { script, proto, weak, rtl, mark, rank }
const extOut = [];
for (const ext of EXTENSIONS) {
  const mine = new Map();
  for (const s of ext.scripts) {
    for (let cp = s.range[0]; cp <= s.range[1]; cp++) {
      if (resolvesAlready(cp, extEntries)) throw new Error(`extension ${ext.id}: U+${cp.toString(16)} already resolves`);
      consider(cp, s, false, mine);
    }
  }
  for (const [cp, e] of mine)
    for (const c of e.proto) if (isCompactCode(c)) throw new Error(`extension ${ext.id}: U+${cp.toString(16)} has a prototype in the code range`);
  // Unicode's prototypes for these scripts often point at a letter of a
  // rarer script that is drawn the same way (Devanagari "ा" -> Nandinagari
  // "𑧑"). Where a character of this extension has a prototype that is a
  // single such symbol, that character stands for the symbol instead (the
  // lowest one, if several do): the same collisions, in fewer bytes.
  const owners = new Map();
  for (const [cp, e] of mine) {
    if ([...e.proto].length === 1 && e.proto !== String.fromCodePoint(cp)) {
      if (!owners.has(e.proto)) owners.set(e.proto, []);
      owners.get(e.proto).push(cp);
    }
  }
  const rename = new Map();
  for (const [symbol, cps] of owners) {
    if (launchSymbols.has(symbol)) continue;
    const allowed = (c) => entries.has(c.codePointAt(0)) || mine.has(c.codePointAt(0)) || extEntries.has(c.codePointAt(0));
    if (allowed(symbol)) continue;
    cps.sort((a, b) => a - b);
    rename.set(symbol, String.fromCodePoint(cps[0]));
  }
  for (const e of mine.values()) e.proto = [...e.proto].map((c) => rename.get(c) ?? c).join('');
  // Some letters are still too long to store: an independent vowel such as
  // Devanagari "ओ" is drawn as "अ" plus two vowel signs, nine bytes in UTF-8.
  // The symbols those prototypes use get a two-byte code instead (see
  // COMPACT_CODES). Skeletons are only ever compared, so any consistent code
  // works; the code is applied to every prototype that contains the symbol,
  // the vowel sign's own included.
  const allocatedHere = new Set();
  const allocate = (c) => {
    if (compact.has(c) || compact.size >= COMPACT_CODES) return;
    const code = String.fromCodePoint(0x80 + compact.size);
    compact.set(c, code);
    allocatedHere.add(code);
  };
  for (const e of mine.values()) {
    if (enc.encode(e.proto).length <= MAX_PROTO_BYTES) continue;
    for (const c of [...e.proto].filter((c) => enc.encode(c).length > 2)) allocate(c);
  }
  // A prototype of several characters is a pattern: a name is priced by the
  // shortest name that looks like it, so the pattern counts as one character.
  // Only prototypes that can also be spelled with two or more characters of
  // the same script matter for pricing; one whose parts cannot be typed
  // together in one name has no cheaper twin.
  const spellable = (p, script) => {
    const singleProtos = new Set(
      [...entries.values(), ...extEntries.values(), ...mine.values()].filter((e) => e.script === script || e.script === 0).map((e) => e.proto),
    );
    const sym = [...p];
    const ok = [true];
    for (let j = 1; j <= sym.length; j++) {
      ok[j] = false;
      for (let i = 0; i < j && !ok[j]; i++) if (ok[i] && !(i === 0 && j === sym.length) && singleProtos.has(sym.slice(i, j).join(''))) ok[j] = true;
    }
    return ok[sym.length];
  };
  // Patterns added after sealing must begin with a two-byte code allocated
  // by this extension, so they can never match inside a name that existed
  // before it. The first symbol of each pattern gets one.
  for (const e of mine.values()) {
    const first = [...e.proto][0];
    if ([...e.proto].length > 1 && spellable(e.proto, e.script) && !isCompactCode(first)) allocate(first);
  }
  for (const e of mine.values()) e.proto = [...e.proto].map((c) => compact.get(c) ?? c).join('');
  const rank = rankMarks([...mine.entries()].filter(([, e]) => e.mark).map(([cp]) => String.fromCodePoint(cp)));
  for (const [cp, e] of mine) {
    if (enc.encode(e.proto).length > MAX_PROTO_BYTES) {
      // Too long to store even after shortening: keep the character, as its
      // own prototype, so the alphabet is still usable. Its lookalike made
      // of several characters is then a separate name; ENS has the same gap.
      dropped.push([cp, 'prototype kept as itself (too long)']);
      e.proto = String.fromCodePoint(cp);
    }
    const s = ext.scripts.find((x) => x.id === e.script);
    e.rtl = !!s.rtl;
    e.rank = e.mark ? rank.get(String.fromCodePoint(cp)) ?? 0 : 0;
    extEntries.set(cp, e);
  }

  const sortedExt = [...mine.entries()].sort((x, y) => x[0] - y[0]);
  const dir = `nametables/ext-${ext.id}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const extPages = [];
  for (let i = 0; i < sortedExt.length; i += MAX_PAGE_RECORDS) extPages.push(sortedExt.slice(i, i + MAX_PAGE_RECORDS));
  const pageHex = extPages.map((page) => {
    const buf = Buffer.alloc(1 + page.length * RECORD);
    page.forEach(([cp, e], i) => {
      const o = 1 + i * RECORD;
      buf.writeUIntBE(cp, o, 3);
      buf[o + 3] = e.script | (e.weak ? 0x80 : 0) | (e.rtl ? RTL_FLAG : 0) | (e.mark ? MARK_FLAG : 0);
      const p = enc.encode(e.proto);
      buf[o + 4] = p.length | (e.rank << 4);
      buf.set(p, o + 5);
    });
    return '0x' + buf.toString('hex');
  });
  pageHex.forEach((h, n) => fs.writeFileSync(`${dir}/page-${n}.hex`, h));
  // Version 1 contracts cannot take marks or right-to-left letters.
  if ((ext.requiresVersion ?? 1) < 2 && sortedExt.some(([, e]) => e.mark || e.rtl || e.rank))
    throw new Error(`extension ${ext.id} needs version 2`);
  const multi = [...new Set([...mine.values()].filter((e) => [...e.proto].length > 1 && spellable(e.proto, e.script)).map((e) => e.proto))];
  // Patterns are matched whatever the script, so one that another script
  // can also spell would price that script's ordinary words as shorter
  // than they are (Gurmukhi "ੲ" draws like Devanagari "प्ट"). Those are left
  // out: the long spelling is then priced by its own length.
  const scriptIds = new Set([...entries.values(), ...extEntries.values(), ...mine.values()].map((e) => e.script).filter(Boolean));
  const scriptOfProto = new Map([...mine.values()].map((e) => [e.proto, e.script]));
  const elsewhere = (p) => [...scriptIds].some((g) => g !== scriptOfProto.get(p) && spellable(p, g));
  const extPatterns = multi
    .filter((p) => allocatedHere.has([...p][0]) && enc.encode(p).length <= 7 && !elsewhere(p))
    .sort((x, y) => enc.encode(y).length - enc.encode(x).length || (x < y ? -1 : 1));
  const unpriced = multi.filter((p) => !extPatterns.includes(p));
  const perScript = Object.fromEntries(ext.scripts.map((s) => [s.name, sortedExt.filter(([, e]) => e.script === s.id).length]));
  const extMeta = {
    id: ext.id,
    title: ext.title,
    requiresVersion: ext.requiresVersion ?? 1,
    pageFiles: extPages.map((_, n) => `${dir}/page-${n}.hex`),
    // The first code point of each page, so a script can tell which pages
    // are already on-chain.
    pageFirst: extPages.map((p) => p[0][0]),
    // Each script on its own: these alphabets are not mixed with any other.
    groups: ext.scripts.map((s) => 1 << s.id),
    // A label that is refused before this extension and allowed after it.
    probe: ext.samples[0],
    // Applied only where the contract accepts patterns after sealing (version 2).
    patterns: extPatterns.map((p) => '0x' + Buffer.from(enc.encode(p)).toString('hex')),
    // Lookalikes spelled with more characters that cannot be priced as the
    // shorter name (prototype too long, or not starting with a fresh code).
    unpricedLookalikes: unpriced.length,
    scripts: ext.scripts.map((s) => ({ id: s.id, name: s.name, languages: s.label, rtl: !!s.rtl, characters: perScript[s.name] })),
  };
  fs.writeFileSync(`${dir}/meta.json`, JSON.stringify(extMeta, null, 1));
  extOut.push({ ...extMeta, samples: ext.samples });
}
const allGroups = [...groups, ...extOut.flatMap((e) => e.groups)];
fs.writeFileSync('nametables/extensions.json', JSON.stringify({ files: extOut.map((e) => `nametables/ext-${e.id}/meta.json`) }, null, 1));

fs.writeFileSync('nametables/skeleton.json', JSON.stringify({
  entries: Object.fromEntries(
    [...sorted, ...[...extEntries.entries()].sort((x, y) => x[0] - y[0])].map(([cp, e]) => [cp, [e.script, e.proto, e.weak ? 1 : 0, e.rtl ? 1 : 0, e.mark ? 1 : 0, e.rank ?? 0]]),
  ),
  ranges, groups: allGroups,
  patterns: meta.patterns, latinBit: meta.latinBit,
}));

// ---- reference implementation, used for the vectors and mirrored on-chain
const patternBytes = [...meta.patterns, ...extOut.flatMap((e) => e.patterns)]
  .map((h) => Buffer.from(h.slice(2), 'hex'))
  .sort((x, y) => y.length - x.length);
function lookup(cp) {
  const e = entries.get(cp) ?? extEntries.get(cp);
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
  let mask = 0, skeleton = '', exact = true, rtl = false, common = false;
  let prevCp = -1, prevRank = 0, prevCommon = false;
  for (const [i, cp] of cps.entries()) {
    const e = lookup(cp);
    if (!e) return { ok: false };
    if (e.rtl) rtl = true;
    // Marks: something to sit on, no repeats, canonical order.
    if (e.mark && (i === 0 || prevCommon || cp === prevCp || (e.rank && prevRank > e.rank))) return { ok: false };
    prevCp = cp;
    prevRank = e.rank ?? 0;
    prevCommon = !e.script;
    if (!e.script) common = true;
    if (e.script) {
      mask |= 1 << e.script;
      if (e.weak || !/^[\x00-\x7f]*$/.test(e.proto)) exact = false;
    }
    skeleton += e.proto;
  }
  if (mask && !allGroups.some((g) => (mask & ~g) === 0)) return { ok: false };
  // Right to left: letters only, since digits and hyphens are laid out
  // left to right and can be moved to either end without changing the look.
  if (rtl && common) return { ok: false };
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
  // emoji, and alphabets added after launch
  'alice😀', 'مرحبا', 'नमस्ते',
  ...EXTENSIONS.flatMap((e) => e.samples),
  // right-to-left names are letters only
  'مرحبا1', '1مرحبا', 'مر-حبا', 'שלום2',
  // a script added later still cannot be mixed with another
  'नमस्तेabc', 'สวัสดีกนमस',
  // lookalikes in the added alphabets: exact doubles of Latin are refused
  'օօօ', 'հօս', 'ՕՕՕ',
  // marks out of canonical order, doubled, or with nothing to sit on: refused
  '\u0e1b\u0e39\u0e48', '\u0e1b\u0e48\u0e39', '\u0e01\u0e38\u0e49\u0e07', '\u0e01\u0e49\u0e38\u0e07', 'ก่่ก', 'ाकक', 'क1्क', '\u0915\u093c\u094d\u0937', '\u0915\u094d\u093c\u0937',
  // cross-script pieces do not make a Devanagari word cheaper
  'वित्त', 'उत्तर', 'सप्ट',
  // two spellings that are drawn the same collide (Thai sara ae and two sara e)
  'แกก', 'เเกก', 'आराम', 'अाराम', 'ओम्', 'अोम्', 'अाेम्', 'ଓଡ଼ିଆ', 'ବୋଲ', 'ବୋଲ', 'ਓਮਕਾਰ', 'ੳੋਮਕਾਰ', 'ઓમકાર', 'અોમકાર',
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
// Foundry's JSON reader takes a 20-byte hex string for an address and a
// 32-byte one for a bytes32, which breaks decoding into bytes. Keep clear.
for (const v of vectors) for (const k of ['label', 'skeleton'])
  if ([40, 64].includes(v[k].length - 2)) throw new Error(`vector ${k} of ${v.label} is 20 or 32 bytes; pick another sample`);
fs.writeFileSync('nametables/vectors.json', JSON.stringify({ vectors }, null, 1));

if (process.argv.includes('--report')) {
  console.log(JSON.stringify(meta.counts), 'pages', pages.length, 'ranges', ranges.length);
  const show = (l) => { const r = check(l); console.log(l.padEnd(14), r.ok ? `ok   ${r.skeleton}  (${r.length}/${r.priceLength})` : 'refused'); };
  samples.forEach(show);
  const multi = [...classes.entries()].filter(([, c]) => c.length > 1).slice(0, 12);
  for (const [p, c] of multi) console.log('class', JSON.stringify(p), c.map((x) => String.fromCodePoint(x)).join(' '));
  const by = {}; for (const [, why] of dropped) by[why] = (by[why] ?? 0) + 1; console.log(by);
}
if (process.argv.includes('--report-ext')) {
  for (const [cp, e] of extEntries) {
    const n = enc.encode(e.proto).length;
    if ([...e.proto].length > 1 && !extOut.some((x) => x.patterns.includes('0x' + Buffer.from(enc.encode(e.proto)).toString('hex'))))
      console.log('no pattern', String.fromCodePoint(cp), cp.toString(16), [...e.proto].map((c) => c.codePointAt(0).toString(16)).join(' '), n);
  }
  for (const [cp, why] of dropped) if (why.startsWith('prototype')) console.log('dropped', String.fromCodePoint(cp), cp.toString(16), why);
}
