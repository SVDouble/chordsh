import { describe, expect, it } from 'vitest';
import {
  emptySequence,
  SequenceEditor,
  sequenceFromChart,
  sequencePiece,
  sequenceKeyAt,
  sequenceChart,
} from '../src/engine/sequence';
import { writeMidi } from '../src/io/midiexport';
import { midiFileMeta, parseMidiFile } from '../src/io/midifile';

describe('composition editing', () => {
  it('keeps explicit key regions and analyses subsequent chords in the local key', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C | D7 | G |', 'Modulation'));
    editor.update({ key: { tonic: 0, mode: 'major' } });
    editor.setRegion(4, { tonic: 7, mode: 'major' }, 'Bridge');
    expect(sequenceKeyAt(editor.document, 3)).toEqual({ tonic: 0, mode: 'major' });
    expect(sequenceKeyAt(editor.document, 8)).toEqual({ tonic: 7, mode: 'major' });
    expect(sequenceChart(editor.document).chords[1].roman?.numeral).toBe('V7');
    const before = editor.document;
    editor.removeRegion(before.regions![1].id);
    expect(sequenceKeyAt(editor.document, 8)).toEqual({ tonic: 0, mode: 'major' });
    editor.undo();
    expect(editor.document).toEqual(before);
    editor.transpose(2);
    expect(sequenceKeyAt(editor.document, 8)).toEqual({ tonic: 9, mode: 'major' });
    expect(editor.document.regions![1].label).toBe('Bridge');
  });

  it('moves later key boundaries with inserted or resized chords while keeping the opening region at zero', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C | D7 | G |', 'Ripple'));
    editor.setRegion(4, { tonic: 7, mode: 'major' });
    editor.place([{ symbol: 'Am', beats: 2 }], 0);
    expect(editor.document.regions!.map((r) => r.start)).toEqual([0, 6]);
    editor.replace(editor.document.steps[0].id, { symbol: 'Am', beats: 4 });
    expect(editor.document.regions!.map((r) => r.start)).toEqual([0, 8]);
  });

  it('retains a key change included with an inserted suggestion as part of the same undo action', () => {
    const editor = new SequenceEditor(emptySequence());
    editor.insert([{ symbol: 'C' }]);
    const before = editor.document;
    editor.insert([{ symbol: 'D7' }, { symbol: 'G', key: { tonic: 7, mode: 'major' } }]);
    expect(sequenceKeyAt(editor.document, 8)).toEqual({ tonic: 7, mode: 'major' });
    editor.undo();
    expect(editor.document).toEqual(before);
    expect(() => editor.setRegion(-1, null)).toThrow();
    expect(editor.document).toEqual(before);
  });

  it('clears a song in one undoable edit while preserving its tempo, meter and key', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C | Dm7 G7 |', 'Reset'));
    editor.update({ bpm: 132, meter: 3 });
    const before = editor.document;
    editor.clear();
    expect(editor.document).toEqual({ ...before, steps: [] });
    editor.undo();
    expect(editor.document).toEqual(before);
    editor.redo();
    expect(editor.document.steps).toEqual([]);
  });

  it('places chords in empty timeline spots and preserves gaps in playback', () => {
    const editor = new SequenceEditor(emptySequence());
    editor.place([{ symbol: 'C', beats: 2 }], 0);
    editor.place([{ symbol: 'G7', beats: 2 }], 6);
    expect(editor.document.steps.map((s) => s.start)).toEqual([0, 6]);
    const piece = sequencePiece(editor.document);
    expect(piece.notes.filter((n) => n[0] > 0).every((n) => n[0] === 3600)).toBe(true);
    expect(piece.durationMs).toBe(4800);
  });

  it('ripples overlapping chords while keeping untouched empty space', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C | G7 |', 'Timeline'));
    editor.place([{ symbol: 'Dm7', beats: 2 }], 4);
    expect(editor.document.steps.map((s) => [s.symbol, s.start])).toEqual([
      ['C', 0],
      ['Dm7', 4],
      ['G7', 6],
    ]);
    editor.replace(editor.document.steps[0].id, { symbol: 'C', beats: 2 });
    expect(editor.document.steps.map((s) => s.start)).toEqual([0, 4, 6]);
    editor.undo();
    expect(editor.document.steps[0].beats).toBe(4);
  });

  it('moves a timeline block without losing its identity or voicing', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C | G7 |', 'Move'));
    const step = editor.document.steps[0];
    editor.moveTo(step.id, 12);
    expect(editor.document.steps[1]).toEqual({ ...step, start: 12 });
    editor.undo();
    expect(editor.document.steps[0]).toEqual(step);
  });

  it('accepts a transition as one undoable edit and preserves its order', () => {
    const editor = new SequenceEditor(emptySequence());
    const first = editor.insert([{ symbol: 'Cmaj7' }])!;
    editor.insert([{ symbol: 'Am7' }, { symbol: 'D7' }, { symbol: 'Gmaj7' }], first);
    expect(editor.document.steps.map((s) => s.symbol)).toEqual(['Cmaj7', 'Am7', 'D7', 'Gmaj7']);
    editor.undo();
    expect(editor.document.steps.map((s) => s.symbol)).toEqual(['Cmaj7']);
    editor.redo();
    expect(editor.document.steps).toHaveLength(4);
  });

  it('rejects invalid multi-chord input atomically', () => {
    const editor = new SequenceEditor(emptySequence());
    expect(() => editor.insert([{ symbol: 'Dm7' }, { symbol: 'nonsense' }])).toThrow();
    expect(editor.document.steps).toEqual([]);
    expect(editor.canUndo).toBe(false);
  });

  it('edits durations and voicings, reorders and duplicates, without changing past snapshots', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C | Dm | G7 |', 'Song'));
    const original = editor.document;
    const id = original.steps[1].id;
    editor.replace(id, { symbol: 'Dm9', beats: 2, notes: [50, 53, 57, 60, 64] });
    editor.move(id, -1);
    const duplicate = editor.duplicate(id)!;
    expect(editor.document.steps.map((s) => s.symbol)).toEqual(['Dm9', 'Dm9', 'C', 'G7']);
    editor.remove(duplicate);
    expect(editor.document.steps[0].beats).toBe(2);
    expect(original.steps[1].symbol).toBe('Dm');
    editor.undo();
    editor.undo();
    editor.undo();
    editor.undo();
    expect(editor.document).toEqual(original);
  });

  it('discards redo after a new edit and isolates returned snapshots', () => {
    const editor = new SequenceEditor(emptySequence());
    editor.insert([{ symbol: 'C' }]);
    editor.undo();
    editor.insert([{ symbol: 'F' }]);
    expect(editor.canRedo).toBe(false);
    const snapshot = editor.document;
    snapshot.steps[0].notes[0] = 1;
    expect(editor.document.steps[0].notes[0]).not.toBe(1);
  });

  it('preserves the bar duration when replacing a chord with a reharmonisation', () => {
    const editor = new SequenceEditor(sequenceFromChart('| G7 |', 'Cadence'));
    editor.replaceWith(editor.document.steps[0].id, [
      { symbol: 'Dm7', beats: 2 },
      { symbol: 'G7', beats: 2 },
    ]);
    expect(editor.document.steps.reduce((n, s) => n + s.beats, 0)).toBe(4);
  });

  it('transposes slash chords and voicings together, and rejects out-of-range transposition', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C/E |', 'Slash'));
    const notes = editor.document.steps[0].notes;
    editor.transpose(2);
    expect(editor.document.steps[0].symbol).toBe('D/F♯');
    expect(editor.document.steps[0].notes).toEqual(notes.map((n) => n + 2));
    const before = editor.document;
    expect(() => editor.transpose(120)).toThrow();
    expect(editor.document).toEqual(before);
  });
});

