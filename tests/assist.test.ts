import { describe, expect, it } from 'vitest';
import {
  melodyFit,
  metricWeight,
  motion,
  noteRole,
  suggestForSlot,
  tensionContext,
  type MelodyNote,
} from '../src/engine/assist';
import { chordOf } from '../src/theory/chords';
import type { Key } from '../src/theory/scales';

const C: Key = { tonic: 0, mode: 'major' };
/** "C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2" → notes in quarter notes. */
function tune(src: string): MelodyNote[] {
  const pc: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let t = 0;
  return src
    .replace(/\|/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const [p, d] = tok.split(':');
      const note = { pitch: 12 * (Number(p.at(-1)) + 1) + pc[p[0]], start: t, beats: d ? Number(d) : 1 };
      t += note.beats;
      return note;
    });
}
const twinkle = tune('C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2');

describe('note roles over a chord', () => {
  it('classifies rest, colour, lean and pull', () => {
    const c = chordOf(0, 'maj');
    expect(noteRole(64, c)).toBe('rest');
    expect(noteRole(62, c)).toBe('colour');
    expect(noteRole(65, c)).toBe('pull'); // F rubs a semitone above E
    expect(noteRole(71, c)).toBe('lean'); // B leans into C
  });
  it('weights downbeats over off-beats', () => {
    expect(metricWeight(0, 4)).toBe(1);
    expect(metricWeight(2, 4)).toBe(0.8);
    expect(metricWeight(1, 4)).toBe(0.6);
    expect(metricWeight(1.5, 4)).toBe(0.35);
  });
});

describe('melody fit', () => {
  it('prefers the chord the melody rests on', () => {
    const bar3 = { start: 8, end: 10 }; // F F
    const f = melodyFit(chordOf(5, 'maj'), twinkle, bar3)!;
    const c = melodyFit(chordOf(0, 'maj'), twinkle, bar3)!;
    expect(f.score).toBeGreaterThan(c.score);
    expect(c.clashes).toBeGreaterThan(0);
  });
  it('forgives a passing tone that steps into a chord tone', () => {
    // E D C over C: D on beat 2 is colour; F on an off-beat moving to E is a resolved pull
    const run: MelodyNote[] = [
      { pitch: 64, start: 0, beats: 1 },
      { pitch: 65, start: 1.5, beats: 0.5 },
      { pitch: 64, start: 2, beats: 2 },
    ];
    const fit = melodyFit(chordOf(0, 'maj'), run, { start: 0, end: 4 })!;
    expect(fit.clashes).toBe(0);
    expect(fit.notes.find((n) => n.note.pitch === 65)!.resolved).toBe(true);
  });
  it('returns null when no melody sounds in the span', () => {
    expect(melodyFit(chordOf(0, 'maj'), twinkle, { start: 100, end: 104 })).toBeNull();
  });
});

describe('motion between chords', () => {
  it('names a V7 → I as a resolution and scores it above a leap', () => {
    const res = motion(chordOf(7, '7'), chordOf(0, 'maj'), C);
    expect(res.kind).toBe('resolves');
    expect(res.score).toBeGreaterThan(motion(chordOf(0, 'maj'), chordOf(6, 'maj'), C).score);
  });
  it('sees a relative swap as a glide with two shared notes', () => {
    const m = motion(chordOf(0, 'maj'), chordOf(9, 'min'), C);
    expect(m.kind).toBe('glides');
    expect(m.common).toBe(2);
  });
  it('reports brightness on the circle of fifths', () => {
    expect(motion(chordOf(0, 'maj'), chordOf(7, 'maj'), C).brightness).toBe(1);
    expect(motion(chordOf(0, 'maj'), chordOf(5, 'maj'), C).brightness).toBe(-1);
  });
});

describe('suggestions for a slot', () => {
  it('suggests F for "F F" in Twinkle between C and C', () => {
    const top = suggestForSlot({
      key: C,
      prev: chordOf(0, 'maj'),
      next: chordOf(0, 'maj'),
      melody: twinkle,
      span: { start: 8, end: 10 },
    });
    expect(top.slice(0, 3).map((s) => s.name)).toContain('F');
  });
  it('suggests a dominant for "D D" before the final C', () => {
    const top = suggestForSlot({
      key: C,
      prev: chordOf(0, 'maj'),
      next: chordOf(0, 'maj'),
      melody: twinkle,
      span: { start: 12, end: 14 },
    });
    expect(['G', 'G7']).toContain(top[0].name);
    expect(top[0].onward?.kind).toBe('resolves');
  });
  it('works without a melody, from neighbours alone', () => {
    const top = suggestForSlot({
      key: C,
      prev: chordOf(2, 'min'),
      next: chordOf(0, 'maj'),
      span: { start: 0, end: 4 },
    });
    expect(['G', 'G7']).toContain(top[0].name);
    expect(top.every((s) => s.melody === null)).toBe(true);
  });
  it('lets colour chords rise when adventurous', () => {
    const ctx = { key: C, prev: chordOf(5, 'maj'), next: chordOf(0, 'maj'), span: { start: 0, end: 4 } };
    const rank = (adventurous: number) => suggestForSlot({ ...ctx, adventurous, limit: 30 }).findIndex((s) => !s.inKey);
    expect(rank(1)).toBeLessThanOrEqual(rank(0));
  });
});

describe('context: tension needs preparation or resolution', () => {
  const C: Key = { tonic: 0, mode: 'major' };
  it('a plain in-key chord needs no excuse', () => {
    expect(tensionContext(chordOf(9, 'min'), C, null, null).score).toBe(1);
  });
  it('a weird chord sticks out when nothing follows it, and fits once it resolves', () => {
    const weird = chordOf(1, '7'); // D♭7 in C
    const hanging = tensionContext(weird, C, chordOf(0, 'maj'), null);
    const resolved = tensionContext(weird, C, chordOf(0, 'maj'), chordOf(0, 'maj'));
    expect(resolved.score).toBeGreaterThan(hanging.score);
    expect(resolved.text).toMatch(/resolves into C/);
  });
  it('a dominant 7th resolves its tritone into the tonic', () => {
    const v = tensionContext(chordOf(7, '7'), C, chordOf(5, 'maj'), chordOf(0, 'maj'));
    expect(v.tones.some((t) => t.why === 'tritone')).toBe(true);
    expect(v.score).toBeGreaterThan(0.9);
  });
});
