/**
 * Library entries as editable songs: a reference piece with its annotated chords, a recording with the chords the
 * app recognised during the take, or any performance (MIDI file, built-in) with chords read from its notes.
 * The melody is the top line of the notes (an approximation for piano pieces). See docs/app.md.
 */
import { chordsFromNotes, melodyFromPart, type PartNote } from '../engine/partImport';
import { estimateKey } from '../engine/advisor';
import { emptySequence, SequenceEditor, type Sequence } from '../engine/sequence';
import { type Chord, chordName, chordOf, type KindName } from '../theory/chords';
import type { Key } from '../theory/scales';
import { parseChordSymbol } from '../theory/symbols';
import type { Piece } from './pieces';

interface Placed {
  start: number;
  beats: number;
  symbol: string;
}

/** The chord kind of an annotation: its quality family, plus the 7th its label names (Roman, jazz or Harte). */
export function annotatedKind(family: string, label: string): KindName {
  const l = label.split('/')[0];
  if (/hdim|ø|%|m7b5/.test(l)) return 'm7b5';
  if (/dim7|o7|°7/.test(l)) return 'dim7';
  if (/\^7|maj7|M7/.test(l)) return 'maj7';
  const seventh = /(?<![#b])(7|65|43|42)(?!\d)/.test(l.split(':').pop() ?? l) || /:(7|min7)$/.test(l);
  if (family === 'min') return seventh || /-7|min7|m7/.test(l) ? 'm7' : 'min';
  if (family === 'dim') return seventh ? 'm7b5' : 'dim';
  if (family === 'aug') return 'aug';
  if (family === 'sus') return 'sus4';
  return seventh ? '7' : 'maj';
}

/** Snap to half beats; keep chords in order without overlaps or zero lengths. */
function tidy(chords: Placed[]): Placed[] {
  const out: Placed[] = [];
  for (const c of chords) {
    const start = Math.round(c.start * 2) / 2;
    const end = Math.max(start + 0.5, Math.round((c.start + c.beats) * 2) / 2);
    const last = out.at(-1);
    if (last && start < last.start + last.beats) {
      if (start <= last.start) continue;
      last.beats = start - last.start;
    }
    if (last && last.symbol === c.symbol && Math.abs(last.start + last.beats - start) < 1e-9)
      last.beats = end - last.start;
    else out.push({ start, beats: end - start, symbol: c.symbol });
  }
  return out;
}

function build(
  title: string,
  bpm: number,
  meter: number,
  chords: Placed[],
  notes: PartNote[],
  knownKey?: Key,
): Sequence {
  const editor = new SequenceEditor(emptySequence(title));
  const safeBpm = Math.min(300, Math.max(30, Math.round(bpm)));
  editor.update({ bpm: safeBpm, meter: meter > 0 && meter <= 16 ? meter : 4, denominator: 4 });
  const melody = melodyFromPart(notes.filter((n) => n.pitch >= 55));
  const parsed = chords.map((c) => parseChordSymbol(c.symbol)).filter((c): c is Chord => !!c);
  editor.update({ key: knownKey ?? estimateKey(melody, parsed) });
  for (const c of tidy(chords)) editor.place([{ symbol: c.symbol, beats: c.beats }], c.start);
  if (melody.length) editor.recordMelody(melody);
  return editor.document;
}

/** Benchmark format (local/data/<corpus>/<id>.json): annotated chords on a beat grid in milliseconds. */
export function songFromReference(raw: {
  title: string;
  notes: [number, number, number, number][];
  beats: number[];
  beats_per_bar: number;
  chords?: unknown[][];
}): Sequence {
  const beats = raw.beats;
  const beat = (t: number) => {
    if (beats.length < 2) return t / 500;
    if (t <= beats[0]) return (t - beats[0]) / (beats[1] - beats[0]);
    let lo = 0;
    let hi = beats.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (beats[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo + (t - beats[lo]) / (beats[lo + 1] - beats[lo] || 1);
  };
  const gaps = beats
    .slice(1)
    .map((b, i) => b - beats[i])
    .sort((a, b) => a - b);
  const bpm = gaps.length ? 60000 / gaps[Math.floor(gaps.length / 2)] : 120;
  // the annotated key, weighted by how long it holds (most corpora label every chord with its local key)
  const keyTime = new Map<string, number>();
  for (const row of raw.chords ?? []) {
    const [t0, t1, , , , tonic, mode] = row as [number, number, number, string, string, number | null, string];
    if (typeof tonic === 'number') keyTime.set(`${tonic}:${mode}`, (keyTime.get(`${tonic}:${mode}`) ?? 0) + t1 - t0);
  }
  const top = [...keyTime].sort((a, b) => b[1] - a[1])[0]?.[0];
  const key: Key | undefined = top
    ? { tonic: Number(top.split(':')[0]), mode: top.split(':')[1] === 'minor' ? 'minor' : 'major' }
    : undefined;
  const chords = (raw.chords ?? []).flatMap((row) => {
    const [t0, t1, root, family, label] = row as [number, number, number, string, string];
    if (typeof root !== 'number') return [];
    const symbol = chordName(chordOf(root, annotatedKind(family, String(label))), key);
    return [{ start: Math.max(0, beat(t0)), beats: beat(t1) - beat(t0), symbol }];
  });
  const notes = raw.notes.map(([t, d, pitch, velocity]) => ({
    start: Math.max(0, beat(t)),
    beats: Math.max(0.125, beat(t + d) - beat(t)),
    pitch,
    velocity,
  }));
  return build(raw.title, bpm, raw.beats_per_bar || 4, chords, notes, key);
}

/**
 * A performance as a song: chords recognised during a recording (`commits`, at ms), else read from the notes.
 * Without a known tempo the beat is assumed at `fallbackBpm`.
 */
export function songFromPerformance(
  piece: Piece,
  commits: { t: number; name: string }[] = [],
  fallbackBpm = 100,
): Sequence {
  const bpm = piece.bpm ?? fallbackBpm;
  const ms = 60000 / bpm;
  const first = piece.notes.length ? Math.min(...piece.notes.map((n) => n[0])) : 0;
  const notes: PartNote[] = piece.notes.map(([t, d, pitch, velocity]) => ({
    start: (t - first) / ms,
    beats: Math.max(0.125, d / ms),
    pitch,
    velocity,
  }));
  const meter = piece.beatsPerBar ?? 4;
  let chords: Placed[];
  if (commits.length) {
    const end = Math.max(...notes.map((n) => n.start + n.beats));
    chords = commits.map((c, i) => {
      const start = Math.max(0, (c.t - first) / ms);
      const next = i + 1 < commits.length ? (commits[i + 1].t - first) / ms : end;
      return { start, beats: Math.max(0.5, next - start), symbol: c.name };
    });
  } else {
    // accompaniment: the notes below the melody's register
    chords = chordsFromNotes(
      notes.filter((n) => n.pitch < 67),
      meter,
    );
  }
  return build(
    piece.title,
    bpm,
    meter,
    chords.filter((c) => !!parseChordSymbol(c.symbol)),
    notes,
  );
}

/** The chord names a recording's engine committed (in order), for songFromPerformance. */
export function recordedChords(engine: unknown): { t: number; name: string }[] {
  if (!Array.isArray(engine)) return [];
  return engine
    .filter((e) => e && e.kind === 'commit' && typeof e.name === 'string' && typeof e.t === 'number')
    .map((e) => ({ t: e.t as number, name: e.name as string }))
    .filter((c, i, all) => i === 0 || c.name !== all[i - 1].name || c.t - all[i - 1].t > 50);
}
