import { DEFAULT_STEP, type Spelling, mod12, spellFrom, spellingToString } from './pitch';

export type Mode = 'major' | 'minor';
export interface Key {
  tonic: number;
  mode: Mode;
}

/** Scales as intervals above a tonic. */
export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
} as const;
export type ScaleName = keyof typeof SCALES;

export const SCALE_LABEL: Record<ScaleName, string> = {
  ionian: 'major',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  aeolian: 'natural minor',
  locrian: 'Locrian',
  harmonicMinor: 'harmonic minor',
  melodicMinor: 'melodic minor',
};

/** Notes that count as "in the key". Minor admits the harmonic-minor leading tone. */
const KEY_INTERVALS: Record<Mode, readonly number[]> = {
  major: SCALES.ionian,
  minor: [0, 2, 3, 5, 7, 8, 10, 11],
};

export const keyIndex = (k: Key): number => (k.mode === 'major' ? 0 : 12) + mod12(k.tonic);
export const keyFromIndex = (i: number): Key => ({ tonic: i % 12, mode: i < 12 ? 'major' : 'minor' });
export const ALL_KEYS: Key[] = Array.from({ length: 24 }, (_, i) => keyFromIndex(i));
export const keyEq = (a: Key | null | undefined, b: Key | null | undefined): boolean =>
  !!a && !!b && mod12(a.tonic) === mod12(b.tonic) && a.mode === b.mode;

const keySetCache = new Map<number, Set<number>>();
export function keyPcSet(k: Key): Set<number> {
  const id = keyIndex(k);
  let s = keySetCache.get(id);
  if (!s) {
    s = new Set(KEY_INTERVALS[k.mode].map((i) => mod12(i + k.tonic)));
    keySetCache.set(id, s);
  }
  return s;
}

const scaleSetCache = new Map<string, Set<number>>();
export function scalePcSet(tonic: number, scale: ScaleName): Set<number> {
  const id = `${mod12(tonic)}:${scale}`;
  let s = scaleSetCache.get(id);
  if (!s) {
    s = new Set(SCALES[scale].map((i) => mod12(i + tonic)));
    scaleSetCache.set(id, s);
  }
  return s;
}

/** The 7-note natural scale of a key (minor = aeolian). */
export const naturalScale = (k: Key): number[] =>
  (k.mode === 'major' ? SCALES.ionian : SCALES.aeolian).map((i) => mod12(i + k.tonic));

// Major-key tonic spellings with the fewest accidentals.
const MAJOR_TONIC: Spelling[] = [
  [0, 0],
  [1, -1],
  [1, 0],
  [2, -1],
  [2, 0],
  [3, 0],
  [3, 1],
  [4, 0],
  [5, -1],
  [5, 0],
  [6, -1],
  [6, 0],
].map(([letter, acc]) => ({ letter, acc }));

export function tonicSpelling(k: Key): Spelling {
  if (k.mode === 'major') return MAJOR_TONIC[mod12(k.tonic)];
  // A minor key is spelled from its relative major, two letters below.
  return spellFrom(MAJOR_TONIC[mod12(k.tonic + 3)], -2, k.tonic);
}

export const tonicName = (k: Key): string => spellingToString(tonicSpelling(k));
export const keyShort = (k: Key): string => tonicName(k) + (k.mode === 'minor' ? 'm' : '');
export const keyLong = (k: Key): string => `${tonicName(k)} ${k.mode}`;

/** Spell a pitch class as a scale degree of the key (♭6 in C → A♭, ♯4 → F♯). */
export function spellInKey(pc: number, k: Key): Spelling {
  const i = mod12(pc - k.tonic);
  const step = i === 6 && k.mode === 'minor' ? 4 : DEFAULT_STEP[i];
  return spellFrom(tonicSpelling(k), step, pc);
}
export const nameInKey = (pc: number, k: Key): string => spellingToString(spellInKey(pc, k));

export const relativeKey = (k: Key): Key =>
  k.mode === 'major' ? { tonic: mod12(k.tonic + 9), mode: 'minor' } : { tonic: mod12(k.tonic + 3), mode: 'major' };
export const parallelKey = (k: Key): Key => ({ tonic: k.tonic, mode: k.mode === 'major' ? 'minor' : 'major' });

/** Position of the key signature on the circle of fifths (0 = C / Am). */
export const fifthsPos = (k: Key): number => mod12((k.mode === 'major' ? k.tonic : k.tonic + 3) * 7);
export function fifthsDistance(a: Key, b: Key): number {
  const d = mod12(fifthsPos(a) - fifthsPos(b));
  return Math.min(d, 12 - d);
}
export function commonTones(a: Key, b: Key): number {
  const s = new Set(naturalScale(a));
  return naturalScale(b).filter((p) => s.has(p)).length;
}
