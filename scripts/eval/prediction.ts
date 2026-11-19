import { keyEq } from '../../src/theory/scales';
import { predictionToken } from '../../src/engine/prediction';
import type { Key } from '../../src/theory/scales';
import type { Piece } from './truth';

export interface PredictionExample {
  key: Key;
  history: number[];
  next: number;
}

/** Only actual chord changes within one contiguous local-key region are prediction examples. */
export function predictionExamples(piece: Piece): PredictionExample[] {
  const examples: PredictionExample[] = [];
  let key: Key | null = null;
  let end = -Infinity;
  let history: number[] = [];
  for (const chord of piece.chords) {
    if (!chord.key || chord.t1 <= chord.t0) {
      key = null;
      history = [];
      continue;
    }
    if (!keyEq(key, chord.key) || chord.t0 > end) history = [];
    key = chord.key;
    const token = predictionToken(chord.root, chord.family, key);
    if (token !== history.at(-1)) {
      if (history.length) examples.push({ key, history: history.slice(-2), next: token });
      history.push(token);
    }
    end = chord.t1;
  }
  return examples;
}
