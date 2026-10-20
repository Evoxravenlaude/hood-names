/**
 * The colours the street can be painted in. Each colour has a night and a
 * day setting; the sign, the mark and the street keep their shapes in all
 * of them, only the paint changes. Slate is the default.
 *
 * This file is the one source: the page's colour tokens are built from it
 * (paletteCss), and the street and the name picture read it directly.
 * scripts/palettes.mjs checks every text pairing for contrast.
 */

export type PaletteId = 'slate' | 'brass' | 'enamel' | 'claret' | 'onyx';
export type Mode = 'dark' | 'light';

export interface Street {
  back: string;
  backWin: string;
  face: [string, string, string, string];
  off: string;
  ambient: string;
  door: string;
  ground: string;
  kerb: string;
  lamp: string;
  roof: string;
  cap: string;
  /** Lit windows: most are the first colour, every fifth the second. */
  lit: [string, string];
  /** Streetlight glow, as r, g, b. */
  glow: string;
  bulb: string;
  /** Day houses are drawn in ink; night houses have no outline. */
  stroke?: string;
  sky: [string, string];
  /** The sun by day, the moon at night. */
  orb: string;
  /** The little sign over each door. */
  doorSign: [string, string];
}

export interface Setting {
  tokens: Record<string, string>;
  street: Street;
  /** The browser bar on phones. */
  bar: string;
}

export interface Palette {
  id: PaletteId;
  /** English name, translated where it is shown. */
  name: string;
  /** One line on what it is like, translated where it is shown. */
  note: string;
  dark: Setting;
  light: Setting;
}

const NEON = '#ccff00';

/** Shared by every colour: warnings are sodium orange, the other streetlight. */
const WARN = {
  dark: { warn: '#ff8a3d', 'warn-ink': '#ffc9a6', 'warn-soft': 'rgba(255, 138, 61, 0.18)', 'warn-wash': 'rgba(255, 138, 61, 0.08)', 'warn-line': 'rgba(255, 138, 61, 0.42)', 'on-warn': '#14110e' },
  light: { warn: '#b4400e', 'warn-ink': '#7a2a08', 'warn-soft': '#fde4d6', 'warn-wash': '#fff4ee', 'warn-line': '#f2bfa2', 'on-warn': '#ffffff' },
};

/** Chart colours, checked for colour blindness against each colour's panels. */
const SERIES = {
  dark: { 'series-1': '#7fa300', 'series-2': '#5b86ff', 'series-3': '#d9599c' },
  light: { 'series-1': '#2b4fc7', 'series-2': '#5e8f00', 'series-3': '#c2378a' },
};
const NEON_RAMP = ['#465c14', '#557809', '#679404', '#7bb200', '#93ce00', '#ade800', '#ccff00'];
const GOLD_RAMP = ['#665230', '#7b653c', '#927a4b', '#aa915e', '#c2a872', '#dcc28c', '#f3dba8'];
const ramp = (r: string[]) => Object.fromEntries(r.map((c, i) => [`s${i + 1}00`, c]));

const neonSign = (bg: string) => ({
  'sign-bg': bg,
  'sign-ink': '#ffffff',
  'sign-sub': 'rgba(255, 255, 255, 0.72)',
  'sign-hair': 'rgba(255, 255, 255, 0.9)',
  frame: NEON,
  'frame-rgb': '204, 255, 0',
  'sign-end': NEON,
  'sign-bad': '#ffa466',
});

