import { describe, expect, it } from 'vitest';
import { noteContext } from '../src/ui/noteContext';
import { parseChordSymbol } from '../src/theory/symbols';

describe('piano note context', () => {
  it('distinguishes the chord root from the key tonic', () => {
    const context = noteContext(67, parseChordSymbol('G7'), { tonic: 0, mode: 'major' });
    expect(context.name).toBe('G4');
    expect(context.role?.label).toBe('R');
    expect(context.chordName).toBe('G7');
    expect(context.degree).toBe('5');
    expect(context.description).toContain('root of G7');
    expect(context.description).toContain('scale degree 5 in C major');
  });

  it('gives every note an interval, including a melodic tension outside the voicing', () => {
    const context = noteContext(74, parseChordSymbol('C'), { tonic: 0, mode: 'major' });
    expect(context.name).toBe('D5');
    expect(context.role).toEqual({ label: '9', kind: 'tension' });
    expect(context.degree).toBe('2');
    expect(noteContext(66, parseChordSymbol('C'), { tonic: 0, mode: 'major' }).degree).toBe('♯4');
  });

  it('shows a minor-chord third separately from its degree in the key', () => {
    const context = noteContext(67, parseChordSymbol('Em'), { tonic: 0, mode: 'major' });
    expect(context.role?.label).toBe('♭3');
    expect(context.degree).toBe('5');
  });

  it('uses natural-minor degrees, including the raised leading tone', () => {
    const minor = { tonic: 0, mode: 'minor' as const };
    expect(noteContext(63, parseChordSymbol('Cm'), minor).degree).toBe('3');
    expect(noteContext(70, parseChordSymbol('Cm7'), minor).degree).toBe('7');
    expect(noteContext(71, parseChordSymbol('G7'), minor).degree).toBe('♯7');
  });

  it('spells enharmonic octaves correctly and handles an absent chord or key', () => {
    expect(noteContext(60, null, { tonic: 1, mode: 'minor' }).name).toBe('B♯3');
    expect(noteContext(71, null, { tonic: 10, mode: 'minor' }).name).toBe('C♭5');
    expect(noteContext(61, null, null)).toMatchObject({ name: 'C♯4', role: null, degree: null });
  });
});
