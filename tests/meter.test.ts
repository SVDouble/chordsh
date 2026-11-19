import { describe, expect, it, vi, afterEach } from 'vitest';
import { barQuarters, beatQuarters, meterPosition, validateMeter } from '../src/theory/meter';
import { emptySequence, SequenceEditor, sequenceChart, sequenceFromChart, sequencePiece } from '../src/engine/sequence';
import { DEFAULT_SETTINGS, restoreSettings, settingsSchema } from '../src/config/settings';
import { midiExportInfo, writeMidi } from '../src/io/midiexport';
import { midiFileMeta, parseMidiFile } from '../src/io/midifile';
import { fromMidi, fromRecording } from '../src/library/pieces';
import { Session } from '../src/engine/session';
import type { Recording } from '../src/io/recorder';

const song = (numerator: number, denominator: number) => {
  const editor = new SequenceEditor(emptySequence('Meter test'));
  editor.update({ meter: numerator, denominator, bpm: 120 });
  return editor;
};
afterEach(() => vi.useRealTimers());

describe('arbitrary time signatures', () => {
  it.each([
    [6, 8, 0.5, 3],
    [7, 8, 0.5, 3.5],
    [5, 3, 4 / 3, 20 / 3],
    [4, 6, 2 / 3, 8 / 3],
    [13, 16, 0.25, 3.25],
    [3, 2, 2, 6],
  ])('counts %s/%s using notated beat units while retaining quarter-note positions', (n, d, unit, bar) => {
    expect(beatQuarters(d)).toBeCloseTo(unit, 10);
    expect(barQuarters(n, d)).toBeCloseTo(bar, 10);
    expect(meterPosition(bar, n, d)).toEqual({ bar: 2, beat: 1 });
    expect(meterPosition(bar + unit, n, d)).toEqual({ bar: 2, beat: 2 });
    expect(meterPosition(bar * 12, n, d)).toEqual({ bar: 13, beat: 1 });
  });

  it('validates both numbers before mutating a song or its undo history', () => {
    const editor = song(5, 3);
    const before = editor.document;
    for (const patch of [
      { meter: 0 },
      { meter: 256 },
      { meter: 2.5 },
      { denominator: 0 },
      { denominator: 257 },
      { denominator: NaN },
    ]) {
      expect(() => editor.update(patch)).toThrow();
      expect(editor.document).toEqual(before);
    }
    expect(validateMeter(255, 256)).toEqual({ numerator: 255, denominator: 256 });
  });

  it('regroups an existing song without stretching notes, and restores meter with undo', () => {
    const editor = song(4, 4);
    editor.insert([
      { symbol: 'Cmaj7', beats: 4 },
      { symbol: 'G7', beats: 2 },
    ]);
    const original = editor.document,
      notes = sequencePiece(original).notes;
    editor.update({ meter: 6, denominator: 8 });
    expect(editor.document.steps).toEqual(original.steps);
    expect(sequencePiece(editor.document).notes).toEqual(notes);
    expect(sequenceChart(editor.document).chords[1].bar).toBe(2);
    editor.undo();
    expect(editor.document).toEqual(original);
    editor.redo();
    expect(editor.document.denominator).toBe(8);
  });

  it('creates full-bar chords and pastes a chart using the chosen meter', () => {
    const editor = song(6, 8);
    editor.insert([{ symbol: 'C' }, { symbol: 'G7' }]);
    expect(editor.document.steps.map((s) => [s.start, s.beats])).toEqual([
      [0, 3],
      [3, 3],
    ]);
    expect(sequencePiece(editor.document).durationMs).toBe(3000);
    const chart = sequenceFromChart('| Dm7 G7 | Cmaj7 |', 'Paste', undefined, { numerator: 5, denominator: 3 });
    expect(chart.steps.map((s) => s.beats)).toEqual([10 / 3, 10 / 3, 20 / 3]);
    expect(sequenceChart(chart).chords.map((c) => c.bar)).toEqual([1, 1, 2]);
  });

  it('handles rational-meter boundaries without spurious overlap or duplicate key regions', () => {
    const editor = song(5, 3);
    editor.insert([{ symbol: 'C' }, { symbol: 'G7' }]);
    const boundary = 20 / 3;
    const roundedBoundary = 20 * (1 / 3);
    editor.setRegion(boundary, { tonic: 7, mode: 'major' }, 'Bridge');
    editor.setRegion(roundedBoundary, { tonic: 7, mode: 'major' }, 'Chorus');
    expect(editor.document.regions).toHaveLength(2);
    expect(() => editor.moveTo(editor.document.steps[1].id, roundedBoundary)).not.toThrow();
    expect(() => editor.place([{ symbol: 'Dm7', beats: 1 }], roundedBoundary)).not.toThrow();
    expect(editor.document.steps.map((step) => step.symbol)).toEqual(['C', 'Dm7', 'G7']);
  });

  it('migrates old songs/settings to /4 and keeps new-song and metronome denominators configurable', () => {
    const legacy = emptySequence();
    delete legacy.denominator;
    expect(new SequenceEditor(legacy).document.denominator).toBe(4);
    const restored = restoreSettings({ editor: { newMeter: 7 }, preferences: { meter: 5 } }).settings;
    expect(restored.editor.newDenominator).toBe(4);
    expect(restored.preferences.meterDenominator).toBe(4);
    const settings = settingsSchema.parse({
      editor: { newMeter: 5, newDenominator: 6 },
      preferences: { meter: 7, meterDenominator: 8 },
    });
    expect(emptySequence('Custom', 'custom', settings.editor)).toMatchObject({ meter: 5, denominator: 6 });
  });

  it('tracks metronome/file beats at the denominator’s duration and reports quarter-note BPM', () => {
    vi.useFakeTimers();
    const session = new Session();
    for (const [n, d, period] of [
      [6, 8, 250],
      [5, 3, 2000 / 3],
      [4, 6, 1000 / 3],
    ]) {
      session.setTempo(120, n, 0, d);
      session.beats.update(4000);
      expect(session.beats.period).toBeCloseTo(period, 8);
      expect(session.tempo.bpm).toBeCloseTo(120, 8);
      expect(session.tempo.denominator).toBe(d);
      expect(session.tempo.beatsPerBar).toBe(n);
    }
    session.setTempo(null);
    expect(session.tempo.denominator).toBe(4);
  });
});

