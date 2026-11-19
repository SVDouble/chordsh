/**
 * Pitch-class utilities.
 *
 * The whole engine works on pitch classes (0–11) and on intervals relative to a
 * reference (a chord root or a key tonic). Rules are therefore transposition
 * invariant: they are written once and apply in every key.
 */
export const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

/** A spelled pitch class: letter index (0 = C … 6 = B) plus accidental (-2 … +2). */
export interface Spelling {
  letter: number;
  acc: number;
}

const ACC: Record<string, string> = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };

export function spellingToString(s: Spelling): string {
  return LETTERS[s.letter] + (ACC[String(s.acc)] ?? '');
}

const toSp = ([letter, acc]: number[]): Spelling => ({ letter, acc });
const SHARP_SP = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]].map(toSp);
const FLAT_SP = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]].map(toSp);

export function plainSpelling(pc: number, preferFlats = false): Spelling {
  return (preferFlats ? FLAT_SP : SHARP_SP)[mod12(pc)];
}

/**
 * Spell `pc` as the note `steps` letters above `ref` (e.g. the 3rd of a chord is
 * two letters above its root). Falls back to a plain spelling if that would need
 * more than a double accidental.
 */
export function spellFrom(ref: Spelling, steps: number, pc: number): Spelling {
  const letter = (((ref.letter + steps) % 7) + 7) % 7;
  let acc = mod12(pc - LETTER_PC[letter]);
  if (acc > 6) acc -= 12;
  if (acc < -2 || acc > 2) return plainSpelling(pc, ref.acc < 0);
  return { letter, acc };
}

export const pcName = (pc: number, preferFlats = false): string => spellingToString(plainSpelling(pc, preferFlats));
export const midiName = (m: number, preferFlats = false): string => pcName(m, preferFlats) + (Math.floor(m / 12) - 1);

/** Default number of letter steps for each semitone interval: 1 ♭2 2 ♭3 3 4 ♯4 5 ♭6 6 ♭7 7. */
export const DEFAULT_STEP = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
export const DEGREE_LABEL = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];
export const INTERVAL_NAME = [
  'unison', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
  'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th',
];
