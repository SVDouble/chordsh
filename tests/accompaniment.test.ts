import { describe, expect, it } from 'vitest';
import { PLAYBACK_STYLES, barPlaybackStyle, marksFromBarStyles } from '../src/engine/accompaniment';
import { DEFAULT_SETTINGS, settingsSchema } from '../src/config/settings';
import { emptySequence, SequenceEditor, sequencePiece } from '../src/engine/sequence';
import { fromMidi } from '../src/library/pieces';
import { writeMidi } from '../src/io/midiexport';
import { midiFileMeta, parseMidiFile } from '../src/io/midifile';

function song(style = 'once', meter = 4, denominator = 4) {
  const editor = new SequenceEditor(emptySequence());
  editor.update({ bpm: 120, meter, denominator });
  editor.setStyle(style);
  return editor;
}

describe('bar accompaniment model', () => {
  it('keeps existing held voicings and velocities unchanged, including legacy songs and long chords', () => {
    const editor = song();
    editor.insert([{ symbol: 'Cmaj7', notes: [60, 64, 67, 71], beats: 12, velocity: 92 }]);
    const legacy = editor.document;
    delete legacy.style;
    expect(sequencePiece(legacy).notes).toEqual([60, 64, 67, 71].map((n) => [0, 5700, n, 92]));
    expect(sequencePiece(legacy).durationMs).toBe(6000);
  });

  it('keeps song defaults and independent bar overrides undoable without altering chords or keys', () => {
    const editor = song();
    editor.insert([{ symbol: 'C' }, { symbol: 'G7' }]);
    editor.setRegion(4, { tonic: 7, mode: 'major' });
    const before = editor.document;
    editor.setStyle('pop-1');
    editor.setBarStyle(1, 'bossa-nova-1');
    expect(barPlaybackStyle(editor.document, 0).id).toBe('pop-1');
    expect(barPlaybackStyle(editor.document, 1).id).toBe('bossa-nova-1');
    expect(barPlaybackStyle(editor.document, 2).id).toBe('pop-1');
    expect(editor.document.steps).toEqual(before.steps);
    expect(editor.document.regions).toEqual(before.regions);
    const saved = editor.document;
    editor.setStyle('rock-1');
    expect(barPlaybackStyle(editor.document, 1).id).toBe('bossa-nova-1');
    editor.undo();
    expect(editor.document).toEqual(saved);
    editor.setBarStyle(1, null);
    expect(barPlaybackStyle(editor.document, 1).id).toBe('pop-1');
    editor.undo();
    expect(editor.document).toEqual(saved);
    editor.redo();
    expect(editor.document.barStyles).toEqual([]);
    expect(new SequenceEditor(saved).document).toEqual(saved);
  });

  it('validates styles atomically and resets bar overrides with an undoable reset', () => {
    const editor = song('swing-1');
    editor.insert([{ symbol: 'Dm7' }]);
    editor.setBarStyle(2, 'funk-2');
    const before = editor.document;
    expect(() => editor.setStyle('made-up')).toThrow();
    expect(() => editor.setBarStyle(-1, 'once')).toThrow();
    expect(() => editor.setBarStyle(0.5, 'once')).toThrow();
    expect(() => editor.setBarStyle(0, 'made-up')).toThrow();
    expect(editor.document).toEqual(before);
    editor.clear();
    expect(editor.document.barStyles).toEqual([]);
    expect(editor.document.style).toBe('swing-1');
    editor.undo();
    expect(editor.document).toEqual(before);
  });

  it('uses saved new-song defaults while old songs still default to held chords', () => {
    const settings = settingsSchema.parse({ editor: { newPlaybackStyle: 'salsa-1' } });
    expect(emptySequence('New', 'new', settings.editor).style).toBe('salsa-1');
    const legacy = emptySequence();
    delete legacy.style;
    expect(barPlaybackStyle(legacy, 0).id).toBe('once');
    expect(settingsSchema.safeParse({ editor: { newPlaybackStyle: 'nope' } }).success).toBe(false);
  });
});

