import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, restoreSettings, settingsSchema } from '../src/config/settings';
import { chordOf } from '../src/theory/chords';
import type { Key } from '../src/theory/scales';
import {
  chordToken,
  predictedChord,
  predictionFamily,
  predictionHistory,
  predictTokens,
  type PredictionModel,
} from '../src/engine/prediction';
import { PREDICTION_MODEL } from '../src/engine/predictionModel';
import { suggestNext } from '../src/engine/coach';
import { predictionExamples } from '../scripts/eval/prediction';
import type { Piece } from '../scripts/eval/truth';

const C: Key = { tonic: 0, mode: 'major' };
const options = DEFAULT_SETTINGS.prediction;
const token = (root: number, kind: Parameters<typeof chordOf>[1] = 'maj') => chordToken(chordOf(root, kind), C);

describe('next-change prediction', () => {
  it('ships reproducible tune-only training metadata with equal corpus contributions', () => {
    expect(PREDICTION_MODEL.split).toBe('tune');
    expect(PREDICTION_MODEL.training.reduce((n, corpus) => n + corpus.pieces, 0)).toBe(687);
    expect(PREDICTION_MODEL.training.reduce((n, corpus) => n + corpus.transitions, 0)).toBe(43219);
    expect(PREDICTION_MODEL.dataSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(PREDICTION_MODEL.unigram.flat().reduce((sum, n) => sum + n, 0)).toBeCloseTo(5000, 3);
  });

  it.each(['major', 'minor'] as const)(
    'normalises unseen and known contexts in %s without impossible continuations',
    (mode) => {
      for (const history of [[], [0], [0, 35], [59, 19]]) {
        const distribution = predictTokens(mode, history);
        expect(distribution.reduce((sum, n) => sum + n, 0)).toBeCloseTo(1, 10);
        distribution.forEach((p, to) => expect(p, `${history} → ${to}`).toBeGreaterThanOrEqual(0));
        if (history.length) {
          expect(distribution[history.at(-1)!]).toBe(0);
          expect(distribution.filter((p) => p > 0)).toHaveLength(59);
        }
      }
    },
  );

  it('keeps chord quality, merges prolongations and disregards inversion/extension changes', () => {
    expect(predictionFamily(chordOf(11, 'm7b5'))).toBe('dim');
    const history = predictionHistory(
      [chordOf(0, 'maj'), chordOf(0, 'maj7'), chordOf(2, 'min'), chordOf(2, 'm7', 5)],
      C,
    );
    expect(history).toEqual([token(0), token(2, 'min')]);
    expect(predictTokens('major', [token(2, 'min')])).not.toEqual(predictTokens('major', [token(2, 'maj')]));
  });

  it('uses two-chord context and falls back exactly to one chord when disabled or unseen', () => {
    const model: PredictionModel = {
      ...PREDICTION_MODEL,
      single: {},
      pair: {
        [`0:${token(2, 'min')}:${token(7)}`]: [[token(0), 1000]],
        [`0:${token(5)}:${token(7)}`]: [[token(9, 'min'), 1000]],
      },
    };
    const first = [token(2, 'min'), token(7)];
    const second = [token(5), token(7)];
    expect(predictTokens('major', first, options, model)[token(0)]).toBeGreaterThan(0.9);
    expect(predictTokens('major', second, options, model)[token(9, 'min')]).toBeGreaterThan(0.9);
    expect(predictTokens('major', first, { ...options, useSequence: false }, model)).toEqual(
      predictTokens('major', [token(7)], options, model),
    );
    expect(predictTokens('major', [token(3), token(7)], options, model)).toEqual(
      predictTokens('major', [token(7)], options, model),
    );
  });

  it('ranks actual suggestions from preceding context while retaining previewable colour alternatives', () => {
    const ii = chordOf(2, 'm7'),
      V = chordOf(7, '7');
    const moves = suggestNext(C, V, 'jazz', [43, 53, 59, 62], [ii, V]);
    expect(moves[0].chord.root).toBe(0);
    expect(moves.every((move) => move.why && move.voicing.length > 0 && move.prob > 0)).toBe(true);
    expect(moves.reduce((sum, move) => sum + move.prob, 0)).toBeCloseTo(1, 10);
    const tonic = suggestNext(C, chordOf(0, 'maj7'), 'jazz', null, [], { ...options, learnedWeight: 0 });
    expect(tonic[0].name).toBe('Fmaj7');
    expect(tonic.some((move) => move.tag === 'passing °7')).toBe(true);
    expect(tonic.some((move) => move.tag === 'common-tone °7')).toBe(true);
  });

  it('preserves transposition invariance for prediction and ranked suggestion roots/qualities', () => {
    const recent = [chordOf(0, 'maj'), chordOf(9, 'min')];
    const baseline = suggestNext(C, recent[1], 'triads', null, recent).map((move) => chordToken(move.chord, C));
    for (let tonic = 1; tonic < 12; tonic++) {
      const key = { ...C, tonic };
      const shifted = [chordOf(tonic, 'maj'), chordOf(tonic + 9, 'min')];
      expect(predictionHistory(shifted, key)).toEqual(predictionHistory(recent, C));
      expect(suggestNext(key, shifted[1], 'triads', null, shifted).map((move) => chordToken(move.chord, key))).toEqual(
        baseline,
      );
    }
    for (let n = 0; n < 60; n++) expect(chordToken(predictedChord(n, C, 'jazz'), C)).toBe(n);
  });

  it('migrates, validates and exposes suggestion controls in the shared settings schema', () => {
    expect(restoreSettings({ editor: { velocity: 91 } }).settings.prediction).toEqual(options);
    expect(
      settingsSchema.safeParse({ ...DEFAULT_SETTINGS, prediction: { ...options, learnedWeight: 2 } }).success,
    ).toBe(false);
    expect(
      settingsSchema.safeParse({ ...DEFAULT_SETTINGS, prediction: { ...options, contextStrength: 0 } }).success,
    ).toBe(false);
    const moves = suggestNext(C, chordOf(0, 'maj7'), 'jazz', null, [], { ...options, primaryCount: 2, colourCount: 0 });
    expect(moves).toHaveLength(2);
    expect(moves.every((move) => !move.tag)).toBe(true);
  });
});

describe('prediction evaluation boundaries', () => {
  it('does not train on repetition, gaps, modulation or unavailable key context', () => {
    const key2: Key = { tonic: 7, mode: 'major' };
    const chords: Piece['chords'] = [
      { t0: 0, t1: 100, root: 0, family: 'maj', label: 'C', key: C },
      { t0: 100, t1: 200, root: 0, family: 'maj', label: 'Cmaj7', key: C },
      { t0: 200, t1: 300, root: 2, family: 'min', label: 'Dm', key: C },
      { t0: 300, t1: 400, root: 7, family: 'maj', label: 'G', key: C },
      { t0: 400, t1: 500, root: 2, family: 'maj', label: 'D', key: key2 },
      { t0: 500, t1: 600, root: 7, family: 'maj', label: 'G', key: key2 },
      { t0: 700, t1: 800, root: 0, family: 'maj', label: 'C', key: key2 },
      { t0: 800, t1: 900, root: 9, family: 'min', label: 'Am', key: null },
      { t0: 900, t1: 1000, root: 2, family: 'maj', label: 'D', key: key2 },
    ];
    const examples = predictionExamples({ chords } as Piece);
    expect(examples.map((example) => example.history)).toEqual([[token(0)], [token(0), token(2, 'min')], [token(7)]]);
    expect(examples.map((example) => example.next)).toEqual([token(2, 'min'), token(7), token(0)]);
    expect(examples[2].key).toEqual(key2);
  });
});
