/**
 * Loading a melody and chords separately (from MIDI parts, see io/midifile.ts midiParts).
 * Chords are read from accompaniment notes on a one-beat grid: per beat, the pitch classes that sound for a
 * real share of it (so arpeggios count as chords), named with theory/chords identify(); equal neighbours merge.
 */
import { chordName, identify } from '../theory/chords';
import { mod12 } from '../theory/pitch';
import type { MelodyNote } from './sequence';

export interface PartNote {
  start: number;
  beats: number;
  pitch: number;
  velocity: number;
}

/** A single line from a part: the highest note wherever notes overlap (for parts that double or harmonise). */
export function melodyFromPart(notes: PartNote[], snap = 1 / 8): MelodyNote[] {
  const q = (x: number) => Math.round(x / snap) * snap;
  const sorted = [...notes].sort((a, b) => a.start - b.start || b.pitch - a.pitch);
  const out: MelodyNote[] = [];
  for (const n of sorted) {
    const start = q(n.start);
    const last = out.at(-1);
    if (last && Math.abs(last.start - start) < 1e-9) continue; // same onset: the higher note was kept
    if (last && last.start + last.beats > start) last.beats = Math.max(snap, start - last.start); // cut the overlap
    out.push({ start, beats: Math.max(snap, q(n.beats)), pitch: n.pitch, velocity: n.velocity });
  }
  return out;
}

export interface ImportedChord {
  start: number;
  beats: number;
  symbol: string;
}

/** The chord in a window: pitch classes sounding for at least `minShare` of the strongest one, plus the bass. */
function chordIn(
  notes: PartNote[],
  from: number,
  to: number,
  minShare: number,
): { symbol: string; size: number; end: number } | null {
  const weight = Array<number>(12).fill(0);
  const lowest = Array<number>(12).fill(Infinity);
  let bass = Infinity;
  let end = from;
  for (const n of notes) {
    const overlap = Math.min(n.start + n.beats, to) - Math.max(n.start, from);
    if (overlap <= 1e-6) continue;
    end = Math.max(end, Math.min(n.start + n.beats, to));
    const pc = mod12(n.pitch);
    weight[pc] += overlap;
    lowest[pc] = Math.min(lowest[pc], n.pitch);
    bass = Math.min(bass, n.pitch);
  }
  const top = Math.max(...weight);
  if (!top) return null;
  const pitches = weight
    .map((w, pc) => (w >= minShare * top ? lowest[pc] : null))
    .filter((p): p is number => p !== null);
  if (Number.isFinite(bass) && !pitches.includes(bass)) pitches.push(bass);
  const id = identify(pitches);
  return id.best ? { symbol: chordName(id.best), size: new Set(pitches.map(mod12)).size, end } : null;
}

/**
 * Chords from accompaniment notes. Each bar is read as one chord, and split into halves (then beats) only where
 * every part is a full chord of its own (3+ notes) and they differ, so arpeggios stay one chord and real changes
 * on the half bar are kept. Equal neighbours merge.
 */
export function chordsFromNotes(notes: PartNote[], meter = 4, minShare = 0.2): ImportedChord[] {
  if (!notes.length) return [];
  const end = Math.max(...notes.map((n) => n.start + n.beats));
  const out: ImportedChord[] = [];
  const read = (from: number, len: number): ImportedChord[] => {
    const whole = chordIn(notes, from, from + len, minShare);
    const parts = len >= 2 && len % 2 === 0 ? 2 : len >= 3 && len % 3 === 0 ? 3 : 0;
    if (parts) {
      const step = len / parts;
      const pieces = Array.from({ length: parts }, (_, k) =>
        chordIn(notes, from + k * step, from + (k + 1) * step, minShare),
      );
      if (pieces.every((c) => c && c.size >= 3) && new Set(pieces.map((c) => c?.symbol)).size > 1)
        return pieces.flatMap((_, k) => read(from + k * step, step));
    }
    // a chord lasts until its notes stop (rounded up to the beat), not over the silence after them
    return whole
      ? [{ start: from, beats: Math.min(len, Math.ceil(whole.end - from - 1e-6)), symbol: whole.symbol }]
      : [];
  };
  for (let bar = 0; bar < end - 1e-6; bar += meter)
    for (const c of read(bar, meter)) {
      const last = out.at(-1);
      if (last && last.symbol === c.symbol && Math.abs(last.start + last.beats - c.start) < 1e-9) last.beats += c.beats;
      else out.push(c);
    }
  return out;
}
