/**
 * Chord progressions as scale-degree tokens, and how often real music uses them. The rules study
 * (scripts/rules.test.ts) counts 1- to 4-chord patterns per tradition and writes them to
 * local/assist/progressions.json; the sequence engine (sequences.ts) uses the counts as its "habit" judge.
 * Tokens are key-relative, so "7:7 0:maj" is V7 → I in any key.
 */
import { type Chord, chordOf, type KindName } from '../theory/chords';
import { mod12 } from '../theory/pitch';
import type { Key } from '../theory/scales';

/** The chord kinds patterns are counted in (inversions and extensions folded away). */
export type TokenKind = 'maj' | 'min' | 'dim' | 'aug' | 'sus4' | '7' | 'maj7' | 'm7' | 'm7b5' | 'dim7';

export function kindOf(c: Chord): TokenKind {
  const q = c.quality;
  if (q === 'dim') return c.seventh === 'dim7' ? 'dim7' : c.seventh === 'b7' ? 'm7b5' : 'dim';
  if (q === 'min') return c.seventh === 'none' ? 'min' : 'm7';
  if (q === 'aug') return 'aug';
  if (q === 'sus4' || q === 'sus2') return c.seventh === 'b7' ? '7' : 'sus4';
  // maj and power chords
  return c.seventh === 'b7' ? '7' : c.seventh === 'maj7' ? 'maj7' : 'maj';
}

export const tokenOf = (c: Chord, key: Key) => `${mod12(c.root - key.tonic)}:${kindOf(c)}`;

export function chordOfToken(token: string, key: Key): Chord {
  const [deg, kind] = token.split(':');
  return chordOf(key.tonic + Number(deg), kind as KindName);
}

export interface TraditionStats {
  /** Number of chord moves counted. */
  moves: number;
  /** Pattern → count, for patterns of 1 to 4 tokens joined by spaces (seen at least a few times). */
  grams: Record<string, number>;
}
export interface ProgressionStats {
  generated: string;
  /** Major and minor keys are counted apart: "major|popular", "minor|art", … */
  traditions: Record<string, TraditionStats>;
  /** Frequent rule breaks: idioms of a tradition that a rule does not foresee. */
  idioms: Idiom[];
}
export interface Idiom {
  tradition: string;
  rule: string;
  /** "prev → [chord] → next" in numerals (as the study prints it). */
  context: string;
  count: number;
  /** Share of the chords the rule concerns in that tradition. */
  share: number;
}

export const statsKey = (key: Key, tradition: string) => `${key.mode}|${tradition}`;

/**
 * How expected `token` is after `history` (most recent last) in a tradition: stupid back-off over the 4-, 3- and
 * 2-chord patterns (Brants et al. 2007), mapped to 0 … 1 on a log scale. 0.5 ≈ an ordinary move, 1 = the most
 * common continuation, 0 = never seen. Null without statistics.
 */
export function habitScore(stats: TraditionStats | undefined, history: string[], token: string): number | null {
  if (!stats) return null;
  const g = stats.grams;
  let factor = 1;
  for (let n = Math.min(3, history.length); n >= 1; n--) {
    const ctx = history.slice(-n).join(' ');
    const seen = g[ctx];
    const hit = g[`${ctx} ${token}`];
    if (seen && hit) return scale((factor * hit) / seen);
    factor *= 0.4;
  }
  const uni = g[token];
  const total = stats.moves || 1;
  return uni ? scale((factor * uni) / total) : 0;
}

/** log10 probability → 0 … 1: p = 1 → 1, p = 0.1 → 0.67, p = 0.01 → 0.33, p ≤ 0.001 → 0. */
const scale = (p: number) => Math.max(0, Math.min(1, 1 + Math.log10(Math.max(p, 1e-9)) / 3));