describe('Standard MIDI export', () => {
  it('retains sustain and releases an unfinished pedal at the clip end', () => {
    const data = writeMidi({
      id: 'pedal',
      title: 'Sustain',
      source: 'recording',
      bpm: 120,
      notes: [[0, 500, 60, 80]],
      pedal: [[0, true]],
      durationMs: 1000,
    });
    expect(parseMidiFile(data.buffer).filter((e) => e.type === 'pedal')).toEqual([
      { t: 0, type: 'pedal', note: 1, vel: 127 },
      { t: 1000, type: 'pedal', note: 0, vel: 0 },
    ]);
  });

  it('round-trips chord notes, durations, tempo and meter through the existing MIDI reader', () => {
    const editor = new SequenceEditor(emptySequence('MIDI test'));
    editor.update({ bpm: 90, meter: 3 });
    editor.insert([
      { symbol: 'Dm7', beats: 2, notes: [50, 53, 57, 60] },
      { symbol: 'G7', beats: 1, notes: [43, 53, 59, 62] },
    ]);
    const piece = sequencePiece(editor.document);
    const data = writeMidi(piece);
    expect(midiFileMeta(data.buffer)).toEqual({ bpm: expect.closeTo(90, 3), beatsPerBar: 3, denominator: 4 });
    const events = parseMidiFile(data.buffer);
    expect(
      events
        .filter((e) => e.type === 'on')
        .map((e) => e.note)
        .sort((a, b) => a - b),
    ).toEqual(piece.notes.map((n) => n[2]).sort((a, b) => a - b));
    expect(events.filter((e) => e.type === 'on' && e.t > 0)[0].t).toBeCloseTo(4000 / 3, 2);
    expect(events.filter((e) => e.type === 'off')).toHaveLength(8);
    expect(piece.durationMs).toBe(2000);
  });

  it('orders note-off before a same-pitch retrigger and supports long delta times', () => {
    const data = writeMidi({
      id: 'long',
      title: 'Long',
      source: 'sequence',
      bpm: 120,
      notes: [
        [0, 500, 60, 80],
        [500, 1000, 60, 90],
        [120000, 500, 127, 127],
      ],
    });
    const events = parseMidiFile(data.buffer);
    expect(events.filter((e) => e.t === 500).map((e) => e.type)).toEqual(['off', 'on']);
    expect(events[events.length - 1].t).toBe(120500);
  });

  it('rejects invalid notes instead of silently corrupting a file', () => {
    expect(() => writeMidi({ id: 'bad', title: 'Bad', source: 'sequence', notes: [[0, 500, 128, 80]] })).toThrow();
  });
});