export const PALETTES: Palette[] = [
  {
    id: 'slate',
    name: 'Slate',
    note: 'Cool grey slate with the neon of Robinhood Chain. The default.',
    dark: {
      bar: '#14171c',
      tokens: {
        paper: '#14171c', surface: '#1c2028', sunken: '#171a21', raised: '#232831',
        ink: '#f4f5f7', 'ink-2': '#e3e6ea', muted: '#b0b6c0', faint: '#8f96a2', ghost: '#636b77',
        line: '#2d333d', 'line-soft': '#22272f', field: '#414855',
        accent: NEON, 'on-accent': '#14171c', 'accent-hover': '#dbff4d', 'accent-ink': NEON,
        'accent-soft': 'rgba(204, 255, 0, 0.14)', 'accent-wash': 'rgba(204, 255, 0, 0.06)', 'accent-line': 'rgba(204, 255, 0, 0.35)',
        inverse: '#ffffff', 'on-inverse': '#14171c', good: NEON,
        night: '#0d0f13', 'night-2': '#1c2028', 'night-ink': '#ffffff', 'night-faint': '#8f96a2',
        overlay: 'rgba(5, 6, 9, 0.7)',
        ...neonSign('#2b313b'),
        'sign-shadow': '0 0 0 1px rgba(204, 255, 0, 0.28), 0 0 70px rgba(204, 255, 0, 0.16), 0 26px 60px rgba(0, 0, 0, 0.5)',
        'plate-shadow': '0 0 0 1px rgba(204, 255, 0, 0.22), 0 0 36px rgba(204, 255, 0, 0.12)',
        ...ramp(NEON_RAMP), empty: '#22272f', single: NEON, 'single-hover': '#e6ff80',
      },
      street: {
        back: '#191d24', backWin: '#2f3643', face: ['#242a33', '#28303a', '#20252d', '#2c3440'], off: '#14171c', ambient: '#454e5e',
        door: '#0f1115', ground: '#111418', kerb: '#353d4a', lamp: '#353d4a', roof: '#111418', cap: '#111418',
        lit: [NEON, '#ffffff'], glow: '204, 255, 0', bulb: NEON, sky: ['#14171c', '#262d38'], orb: '#f2f4f7', doorSign: ['#2b313b', NEON],
      },
    },
    light: {
      bar: '#e7e9ec',
      tokens: {
        paper: '#e7e9ec', surface: '#ffffff', sunken: '#f3f4f6', raised: '#ffffff',
        ink: '#14171c', 'ink-2': '#252a32', muted: '#4b525e', faint: '#5d6470', ghost: '#959ba5',
        line: '#d3d7dd', 'line-soft': '#e2e5e9', field: '#b2b8c1',
        accent: NEON, 'on-accent': '#14171c', 'accent-hover': '#b8e600', 'accent-ink': '#4a6400',
        'accent-soft': '#eef8cc', 'accent-wash': '#f7fbe8', 'accent-line': '#cfe68c',
        inverse: '#14171c', 'on-inverse': '#ffffff', good: '#4a6400',
        night: '#14171c', 'night-2': '#1c2028', 'night-ink': '#ffffff', 'night-faint': '#8f96a2',
        overlay: 'rgba(20, 23, 28, 0.45)',
        ...neonSign('#2b313b'),
        'sign-shadow': '0 3px 0 #14171c, 0 22px 50px rgba(20, 23, 28, 0.2)',
        'plate-shadow': '0 3px 0 #14171c',
        ...ramp(['#a9b0bc', '#8f97a5', '#767f8e', '#5e6777', '#485161', '#333b49', '#212733']),
        empty: '#eef0f3', single: '#2b313b', 'single-hover': '#14171c',
      },
      street: {
        back: '#cdd3dc', backWin: '#b3bbc7', face: ['#ffffff', '#f3f4f6', '#dde1e7', '#ffffff'], off: '#2b313b', ambient: '#2b313b',
        door: '#14171c', ground: '#d6dae1', kerb: '#14171c', lamp: '#14171c', roof: '#2b313b', cap: '#14171c',
        lit: [NEON, NEON], glow: '204, 255, 0', bulb: '#ffffff', stroke: '#14171c', sky: ['#e7e9ec', '#c9d0db'], orb: NEON, doorSign: ['#2b313b', NEON],
      },
    },
  },
  {
    id: 'brass',
    name: 'Brass',
    note: 'An ivory sign with a brass frame, on oat by day and espresso by night. The quietest.',
    dark: {
      bar: '#1b1511',
      tokens: {
        paper: '#1b1511', surface: '#241c17', sunken: '#1f1813', raised: '#2c231c',
        ink: '#f5efe4', 'ink-2': '#e8dfd0', muted: '#c9b9a3', faint: '#a8977f', ghost: '#786a5c',
        line: '#3a2f26', 'line-soft': '#2d241d', field: '#54473a',
        accent: '#d9b98a', 'on-accent': '#1b1511', 'accent-hover': '#e6cda6', 'accent-ink': '#e2c495',
        'accent-soft': 'rgba(217, 185, 138, 0.16)', 'accent-wash': 'rgba(217, 185, 138, 0.07)', 'accent-line': 'rgba(217, 185, 138, 0.38)',
        inverse: '#f5efe4', 'on-inverse': '#1b1511', good: '#e2c495',
        night: '#120e0b', 'night-2': '#241c17', 'night-ink': '#f5efe4', 'night-faint': '#a8977f',
        overlay: 'rgba(10, 7, 5, 0.7)',
        'sign-bg': '#f2ead9', 'sign-ink': '#2b1f17', 'sign-sub': 'rgba(43, 31, 23, 0.66)', 'sign-hair': 'rgba(43, 31, 23, 0.45)',
        frame: '#b8925f', 'frame-rgb': '217, 185, 138', 'sign-end': '#86602f', 'sign-bad': '#a3380b',
        'sign-shadow': '0 0 0 1px rgba(217, 185, 138, 0.25), 0 0 60px rgba(217, 185, 138, 0.12), 0 26px 60px rgba(0, 0, 0, 0.5)',
        'plate-shadow': '0 0 0 1px rgba(217, 185, 138, 0.2), 0 0 30px rgba(217, 185, 138, 0.1)',
        ...ramp(GOLD_RAMP), empty: '#2d241d', single: '#d9b98a', 'single-hover': '#f3dba8',
      },
      street: {
        back: '#211a15', backWin: '#3a2f26', face: ['#2e251e', '#332a22', '#2a211b', '#382e25'], off: '#1b1511', ambient: '#4a3d31',
        door: '#140f0c', ground: '#17120e', kerb: '#45392e', lamp: '#45392e', roof: '#17120e', cap: '#17120e',
        lit: ['#ead3a6', '#f5efe4'], glow: '234, 211, 166', bulb: '#ead3a6', sky: ['#1b1511', '#30261e'], orb: '#f5efe4', doorSign: ['#f2ead9', '#b8925f'],
      },
    },
    light: {
      bar: '#efe8dc',
      tokens: {
        paper: '#efe8dc', surface: '#fbf8f2', sunken: '#f5f0e7', raised: '#fffdf8',
        ink: '#2b1f17', 'ink-2': '#3d2f25', muted: '#62503f', faint: '#76624f', ghost: '#a8988a',
        line: '#ddd2c1', 'line-soft': '#e8dfd1', field: '#c4b49e',
        accent: '#2b1f17', 'on-accent': '#f5efe4', 'accent-hover': '#47372b', 'accent-ink': '#7d5a2c',
        'accent-soft': '#efe3cf', 'accent-wash': '#f7f0e4', 'accent-line': '#d8c3a0',
        inverse: '#2b1f17', 'on-inverse': '#f5efe4', good: '#7d5a2c',
        night: '#2b1f17', 'night-2': '#3d2f25', 'night-ink': '#f5efe4', 'night-faint': '#c9b9a3',
        overlay: 'rgba(43, 31, 23, 0.4)',
        'sign-bg': '#f8f3e8', 'sign-ink': '#2b1f17', 'sign-sub': 'rgba(43, 31, 23, 0.66)', 'sign-hair': 'rgba(43, 31, 23, 0.4)',
        frame: '#b8925f', 'frame-rgb': '184, 146, 95', 'sign-end': '#86602f', 'sign-bad': '#a3380b',
        'sign-shadow': '0 3px 0 #2b1f17, 0 22px 50px rgba(43, 31, 23, 0.16)',
        'plate-shadow': '0 3px 0 #2b1f17',
        ...ramp(['#c9ab7b', '#b5935f', '#9f7c49', '#886639', '#71522c', '#5b4122', '#45311a']),
        empty: '#f2ece2', single: '#86602f', 'single-hover': '#45311a',
      },
      street: {
        back: '#e0d6c6', backWin: '#cfc1ab', face: ['#fbf8f2', '#f5efe4', '#ebe2d3', '#fbf8f2'], off: '#c9b393', ambient: '#c9b393',
        door: '#2b1f17', ground: '#e3d9c9', kerb: '#2b1f17', lamp: '#2b1f17', roof: '#8a6a44', cap: '#2b1f17',
        lit: ['#b8925f', '#b8925f'], glow: '184, 146, 95', bulb: '#fbf8f2', stroke: '#2b1f17', sky: ['#efe8dc', '#e2d5c0'], orb: '#e9cf9a', doorSign: ['#f8f3e8', '#b8925f'],
      },
    },
  },
  {
    id: 'enamel',
    name: 'Enamel blue',
    note: 'A blue enamel street sign, like the ones in old European cities.',
    dark: {
      bar: '#0b1030',
      tokens: {
        paper: '#0b1030', surface: '#121a44', sunken: '#0e1538', raised: '#18215a',
        ink: '#ffffff', 'ink-2': '#e6e9f5', muted: '#b8beda', faint: '#9299bf', ghost: '#646c96',
        line: '#263066', 'line-soft': '#1a2350', field: '#3a4580',
        accent: NEON, 'on-accent': '#0b1030', 'accent-hover': '#dbff4d', 'accent-ink': NEON,
        'accent-soft': 'rgba(204, 255, 0, 0.14)', 'accent-wash': 'rgba(204, 255, 0, 0.06)', 'accent-line': 'rgba(204, 255, 0, 0.35)',
        inverse: '#ffffff', 'on-inverse': '#0b1030', good: NEON,
        night: '#060a22', 'night-2': '#121a44', 'night-ink': '#ffffff', 'night-faint': '#9299bf',
        overlay: 'rgba(4, 7, 26, 0.7)',
        ...neonSign('#1f3fa8'),
        'sign-shadow': '0 0 0 1px rgba(204, 255, 0, 0.28), 0 0 70px rgba(204, 255, 0, 0.2), 0 26px 60px rgba(2, 4, 18, 0.55)',
        'plate-shadow': '0 0 0 1px rgba(204, 255, 0, 0.22), 0 0 36px rgba(204, 255, 0, 0.13)',
        ...ramp(NEON_RAMP), empty: '#1a2350', single: NEON, 'single-hover': '#e6ff80',
      },
      street: {
        back: '#0f1745', backWin: '#26337a', face: ['#1b2566', '#1f2b72', '#18215c', '#24317c'], off: '#0b1236', ambient: '#3c4a9a',
        door: '#080e2e', ground: '#0b1236', kerb: '#2a3678', lamp: '#2a3678', roof: '#0c1340', cap: '#0c1340',
        lit: [NEON, '#ffffff'], glow: '204, 255, 0', bulb: NEON, sky: ['#0b1030', '#1a2462'], orb: '#f2f4ff', doorSign: ['#1f3fa8', NEON],
      },
    },
    light: {
      bar: '#e9eef7',
      tokens: {
        paper: '#e9eef7', surface: '#ffffff', sunken: '#f3f6fb', raised: '#ffffff',
        ink: '#0b1030', 'ink-2': '#1e2550', muted: '#444b70', faint: '#5a6187', ghost: '#8e94b3',
        line: '#cdd5e6', 'line-soft': '#dfe5f0', field: '#aab5d0',
        accent: NEON, 'on-accent': '#0b1030', 'accent-hover': '#b8e600', 'accent-ink': '#1f3fa8',
        'accent-soft': '#dbe3fa', 'accent-wash': '#f0f4fd', 'accent-line': '#a9baeb',
        inverse: '#0b1030', 'on-inverse': '#ffffff', good: '#1f3fa8',
        night: '#0b1030', 'night-2': '#121a44', 'night-ink': '#ffffff', 'night-faint': '#9299bf',
        overlay: 'rgba(11, 16, 48, 0.45)',
        ...neonSign('#1f3fa8'),
        'sign-shadow': '0 3px 0 #0b1030, 0 22px 50px rgba(11, 16, 48, 0.22)',
        'plate-shadow': '0 3px 0 #0b1030',
        ...ramp(['#98ace6', '#7f96dd', '#6680d3', '#4d69c8', '#3654bc', '#2242a8', '#16308a']),
        empty: '#edf1f8', single: '#1f3fa8', 'single-hover': '#16308a',
      },
      street: {
        back: '#c6d3ec', backWin: '#aebfe0', face: ['#ffffff', '#f3f6fb', '#dde5f3', '#ffffff'], off: '#1f3fa8', ambient: '#1f3fa8',
        door: '#0b1030', ground: '#d5dcea', kerb: '#0b1030', lamp: '#0b1030', roof: '#1f3fa8', cap: '#0b1030',
        lit: [NEON, NEON], glow: '204, 255, 0', bulb: '#ffffff', stroke: '#0b1030', sky: ['#e9eef7', '#bccff0'], orb: NEON, doorSign: ['#1f3fa8', NEON],
      },
    },
  },
  {
    id: 'claret',
    name: 'Claret',
    note: 'Deep claret with gold lettering, like an old shopfront.',
    dark: {
      bar: '#180c10',
      tokens: {
        paper: '#180c10', surface: '#22131a', sunken: '#1c0f14', raised: '#2b1820',
        ink: '#f7efe9', 'ink-2': '#eadfd8', muted: '#cdb1ab', faint: '#a98e8a', ghost: '#77605e',
        line: '#3b222a', 'line-soft': '#2c1920', field: '#553844',
        accent: '#e2c27e', 'on-accent': '#180c10', 'accent-hover': '#ecd39c', 'accent-ink': '#e2c27e',
        'accent-soft': 'rgba(226, 194, 126, 0.16)', 'accent-wash': 'rgba(226, 194, 126, 0.07)', 'accent-line': 'rgba(226, 194, 126, 0.38)',
        inverse: '#f7efe9', 'on-inverse': '#180c10', good: '#e2c27e',
        night: '#10080b', 'night-2': '#22131a', 'night-ink': '#f7efe9', 'night-faint': '#a98e8a',
        overlay: 'rgba(10, 4, 6, 0.7)',
        'sign-bg': '#5c1f2c', 'sign-ink': '#f7efe3', 'sign-sub': 'rgba(247, 239, 227, 0.72)', 'sign-hair': 'rgba(247, 239, 227, 0.82)',
        frame: '#c6a25a', 'frame-rgb': '226, 194, 126', 'sign-end': '#e8c983', 'sign-bad': '#ffa466',
        'sign-shadow': '0 0 0 1px rgba(226, 194, 126, 0.25), 0 0 60px rgba(226, 194, 126, 0.12), 0 26px 60px rgba(0, 0, 0, 0.5)',
        'plate-shadow': '0 0 0 1px rgba(226, 194, 126, 0.22), 0 0 30px rgba(226, 194, 126, 0.1)',
        ...ramp(GOLD_RAMP), empty: '#2c1920', single: '#e2c27e', 'single-hover': '#f3dba8',
      },
      street: {
        back: '#1f1015', backWin: '#3d2229', face: ['#2c161d', '#331a22', '#271319', '#3a1e27'], off: '#180c10', ambient: '#4d2c35',
        door: '#12070a', ground: '#150a0e', kerb: '#46262f', lamp: '#46262f', roof: '#150a0e', cap: '#150a0e',
        lit: ['#e9cf8e', '#f7efe3'], glow: '233, 207, 142', bulb: '#e9cf8e', sky: ['#180c10', '#30161f'], orb: '#f7efe3', doorSign: ['#5c1f2c', '#c6a25a'],
      },
    },
    light: {
      bar: '#f2ece5',
      tokens: {
        paper: '#f2ece5', surface: '#ffffff', sunken: '#f8f3ee', raised: '#ffffff',
        ink: '#24121a', 'ink-2': '#3a2129', muted: '#674a4f', faint: '#7a5d62', ghost: '#ad979a',
        line: '#e0d3cc', 'line-soft': '#ebe1db', field: '#c7b3ad',
        accent: '#5c1f2c', 'on-accent': '#f7efe3', 'accent-hover': '#47141f', 'accent-ink': '#7a2a3a',
        'accent-soft': '#f3e1e3', 'accent-wash': '#faf1f2', 'accent-line': '#ddb6bd',
        inverse: '#24121a', 'on-inverse': '#f7efe9', good: '#7a2a3a',
        night: '#24121a', 'night-2': '#3a2129', 'night-ink': '#f7efe9', 'night-faint': '#cdb1ab',
        overlay: 'rgba(36, 18, 26, 0.42)',
        'sign-bg': '#5c1f2c', 'sign-ink': '#f7efe3', 'sign-sub': 'rgba(247, 239, 227, 0.72)', 'sign-hair': 'rgba(247, 239, 227, 0.82)',
        frame: '#c6a25a', 'frame-rgb': '198, 162, 90', 'sign-end': '#e8c983', 'sign-bad': '#ffa466',
        'sign-shadow': '0 3px 0 #24121a, 0 22px 50px rgba(36, 18, 26, 0.18)',
        'plate-shadow': '0 3px 0 #24121a',
        ...ramp(['#d49ba6', '#c4808d', '#b06777', '#984f61', '#7e3b4c', '#64283a', '#4f1a27']),
        empty: '#f6efeb', single: '#7a2a3a', 'single-hover': '#4f1a27',
      },
      street: {
        back: '#e3d4cd', backWin: '#d0bab2', face: ['#ffffff', '#f8f3ee', '#ede2dc', '#ffffff'], off: '#5c1f2c', ambient: '#5c1f2c',
        door: '#24121a', ground: '#e6dbd4', kerb: '#24121a', lamp: '#24121a', roof: '#5c1f2c', cap: '#24121a',
        lit: ['#c6a25a', '#c6a25a'], glow: '198, 162, 90', bulb: '#ffffff', stroke: '#24121a', sky: ['#f2ece5', '#e6d2c8'], orb: '#e2c27e', doorSign: ['#5c1f2c', '#c6a25a'],
      },
    },
  },
  {
    id: 'onyx',
    name: 'Onyx',
    note: 'Robinhood Chain’s own black, white and neon.',
    dark: {
      bar: '#050505',
      tokens: {
        paper: '#050505', surface: '#121212', sunken: '#0b0b0b', raised: '#1a1a1a',
        ink: '#ffffff', 'ink-2': '#e6e6e6', muted: '#b3b3b3', faint: '#8f8f8f', ghost: '#5f5f5f',
        line: '#2a2a2a', 'line-soft': '#1c1c1c', field: '#404040',
        accent: NEON, 'on-accent': '#000000', 'accent-hover': '#dbff4d', 'accent-ink': NEON,
        'accent-soft': 'rgba(204, 255, 0, 0.14)', 'accent-wash': 'rgba(204, 255, 0, 0.06)', 'accent-line': 'rgba(204, 255, 0, 0.35)',
        inverse: '#ffffff', 'on-inverse': '#000000', good: NEON,
        night: '#000000', 'night-2': '#121212', 'night-ink': '#ffffff', 'night-faint': '#8f8f8f',
        overlay: 'rgba(0, 0, 0, 0.72)',
        ...neonSign('#161616'),
        'sign-shadow': '0 0 0 1px rgba(204, 255, 0, 0.3), 0 0 70px rgba(204, 255, 0, 0.18), 0 26px 60px rgba(0, 0, 0, 0.6)',
        'plate-shadow': '0 0 0 1px rgba(204, 255, 0, 0.24), 0 0 36px rgba(204, 255, 0, 0.13)',
        ...ramp(NEON_RAMP), empty: '#1c1c1c', single: NEON, 'single-hover': '#e6ff80',
      },
      street: {
        back: '#0f0f0f', backWin: '#2a2a2a', face: ['#1a1a1a', '#1f1f1f', '#161616', '#232323'], off: '#0a0a0a', ambient: '#3a3a3a',
        door: '#000000', ground: '#0a0a0a', kerb: '#2e2e2e', lamp: '#2e2e2e', roof: '#0a0a0a', cap: '#0a0a0a',
        lit: [NEON, '#ffffff'], glow: '204, 255, 0', bulb: NEON, sky: ['#050505', '#1a1a1a'], orb: '#f2f2f2', doorSign: ['#161616', NEON],
      },
    },
    light: {
      bar: '#f2f2f2',
      tokens: {
        paper: '#f2f2f2', surface: '#ffffff', sunken: '#f7f7f7', raised: '#ffffff',
        ink: '#000000', 'ink-2': '#1a1a1a', muted: '#4d4d4d', faint: '#5e5e5e', ghost: '#999999',
        line: '#d9d9d9', 'line-soft': '#e8e8e8', field: '#b8b8b8',
        accent: NEON, 'on-accent': '#000000', 'accent-hover': '#b8e600', 'accent-ink': '#4a6400',
        'accent-soft': '#eef8cc', 'accent-wash': '#f7fbe8', 'accent-line': '#cfe68c',
        inverse: '#000000', 'on-inverse': '#ffffff', good: '#4a6400',
        night: '#000000', 'night-2': '#121212', 'night-ink': '#ffffff', 'night-faint': '#8f8f8f',
        overlay: 'rgba(0, 0, 0, 0.45)',
        ...neonSign('#111111'),
        'sign-shadow': '0 3px 0 #000000, 0 22px 50px rgba(0, 0, 0, 0.2)',
        'plate-shadow': '0 3px 0 #000000',
        ...ramp(['#b3b3b3', '#999999', '#808080', '#666666', '#4d4d4d', '#333333', '#1a1a1a']),
        empty: '#f0f0f0', single: '#111111', 'single-hover': '#000000',
      },
      street: {
        back: '#d6d6d6', backWin: '#bdbdbd', face: ['#ffffff', '#f5f5f5', '#e3e3e3', '#ffffff'], off: '#111111', ambient: '#111111',
        door: '#000000', ground: '#dedede', kerb: '#000000', lamp: '#000000', roof: '#111111', cap: '#000000',
        lit: [NEON, NEON], glow: '204, 255, 0', bulb: '#ffffff', stroke: '#000000', sky: ['#f2f2f2', '#d4d4d4'], orb: NEON, doorSign: ['#111111', NEON],
      },
    },
  },
];

