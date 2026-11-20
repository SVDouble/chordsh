import { describe, expect, it } from 'vitest';
import { advise, estimateKey, fillGaps, templates } from '../src/engine/advisor';
import { type MelodyNote, sequenceFromChart, SequenceEditor } from '../src/engine/sequence';
import { chordOf } from '../src/theory/chords';
import type { Key } from '../src/theory/scales';

const C: Key = { tonic: 0, mode: 'major' };
/** Twinkle Twinkle, first 4 bars: C C G G | A A G- | F F E E | D D C- */
const twinkle: MelodyNote[] = [60, 60, 67, 67, 69, 69, 67, 0, 65, 65, 64, 64, 62, 62, 60, 0]
  .map((pitch, i) => ({ start: i, beats: 1, pitch, velocity: 90 }))
  .filter((n) => n.pitch > 0)
  .map((n) => ((n.pitch === 67 && n.start === 6) || (n.pitch === 60 && n.start === 14) ? { ...n, beats: 2 } : n));

describe('advisor', () => {
  it('spells the loop schemas in a key', () => {
    const axis = templates(C).find((t) => t.name.startsWith('axis /'));
    expect(axis?.symbols).toEqual(['C', 'G', 'Am', 'F']);
    expect(templates({ tonic: 9, mode: 'minor' }).find((t) => t.name.startsWith('Andalusian'))?.symbols).toEqual([
      'Am',
      'G',
      'F',
      'E',
    ]);
  });
  it('finds the key of a tune from its melody', () => {
    expect(estimateKey(twinkle)).toEqual(C);
  });
  it('ranks F for “F F E E” between C chords, with reasons from the style', () => {
    const melody = twinkle.map(({ start, beats, pitch }) => ({ start, beats, pitch }));
    const top = advise({
      key: C,
      prev: chordOf(0, 'maj'),
      next: chordOf(7, 'maj'),
      melody,
      span: { start: 8, end: 12 },
      meter: 4,
      style: 'functional',
    });
    expect(top.slice(0, 3).map((a) => a.name)).toContain('F');
    expect(top[0].style).not.toBeNull();
  });
  it('fills one chord per bar under a melody, keeping existing chords', () => {
    const song = new SequenceEditor(sequenceFromChart('| C |', 'Twinkle'));
    song.recordMelody(twinkle);
    const filled = fillGaps(song.document, 'functional', 4);
    expect(filled.map((f) => f.start)).toEqual([4, 8, 12]);
    expect(filled.at(-1)?.symbol).toBe('C');
    expect(filled.every((f) => f.beats === 4)).toBe(true);
  });
  it('gives the same advice every time (deterministic)', () => {
    const song = new SequenceEditor(sequenceFromChart('| C |', 'Twinkle'));
    song.recordMelody(twinkle);
    expect(fillGaps(song.document, 'pop', 4)).toEqual(fillGaps(song.document, 'pop', 4));
  });
});
