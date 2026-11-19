import { DEFAULT_SETTINGS, type PredictionSettings } from '../config/settings';
import { type Chord, chordOf } from '../theory/chords';
import { mod12 } from '../theory/pitch';
import type { Key } from '../theory/scales';
import { PREDICTION_MODEL } from './predictionModel';

export const PREDICTION_FAMILIES = ['maj', 'min', 'dim', 'aug', 'sus'] as const;
export type PredictionFamily = (typeof PREDICTION_FAMILIES)[number];
export interface PredictionModel {
  version: number;
  split: 'tune';
  manifestSha256: string;
  dataSha256: string;
  training: { corpus: string; pieces: number; transitions: number }[];
  unigram: number[][];
  single: Record<string, number[]>;
  pair: Record<string, [number, number][]>;
}

/** Keep the benchmark's root/quality vocabulary; inversions/extensions share one event. */
export function predictionFamily(chord: Chord): PredictionFamily {
  if (chord.quality === 'dim' || chord.flat5) return 'dim';
  if (chord.quality === 'sus2' || chord.quality === 'sus4' || chord.quality === 'power') return 'sus';
  return chord.quality;
}
export const predictionToken = (root: number, family: PredictionFamily, key: Key) =>
  mod12(root - key.tonic) * PREDICTION_FAMILIES.length + PREDICTION_FAMILIES.indexOf(family);
export const chordToken = (chord: Chord, key: Key) => predictionToken(chord.root, predictionFamily(chord), key);

/** Consecutive repeats are prolongations; predicting the next change needs only two distinct chords. */
export function predictionHistory(chords: Chord[], key: Key): number[] {
  const tokens: number[] = [];
  for (const chord of chords) {
    const token = chordToken(chord, key);
    if (token !== tokens.at(-1)) tokens.push(token);
  }
  return tokens.slice(-2);
}

function normalise(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
}

/** Smoothed second-order continuation model with first-order and mode priors as backoff. */
export function predictTokens(
  mode: Key['mode'],
  history: number[],
  settings: PredictionSettings = DEFAULT_SETTINGS.prediction,
  model: PredictionModel = PREDICTION_MODEL,
): number[] {
  const m = mode === 'major' ? 0 : 1;
  const unigram = model.unigram[m];
  let probabilities = normalise(unigram.map((value) => value + 1 / unigram.length));
  const current = history.at(-1);
  if (current !== undefined) {
    const counts = model.single[`${m}:${current}`];
    if (counts)
      probabilities = normalise(counts.map((value, to) => value + settings.priorStrength * probabilities[to]));
    const previous = history.at(-2);
    const pair = previous === undefined ? undefined : model.pair[`${m}:${previous}:${current}`];
    if (pair && settings.useSequence) {
      const counts = Array<number>(unigram.length).fill(0);
      for (const [to, value] of pair) counts[to] = value;
      probabilities = normalise(counts.map((value, to) => value + settings.contextStrength * probabilities[to]));
    }
    probabilities[current] = 0;
    probabilities = normalise(probabilities);
  }
  return probabilities;
}

/** Render a predicted quality in the selected suggestion style; keep its root/family intact. */
export function predictedChord(token: number, key: Key, style: 'triads' | 'jazz'): Chord {
  const root = key.tonic + Math.floor(token / PREDICTION_FAMILIES.length);
  const family = PREDICTION_FAMILIES[token % PREDICTION_FAMILIES.length];
  if (family === 'maj') return chordOf(root, style === 'triads' ? 'maj' : mod12(root - key.tonic) === 7 ? '7' : 'maj7');
  if (family === 'min') return chordOf(root, style === 'triads' ? 'min' : 'm7');
  if (family === 'dim') return chordOf(root, style === 'triads' ? 'dim' : 'm7b5');
  return chordOf(root, family === 'sus' ? 'sus4' : 'aug');
}