export const DEFAULT_PALETTE: PaletteId = 'slate';
export const paletteById = (id: string | null | undefined): Palette => PALETTES.find((p) => p.id === id) ?? PALETTES[0];

const derived = (mode: Mode) => ({
  ...WARN[mode],
  ...SERIES[mode],
  shadow: mode === 'dark' ? '0 24px 64px rgba(0, 0, 0, 0.55)' : '0 24px 64px rgba(0, 0, 0, 0.16)',
  'shadow-sm': mode === 'dark' ? '0 10px 30px rgba(0, 0, 0, 0.42)' : '0 10px 30px rgba(0, 0, 0, 0.1)',
});

/** All custom properties of one colour in one setting. */
export function settingVars(p: Palette, mode: Mode): Record<string, string> {
  const s = p[mode];
  const rgb = s.tokens['frame-rgb'];
  return {
    ...derived(mode),
    glow: mode === 'dark' ? `0 0 0 1px rgba(${rgb}, 0.5), 0 0 32px rgba(${rgb}, 0.25)` : '0 0 0 4px var(--accent-soft)',
    ...s.tokens,
    'sky-top': s.street.sky[0],
    'sky-bottom': s.street.sky[1],
    'glow-rgb': s.street.glow,
    'win-hover': mode === 'dark' ? '#ffffff' : s.street.face[0],
  };
}

/** Every colour and setting as CSS custom properties, scoped by attribute so a preview can carry its own. */
export function paletteCss(): string {
  const out: string[] = [];
  for (const p of PALETTES)
    for (const mode of ['dark', 'light'] as const) {
      const vars = settingVars(p, mode);
      const sel = `[data-palette='${p.id}'][data-theme='${mode}']`;
      const first = p.id === DEFAULT_PALETTE && mode === 'dark' ? ':root, ' : '';
      out.push(`${first}${sel} { color-scheme: ${mode}; ${Object.entries(vars).map(([k, v]) => `--${k}: ${v};`).join(' ')} }`);
      // Charts read the same names inside .viz.
      out.push(`${sel} .viz, ${sel}.viz { --surface-1: var(--surface); }`);
    }
  return out.join('\n');
}
