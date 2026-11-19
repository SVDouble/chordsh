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
          });
        if (type === 0x58 && n >= 4) raw.push({ tick, kind: 'signature', a: d.getUint8(p), b: 2 ** d.getUint8(p + 1) });
        p += n;
      } else if (s === 0xf0 || s === 0xf7) {
        const length = vlq();
        p += length;
      } else {
        status = s;
        const type = s & 0xf0;
        const a = d.getUint8(p++),
          b = type === 0xc0 || type === 0xd0 ? 0 : d.getUint8(p++);
        if (type === 0x90 && b > 0) raw.push({ tick, kind: 'on', a, b });
        else if (type === 0x80 || type === 0x90) raw.push({ tick, kind: 'off', a, b });
        else if (type === 0xb0 && a === 64) raw.push({ tick, kind: 'pedal', a: b >= 64 ? 1 : 0, b });
      }
    }
    p = end;
  }
  raw.sort((x, y) => x.tick - y.tick);
  return { raw, division };
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
