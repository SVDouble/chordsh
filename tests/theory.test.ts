import { describe, expect, it } from 'vitest';
import { chordName, chordOf, identify } from '../src/theory/chords';
import { analyzeRoman } from '../src/theory/roman';
import { patternsAtEnd } from '../src/theory/patterns';
import { Key } from '../src/theory/scales';

const C: Key = { tonic: 0, mode: 'major' };
const Am: Key = { tonic: 9, mode: 'minor' };
const name = (notes: number[], key?: Key) => {
  const b = identify(notes, key).best;
  return b ? chordName(b, key) : null;
};

describe('chord recognition', () => {
  it.each([
    [[48, 52, 55], 'C'],
    [[52, 55, 60], 'C/E'],
    [[55, 60, 64], 'C/G'],
    [[48, 52, 55, 57], 'C6'],
    [[45, 48, 52, 55], 'Am7'],
    [[47, 50, 53, 57], 'Bm7♭5'],
    [[48, 52, 55, 58, 62], 'C9'],
    [[50, 53, 57, 60, 64], 'Dm9'],
    [[43, 47, 50, 53], 'G7'],
    [[47, 50, 53, 55], 'G7/B'],
    [[48, 51, 54, 57], 'C°7'],
    [[48, 52, 56], 'C+'],
    [[48, 53, 55], 'Csus4'],
    [[48, 53, 55, 58], 'C7sus4'],
    [[48, 52, 55, 59, 66], 'Cmaj7(♯11)'],
    [[48, 52, 58, 61], 'C7(♭9)'],
    [[48, 52, 58, 63], 'C7(♯9)'],
    [[43, 53, 59, 64], 'G13'],
    [[48, 52, 55, 62], 'Cadd9'],
    [[48, 51, 55, 59], 'Cm(maj7)'],
  ])('%j → %s', (notes, expected) => {
    expect(name(notes)).toBe(expected);
  });

  it('spells roots in key context', () => {
    expect(name([51, 55, 58], { tonic: 3, mode: 'major' })).toBe('E♭');
    expect(name([54, 58, 61], { tonic: 6, mode: 'major' })).toBe('F♯');
  });

  it('reports dyads as intervals', () => {
    const id = identify([48, 52]);
    expect(id.kind).toBe('interval');
    expect(id.intervalName).toBe('major 3rd');
  });
});

const rn = (c: ReturnType<typeof chordOf>, k: Key, next?: ReturnType<typeof chordOf>) => analyzeRoman(c, k, next);

describe('roman analysis', () => {
  it('diatonic', () => {
    expect(rn(chordOf(2, 'm7'), C).numeral).toBe('ii7');
    expect(rn(chordOf(7, '7'), C).func).toBe('D');
    expect(rn(chordOf(11, 'm7b5'), C).numeral).toBe('viiø7');
    expect(rn(chordOf(4, '7'), Am).numeral).toBe('V7');
  });
  it('secondary dominants and subs', () => {
    expect(rn(chordOf(9, '7'), C).numeral).toBe('V7/ii');
    expect(rn(chordOf(2, '7'), C).numeral).toBe('V7/V');
    expect(rn(chordOf(1, '7'), C, chordOf(0, 'maj7')).kind).toBe('tritone-sub');
    expect(rn(chordOf(10, '7'), C).kind).toBe('backdoor');
    expect(rn(chordOf(6, 'dim7'), C).numeral).toBe('vii°7/V');
  });
  it('borrowed chords', () => {
    const r = rn(chordOf(5, 'min'), C);
    expect(r.kind).toBe('borrowed');
    expect(r.numeral).toBe('iv');
    expect(rn(chordOf(8, 'maj'), C).numeral).toBe('♭VI');
  });
});

describe('patterns', () => {
  it('finds ii–V–I in another key', () => {
    const p = patternsAtEnd([chordOf(7, 'm7'), chordOf(0, '7'), chordOf(5, 'maj7')], C);
    expect(p[0].kind).toBe('ii-V-I');
    expect(p[0].target).toEqual({ tonic: 5, mode: 'major' });
  });
  it('finds the Andalusian cadence', () => {
    const p = patternsAtEnd([chordOf(9, 'min'), chordOf(7, 'maj'), chordOf(5, 'maj'), chordOf(4, 'maj')], Am);
    expect(p.some((x) => x.label === 'Andalusian cadence')).toBe(true);
  });
});
