/** Ground-truth loaders: BPS-FH (Beethoven, functional harmony) and POP909 (pop, chord symbols). */
import fs from 'node:fs';
import path from 'node:path';
import { parseMidiFile } from '../../src/io/midifile';
import { mod12 } from '../../src/theory/pitch';
import type { Key } from '../../src/theory/scales';

export type Family = 'maj' | 'min' | 'dim' | 'aug' | 'sus';
export interface TruthChord { t0: number; t1: number; root: number; family: Family; label: string; key: Key | null }
export interface Piece {
  id: string;
  title: string;
  /** Note events in ms. */
  events: { t: number; kind: 'on' | 'off'; note: number; vel: number }[];
  chords: TruthChord[];
  /** Bar start times in ms. */
  bars: number[];
  /** Beat times in ms. */
  beats: number[];
  durationMs: number;
}

const DATA = path.resolve('data');
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// ── BPS-FH ──
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

function bpsKey(s: string): Key {
  let pc = LETTER[s[0].toUpperCase()];
  for (const ch of s.slice(1)) pc += ch === '-' ? -1 : ch === '+' ? 1 : 0;
  return { tonic: mod12(pc), mode: s[0] === s[0].toUpperCase() ? 'major' : 'minor' };
}

/** "5", "-2", "+4", "7/5" → semitones above the key's tonic. */
function bpsDegree(deg: string, key: Key, quality: string): number {
  const one = (d: string, leading: boolean): number => {
    const acc = d[0] === '-' ? -1 : d[0] === '+' ? 1 : 0;
    const n = Number(acc ? d.slice(1) : d) - 1;
    if (acc) return mod12(MAJOR[n] + acc); // altered degrees are written against the major scale
    if (key.mode === 'minor' && n === 6 && leading) return 11; // vii° uses the raised leading tone
    return (key.mode === 'major' ? MAJOR : MINOR)[n];
  };
  const leading = ['d', 'd7', 'h7'].includes(quality);
  if (!deg.includes('/')) return one(deg, leading);
  const [x, y] = deg.split('/');
  const local = one(y, false);
  const xn = Number(x.replace(/[+-]/, '')) - 1;
  return mod12(local + MAJOR[xn] + (x[0] === '-' ? -1 : x[0] === '+' ? 1 : 0));
}

const BPS_FAMILY: Record<string, Family | null> = { M: 'maj', M7: 'maj', D7: 'maj', m: 'min', m7: 'min', d: 'dim', d7: 'dim', h7: 'dim', a: 'aug', a6: null };

export function loadBps(n: number, bpm = 100): Piece {
  const p = JSON.parse(fs.readFileSync(path.join(DATA, 'bps-fh', String(n), 'piece.json'), 'utf8'));
  const beat = 60000 / bpm;
  const start = Math.min(...p.notes.map((x: number[]) => x[0]));
  const ms = (b: number) => (b - start) * beat;
  const events: Piece['events'] = [];
  for (const [on, midi, , dur] of p.notes as number[][]) {
    events.push({ t: ms(on), kind: 'on', note: midi, vel: 80 });
    events.push({ t: ms(on + dur) - 15, kind: 'off', note: midi, vel: 0 });
  }
  const chords: TruthChord[] = [];
  for (const [t0, t1, keyS, deg, q, , roman] of p.chords as (string | number)[][]) {
    const fam = BPS_FAMILY[String(q)];
    if (!fam) continue;
    const key = bpsKey(String(keyS));
    chords.push({ t0: ms(+t0), t1: ms(+t1), root: mod12(key.tonic + bpsDegree(String(deg), key, String(q))), family: fam, label: `${keyS}:${roman}`, key });
  }
  const lastBeat = Math.max(...p.notes.map((x: number[]) => x[0] + x[3]));
  const beats = Array.from({ length: Math.ceil(lastBeat - start) }, (_, i) => i * beat);
  return finish({ id: `bps-${n}`, title: p.title, events, chords, bars: (p.downbeats as number[]).map(ms), beats });
}

// ── POP909 ──
const POP_FAMILY: Record<string, Family> = {
  maj: 'maj', maj7: 'maj', maj6: 'maj', '7': 'maj', min: 'min', min7: 'min', min6: 'min',
  dim: 'dim', hdim7: 'dim', dim7: 'dim', aug: 'aug', sus2: 'sus', sus4: 'sus', 'sus4(b7)': 'sus',
};

function harteRoot(s: string): number {
  let pc = LETTER[s[0]];
  for (const ch of s.slice(1)) pc += ch === 'b' ? -1 : ch === '#' ? 1 : 0;
  return mod12(pc);
}

export function loadPop(id: string): Piece {
  const dir = path.join(DATA, 'pop909', id);
  const buf = fs.readFileSync(path.join(dir, `${id}.mid`));
  const midi = parseMidiFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const events: Piece['events'] = midi.filter((e) => e.type !== 'pedal').map((e) => ({ t: e.t, kind: e.type as 'on' | 'off', note: e.note, vel: e.vel }));
  const keyLine = fs.readFileSync(path.join(dir, 'key_audio.txt'), 'utf8').trim().split('\n')[0].split(/\s+/)[2];
  const [kr, km] = keyLine.split(':');
  const key: Key = { tonic: harteRoot(kr), mode: km.startsWith('min') ? 'minor' : 'major' };
  const chords: TruthChord[] = [];
  for (const line of fs.readFileSync(path.join(dir, 'chord_midi.txt'), 'utf8').trim().split('\n')) {
    const [a, b, lab] = line.split(/\s+/);
    if (lab === 'N') continue;
    const [root, rest] = lab.split(':');
    const fam = POP_FAMILY[rest.split('/')[0]];
    if (!fam) continue;
    chords.push({ t0: +a * 1000, t1: +b * 1000, root: harteRoot(root), family: fam, label: lab, key });
  }
  const rows = fs.readFileSync(path.join(dir, 'beat_midi.txt'), 'utf8').trim().split('\n').map((l) => l.split(/\s+/).map(Number));
  const bars = rows.filter((r) => r[2] === 1).map((r) => r[0] * 1000);
  return finish({ id: `pop-${id}`, title: `POP909 #${id}`, events, chords, bars, beats: rows.map((r) => r[0] * 1000) });
}

function finish(p: Omit<Piece, 'durationMs'>): Piece {
  p.events.sort((a, b) => a.t - b.t || (a.kind === 'off' ? -1 : 1));
  return { ...p, durationMs: Math.max(...p.events.map((e) => e.t)) };
}

export const bpsIds = () => (fs.existsSync(path.join(DATA, 'bps-fh')) ? fs.readdirSync(path.join(DATA, 'bps-fh')).map(Number).sort((a, b) => a - b) : []);
export const popIds = () => (fs.existsSync(path.join(DATA, 'pop909')) ? fs.readdirSync(path.join(DATA, 'pop909')).sort() : []);
