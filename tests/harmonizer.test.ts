import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PARAMS, Harmonizer, type Segment, chordState } from '../src/engine/harmonizer';
import { TRANSITIONS } from '../src/engine/transitions';
import { ALL_KEYS } from '../src/theory/scales';
import { mod12 } from '../src/theory/pitch';

describe('learned harmonic transitions', () => {
  it('ships smoothed, normalised probabilities learned on the tune split', () => {
    expect(TRANSITIONS.split).toBe('tune');
    for (const mode of TRANSITIONS.probabilities)
      for (const row of mode) {
        expect(row.every((p) => p > 0 && p < 1)).toBe(true);
        expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
      }
  });

  it.each([0, 0.5, 1.2])('matches exhaustive decoding and backward rankings at strength %s', (transitionWeight) => {
    const params = {
      ...DEFAULT_PARAMS,
      transitionWeight,
      keyChange: 1000,
      keyFit: 0,
      prior: { diatonic: 0, secondary: 0, borrowed: 0, other: 0, tonic: 0, dominant: 0 },
    };
    const scores = [
      [2.8, 0],
      [0.7, 1.4],
      [0, 2.7],
      [2.1, 0.4],
    ];
    const roots = [0, 7];
    const h = new Harmonizer(params);
    h.keepColumns = true;
    vi.spyOn(h, 'emission').mockImplementation((seg, c) => {
      const which = roots.findIndex((root) => chordState(root, 0) === c);
      return which < 0 ? -1e6 : scores[seg.t0 / 1000][which];
    });
    for (let i = 0; i < scores.length; i++) {
      const seg: Segment = { t0: i * 1000, t1: (i + 1) * 1000, sal: new Float64Array(12), bass: null, bassNote: null };
      h.push(seg);
    }

    // Enumerate every C/G path in every fixed key. The large modulation cost makes
    // key-changing paths strictly worse; all other chord states have impossible emissions.
    let best = -Infinity;
    const byChord = scores.map(() => [-Infinity, -Infinity]);
    for (const key of ALL_KEYS)
      for (let mask = 0; mask < 2 ** scores.length; mask++) {
        const path = scores.map((_, i) => (mask >> i) & 1);
        let score = 0;
        for (let i = 0; i < path.length; i++) {
          score += scores[i][path[i]];
          if (i > 0 && path[i] !== path[i - 1]) {
            const from = mod12(roots[path[i - 1]] - key.tonic);
            const to = mod12(roots[path[i]] - key.tonic);
            const probability = TRANSITIONS.probabilities[key.mode === 'major' ? 0 : 1][from][to];
            score -= params.chordChange * Math.exp(-transitionWeight * Math.log(12 * probability));
          }
        }
        best = Math.max(best, score);
        path.forEach((c, i) => {
          byChord[i][c] = Math.max(byChord[i][c], score);
        });
      }
    const ranked = h.ranked(2);
    ranked.forEach((row, i) => {
      for (let c = 0; c < roots.length; c++) {
        expect(row.chords.find((chord) => chord.root === roots[c])?.delta).toBeCloseTo(byChord[i][c] - best, 4);
      }
    });
    const path = h.path();
    for (let i = 0; i < scores.length; i++) {
      const root = path.find((item) => item.t0 <= i * 1000 && item.t1 > i * 1000)!.chord.root;
      expect(byChord[i][roots.indexOf(root)]).toBeCloseTo(best, 4);
    }
  });
});
