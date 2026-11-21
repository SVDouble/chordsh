import { describe, expect, it } from 'vitest';
import { habitScore, type TraditionStats, tokenOf } from '../src/engine/progressions';
import { rateProgression, type SequenceContext, suggestSequences } from '../src/engine/sequences';
import { chordOf } from '../src/theory/chords';
import type { Key } from '../src/theory/scales';

const C: Key = { tonic: 0, mode: 'major' };
/** Twinkle Twinkle, first 4 bars: C C G G | A A G- | F F E E | D D C- */
const twinkle = [60, 60, 67, 67, 69, 69, 67, 0, 65, 65, 64, 64, 62, 62, 60, 0]
  .map((pitch, i) => ({ start: i, beats: 1, pitch }))
  .filter((n) => n.pitch > 0)
  .map((n) => ((n.pitch === 67 && n.start === 6) || (n.pitch === 60 && n.start === 14) ? { ...n, beats: 2 } : n));
const whole = { key: C, before: [], after: null, melody: twinkle, span: { start: 0, end: 16 }, meter: 4, count: 8 };

describe('sequence suggestions', () => {
  it('harmonises Twinkle from home to home, with the melody resting on the chords', () => {
    const ideas = suggestSequences({ ...whole, style: 'functional', tradition: 'art', phraseEnd: true });
    expect(ideas.length).toBeGreaterThan(2);
    for (const idea of ideas) {
      expect(idea.names).toHaveLength(8);
      expect(idea.names[0]).toBe('C');
      expect(['C', 'Cmaj7']).toContain(idea.names[7]);
      expect(idea.melody!).toBeGreaterThan(0.8);
    }
  });
  it('is deterministic and lists varied ideas', () => {
    const a = suggestSequences({ ...whole, style: 'pop', tradition: 'popular', phraseEnd: true });
    const b = suggestSequences({ ...whole, style: 'pop', tradition: 'popular', phraseEnd: true });
    expect(a.map((i) => i.names.join(' '))).toEqual(b.map((i) => i.names.join(' ')));
    for (let i = 1; i < a.length; i++)
      for (let j = 0; j < i; j++)
        expect(a[i].names.filter((n, k) => n !== a[j].names[k]).length).toBeGreaterThanOrEqual(2);
  });
  it('scores a fixed progression like the same progression from the search', () => {
    const context = { ...whole, style: 'functional', tradition: 'art', phraseEnd: true } as const;
    const [idea] = suggestSequences(context);
    expect(rateProgression(context, idea.chords)).toEqual(idea);
    expect(rateProgression(context, [...idea.chords].reverse())?.score).toBeLessThan(idea.score);
  });
  it('uses the tonic and internal motion on a blank chart, even without a matching rulebook or corpus', () => {
    const context: SequenceContext = { ...whole, melody: [], style: 'melody-fit', tradition: 'art', count: 4 };
    const tonic = chordOf(0, 'maj');
    const dominant = chordOf(7, 'maj');
    const subdominant = chordOf(5, 'maj');
    const progression = rateProgression(context, [tonic, subdominant, dominant, tonic])!;
    const repeat = rateProgression(context, [tonic, tonic, tonic, tonic])!;
    expect(progression.anchor).toBe(1);
    expect(progression.motion).toBeGreaterThan(repeat.motion!);
    expect(progression.score).toBeGreaterThan(repeat.score);
    expect(suggestSequences({ ...context, count: 1 })[0]).toMatchObject({ names: ['C'], anchor: 1, motion: null });
  });
  it('leads into the chord after the span: between C and C, bar 2 goes to a dominant', () => {
    const ideas = suggestSequences({
      key: C,
      before: [chordOf(0, 'maj')],
      after: chordOf(0, 'maj'),
      melody: twinkle,
      span: { start: 4, end: 8 },
      meter: 4,
      count: 2,
      style: 'functional',
      tradition: 'art',
    });
    expect(['G', 'G7']).toContain(ideas[0].names[1]);
  });
  it('uses counted habits when there are statistics', () => {
    const t = (c: ReturnType<typeof chordOf>) => tokenOf(c, C);
    const [I, IV, V] = [t(chordOf(0, 'maj')), t(chordOf(5, 'maj')), t(chordOf(7, 'maj'))];
    const stats: TraditionStats = {
      moves: 100,
      grams: { [I]: 50, [IV]: 25, [V]: 25, [`${V} ${I}`]: 20, [`${V} ${IV}`]: 2 },
    };
    expect(habitScore(stats, [V], I)!).toBeGreaterThan(habitScore(stats, [V], IV)!);
    expect(habitScore(undefined, [V], I)).toBeNull();
  });
});
