import { mod12 } from './pitch';
import { Chord, isDominant, isDominantLike } from './chords';
import { Key, keyShort } from './scales';

export type PatternKind = 'ii-V-I' | 'ii-V' | 'V-I' | 'subV-I' | 'plagal' | 'deceptive' | 'backdoor' | 'cycle' | 'loop';
export interface PatternMatch {
  kind: PatternKind;
  /** Number of chords (ending at the latest) the pattern spans. */
  length: number;
  label: string;
  /** Key the pattern points to (cadences only) — evidence for key detection. */
  target?: Key;
}

const minorish = (c: Chord) => c.quality === 'min' || c.quality === 'dim';
const stable = (c: Chord) => (c.quality === 'maj' || c.quality === 'min') && c.seventh !== 'b7';
const up4 = (a: Chord, b: Chord) => mod12(b.root - a.root) === 5;
const tonicOf = (c: Chord): Key => ({ tonic: c.root, mode: c.quality === 'min' ? 'minor' : 'major' });

// Loops written as scale degrees (semitones above tonic) — they work in any key.
const LOOPS: { degs: number[]; label: string }[] = [
  { degs: [0, 7, 9, 5], label: 'I–V–vi–IV' },
  { degs: [0, 9, 5, 7], label: 'I–vi–IV–V' },
  { degs: [9, 5, 0, 7], label: 'vi–IV–I–V' },
  { degs: [0, 9, 2, 7], label: 'I–vi–ii–V turnaround' },
  { degs: [0, 5, 7, 0], label: 'I–IV–V–I' },
  { degs: [0, 10, 8, 7], label: 'Andalusian cadence' },
  { degs: [0, 8, 3, 10], label: 'i–♭VI–♭III–♭VII' },
];

/** Patterns ending at the last chord, most specific first. */
export function patternsAtEnd(chords: Chord[], key: Key | null): PatternMatch[] {
  const n = chords.length;
  const out: PatternMatch[] = [];
  if (n < 2) return out;
  const c = chords[n - 1],
    b = chords[n - 2],
    a = chords[n - 3];
  // A plain tonic triad moving up a 4th is I–IV, not a V–I into a new key.
  const dominant = (x: Chord) => isDominant(x) || (isDominantLike(x) && !(key && x.root === key.tonic));

  if (a && minorish(a) && dominant(b) && up4(a, b) && up4(b, c) && stable(c)) {
    const target = tonicOf(c);
    const lbl = `${a.quality === 'dim' ? 'iiø' : 'ii'}–V–${c.quality === 'min' ? 'i' : 'I'} in ${keyShort(target)}`;
    out.push({ kind: 'ii-V-I', length: 3, label: lbl, target });
  } else if (dominant(b) && up4(b, c) && stable(c)) {
    const target = tonicOf(c);
    const home = key && c.root === key.tonic;
    out.push({ kind: 'V-I', length: 2, label: home ? 'V–I authentic cadence' : `V–I → ${keyShort(target)}`, target });
  } else if (isDominant(b) && mod12(c.root - b.root) === 11 && stable(c)) {
    out.push({ kind: 'subV-I', length: 2, label: 'Tritone sub → I', target: tonicOf(c) });
  }
  if (key) {
    const bd = mod12(b.root - key.tonic),
      cd = mod12(c.root - key.tonic);
    if (cd === 0 && bd === 5 && stable(b))
      out.push({
        kind: 'plagal',
        length: 2,
        label: b.quality === 'min' && key.mode === 'major' ? 'iv–I minor plagal' : 'Plagal (IV–I)',
      });
    if (bd === 7 && isDominantLike(b) && cd === (key.mode === 'major' ? 9 : 8))
      out.push({ kind: 'deceptive', length: 2, label: 'Deceptive cadence' });
    if (bd === 10 && isDominant(b) && cd === 0) out.push({ kind: 'backdoor', length: 2, label: 'Backdoor ♭VII7–I' });
  }
  if (minorish(b) && dominant(c) && up4(b, c)) {
    const target: Key = { tonic: mod12(c.root + 5), mode: b.quality === 'dim' ? 'minor' : 'major' };
    out.push({ kind: 'ii-V', length: 2, label: `ii–V → ${keyShort(target)}?`, target });
  }
  let k = 1;
  while (k < n && up4(chords[n - 1 - k], chords[n - k])) k++;
  if (k >= 4) out.push({ kind: 'cycle', length: k, label: `Circle of fifths ×${k}` });
  if (key && n >= 4) {
    const degs = chords.slice(-4).map((x) => mod12(x.root - key.tonic));
    const loop = LOOPS.find((l) => l.degs.every((d, i) => d === degs[i]));
    if (loop) out.push({ kind: 'loop', length: 4, label: loop.label });
  }
  return out;
}