describe('time-signature MIDI interchange', () => {
  it.each([
    [7, 8],
    [6, 8],
    [13, 16],
    [3, 2],
    [1, 256],
    [255, 1],
  ])('round-trips %s/%s and note timing', (n, d) => {
    const editor = song(n, d);
    editor.insert([{ symbol: 'C' }, { symbol: 'G7' }]);
    const piece = sequencePiece(editor.document),
      file = writeMidi(piece),
      meta = midiFileMeta(file.buffer);
    expect(meta).toEqual({ bpm: 120, beatsPerBar: n, denominator: d });
    expect(midiExportInfo(piece).converted).toBe(false);
    const imported = fromMidi('roundtrip', 'Roundtrip', parseMidiFile(file.buffer), meta);
    expect(imported.denominator).toBe(d);
    expect(imported.beatsPerBar).toBe(n);
    expect(imported.notes.map((note) => note[0])).toEqual(piece.notes.map((note) => note[0]));
  });

  it.each([
    [5, 3],
    [4, 6],
    [11, 7],
    [5, 6],
    [8, 12],
  ])('preserves %s/%s notation in verified metadata and exports an honest binary-meter equivalent', (n, d) => {
    const editor = song(n, d);
    editor.insert([{ symbol: 'C' }, { symbol: 'G7' }]);
    const piece = sequencePiece(editor.document),
      info = midiExportInfo(piece),
      file = writeMidi(piece);
    expect(info.converted).toBe(true);
    expect(Number.isInteger(Math.log2(info.denominator))).toBe(true);
    expect((barQuarters(n, info.denominator) * 60000) / info.bpm).toBeCloseTo(barQuarters(n, d) * 500, 8);
    expect(midiFileMeta(file.buffer)).toEqual({ bpm: 120, beatsPerBar: n, denominator: d });
    const events = parseMidiFile(file.buffer).filter((event) => event.type === 'on');
    const starts = [...new Set(events.map((event) => event.t))];
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBeCloseTo(barQuarters(n, d) * 500, 1);
  });

  it('keeps converted tempos valid at the slow and fast supported extremes', () => {
    for (const bpm of [DEFAULT_SETTINGS.editor.newTempo, 4, 1000]) {
      const editor = song(5, 3);
      editor.update({ bpm });
      editor.insert([{ symbol: 'C' }]);
      const piece = sequencePiece(editor.document),
        info = midiExportInfo(piece),
        file = writeMidi(piece);
      expect(info.tempoUs).toBeGreaterThan(0);
      expect(info.tempoUs).toBeLessThanOrEqual(0xffffff);
      expect(midiFileMeta(file.buffer).bpm).toBe(bpm);
    }
  });

  it('ignores stale original-meter metadata after the MIDI tempo is changed by another app', () => {
    const editor = song(5, 3);
    editor.insert([{ symbol: 'C' }]);
    const file = writeMidi(sequencePiece(editor.document));
    const index = file.findIndex((b, i) => b === 0xff && file[i + 1] === 0x51);
    file[index + 3] = 0x07;
    file[index + 4] = 0xa1;
    file[index + 5] = 0x20;
    expect(midiFileMeta(file.buffer)).toEqual({ bpm: 120, beatsPerBar: 5, denominator: 4 });
  });

  it('does not mistake metadata-like bytes inside another meta event for a time signature', () => {
    const file = writeMidi({ id: 'meta', title: 'Metadata', source: 'sequence', notes: [], bpm: 120, beatsPerBar: 4 });
    const opaque = [0, 0xff, 0x7f, 8, 0x7d, 0xff, 0x58, 4, 9, 3, 24, 8];
    const combined = new Uint8Array([...file.slice(0, 22), ...opaque, ...file.slice(22)]);
    const view = new DataView(combined.buffer);
    view.setUint32(18, view.getUint32(18) + opaque.length);
    expect(midiFileMeta(combined.buffer)).toEqual({ bpm: 120, beatsPerBar: 4, denominator: 4 });
  });

  it('retains recording meter metadata and gives old recordings a /4 denominator', () => {
    const rec = {
      started: '2026-11-19T12:00:00Z',
      note: '',
      settings: { bars: 'metronome', bpm: 120, meter: 6, meterDenominator: 8 },
      input: [],
      durationMs: 1000,
    } as unknown as Recording;
    expect(fromRecording('take', rec)).toMatchObject({ beatsPerBar: 6, denominator: 8, bpm: 120 });
    rec.settings.bars = 'file';
    expect(fromRecording('song-clock', rec)).toMatchObject({ bpm: 120, beatsPerBar: 6, denominator: 8 });
    rec.settings.bars = 'auto';
    expect(fromRecording('free', rec).bpm).toBeUndefined();
    delete rec.settings.meterDenominator;
    expect(fromRecording('old', rec).denominator).toBe(4);
  });
});
