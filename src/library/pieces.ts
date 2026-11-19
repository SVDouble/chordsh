import type { MidiEvent } from '../io/midifile';
import type { Recording } from '../io/recorder';
import { isMeterDenominator } from '../theory/meter';

/** Anything that can be played into the app: built-ins, your recordings, MIDI files, benchmark pieces. */
export interface Piece {
  id: string;
  title: string;
  source: 'built-in' | 'recording' | 'midi file' | 'benchmark' | 'sequence';
  /** [onset ms, duration ms, midi note, velocity] */
  notes: [number, number, number, number][];
  /** Known tempo → exact bars; absent → bars are estimated from the playing. */
  bpm?: number;
  beatsPerBar?: number;
  denominator?: number;
  /** Optional full clip length, including the final rest/release gap. */
  durationMs?: number;
  /** Sustain changes retained from MIDI files and recordings. */
  pedal?: [t: number, on: boolean][];
  note?: string;
}

// The demo: C major ii–V–I, a secondary dominant, then Fm7 (borrowed iv = ii of E♭) pivots into E♭ major.
const DEMO_BARS: [number[], number[]][] = [
  [
    [36, 52, 55, 59],
    [76, 74],
  ],
  [
    [45, 55, 60, 64],
    [72, 76],
  ],
  [
    [38, 53, 57, 60],
    [77, 76],
  ],
  [
    [43, 53, 59, 62],
    [74, 71],
  ],
  [[36, 52, 55, 59], [72]],
  [
    [45, 55, 61, 64],
    [73, 76],
  ],
  [[38, 53, 57, 60], [77]],
  [[43, 53, 59, 62], [74]],
  [
    [41, 56, 60, 63],
    [75, 72],
  ],
  [
    [46, 56, 62, 65],
    [74, 70],
  ],
  [
    [39, 55, 58, 62],
    [79, 75],
  ],
  [[44, 55, 60, 63], [72]],
  [[41, 56, 60, 63], [75]],
  [[46, 56, 62, 65], [74]],
  [[39, 55, 58, 62], [75]],
];

function demo(bpm = 96): Piece {
  const half = (60000 / bpm) * 2; // two chords per 4/4 bar
  const notes: Piece['notes'] = [];
  DEMO_BARS.forEach(([chord, mel], i) => {
    const t = i * half;
    for (const n of chord) notes.push([t, half - 40, n, 70]);
    mel.forEach((m, j) => notes.push([t + 250 + (j * half) / mel.length, half / mel.length - 60, m, 95]));
  });
  return {
    id: 'demo',
    title: 'Demo: ii–V–I, secondary dominant, pivot to E♭',
    source: 'built-in',
    notes,
    bpm,
    beatsPerBar: 4,
  };
}

export const BUILT_IN: Piece[] = [demo()];

export function fromMidi(
  id: string,
  title: string,
  events: MidiEvent[],
  meta?: { bpm: number; beatsPerBar: number; denominator?: number },
): Piece {
  return {
    id,
    title,
    source: 'midi file',
    notes: pair(
      events.filter((e) => e.type !== 'pedal').map((e) => ({ t: e.t, on: e.type === 'on', note: e.note, vel: e.vel })),
    ),
    bpm: meta?.bpm,
    beatsPerBar: meta?.beatsPerBar,
    denominator: meta?.denominator ?? 4,
    pedal: events.filter((e) => e.type === 'pedal').map((e) => [e.t, e.vel >= 64]),
  };
}

export function fromRecording(id: string, rec: Recording): Piece {
  const s = rec.settings as { bars?: string; bpm?: number; meter?: number; meterDenominator?: number };
  return {
    id,
    title: rec.note || `Recording ${rec.started.slice(0, 16).replace('T', ' ')}`,
    source: 'recording',
    note: rec.note,
    notes: pair(
      rec.input
        .filter((e) => e.kind !== 'pedal')
        .map((e) => ({ t: e.t, on: e.kind === 'on', note: e.note, vel: e.vel })),
      rec.durationMs,
    ),
    bpm: s.bars === 'metronome' || s.bars === 'file' ? s.bpm : undefined,
    beatsPerBar: s.meter,
    denominator: isMeterDenominator(s.meterDenominator) ? s.meterDenominator : 4,
    pedal: rec.input.filter((e) => e.kind === 'pedal').map((e) => [e.t, e.vel >= 64]),
    durationMs: rec.durationMs,
  };
}

/** Benchmark format (local/data/<corpus>/<id>.json). */
export function fromBenchmark(
  id: string,
  p: { title: string; notes: [number, number, number, number][]; beats: number[]; beats_per_bar: number },
): Piece {
  const beat = p.beats.length > 1 ? p.beats[1] - p.beats[0] : 0;
  return {
    id,
    title: p.title,
    source: 'benchmark',
    notes: p.notes,
    bpm: beat ? 60000 / beat : undefined,
    beatsPerBar: p.beats_per_bar,
  };
}

function pair(ev: { t: number; on: boolean; note: number; vel: number }[], end?: number): Piece['notes'] {
  const open = new Map<number, { t: number; vel: number }>(),
    out: Piece['notes'] = [];
  for (const e of ev) {
    if (e.on) open.set(e.note, { t: e.t, vel: e.vel });
    else {
      const o = open.get(e.note);
      if (o) {
        out.push([o.t, e.t - o.t, e.note, o.vel]);
        open.delete(e.note);
      }
    }
  }
  if (end !== undefined) for (const [note, held] of open) out.push([held.t, Math.max(1, end - held.t), note, held.vel]);
  return out.sort((a, b) => a[0] - b[0]);
}