describe('musical arrangement rendering', () => {
  it('provides 57 distinct, deterministic arrangements with valid notes in standard and irregular meters', () => {
    expect(PLAYBACK_STYLES).toHaveLength(57);
    expect(new Set(PLAYBACK_STYLES.map((s) => s.id)).size).toBe(57);
    const variants = new Set<string>();
    for (const style of PLAYBACK_STYLES) {
      for (const [meter, denominator] of [
        [4, 4],
        [3, 4],
        [6, 8],
        [7, 8],
        [13, 16],
      ]) {
        const editor = song(style.id, meter, denominator);
        editor.insert([{ symbol: 'Cmaj7', notes: [60, 64, 67, 71] }]);
        const piece = sequencePiece(editor.document);
        expect(piece.notes.length, style.id).toBeGreaterThan(0);
        for (const [at, duration, note, velocity] of piece.notes) {
          expect(at, style.id).toBeGreaterThanOrEqual(0);
          expect(duration, style.id).toBeGreaterThan(0);
          expect(at + duration, style.id).toBeLessThanOrEqual(piece.durationMs! + 1e-7);
          expect(Number.isInteger(note) && note >= 0 && note <= 127, style.id).toBe(true);
          expect(Number.isInteger(velocity) && velocity >= 1 && velocity <= 127, style.id).toBe(true);
        }
        expect(sequencePiece(editor.document).notes).toEqual(piece.notes);
        if (meter === 4 && denominator === 4) variants.add(JSON.stringify(piece.notes));
      }
    }
    expect(variants.size).toBe(57);
  });

  it('applies a bar override inside a long chord and clips tails at each style boundary', () => {
    const editor = song();
    editor.insert([{ symbol: 'C', notes: [60, 64, 67], beats: 12 }]);
    editor.setBarStyle(1, 'dance-1');
    const notes = sequencePiece(editor.document).notes;
    expect(notes.filter((n) => n[0] === 0)).toEqual([60, 64, 67].map((n) => [0, 1900, n, 80]));
    expect(notes.some((n) => n[0] > 2000 && n[0] < 4000)).toBe(true);
    expect(notes.filter((n) => n[0] === 4000)).toEqual([60, 64, 67].map((n) => [4000, 1900, n, 80]));
    expect(notes.filter((n) => n[0] < 4000).every((n) => n[0] + n[1] <= 4000)).toBe(true);
  });

  it('follows mid-bar chords and slash basses, leaves gaps silent, and sounds very short off-grid chords', () => {
    const editor = song('basic-2');
    editor.place([{ symbol: 'C/E', notes: [60, 64, 67], beats: 1.5 }], 0);
    editor.place([{ symbol: 'Fm', notes: [65, 68, 72], beats: 1 }], 2.1);
    editor.place([{ symbol: 'G', notes: [67, 71, 74], beats: 0.1 }], 3.1);
    const notes = sequencePiece(editor.document).notes;
    expect(notes.some((n) => n[2] === 40 && n[0] === 0)).toBe(true);
    expect(notes.filter((n) => n[0] < 750).every((n) => n[0] + n[1] <= 750)).toBe(true);
    expect(notes.some((n) => n[0] >= 750 && n[0] < 1050)).toBe(false);
    expect(notes.filter((n) => n[0] >= 1050 && n[0] < 1550).every((n) => [65, 68, 72, 77].includes(n[2]))).toBe(true);
    expect(notes.some((n) => Math.abs(n[0] - 1550) < 1e-6 && n[2] === 67)).toBe(true);
  });

  it('respects bass balance, strum spacing, swing and written velocity without changing the voicing', () => {
    const editor = song('strumming-1');
    editor.insert([{ symbol: 'C', notes: [60, 64, 67], velocity: 100 }]);
    const before = editor.document;
    const noBass = { ...DEFAULT_SETTINGS.editor, accompanimentBassLevel: 0, accompanimentStrumMs: 20 };
    const strum = sequencePiece(before, noBass).notes;
    expect(strum.filter((n) => n[0] < 100).map((n) => [n[0], n[2]])).toEqual([
      [0, 60],
      [20, 64],
      [40, 67],
    ]);
    expect(strum.every((n) => n[2] >= 60)).toBe(true);
    expect(editor.document).toEqual(before);
    editor.setStyle('pop-1');
    const shuffled = sequencePiece(editor.document).notes;
    const straight = sequencePiece(editor.document, { ...DEFAULT_SETTINGS.editor, accompanimentSwing: '0.5' }).notes;
    expect(shuffled.some((n) => n[2] === 36 && Math.abs(n[0] - 1000 / 3) < 1e-7)).toBe(true);
    expect(straight.some((n) => n[2] === 36 && n[0] === 250)).toBe(true);
  });

  it('never overlaps or duplicates simultaneous attacks of the same pitch', () => {
    for (const style of PLAYBACK_STYLES) {
      const editor = song(style.id);
      editor.insert([{ symbol: 'C', notes: [36, 48, 60, 64, 67], beats: 8 }]);
      const last = new Map<number, number>();
      for (const [at, duration, note] of sequencePiece(editor.document).notes) {
        expect(at + 1e-7, style.id).toBeGreaterThanOrEqual(last.get(note) ?? 0);
        last.set(note, at + duration);
      }
    }
  });

  it('exports the rendered groove, pitches and velocities with the same elapsed timing', () => {
    const editor = song('pop-2', 6, 8);
    editor.insert([{ symbol: 'Dm7' }, { symbol: 'G7' }]);
    editor.setBarStyle(1, 'bossa-nova-1');
    const piece = sequencePiece(editor.document);
    const file = writeMidi(piece);
    const meta = midiFileMeta(file.buffer);
    expect(meta).toEqual({ bpm: 120, beatsPerBar: 6, denominator: 8 });
    const imported = fromMidi('rendered', 'Rendered', parseMidiFile(file.buffer), meta);
    const sort = (notes: typeof piece.notes) => [...notes].sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    const expected = sort(piece.notes),
      actual = sort(imported.notes);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((note, i) => {
      expect(note[2]).toBe(expected[i][2]);
      expect(note[3]).toBe(expected[i][3]);
      expect(Math.abs(note[0] - expected[i][0])).toBeLessThan(0.6);
      expect(Math.abs(note[1] - expected[i][1])).toBeLessThan(0.6);
    });
  });
});

