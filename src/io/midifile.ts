import { validateMeter } from '../theory/meter';

export interface MidiEvent {
  t: number;
  type: 'on' | 'off' | 'pedal';
  note: number;
  vel: number;
}

interface RawMidiEvent {
  tick: number;
  kind: 'on' | 'off' | 'pedal' | 'tempo' | 'signature';
  a: number;
  b: number;
  /** Track index and MIDI channel (0–15) of note events; -1 for meta events. */
  track: number;
  channel: number;
}

/** Parse events structurally so metadata-like bytes inside text/SysEx cannot masquerade as a meter. */
function scanMidiFile(buf: ArrayBuffer) {
  const d = new DataView(buf);
  let p = 0;
  const str = (n: number) => String.fromCharCode(...new Uint8Array(buf, p, n));
  const u32 = () => {
    const v = d.getUint32(p);
    p += 4;
    return v;
  };
  const vlq = () => {
    let v = 0,
      b: number;
    do {
      b = d.getUint8(p++);
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };
  if (str(4) !== 'MThd') throw new Error('Not a MIDI file');
  p += 4;
  const headerLen = u32();
  const tracks = d.getUint16(p + 2); // p + 0 = format (0 or 1, both merged the same way)
  const division = d.getUint16(p + 4);
  p += headerLen;
  if (division & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported');

  const raw: RawMidiEvent[] = [];
  const names: Record<number, string> = {};
  for (let tr = 0; tr < tracks && p < buf.byteLength; tr++) {
    const id = str(4);
    p += 4;
    const len = u32(),
      end = p + len;
    if (id !== 'MTrk') {
      p = end;
      continue;
    }
    let tick = 0,
      status = 0;
    while (p < end) {
      tick += vlq();
      let s = d.getUint8(p);
      if (s & 0x80) p++;
      else s = status; // running status
      if (s === 0xff) {
        const type = d.getUint8(p++),
          n = vlq();
        if (type === 0x51)
          raw.push({
            tick,
            kind: 'tempo',
            a: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2),
            b: 0,
            track: -1,
            channel: -1,
          });
        if (type === 0x58 && n >= 4)
          raw.push({ tick, kind: 'signature', a: d.getUint8(p), b: 2 ** d.getUint8(p + 1), track: -1, channel: -1 });
        if (type === 0x03 && n > 0) names[tr] = str(n).trim();
        p += n;
      } else if (s === 0xf0 || s === 0xf7) {
        const length = vlq();
        p += length;
      } else {
        status = s;
        const type = s & 0xf0;
        const a = d.getUint8(p++),
          b = type === 0xc0 || type === 0xd0 ? 0 : d.getUint8(p++);
        const at = { tick, track: tr, channel: s & 0x0f };
        if (type === 0x90 && b > 0) raw.push({ ...at, kind: 'on', a, b });
        else if (type === 0x80 || type === 0x90) raw.push({ ...at, kind: 'off', a, b });
        else if (type === 0xb0 && a === 64) raw.push({ ...at, kind: 'pedal', a: b >= 64 ? 1 : 0, b });
      }
    }
    p = end;
  }
  raw.sort((x, y) => x.tick - y.tick);
  return { raw, division, names };
}

/** Minimal SMF reader: notes and sustain, merged across tracks and timed through tempo changes. */
export function parseMidiFile(buf: ArrayBuffer): MidiEvent[] {
  const { raw, division } = scanMidiFile(buf);
  let usPerBeat = 500000,
    lastTick = 0,
    ms = 0;
  const out: MidiEvent[] = [];
  for (const e of raw) {
    ms += ((e.tick - lastTick) * usPerBeat) / division / 1000;
    lastTick = e.tick;
    if (e.kind === 'tempo') usPerBeat = e.a;
    else if (e.kind === 'on' || e.kind === 'off' || e.kind === 'pedal')
      out.push({ t: ms, type: e.kind, note: e.a, vel: e.b });
  }
  return out;
}

/** Read the initial standard MIDI tempo and time signature. */
export function midiFileMeta(buf: ArrayBuffer): { bpm: number; beatsPerBar: number; denominator: number } {
  const { raw } = scanMidiFile(buf);
  const tempo = raw.find((event) => event.kind === 'tempo');
  const signature = raw.find((event) => event.kind === 'signature');
  const bpm = tempo && tempo.a > 0 ? 60e6 / tempo.a : 120;
  const beatsPerBar = signature?.a ?? 4;
  const denominator = signature?.b ?? 4;
  validateMeter(beatsPerBar, denominator);
  return { bpm, beatsPerBar, denominator };
}

export interface MidiPart {
  /** "track:channel". */
  id: string;
  name: string;
  channel: number;
  /** Notes in quarter-note beats (from ticks, so tempo changes do not matter). */
  notes: { start: number; beats: number; pitch: number; velocity: number }[];
  meanPitch: number;
  /** Share of note time during which another note of the part also sounds (0 = a single line). */
  overlap: number;
}

/**
 * The file's instrument parts (one per track and channel, drums on channel 10 left out), for choosing which part is
 * the melody and which the chords.
 */
export function midiParts(buf: ArrayBuffer): MidiPart[] {
  const { raw, division, names } = scanMidiFile(buf);
  const parts = new Map<string, MidiPart>();
  const open = new Map<string, { start: number; velocity: number }[]>();
  for (const e of raw) {
    if ((e.kind !== 'on' && e.kind !== 'off') || e.channel === 9) continue;
    const id = `${e.track}:${e.channel}`;
    let part = parts.get(id);
    if (!part) {
      part = {
        id,
        name: names[e.track] || `Track ${e.track + 1}`,
        channel: e.channel,
        notes: [],
        meanPitch: 0,
        overlap: 0,
      };
      parts.set(id, part);
    }
    const key = `${id}:${e.a}`;
    const stack = open.get(key) ?? [];
    open.set(key, stack);
    const beat = e.tick / division;
    if (e.kind === 'on') stack.push({ start: beat, velocity: e.b });
    else {
      const on = stack.shift();
      if (on && beat > on.start)
        part.notes.push({ start: on.start, beats: beat - on.start, pitch: e.a, velocity: on.velocity });
    }
  }
  const out = [...parts.values()].filter((p) => p.notes.length);
  for (const p of out) {
    p.notes.sort((a, b) => a.start - b.start || b.pitch - a.pitch);
    p.meanPitch = p.notes.reduce((s, n) => s + n.pitch, 0) / p.notes.length;
    let total = 0;
    let shared = 0;
    for (const [i, n] of p.notes.entries()) {
      total += n.beats;
      const end = n.start + n.beats;
      let covered = 0;
      for (let j = i + 1; j < p.notes.length && p.notes[j].start < end; j++)
        covered = Math.max(covered, Math.min(end, p.notes[j].start + p.notes[j].beats) - p.notes[j].start);
      shared += covered;
    }
    p.overlap = total ? shared / total : 0;
  }
  return out;
}

/** The part most likely to be the melody: a single line (little overlap), high, and with enough notes. */
export function melodyPart(parts: MidiPart[]): MidiPart | null {
  const named = parts.find((p) => /melod|vocal|voice|lead|sing|soprano|tune/i.test(p.name));
  if (named) return named;
  const score = (p: MidiPart) => p.meanPitch - 40 * p.overlap + Math.min(10, p.notes.length / 8);
  return [...parts].sort((a, b) => score(b) - score(a))[0] ?? null;
}
