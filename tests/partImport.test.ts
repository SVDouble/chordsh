import { describe, expect, it } from 'vitest';
import { chordsFromNotes, melodyFromPart } from '../src/engine/partImport';
import { melodyPart, midiParts } from '../src/io/midifile';

/** A format-1 MIDI file, 480 ticks per quarter: one track per [name, channel, notes as [beat, beats, pitch]]. */
function smf(tracks: [string, number, [number, number, number][]][]): ArrayBuffer {
  const vlq = (n: number) => {
    const out = [n & 0x7f];
    for (let v = n >> 7; v; v >>= 7) out.unshift((v & 0x7f) | 0x80);
    return out;
  };
  const u32 = (n: number) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const bytes = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 1, 0, tracks.length, 0x01, 0xe0];
  for (const [name, ch, notes] of tracks) {
    const events: [number, number[]][] = [];
    for (const [b, d, p] of notes) {
      events.push([Math.round(b * 480), [0x90 | ch, p, 90]]);
      events.push([Math.round((b + d) * 480), [0x80 | ch, p, 0]]);
    }
    events.sort((a, b) => a[0] - b[0] || a[1][0] - b[1][0]);
    const body = [0, 0xff, 0x03, ...vlq(name.length), ...[...name].map((c) => c.charCodeAt(0))];
    let t = 0;
    for (const [tick, ev] of events) {
      body.push(...vlq(tick - t), ...ev);
      t = tick;
    }
    body.push(0, 0xff, 0x2f, 0);
    bytes.push(0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body);
  }
  return new Uint8Array(bytes).buffer;
}

// melody C D E F | G (2 beats) …; accompaniment arpeggiates C–E–G for bar 1 and F–A–C for bar 2
const file = smf([
  [
    'Piano LH',
    1,
    [
      [0, 1, 48],
      [1, 1, 52],
      [2, 1, 55],
      [3, 1, 52],
      [4, 1, 53],
      [5, 1, 57],
      [6, 1, 60],
      [7, 1, 57],
    ],
  ],
  [
    'Melody',
    0,
    [
      [0, 1, 72],
      [1, 1, 74],
      [2, 1, 76],
      [3, 1, 77],
      [4, 2, 79],
      [6, 2, 77],
    ],
  ],
]);

describe('loading a melody and chords separately', () => {
  it('splits a MIDI file into parts and finds the melody', () => {
    const parts = midiParts(file);
    expect(parts.map((p) => p.name).sort()).toEqual(['Melody', 'Piano LH']);
    expect(melodyPart(parts)?.name).toBe('Melody');
    const melody = melodyFromPart(melodyPart(parts)!.notes);
    expect(melody.map((n) => n.pitch)).toEqual([72, 74, 76, 77, 79, 77]);
    expect(melody[4]).toMatchObject({ start: 4, beats: 2 });
  });
  it('reads arpeggiated accompaniment as chords, one per bar here', () => {
    const lh = midiParts(file).find((p) => p.name === 'Piano LH')!;
    expect(chordsFromNotes(lh.notes)).toEqual([
      { start: 0, beats: 4, symbol: 'C' },
      { start: 4, beats: 4, symbol: 'F' },
    ]);
  });
  it('guesses the melody by register and single-line texture when no part is named', () => {
    const parts = midiParts(file).map((p) => ({ ...p, name: 'Track' }));
    expect(melodyPart(parts)?.meanPitch).toBeGreaterThan(70);
  });
  it('keeps the top note where a melody part has chords', () => {
    const line = melodyFromPart([
      { start: 0, beats: 1, pitch: 64, velocity: 90 },
      { start: 0, beats: 1, pitch: 72, velocity: 90 },
      { start: 1, beats: 1, pitch: 74, velocity: 90 },
    ]);
    expect(line.map((n) => n.pitch)).toEqual([72, 74]);
  });
  it('splits a bar where block chords change on the half bar', () => {
    const block = (start: number, pitches: number[]) =>
      pitches.map((pitch) => ({ start, beats: 2, pitch, velocity: 80 }));
    const notes = [...block(0, [48, 52, 55]), ...block(2, [43, 47, 50]), ...block(4, [48, 52, 55])];
    expect(chordsFromNotes(notes).map((c) => `${c.symbol}@${c.start}+${c.beats}`)).toEqual(['C@0+2', 'G@2+2', 'C@4+2']);
  });
});
