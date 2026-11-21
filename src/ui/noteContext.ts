import { type Chord, chordName, noteRole } from '../theory/chords';
import { type Key, SCALES, keyLong, spellInKey, tonicSpelling } from '../theory/scales';
import { LETTERS, mod12, plainSpelling, spellingToString } from '../theory/pitch';

/** Explicitly separate chord-root intervals from degrees of the current major/natural-minor key. */
export function noteContext(note: number, chord: Chord | null, key: Key | null) {
  const spelling = key ? spellInKey(mod12(note), key) : plainSpelling(note);
  const pitchName = spellingToString(spelling);
  const natural = [0, 2, 4, 5, 7, 9, 11][spelling.letter];
  const octave = Math.floor((note - natural - spelling.acc) / 12) - 1;
  const name = `${pitchName}${octave}`;
  const role = chord ? noteRole(chord, note) : null;
  let degree: string | null = null;
  if (key) {
    const index = (spelling.letter - tonicSpelling(key).letter + 7) % 7;
    const expected = SCALES[key.mode === 'major' ? 'ionian' : 'aeolian'][index];
    let difference = mod12(note - key.tonic - expected);
    if (difference > 6) difference -= 12;
    degree = `${difference < 0 ? '♭'.repeat(-difference) : '♯'.repeat(difference)}${index + 1}`;
  }
  const harmony = chord ? chordName(chord, key) : null;
  const description = [
    name,
    role && harmony ? `${role.label === 'R' ? 'root' : role.label} of ${harmony}` : null,
    degree && key ? `scale degree ${degree} in ${keyLong(key)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return { name, pitchName, letter: LETTERS[spelling.letter], role, degree, chordName: harmony, description };
}
