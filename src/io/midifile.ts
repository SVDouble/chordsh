export interface MidiEvent { t: number; type: 'on' | 'off' | 'pedal'; note: number; vel: number }

/** Minimal Standard MIDI File reader (format 0/1): notes, sustain pedal and tempo, merged and timed in ms. */
export function parseMidiFile(buf: ArrayBuffer): MidiEvent[] {
  const d = new DataView(buf);
  let p = 0;
  const str = (n: number) => String.fromCharCode(...new Uint8Array(buf, p, n));
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; };
  const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  if (str(4) !== 'MThd') throw new Error('Not a MIDI file');
  p += 4;
  const headerLen = u32();
  const tracks = d.getUint16(p + 2); // p + 0 = format (0 or 1, both merged the same way)
  const division = d.getUint16(p + 4);
  p += headerLen;
  if (division & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported');

  const raw: { tick: number; kind: 'on' | 'off' | 'pedal' | 'tempo'; a: number; b: number }[] = [];
  for (let tr = 0; tr < tracks && p < buf.byteLength; tr++) {
    const id = str(4); p += 4;
    const len = u32(), end = p + len;
    if (id !== 'MTrk') { p = end; continue; }
    let tick = 0, status = 0;
    while (p < end) {
      tick += vlq();
      let s = d.getUint8(p);
      if (s & 0x80) p++; else s = status; // running status
      if (s === 0xff) {
        const type = d.getUint8(p++), n = vlq();
        if (type === 0x51) raw.push({ tick, kind: 'tempo', a: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2), b: 0 });
        p += n;
      } else if (s === 0xf0 || s === 0xf7) p += vlq();
      else {
        status = s;
        const type = s & 0xf0;
        const a = d.getUint8(p++), b = type === 0xc0 || type === 0xd0 ? 0 : d.getUint8(p++);
        if (type === 0x90 && b > 0) raw.push({ tick, kind: 'on', a, b });
        else if (type === 0x80 || type === 0x90) raw.push({ tick, kind: 'off', a, b });
        else if (type === 0xb0 && a === 64) raw.push({ tick, kind: 'pedal', a: b >= 64 ? 1 : 0, b });
      }
    }
    p = end;
  }
  raw.sort((x, y) => x.tick - y.tick);
  let usPerBeat = 500000, lastTick = 0, ms = 0;
  const out: MidiEvent[] = [];
  for (const e of raw) {
    ms += ((e.tick - lastTick) * usPerBeat) / division / 1000;
    lastTick = e.tick;
    if (e.kind === 'tempo') usPerBeat = e.a;
    else out.push({ t: ms, type: e.kind, note: e.a, vel: e.b });
  }
  return out;
}

/** First tempo and time signature of a MIDI file (defaults 120 bpm, 4/4). */
export function midiFileMeta(buf: ArrayBuffer): { bpm: number; beatsPerBar: number } {
  const b = new Uint8Array(buf);
  let bpm = 120, beatsPerBar = 4, gotTempo = false, gotSig = false;
  for (let i = 0; i + 6 < b.length && !(gotTempo && gotSig); i++) {
    if (b[i] !== 0xff) continue;
    if (!gotTempo && b[i + 1] === 0x51 && b[i + 2] === 3) { bpm = 60e6 / ((b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5]); gotTempo = true; }
    if (!gotSig && b[i + 1] === 0x58 && b[i + 2] === 4) { beatsPerBar = b[i + 3] || 4; gotSig = true; }
  }
  return { bpm, beatsPerBar };
}
