import { describe, expect, it } from 'vitest';
import { chordOf, type KindName } from '../src/theory/chords';
import { parseChordSymbol } from '../src/theory/symbols';
import { mod12 } from '../src/theory/pitch';
import { voiceChord } from '../src/theory/voicing';
import { voicingChoices } from '../src/theory/voicingPresets';
import { emptySequence, SequenceEditor, sequencePiece } from '../src/engine/sequence';
import { writeMidi } from '../src/io/midiexport';
import { midiFileMeta, parseMidiFile } from '../src/io/midifile';

const choose = (symbol: string, id: string) =>
  voicingChoices(parseChordSymbol(symbol)!).find((choice) => choice.id === id)!.notes;
const pcs = (notes: number[]) => [...new Set(notes.map(mod12))].sort((a, b) => a - b);

describe('voicing coach', () => {
  it('keeps the existing full voicing and offers shell roots, thirds and sevenths without a fifth', () => {
    const chord = parseChordSymbol('Cmaj7')!;
    expect(choose('Cmaj7', 'full')).toEqual(voiceChord(chord, null));
    expect(pcs(choose('Cmaj7', 'shell')!)).toEqual([0, 4, 11]);
    expect(pcs(choose('Dm7', 'shell')!)).toEqual([0, 2, 5]);
    expect(pcs(choose('C', 'shell')!)).toEqual([0, 4]);
    expect(mod12(choose('Cmaj7/E', 'shell')![0])).toBe(4);
  });

  it('omits the root without inventing extensions or changing the chord', () => {
    expect(pcs(choose('Cmaj7', 'rootless')!)).toEqual([4, 7, 11]);
    expect(pcs(choose('C', 'rootless')!)).toEqual([4, 7]);
    expect(choose('Cmaj7', 'rootless')!.every((note) => mod12(note) !== 0)).toBe(true);
  });

  it('lowers only the second-highest upper note by an octave, retaining all four pitch classes', () => {
    const upper = choose('Cmaj7', 'full')!.slice(1);
    const open = choose('Cmaj7', 'drop2')!;
    expect(open).toHaveLength(4);
    expect(open).toContain(upper[2] - 12);
    expect(open).not.toContain(upper[2]);
    expect(open.filter((note) => upper.includes(note))).toHaveLength(3);
    expect(pcs(open)).toEqual(pcs(upper));
    for (const [bass, pc] of [
      ['E', 4],
      ['G', 7],
      ['B', 11],
    ] as const) {
      const inversion = choose(`Cmaj7/${bass}`, 'drop2')!;
      expect(mod12(inversion[0])).toBe(pc);
      expect(pcs(inversion)).toEqual([0, 4, 7, 11]);
    }
    expect(choose('C', 'drop2')).toBeNull();
    expect(choose('Csus4', 'drop2')).toBeNull();
  });

  it('offers sorted, distinct MIDI notes from the harmony in every transposition', () => {
    for (let root = 0; root < 12; root++)
      for (const kind of ['maj', 'min', '7', 'maj7', 'm7', 'dim7', 'm7b5', 'aug', 'sus4', '9'] as KindName[]) {
        const chord = chordOf(root, kind);
        const allowed = new Set(chord.tones.map((t) => mod12(chord.root + t.interval)));
        for (const choice of voicingChoices(chord, [43, 53, 59, 62])) {
          if (!choice.notes) continue;
          expect(choice.notes).toEqual([...choice.notes].sort((a, b) => a - b));
          expect(new Set(choice.notes).size).toBe(choice.notes.length);
          expect(
            choice.notes.every(
              (note) => Number.isInteger(note) && note >= 0 && note <= 127 && allowed.has(mod12(note)),
            ),
          ).toBe(true);
        }
      }
  });

  it('applies as one undoable edit and preserves the chosen notes/velocity in exported MIDI', () => {
    const editor = new SequenceEditor(emptySequence());
    const id = editor.place([{ symbol: 'Cmaj7', beats: 4, velocity: 93 }], 0);
    const before = editor.document;
    const notes = choose('Cmaj7', 'drop2')!;
    editor.replace(id!, { symbol: 'Cmaj7', notes, beats: 4, velocity: 93 });
    const after = editor.document;
    expect(after.steps[0].symbol).toBe('Cmaj7');
    const data = writeMidi(sequencePiece(after));
    const midi = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const events = parseMidiFile(midi).filter((event) => event.type === 'on');
    expect(events.map((event) => event.note).sort((a, b) => a - b)).toEqual(notes);
    expect(events.every((event) => event.vel === 93)).toBe(true);
    expect(midiFileMeta(midi).bpm).toBe(after.bpm);
    editor.undo();
    expect(editor.document).toEqual(before);
    editor.redo();
    expect(editor.document).toEqual(after);
  });
});
