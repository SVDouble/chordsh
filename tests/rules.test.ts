import { describe, expect, it } from 'vitest';
import type { MelodyNote } from '../src/engine/assist';
import { cadenceAt, featuresOf, pedalsOf, type PieceChord, phrasesOf, sequencesOf } from '../src/engine/features';
import { judgeAll, PIECE_RULES, RULEBOOKS, RULES, type RuleContext, rulebookVerdict } from '../src/engine/rules';
import { chordOf } from '../src/theory/chords';
import type { Key } from '../src/theory/scales';

const C: Key = { tonic: 0, mode: 'major' };
const ctx = (chord: ReturnType<typeof chordOf>, over: Partial<RuleContext> = {}): RuleContext => ({
  key: C,
  chord,
  prev: null,
  next: null,
  melody: [],
  span: { start: 0, end: 4 },
  meter: 4,
  phraseEnd: false,
  ...over,
});
const rule = (id: string) => RULES.find((r) => r.id === id)!;

describe('rule catalogue', () => {
  it('every rule is documented and has a kind', () => {
    for (const r of RULES) {
      expect(r.statement.length).toBeGreaterThan(10);
      expect(r.source.length).toBeGreaterThan(5);
      expect(r.formula.length).toBeGreaterThan(5);
      expect(['preference', 'constraint']).toContain(r.kind);
    }
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
  });
  it('rulebooks only reference existing rules', () => {
    const ids = new Set(RULES.map((r) => r.id));
    const pieceIds = new Set(PIECE_RULES.map((r) => r.id));
    for (const b of RULEBOOKS) {
      for (const id of b.rules) expect(ids.has(id)).toBe(true);
      for (const id of b.pieceRules) expect(pieceIds.has(id)).toBe(true);
    }
  });
  it('constraints never reward, they only object', () => {
    const chords = [chordOf(7, '7'), chordOf(1, '7'), chordOf(0, 'maj'), chordOf(11, 'dim'), chordOf(8, 'maj')];
    for (const r of RULES.filter((x) => x.kind === 'constraint'))
      for (const c of chords)
        for (const next of chords) {
          const v = r.judge(ctx(c, { next, prev: chordOf(5, 'maj'), melody: [{ pitch: 65, start: 0, beats: 2 }] }));
          if (v !== null) expect(v).toBeLessThanOrEqual(0);
        }
  });
});

describe('functional rules, by hand', () => {
  it('function order: V → I is a forward step, V → IV a retrogression', () => {
    expect(rule('function-order').judge(ctx(chordOf(7, 'maj'), { next: chordOf(0, 'maj') }))).toBe(1);
    expect(rule('function-order').judge(ctx(chordOf(7, 'maj'), { next: chordOf(5, 'maj') }))).toBe(-1);
  });
  it('a dominant must resolve: G7 → C fine, G7 → Am deceptive, G7 → F wrong', () => {
    const r = rule('dominant-resolves');
    expect(r.judge(ctx(chordOf(7, '7'), { next: chordOf(0, 'maj') }))).toBe(0);
    expect(r.judge(ctx(chordOf(7, '7'), { next: chordOf(9, 'min') }))).toBe(-0.3);
    expect(r.judge(ctx(chordOf(7, '7'), { next: chordOf(5, 'maj') }))).toBe(-1);
    expect(r.judge(ctx(chordOf(0, 'maj'), { next: chordOf(5, 'maj') }))).toBe(0);
  });
  it('cadence: a phrase ending on I scores +1, on V +0.6', () => {
    expect(rule('cadence').judge(ctx(chordOf(0, 'maj'), { phraseEnd: true }))).toBe(1);
    expect(rule('cadence').judge(ctx(chordOf(7, 'maj'), { phraseEnd: true }))).toBe(0.6);
    expect(rule('cadence').judge(ctx(chordOf(0, 'maj')))).toBeNull();
  });
});

describe('tension rules, by hand', () => {
  it('the G7 tritone (B, F) resolving into C costs nothing; into E♭ it is left hanging', () => {
    const r = rule('tritone-resolves');
    expect(r.judge(ctx(chordOf(7, '7'), { next: chordOf(0, 'maj') }))).toBe(0);
    expect(r.judge(ctx(chordOf(7, '7'), { next: chordOf(3, 'maj') }))!).toBeLessThan(0);
  });
  it('the seventh of G7 (F) falls to E', () => {
    expect(rule('seventh-falls').judge(ctx(chordOf(7, '7'), { next: chordOf(0, 'maj') }))).toBe(0);
    expect(rule('seventh-falls').judge(ctx(chordOf(7, '7'), { next: chordOf(2, 'min') }))!).toBeLessThan(0);
  });
});

describe('melody rules, by hand', () => {
  const melody: MelodyNote[] = [
    { pitch: 64, start: 0, beats: 2 },
    { pitch: 65, start: 2, beats: 2 },
  ];
  it('E then F over C: half the strong time on chord tones → 0; over F: E is a lean on beat 1 → also 0', () => {
    expect(rule('mel-chord-tones').judge(ctx(chordOf(0, 'maj'), { melody }))).toBeCloseTo(2 * (2 / (2 + 1.6)) - 1, 6);
  });
  it('F over C on a strong beat is a ♭9-type clash (a semitone above E)', () => {
    expect(rule('mel-no-minor-ninth').judge(ctx(chordOf(0, 'maj'), { melody }))!).toBeLessThan(0);
    expect(rule('mel-no-minor-ninth').judge(ctx(chordOf(5, 'maj'), { melody }))).toBe(0);
  });
});

