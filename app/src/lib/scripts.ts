import { mark } from '../i18n';

/**
 * The alphabets a name can be written in, with an example each. Whether a
 * deployment accepts an alphabet is up to its name rules contract; the site
 * asks it (see useAlphabets) rather than trusting this list.
 */
export interface Alphabet {
  script: Script;
  /** English name of the alphabet. */
  name: string;
  /** Languages written in it, in English. */
  languages: string;
  example: string;
  rtl?: boolean;
}

export const ALPHABETS: Alphabet[] = [
  { script: 'Latin', name: mark('Latin'), languages: mark('English, French, Spanish, Yoruba, Igbo…'), example: 'café' },
  { script: 'Cyrillic', name: mark('Cyrillic'), languages: mark('Russian, Ukrainian, Serbian…'), example: 'привет' },
  { script: 'Greek', name: mark('Greek'), languages: mark('Greek'), example: 'ελλάδα' },
  { script: 'Han', name: mark('Chinese characters'), languages: mark('Chinese'), example: '東京都' },
  { script: 'Japanese', name: mark('Japanese'), languages: mark('Japanese (kana and kanji)'), example: '東京タワー' },
  { script: 'Hangul', name: mark('Hangul'), languages: mark('Korean'), example: '서울특별시' },
  { script: 'Devanagari', name: mark('Devanagari'), languages: mark('Hindi, Marathi, Nepali'), example: 'नमस्ते' },
  { script: 'Bengali', name: mark('Bengali'), languages: mark('Bengali, Assamese'), example: 'বাংলা' },
  { script: 'Gurmukhi', name: mark('Gurmukhi'), languages: mark('Punjabi'), example: 'ਪੰਜਾਬ' },
  { script: 'Gujarati', name: mark('Gujarati'), languages: mark('Gujarati'), example: 'ગુજરાત' },
  { script: 'Oriya', name: mark('Odia'), languages: mark('Odia'), example: 'ଓଡ଼ିଆ' },
  { script: 'Tamil', name: mark('Tamil'), languages: mark('Tamil'), example: 'தமிழ்' },
  { script: 'Telugu', name: mark('Telugu'), languages: mark('Telugu'), example: 'తెలుగు' },
  { script: 'Kannada', name: mark('Kannada'), languages: mark('Kannada'), example: 'ಕನ್ನಡ' },
  { script: 'Malayalam', name: mark('Malayalam'), languages: mark('Malayalam'), example: 'മലയാളം' },
  { script: 'Sinhala', name: mark('Sinhala'), languages: mark('Sinhala'), example: 'සිංහල' },
  { script: 'Thai', name: mark('Thai'), languages: mark('Thai'), example: 'สวัสดี' },
  { script: 'Lao', name: mark('Lao'), languages: mark('Lao'), example: 'ສະບາຍດີ' },
  { script: 'Georgian', name: mark('Georgian'), languages: mark('Georgian'), example: 'გამარჯობა' },
  { script: 'Armenian', name: mark('Armenian'), languages: mark('Armenian'), example: 'բարեւ' },
  { script: 'Ethiopic', name: mark('Ethiopic'), languages: mark('Amharic, Tigrinya'), example: 'ሰላም' },
  { script: 'Arabic', name: mark('Arabic'), languages: mark('Arabic, Persian, Urdu'), example: 'مرحبا', rtl: true },
  { script: 'Hebrew', name: mark('Hebrew'), languages: mark('Hebrew'), example: 'שלום', rtl: true },
];

export type Script =
  | 'Latin' | 'Cyrillic' | 'Greek' | 'Han' | 'Japanese' | 'Hangul' | 'Devanagari' | 'Bengali' | 'Gurmukhi'
  | 'Gujarati' | 'Oriya' | 'Tamil' | 'Telugu' | 'Kannada' | 'Malayalam' | 'Sinhala' | 'Thai' | 'Lao'
  | 'Georgian' | 'Armenian' | 'Ethiopic' | 'Arabic' | 'Hebrew' | 'Digits';

const TESTS: [Script, RegExp][] = [
  ['Japanese', /[\p{Script=Hiragana}\p{Script=Katakana}]/u],
  ['Hangul', /\p{Script=Hangul}/u],
  ['Han', /\p{Script=Han}/u],
  ...(['Latin', 'Cyrillic', 'Greek', 'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Sinhala', 'Thai', 'Lao', 'Georgian', 'Armenian', 'Ethiopic', 'Arabic', 'Hebrew'] as Script[]).map(
    (s) => [s, new RegExp(`\\p{Script=${s}}`, 'u')] as [Script, RegExp],
  ),
];

/** The alphabet a label is written in (names use one each). */
export function scriptOf(label: string): Script {
  for (const [s, re] of TESTS) if (re.test(label)) return s;
  return 'Digits';
}

export const alphabetName = (s: Script) => (s === 'Digits' ? mark('Digits only') : ALPHABETS.find((a) => a.script === s)?.name ?? s);
