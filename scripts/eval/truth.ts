/** Loads the unified benchmark format written by scripts/fetch_datasets.py (local/data/<corpus>/<id>.json). */
import fs from 'node:fs';
import path from 'node:path';
import type { Key } from '../../src/theory/scales';

export type Family = 'maj' | 'min' | 'dim' | 'aug' | 'sus';
export interface TruthChord { t0: number; t1: number; root: number; family: Family; label: string; key: Key | null }
export interface Piece {
  corpus: string;
  id: string;
  title: string;
  genre: string;
  /** Rendered from chord changes rather than a real performance (easier). */
  synthetic: boolean;
  events: { t: number; kind: 'on' | 'off'; note: number; vel: number }[];
  chords: TruthChord[];
  bars: number[];
  beats: number[];
  beatsPerBar: number;
  durationMs: number;
}

export const DATA = path.resolve('local', 'data');

export function corpora(): string[] {
  return fs.existsSync(DATA) ? fs.readdirSync(DATA).filter((d) => !d.startsWith('.') && fs.statSync(path.join(DATA, d)).isDirectory()).sort() : [];
}

export function pieceIds(corpus: string): string[] {
  return fs.readdirSync(path.join(DATA, corpus)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Deterministic split by id hash: half the pieces tune parameters, the other half check them. */
export function split(corpus: string, id: string): 'tune' | 'test' {
  let h = 2166136261;
  for (const ch of `${corpus}/${id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 2 === 0 ? 'tune' : 'test';
}

export function loadPiece(corpus: string, id: string): Piece {
  const p = JSON.parse(fs.readFileSync(path.join(DATA, corpus, `${id}.json`), 'utf8'));
  const events: Piece['events'] = [];
  for (const [t, d, note, vel] of p.notes as number[][]) {
    events.push({ t, kind: 'on', note, vel });
    events.push({ t: t + Math.max(10, d - 15), kind: 'off', note, vel: 0 });
  }
  events.sort((a, b) => a.t - b.t || (a.kind === 'off' ? -1 : 1));
  const chords: TruthChord[] = (p.chords as [number, number, number, Family, string, number | null, string | null][]).map(
    ([t0, t1, root, family, label, tonic, mode]) => ({ t0, t1, root, family, label, key: tonic === null ? null : { tonic, mode: mode as Key['mode'] } }),
  );
  return {
    corpus, id, title: p.title, genre: p.genre, synthetic: !!p.synthetic, events, chords,
    bars: p.bars, beats: p.beats, beatsPerBar: p.beats_per_bar, durationMs: events.length ? events[events.length - 1].t : 0,
  };
}
