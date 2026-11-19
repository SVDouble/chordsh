import type { Chord } from './chords';
import { mod12 } from './pitch';
import { voiceChord } from './voicing';

export type VoicingPreset = 'full' | 'shell' | 'rootless' | 'drop2';
export interface VoicingChoice {
  id: VoicingPreset;
  label: string;
  description: string;
  /** Null means this chord cannot supply the required tones without changing its harmony. */
  notes: number[] | null;
}

/** Musical alternatives to the same chord; applying one never changes its symbol or adds a seventh. */
export function voicingChoices(chord: Chord, previous: number[] | null = null): VoicingChoice[] {
  const full = voiceChord(chord, previous);
  const upper = full.slice(1);
  const guides = new Set(
    chord.tones
      .filter((tone) => ['3', 'b3', '4', '2', '7', 'b7', 'bb7'].includes(tone.role))
      .map((tone) => mod12(chord.root + tone.interval)),
  );
  const shell = [full[0], ...upper.filter((note) => guides.has(mod12(note)) && mod12(note) !== mod12(full[0]))];
  const seen = new Set<number>();
  const rootless = full.filter((note) => {
    const pc = mod12(note);
    if (pc === chord.root || seen.has(pc)) return false;
    seen.add(pc);
    return true;
  });
  let close = [...upper];
  if (chord.bass !== chord.root && close.length === 4) {
    if (!close.some((note) => mod12(note) === chord.bass)) close = [];
    else {
      const centre = close.reduce((sum, note) => sum + note, 0) / close.length;
      while (mod12(close[2]) !== chord.bass) close.push(close.shift()! + 12);
      const shiftedCentre = close.reduce((sum, note) => sum + note, 0) / close.length;
      const shift = Math.round((centre - shiftedCentre) / 12) * 12;
      close = close.map((note) => note + shift);
    }
  }
  const drop2 =
    close.length === 4 && new Set(close.map(mod12)).size === 4
      ? [close[2] - 12, close[0], close[1], close[3]].sort((a, b) => a - b)
      : null;
  return [
    {
      id: 'full',
      label: 'Full',
      description: 'Bass plus a close upper voicing, led from the previous hand position.',
      notes: full,
    },
    {
      id: 'shell',
      label: 'Shell',
      description: 'Bass and defining tones: third and seventh, or the suspension. A triad keeps bass and third.',
      notes: shell.length > 1 ? shell : null,
    },
    {
      id: 'rootless',
      label: 'Rootless',
      description: 'Leave out the root; useful when a separate bass or instrument supplies it.',
      notes: rootless.length ? rootless : null,
    },
    {
      id: 'drop2',
      label: 'Drop 2',
      description: drop2
        ? 'Lower the second-highest note of a four-note close voicing by one octave.'
        : 'Needs four distinct chord tones including any specified slash bass. A triad stays a triad; add a seventh in the chord symbol to try this.',
      notes: drop2,
    },
  ];
}