describe('style markers: from this bar onward', () => {
  it('a marker holds until the next one; removing it lets the earlier style continue', () => {
    const editor = song('pop-1');
    editor.setStyleMark(2, 'bossa-nova-1');
    editor.setStyleMark(5, 'rock-1');
    const at = (bar: number) => barPlaybackStyle(editor.document, bar).id;
    expect([0, 1, 2, 3, 4, 5, 9].map(at)).toEqual([
      'pop-1',
      'pop-1',
      'bossa-nova-1',
      'bossa-nova-1',
      'bossa-nova-1',
      'rock-1',
      'rock-1',
    ]);
    editor.setStyleMark(2, null);
    expect([1, 2, 5].map(at)).toEqual(['pop-1', 'pop-1', 'rock-1']);
    editor.undo();
    expect(at(3)).toBe('bossa-nova-1');
    editor.setStyleMark(0, 'funk-2'); // bar 0 is the song style
    expect(editor.document.style).toBe('funk-2');
    expect(() => editor.setStyleMark(1, 'made-up')).toThrow();
  });
  it('converts one-bar overrides to markers without changing what plays', () => {
    const editor = song('pop-1');
    editor.setStyleMark(6, 'rock-1');
    editor.setBarStyle(2, 'bossa-nova-1');
    editor.setBarStyle(3, 'bossa-nova-1');
    editor.setBarStyle(6, 'funk-2');
    const before = Array.from({ length: 10 }, (_, b) => barPlaybackStyle(editor.document, b).id);
    expect(marksFromBarStyles(editor.document)).toEqual([
      { bar: 2, style: 'bossa-nova-1' },
      { bar: 4, style: 'pop-1' },
      { bar: 6, style: 'funk-2' },
      { bar: 7, style: 'rock-1' },
    ]);
    editor.convertBarStyles();
    expect(editor.document.barStyles).toEqual([]);
    expect(Array.from({ length: 10 }, (_, b) => barPlaybackStyle(editor.document, b).id)).toEqual(before);
  });
});