describe('melody lane', () => {
  it('records, replaces a range, transposes, undoes and plays the melody', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C | G |', 'Tune'));
    editor.recordMelody([
      { start: 0, beats: 1, pitch: 64, velocity: 90 },
      { start: 4, beats: 2, pitch: 62, velocity: 90 },
    ]);
    expect(editor.document.melody).toHaveLength(2);
    editor.recordMelody([{ start: 4, beats: 1, pitch: 67, velocity: 80 }], 4, 8);
    expect(editor.document.melody?.map((n) => n.pitch)).toEqual([64, 67]);
    editor.transpose(2);
    expect(editor.document.melody?.map((n) => n.pitch)).toEqual([66, 69]);
    editor.undo();
    expect(editor.document.melody?.map((n) => n.pitch)).toEqual([64, 67]);
    const piece = sequencePiece(editor.document);
    expect(piece.notes.some(([, , pitch, vel]) => pitch === 67 && vel === 80)).toBe(true);
  });
  it('rejects notes that cannot be played', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C |', 'Bad'));
    expect(() => editor.recordMelody([{ start: 0, beats: 0, pitch: 60, velocity: 90 }])).toThrow();
  });
  it('batches several edits into one undo step, and applies none when one fails', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C | F | G | C |', 'Batch'));
    const [a, b] = editor.document.steps;
    editor.batch((e) => {
      e.replaceWith(a.id, [{ symbol: 'Cmaj7', beats: 4 }]);
      e.replaceWith(b.id, [
        { symbol: 'Dm7', beats: 2 },
        { symbol: 'G7', beats: 2 },
      ]);
    });
    expect(editor.document.steps.map((s) => s.symbol).join(' ')).toBe('Cmaj7 Dm7 G7 G C');
    editor.undo();
    expect(editor.document.steps.map((s) => s.symbol).join(' ')).toBe('C F G C');
    expect(editor.canUndo).toBe(false);
    expect(() =>
      editor.batch((e) => {
        e.replaceWith(a.id, [{ symbol: 'Am', beats: 4 }]);
        e.replaceWith('missing', [{ symbol: 'Dm', beats: 4 }]);
      }),
    ).toThrow();
    expect(editor.document.steps.map((s) => s.symbol).join(' ')).toBe('C F G C');
  });
});
