import { describe, expect, it } from 'vitest';
import { noteContext, keyRootContext } from '../src/ui/noteContext';
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

describe('key-relative chord-root labels', () => {
  it('labels all seven chord roots in C major even without a sounding chord', () => {
    const key = { tonic: 0, mode: 'major' as const };
    expect([60, 62, 64, 65, 67, 69, 71].map((note) => keyRootContext(note, key)?.numeral)).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii°',
    ]);
    expect(keyRootContext(62, key)).toMatchObject({
      name: 'Dm',
      func: 'PD',
      description: 'root of ii (Dm) in C major',
    });
    expect(keyRootContext(61, key)).toBeNull();
  });

  it('places numerals on the correct black keys after changing key', () => {
    const key = { tonic: 2, mode: 'major' as const };
    expect([62, 64, 66, 67, 69, 71, 73].map((note) => keyRootContext(note, key)?.numeral)).toEqual([
      'I',
      'ii',
      'iii',
      'IV',
      'V',
      'vi',
      'vii°',
    ]);
    expect(keyRootContext(66, key)?.name).toBe('F♯m');
    expect(keyRootContext(60, key)).toBeNull();
  });

  it('retains the app’s minor-key Roman convention and harmonic-minor leading tone', () => {
    const key = { tonic: 0, mode: 'minor' as const };
    expect([60, 62, 63, 65, 67, 68, 70, 71].map((note) => keyRootContext(note, key)?.numeral)).toEqual([
      'i',
      'ii°',
      '♭III',
      'iv',
      'V',
      '♭VI',
      '♭VII',
      'vii°',
    ]);
    expect(keyRootContext(63, key)?.name).toBe('E♭');
    expect(keyRootContext(64, key)).toBeNull();
  });

  it('keeps roots distinct from roles within the focused chord, across octaves and transpositions', () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      const key = { tonic, mode: 'major' as const };
      expect(keyRootContext(tonic + 2, key)?.numeral).toBe('ii');
      expect(keyRootContext(tonic + 14, key)).toEqual(keyRootContext(tonic + 2, key));
    }
    expect(noteContext(67, parseChordSymbol('Em'), { tonic: 0, mode: 'major' }).role?.label).toBe('♭3');
    expect(keyRootContext(67, { tonic: 0, mode: 'major' })?.numeral).toBe('V');
    expect(keyRootContext(60, null)).toBeNull();
  });
});
