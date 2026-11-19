import { mod12, spellFrom, spellingToString } from '../theory/pitch';
import { type Chord, chordName, chordOf, isDominant, rootSpelling } from '../theory/chords';
import { DIATONIC_TRIADS } from '../theory/roman';
import type { Chart } from './chart';
import { degreeChord } from './coach';

export interface Hint {
  label: string;
  why: string;
  /** What to play instead of (or around) the written chord, in order. */
  chords: Chord[];
  names: string[];
}

/** Reharmonisation ideas for one chord of a chart, in scale degrees so they work in any key. */
export function reharmHints(chart: Chart, i: number): Hint[] {
  const key = chart.key;
  const cell = chart.chords[i];
  if (!key || !cell) return [];
  const c = cell.chord;
  const prev = chart.chords[i - 1]?.chord ?? null;
  const next = chart.chords[i + 1]?.chord ?? null;
  const nm = (x: Chord) => chordName(x, key);
  /** Spell a °7 from a reference chord (D7 → F♯°7 is its 3rd, E♭ → E°7 a raised root). */
  const dimFrom = (ref: Chord, steps: number, dim: Chord) =>
    spellingToString(spellFrom(rootSpelling(ref, key), steps, dim.root)) + '°7';
  const names = new Map<Chord, string>();
  const deg = mod12(c.root - key.tonic);
  const out: Omit<Hint, 'names'>[] = [];
  const push = (h: Omit<Hint, 'names'>) => out.push(h);

  if (isDominant(c) && next && mod12(next.root - c.root) === 5) {
    const sub = chordOf(c.root + 6, '7');
    push({
      label: 'Tritone sub',
      chords: [sub],
      why: `${nm(sub)} shares ${nm(c)}'s tritone; the bass slides down a half step into ${nm(next)}.`,
    });
    if (!prev || mod12(c.root - prev.root) !== 5) {
      const ii = chordOf(c.root + 7, next.quality === 'min' ? 'm7b5' : 'm7');
      push({
        label: 'Make it a ii–V',
        chords: [ii, c],
        why: `Put ${nm(ii)} in front — split the bar. Dominants love their ii.`,
      });
    }
    const dim = chordOf(c.root + 4, 'dim7');
    names.set(dim, dimFrom(c, 2, dim));
    push({
      label: '°7 instead',
      chords: [dim],
      why: `${names.get(dim)} is ${nm(c)}(♭9) without the root — same pull, smoother voice leading.`,
    });
    push({
      label: 'Add tension',
      chords: [chordOf(c.root, next.quality === 'min' ? '7b9' : '13')],
      why:
        next.quality === 'min'
          ? '♭9 suits a dominant that resolves to minor.'
          : 'The 13 (and 9) add colour without changing the function.',
    });
  }

  const tq = DIATONIC_TRIADS[key.mode][deg];
  const prevIsItsDominant = prev && mod12(c.root - prev.root) === 5 && (isDominant(prev) || prev.quality === 'maj');
  if (deg !== 0 && (tq === 'maj' || tq === 'min') && !prevIsItsDominant && !isDominant(c)) {
    const sec = chordOf(c.root + 7, '7');
    push({
      label: 'Secondary dominant before it',
      chords: [sec, c],
      why: `Approach ${nm(c)} with its own V7 (${nm(sec)}) — the most common way to make a progression move.`,
    });
    if (prev && mod12(c.root - prev.root) === 2) {
      const pass = chordOf(prev.root + 1, 'dim7');
      names.set(pass, dimFrom(prev, 0, pass));
      push({
        label: 'Passing °7',
        chords: [pass, c],
        why: `Between ${nm(prev)} and ${nm(c)} the bass can walk up by half steps through ${names.get(pass)}.`,
      });
    }
  }

  if (deg === 0 && c.quality === (key.mode === 'major' ? 'maj' : 'min')) {
    const vi = degreeChord(key, key.mode === 'major' ? 9 : 3, 'jazz');
    push({
      label: 'Tonic substitute',
      chords: [vi],
      why: `${nm(vi)} shares three notes with ${nm(c)} — same "home" feeling, softer.`,
    });
    if (next && next.root === c.root) {
      const ct = chordOf(c.root, 'dim7');
      names.set(ct, dimFrom(c, 0, ct));
      push({
        label: 'Common-tone °7',
        chords: [c, ct, c],
        why: `On a held tonic, keep ${nm(c).replace(/[^A-G♭♯]/g, '')} and bend the rest a half step for a moment.`,
      });
    }
  }

  if (key.mode === 'major' && deg === 5 && c.quality === 'maj') {
    const iv = chordOf(c.root, 'm6');
    push({
      label: 'Borrowed iv',
      chords: [c, iv],
      why: `Follow ${nm(c)} with ${nm(iv)} (from the parallel minor) before going home — instant nostalgia.`,
    });
  }

  if (c.seventh === 'none' && !c.sixth && (c.quality === 'maj' || c.quality === 'min')) {
    const rich = degreeChord(key, deg, 'jazz');
    if (rich.root === c.root && rich.quality === c.quality)
      push({
        label: 'Add the 7th',
        chords: [rich],
        why: `${nm(rich)} is the diatonic 7th chord here — fuller sound, same function.`,
      });
  }
  return out.slice(0, 5).map((h) => ({ ...h, names: h.chords.map((x) => names.get(x) ?? nm(x)) }));
}
