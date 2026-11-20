/**
 * Which pitch collection does a piece use? Scale degrees relative to the tonic, weighted by duration, matched
 * against named collections (diatonic modes, minor variants, pentatonic, blues, symmetric scales).
 * Used by the rules study (scripts/rules.test.ts) for key and mode statistics; see docs/rules.md.
 */
import { mod12 } from '../theory/pitch';

export interface Collection {
  id: string;
  name: string;
  degrees: number[];
}
export const COLLECTIONS: Collection[] = [
  { id: 'ionian', name: 'major (Ionian)', degrees: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'dorian', name: 'Dorian', degrees: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'phrygian', name: 'Phrygian', degrees: [0, 1, 3, 5, 7, 8, 10] },
  { id: 'lydian', name: 'Lydian', degrees: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'mixolydian', name: 'Mixolydian', degrees: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'aeolian', name: 'natural minor (Aeolian)', degrees: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'locrian', name: 'Locrian', degrees: [0, 1, 3, 5, 6, 8, 10] },
  { id: 'harmonic-minor', name: 'harmonic minor', degrees: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'melodic-minor', name: 'melodic minor', degrees: [0, 2, 3, 5, 7, 9, 11] },
  { id: 'major-pentatonic', name: 'major pentatonic', degrees: [0, 2, 4, 7, 9] },
  { id: 'minor-pentatonic', name: 'minor pentatonic', degrees: [0, 3, 5, 7, 10] },
  { id: 'blues', name: 'blues (minor pentatonic + ♭5)', degrees: [0, 3, 5, 6, 7, 10] },
  { id: 'major-blues', name: 'major blues hexatonic', degrees: [0, 2, 3, 4, 7, 9] },
  { id: 'whole-tone', name: 'whole-tone', degrees: [0, 2, 4, 6, 8, 10] },
  { id: 'octatonic-hw', name: 'octatonic (half–whole)', degrees: [0, 1, 3, 4, 6, 7, 9, 10] },
  { id: 'octatonic-wh', name: 'octatonic (whole–half)', degrees: [0, 2, 3, 5, 6, 8, 9, 11] },
];

export interface ModeReading {
  /** Degrees carrying at least `threshold` of the weight. */
  used: number[];
  /** Best-fitting collection: the smallest one that holds at least 95% of the weight, else the best coverage. */
  best: Collection;
  /** Share of the weight inside the best collection. */
  coverage: number;
  /** Used degrees the best collection does not contain. */
  outside: number[];
}

/** `hist[d]` = weight of scale degree d (0 = tonic). */
export function readMode(hist: number[], threshold = 0.03): ModeReading {
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  const share = hist.map((w) => w / total);
  const used = share
    .map((s, d) => [s, d] as const)
    .filter(([s]) => s >= threshold)
    .map(([, d]) => d);
  const scored = COLLECTIONS.map((c) => ({ c, coverage: c.degrees.reduce((s, d) => s + share[d], 0) }));
  const fitting = scored
    .filter((x) => x.coverage >= 0.95)
    .sort((a, b) => a.c.degrees.length - b.c.degrees.length || b.coverage - a.coverage);
  const pick = fitting[0] ?? scored.sort((a, b) => b.coverage - a.coverage)[0];
  return { used, best: pick.c, coverage: pick.coverage, outside: used.filter((d) => !pick.c.degrees.includes(d)) };
}

/**
 * Register-dependent scale: a degree appears in two forms (e.g. 3 and ♭3) whose registers barely overlap, so the
 * scale does not repeat at the octave. Returns the degree pairs with the octave gap between their median pitches.
 */
export function registerSplits(
  notes: { pitch: number; weight: number }[],
  tonic: number,
): { low: number; high: number; gap: number }[] {
  const byDeg = new Map<number, number[]>();
  for (const n of notes) {
    const d = mod12(n.pitch - tonic);
    byDeg.set(d, [...(byDeg.get(d) ?? []), n.pitch]);
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const out: { low: number; high: number; gap: number }[] = [];
  for (const [a, b] of [
    [3, 4],
    [10, 11],
    [8, 9],
    [5, 6],
    [1, 2],
  ]) {
    const pa = byDeg.get(a) ?? [];
    const pb = byDeg.get(b) ?? [];
    if (pa.length < 4 || pb.length < 4) continue;
    const gap = (median(pb) - median(pa)) / 12;
    const overlap = pa.filter((p) => p >= Math.min(...pb) && p <= Math.max(...pb)).length / pa.length;
    if (Math.abs(gap) >= 0.9 && overlap < 0.25)
      out.push({ low: gap > 0 ? a : b, high: gap > 0 ? b : a, gap: Math.abs(gap) });
  }
  return out;
}
