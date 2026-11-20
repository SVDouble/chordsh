/**
 * Larger musical features built from melody + chords: phrases, cadences and named progressions.
 * Layer 2 of the rules study (events → features → rulebooks); see docs/rules.md.
 * Positions are in quarter notes; chords carry their local key.
 */
import { type Chord, isDominant } from '../theory/chords';
import { patternsAtEnd } from '../theory/patterns';
import { mod12 } from '../theory/pitch';
import type { Key } from '../theory/scales';
import type { MelodyNote } from './assist';

export interface PieceChord {
  chord: Chord;
  start: number;
  end: number;
  key: Key;
}
export interface PhraseNote extends MelodyNote {
  /** A fermata or other explicit phrase-end mark. */
  fermata?: boolean;
}
export type CadenceKind = 'authentic' | 'plagal' | 'half' | 'deceptive' | 'none';
export interface Phrase {
  start: number;
  end: number;
  /** Index of the chord sounding at the phrase end. */
  last: number;
  cadence: CadenceKind;
  /** Where the boundary came from. */
  by: 'annotated' | 'fermata' | 'pause' | 'bars' | 'end';
}
export interface Feature {
  kind: string;
  label: string;
  /** First and last chord index. */
  from: number;
  to: number;
}

/** Cadence formed by chords[i − 1] → chords[i], judged in the key of chords[i]. */
export function cadenceAt(chords: PieceChord[], i: number): CadenceKind {
  const c = chords[i];
  const b = chords[i - 1];
  if (!c) return 'none';
  const key = c.key;
  const deg = (x: Chord) => mod12(x.root - key.tonic);
  const dominant = (x: Chord) =>
    (deg(x) === 7 && (x.quality === 'maj' || isDominant(x))) || (deg(x) === 11 && x.quality === 'dim');
  const cd = deg(c.chord);
  if (cd === 0 && b && dominant(b.chord)) return 'authentic';
  if (cd === 0 && b && deg(b.chord) === 5) return 'plagal';
  if (b && dominant(b.chord) && (cd === 9 || cd === 8)) return 'deceptive';
  if (cd === 7 && (c.chord.quality === 'maj' || isDominant(c.chord))) return 'half';
  return 'none';
}

const chordAt = (chords: PieceChord[], t: number) => {
  let k = 0;
  for (let i = 0; i < chords.length; i++) if (chords[i].start <= t + 1e-6) k = i;
  return k;
};

/**
 * Phrase boundaries, most explicit first: expert annotations (DCML), fermatas (chorales), then melodic pauses of ≥ 1 beat
 * or notes ≥ 2 beats followed by a breath, then every 4 bars when there is no melody.
 */
export function phrasesOf(
  chords: PieceChord[],
  melody: PhraseNote[],
  meter: number,
  annotated: number[] = [],
): Phrase[] {
  if (!chords.length) return [];
  const sorted = [...melody].sort((a, b) => a.start - b.start);
  const ends: { t: number; by: Phrase['by'] }[] = [];
  const fermatas = sorted.filter((n) => n.fermata);
  if (annotated.length) for (const t of annotated) ends.push({ t, by: 'annotated' });
  else if (fermatas.length) for (const n of fermatas) ends.push({ t: n.start + n.beats, by: 'fermata' });
  else if (sorted.length) {
    sorted.forEach((n, i) => {
      const next = sorted[i + 1];
      const gap = next ? next.start - (n.start + n.beats) : Infinity;
      if (next && (gap >= 1 || (n.beats >= 2 && gap >= 0.5))) ends.push({ t: n.start + n.beats, by: 'pause' });
    });
  } else {
    const last = chords[chords.length - 1].end;
    for (let t = 4 * meter; t < last; t += 4 * meter) ends.push({ t, by: 'bars' });
  }
  ends.push({ t: chords[chords.length - 1].end, by: 'end' });
  const phrases: Phrase[] = [];
  let start = chords[0].start;
  for (const e of ends.sort((a, b) => a.t - b.t)) {
    if (e.t - start < meter) continue; // too short to be a phrase
    const last = chordAt(chords, e.t - 1e-3);
    phrases.push({ start, end: e.t, last, cadence: cadenceAt(chords, last), by: e.by });
    start = e.t;
  }
  return phrases;
}

/** Named progressions (ii–V–I, V–I, tritone sub, plagal, deceptive, backdoor, cycles, loops) along the piece. */
export function featuresOf(chords: PieceChord[]): Feature[] {
  const out: Feature[] = [];
  for (let i = 1; i < chords.length; i++) {
    const window = chords.slice(Math.max(0, i - 7), i + 1).map((c) => c.chord);
    for (const m of patternsAtEnd(window, chords[i].key))
      out.push({ kind: m.kind, label: m.label, from: i - m.length + 1, to: i });
  }
  return out;
}

const INTERVAL = [
  'unison',
  'semitone',
  'step',
  'minor 3rd',
  'major 3rd',
  'fourth',
  'tritone',
  'fifth',
  'minor 6th',
  'major 6th',
  'minor 7th',
  'major 7th',
];

/**
 * Sequences: a two-chord pattern (root interval + both chord qualities) repeated straight away at another
 * pitch level, and continued while the same transposition step keeps going (Baroque Fortspinnung). At least three
 * statements (a model and two repetitions), so I–IV | V–I is not counted.
 */
export function sequencesOf(chords: PieceChord[]): Feature[] {
  const out: Feature[] = [];
  const shape = (i: number) =>
    `${mod12(chords[i + 1].chord.root - chords[i].chord.root)}:${chords[i].chord.suffix}:${chords[i + 1].chord.suffix}`;
  let i = 0;
  while (i + 3 < chords.length) {
    const step = mod12(chords[i + 2].chord.root - chords[i].chord.root);
    if (step === 0 || mod12(chords[i + 1].chord.root - chords[i].chord.root) === 0 || shape(i) !== shape(i + 2)) {
      i++;
      continue;
    }
    let end = i + 3;
    while (
      end + 2 < chords.length &&
      shape(end + 1) === shape(i) &&
      mod12(chords[end + 1].chord.root - chords[end - 1].chord.root) === step
    )
      end += 2;
    const links = (end - i + 1) / 2;
    if (links < 3) {
      i++;
      continue; // a model and one repetition is not yet a sequence
    }
    const signed = step > 6 ? `down a ${INTERVAL[12 - step]}` : `up a ${INTERVAL[step]}`;
    out.push({ kind: 'sequence', label: `sequence ×${links}, ${signed}`, from: i, to: end });
    i = end + 1;
  }
  return out;
}

/** Pedal points: the same bass note under at least three consecutive chords with different roots. */
export function pedalsOf(chords: PieceChord[], bass: (number | null)[]): Feature[] {
  const out: Feature[] = [];
  let i = 0;
  while (i < chords.length) {
    const b = bass[i];
    let j = i;
    while (j + 1 < chords.length && b !== null && bass[j + 1] === b) j++;
    const roots = new Set(chords.slice(i, j + 1).map((c) => c.chord.root));
    if (b !== null && j - i >= 2 && roots.size >= 2)
      out.push({ kind: 'pedal', label: `pedal point (bass held under ${j - i + 1} chords)`, from: i, to: j });
    i = j + 1;
  }
  return out;
}
