import { describe, expect, it } from 'vitest';
import { BUILT_IN, fromMidi, fromRecording } from '../src/library/pieces';
import type { Recording } from '../src/io/recorder';

describe('library pieces', () => {
  it('retains sustain and notes still held when a recording was saved', () => {
    const rec: Recording = {
      version: 1,
      started: '2026-11-19T10:00:00Z',
      durationMs: 1000,
      note: 'Held',
      settings: {},
      input: [
        { t: 0, kind: 'on', note: 60, vel: 80 },
        { t: 50, kind: 'pedal', note: 0, vel: 127 },
      ],
      midi: [],
      engine: [],
    };
    const p = fromRecording('held', rec);
    expect(p.notes).toEqual([[0, 1000, 60, 80]]);
    expect(p.pedal).toEqual([[50, true]]);
    expect(p.durationMs).toBe(1000);
  });

  it('the demo is a piece with its own tempo', () => {
    const demo = BUILT_IN.find((p) => p.id === 'demo')!;
    expect(demo.bpm).toBe(96);
    expect(demo.notes.length).toBeGreaterThan(60);
    expect(demo.notes.every(([t, d]) => t >= 0 && d > 0)).toBe(true);
  });
  it('pairs note-on/off from MIDI events and recordings', () => {
    const p = fromMidi(
      'x',
      'x',
      [
        { t: 0, type: 'on', note: 60, vel: 90 },
        { t: 100, type: 'on', note: 64, vel: 80 },
        { t: 500, type: 'off', note: 60, vel: 0 },
        { t: 600, type: 'off', note: 64, vel: 0 },
      ],
      { bpm: 120, beatsPerBar: 3 },
    );
    expect(p.notes).toEqual([
      [0, 500, 60, 90],
      [100, 500, 64, 80],
    ]);
    expect(p.beatsPerBar).toBe(3);
    const rec: Recording = {
      version: 1,
      started: '2026-11-19T10:00:00.000Z',
      durationMs: 1000,
      note: 'held C',
      settings: { bars: 'metronome', bpm: 90, meter: 4 },
      input: [
        { t: 10, kind: 'on', note: 48, vel: 70 },
        { t: 900, kind: 'off', note: 48, vel: 0 },
      ],
      midi: [],
      engine: [],
    };
    const r = fromRecording('r', rec);
    expect(r).toMatchObject({ title: 'held C', bpm: 90, notes: [[10, 890, 48, 70]] });
  });
});