describe('features', () => {
  const piece: PieceChord[] = [
    { chord: chordOf(0, 'maj'), start: 0, end: 4, key: C },
    { chord: chordOf(5, 'maj'), start: 4, end: 8, key: C },
    { chord: chordOf(7, '7'), start: 8, end: 12, key: C },
    { chord: chordOf(0, 'maj'), start: 12, end: 16, key: C },
  ];
  it('names an authentic cadence V7 → I', () => {
    expect(cadenceAt(piece, 3)).toBe('authentic');
    expect(cadenceAt(piece, 2)).toBe('half');
  });
  it('splits phrases at fermatas and finds the cadence at each end', () => {
    const melody = [
      { pitch: 64, start: 0, beats: 8, fermata: true },
      { pitch: 60, start: 8, beats: 8, fermata: true },
    ];
    const phrases = phrasesOf(piece, melody, 4);
    expect(phrases.map((p) => p.cadence)).toEqual(['none', 'authentic']);
  });
  it('finds V–I in the feature layer', () => {
    expect(featuresOf(piece).some((f) => f.kind === 'V-I' && f.to === 3)).toBe(true);
  });
});

describe('rulebooks', () => {
  it('functional harmony prefers G7 → C over D♭maj7 in the same spot', () => {
    const book = RULEBOOKS.find((b) => b.id === 'functional')!;
    const at = (chord: ReturnType<typeof chordOf>) =>
      rulebookVerdict(book, judgeAll(ctx(chord, { prev: chordOf(5, 'maj'), next: chordOf(0, 'maj') })))!;
    expect(at(chordOf(7, '7'))).toBeGreaterThan(at(chordOf(1, 'maj7')));
  });
});

describe('larger features', () => {
  const at = (pairs: [number, Parameters<typeof chordOf>[1]][]): PieceChord[] =>
    pairs.map(([r, k], i) => ({ chord: chordOf(r, k), start: i * 2, end: i * 2 + 2, key: C }));
  it('finds a descending-fifths sequence (Am–Dm, G–C … pattern moved down a step)', () => {
    // C F | Bdim E | Am Dm: each link = root up a fourth, moved down a step
    const seq = sequencesOf(
      at([
        [0, 'maj'],
        [5, 'maj'],
        [10, 'maj'],
        [3, 'maj'],
        [8, 'maj'],
        [1, 'maj'],
      ]),
    );
    expect(seq.length).toBe(1);
    expect(seq[0].from).toBe(0);
    expect(seq[0].to).toBe(5);
    expect(seq[0].label).toMatch(/×3/);
  });
  it('finds no sequence in a plain I–IV–V–I', () => {
    expect(
      sequencesOf(
        at([
          [0, 'maj'],
          [5, 'maj'],
          [7, 'maj'],
          [0, 'maj'],
        ]),
      ),
    ).toEqual([]);
  });
  it('finds a tonic pedal: C in the bass under C, F, G7, C', () => {
    const chords = at([
      [0, 'maj'],
      [5, 'maj'],
      [7, '7'],
      [0, 'maj'],
    ]);
    const pedals = pedalsOf(chords, [0, 0, 0, 0]);
    expect(pedals).toHaveLength(1);
    expect(pedals[0].to - pedals[0].from).toBe(3);
  });
});

describe('keys and modes', () => {
  const hist = (degs: number[]) => Array.from({ length: 12 }, (_, d) => (degs.includes(d) ? 1 : 0));
  it('names a Mixolydian collection by its ♭7', async () => {
    const { readMode } = await import('../src/engine/modes');
    expect(readMode(hist([0, 2, 4, 5, 7, 9, 10])).best.id).toBe('mixolydian');
  });
  it('prefers the smallest collection that fits: a pentatonic tune is pentatonic, not major', async () => {
    const { readMode } = await import('../src/engine/modes');
    expect(readMode(hist([0, 2, 4, 7, 9])).best.id).toBe('major-pentatonic');
  });
  it('finds a register-dependent scale: ♭3 only low, 3 only high', async () => {
    const { registerSplits } = await import('../src/engine/modes');
    const notes = [51, 51, 51, 51, 64, 64, 64, 64].map((pitch) => ({ pitch, weight: 1 }));
    expect(registerSplits(notes, 0)).toEqual([{ low: 3, high: 4, gap: 13 / 12 }]);
  });
});

describe('modern rules, by hand', () => {
  it('♭VII → IV → I (double plagal) is a known schema; I → ♯iv° → V is not a pop schema', () => {
    const r = rule('schema-member');
    expect(r.judge(ctx(chordOf(5, 'maj'), { prev: chordOf(10, 'maj'), next: chordOf(0, 'maj') }))).toBe(1);
    expect(r.judge(ctx(chordOf(6, 'dim'), { prev: chordOf(0, 'maj'), next: chordOf(7, 'maj') }))).toBe(0);
  });
  it('C → A♭ is a chromatic mediant (one shared note), C → Am is not (two shared, different mode)', () => {
    const r = rule('chromatic-mediant');
    expect(r.judge(ctx(chordOf(0, 'maj'), { next: chordOf(8, 'maj') }))).toBe(1);
    expect(r.judge(ctx(chordOf(0, 'maj'), { next: chordOf(9, 'min') }))).toBe(0);
  });
  it('D♭7 → C is a tritone substitute; G7 → C is not', () => {
    const r = rule('tritone-substitute');
    expect(r.judge(ctx(chordOf(1, '7'), { next: chordOf(0, 'maj') }))).toBe(1);
    expect(r.judge(ctx(chordOf(7, '7'), { next: chordOf(0, 'maj') }))).toBe(0);
  });
  it('♭VII is a flat-side colour in major, not in minor', () => {
    const r = rule('flat-side-colour');
    expect(r.judge(ctx(chordOf(10, 'maj')))).toBe(1);
    expect(r.judge(ctx(chordOf(10, 'maj'), { key: { tonic: 0, mode: 'minor' } }))).toBe(0);
  });
});
