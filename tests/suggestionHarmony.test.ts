import { describe, expect, it } from 'vitest';
import { parseChordSymbol } from '../src/theory/symbols';
import { suggestionHarmony } from '../src/ui/suggestionHarmony';

const key = { tonic: 0, mode: 'major' } as const;

describe('suggestion colour tags', () => {
  it('leaves diatonic chords untagged and names the mode for borrowed chords', () => {
    expect(suggestionHarmony(['G7'], key, null, null).colourTags).toEqual([]);
    expect(suggestionHarmony(['Fm'], key, null, null)).toMatchObject({
      colourTags: [{ label: 'From C minor', title: 'Fm · Borrowed from C minor' }],
      borrowedFrom: ['C minor'],
    });
  });

  it('groups shared borrowing sources and identifies the affected chords', () => {
    const f = { tonic: 5, mode: 'major' } as const;
    const harmony = suggestionHarmony(['Fm', 'D♭', 'A♭', 'E♭', 'C', 'Fm'], f, null, null);
    expect(harmony.colourTags).toEqual([
      { label: 'From F minor', title: 'Fm, D♭, A♭, E♭ · Borrowed from F minor', tone: 'colour' },
    ]);
    expect(harmony.borrowedFrom).toEqual(['F minor', 'F minor', 'F minor', 'F minor', null, 'F minor']);
  });

  it('names the target of an applied dominant and ties the tag to its chord in a sequence', () => {
    expect(suggestionHarmony(['A7'], key, null, parseChordSymbol('Dm')).colourTags).toEqual([
      { label: 'V of Dm', tone: 'colour' },
    ]);
    expect(suggestionHarmony(['A7', 'Dm'], key, null, null).colourTags).toEqual([
      { label: 'A7 · V of Dm', tone: 'colour' },
    ]);
  });

  it('identifies an outside extension on an otherwise diatonic chord', () => {
    expect(suggestionHarmony(['Cmaj7#11'], key, null, null).colourTags).toEqual([
      { label: 'Outside F♯', tone: 'colour' },
    ]);
  });
});
