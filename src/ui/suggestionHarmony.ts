import { mod12 } from '../theory/pitch';
import { analyzeRoman, borrowedSource, DIATONIC_TRIADS, type Roman } from '../theory/roman';
import { parseChordSymbol } from '../theory/symbols';
import {
  ALL_KEYS,
  fifthsDistance,
  type Key,
  keyLong,
  keyPcSet,
  keyShort,
  nameInKey,
  SCALE_LABEL,
  tonicName,
} from '../theory/scales';
import { type Chord, chordName, chordOf, chordPcs } from '../theory/chords';

export const schemaTitle = (name: string) => name.replace(/ [♭IViv]+(?:–[♭IViv]+)+$/u, '');

/** A useful move to try when the slot has no surrounding chords. */
export function openingUse(chord: Chord, key: Key, roman: Roman | undefined) {
  if (roman?.kind !== 'diatonic') return;
  const tonic = keyShort(key);
  switch (mod12(chord.root - key.tonic)) {
    case 2:
      return `Prepares ${nameInKey(key.tonic + 7, key)}`;
    case 3:
    case 4: {
      const home = chordPcs(chordOf(key.tonic, key.mode === 'minor' ? 'min' : 'maj'));
      const shared = chordPcs(chord).filter((pc) => home.includes(pc));
      if (shared.length) return `Shares ${shared.map((pc) => nameInKey(pc, key)).join(', ')} with ${tonic}`;
      break;
    }
    case 5:
      return `Plagal route to ${tonic}`;
    case 7:
      if (chord.quality === 'maj') return `Pulls to ${tonic}`;
      break;
    case 9:
      if (key.mode === 'major' && chord.quality === 'min') return 'Relative minor';
      break;
    case 11:
      if (chord.quality === 'dim') return `Leading tone to ${tonic}`;
      break;
  }
}

export function chordConnection(chord: Chord, key: Key, prev: Chord | null, next: Chord | null) {
  const pitches = chordPcs(chord);
  for (const neighbor of [next, prev]) {
    if (!neighbor || (neighbor.root === chord.root && neighbor.suffix === chord.suffix)) continue;
    const other = chordPcs(neighbor);
    const shared = pitches.filter((pc) => other.includes(pc)).map((pc) => nameInKey(pc, key));
    if (shared.length) return `Shared with ${chordName(neighbor, key)} · ${shared.join(', ')}`;
  }
  if (next && chord.bass !== next.bass) return `Bass ${nameInKey(chord.bass, key)} → ${nameInKey(next.bass, key)}`;
  if (prev && prev.bass !== chord.bass) return `Bass ${nameInKey(prev.bass, key)} → ${nameInKey(chord.bass, key)}`;
}

function colourTag(chord: Chord, roman: Roman, key: Key, next?: Chord) {
  const pitchClasses = [...new Set([...chordPcs(chord), chord.bass])];
  const scale = keyPcSet(key);
  const outside = pitchClasses.filter((pc) => !scale.has(pc));
  if (!outside.length) return;

  const degree = roman.targetDeg;
  if (degree !== undefined) {
    const root = mod12(key.tonic + degree);
    const target =
      next?.root === root
        ? chordName(next, key)
        : nameInKey(root, key) + (DIATONIC_TRIADS[key.mode][degree] === 'min' ? 'm' : '');
    if (roman.kind === 'secondary-dominant') return `V of ${target}`;
    if (roman.kind === 'secondary-leading-tone') return `Leads to ${target}`;
    if (roman.kind === 'tritone-sub') return `Tritone sub → ${target}`;
  }
  if (roman.kind === 'backdoor') return `Backdoor → ${tonicName(key)}`;
  if (roman.kind === 'neapolitan') return 'Neapolitan ♭II';
  if (roman.kind === 'chromatic-mediant') return 'Chromatic mediant';

  // Scale fit names one nearby possibility, without claiming the song changed key.
  if (roman.kind !== 'diatonic') {
    const nearby = ALL_KEYS.filter((candidate) => pitchClasses.every((pc) => keyPcSet(candidate).has(pc))).sort(
      (a, b) => fifthsDistance(a, key) - fifthsDistance(b, key),
    )[0];
    if (nearby) return `Fits ${keyLong(nearby)}`;
  }
  return `Outside ${outside.map((pc) => nameInKey(pc, key)).join(', ')}`;
}

export function suggestionHarmony(names: string[], key: Key | null, prev: Chord | null, next: Chord | null) {
  const proposed = names.map(parseChordSymbol).filter((chord): chord is Chord => chord !== null);
  if (!key || !proposed.length || proposed.length !== names.length)
    return { tags: [], colourTags: [], borrowedFrom: [], proposed: [] };
  const chords = [...(prev ? [prev] : []), ...proposed, ...(next ? [next] : [])];
  const numerals = chords.map((chord, i) => analyzeRoman(chord, key, chords[i + 1]));
  const degrees = chords.map((chord) => mod12(chord.root - key.tonic));
  const tags = new Set<string>();
  for (let i = 1; i < chords.length; i++) {
    const from = degrees[i - 1];
    const to = degrees[i];
    const previous = numerals[i - 1];
    const current = numerals[i];
    if (from === 7 && previous.func === 'D' && to === 0 && current.func === 'T') tags.add('Dominant resolution');
    else if (from === 5 && to === 0 && current.func === 'T' && /^(IV|iv)(6|7|$)/.test(previous.numeral))
      tags.add('Plagal return');
    else if (from === 7 && previous.func === 'D' && to === (key.mode === 'major' ? 9 : 8))
      tags.add('Deceptive resolution');
    else if (from === 2 && to === 7 && current.func === 'D') tags.add('ii–V preparation');
    else if (previous.targetDeg === to && previous.kind === 'secondary-dominant') tags.add('Secondary dominant');
    else if (previous.func === 'PD' && current.func === 'D') tags.add('Builds tension');
    else if (previous.func === 'T' && current.func === 'PD') tags.add('Leaves tonic');
    else if (previous.func === 'T' && current.func === 'T' && to !== from) tags.add('Tonic substitute');
  }
  if (!prev && degrees[0] === 0 && numerals[0].func === 'T') tags.add('Tonic opening');
  const start = prev ? 1 : 0;
  const colours = new Set<string>();
  const borrowing = new Map<string, Set<string>>();
  const borrowedFrom = proposed.map((chord, index) => {
    const at = start + index;
    const source = numerals[at].kind === 'borrowed' ? borrowedSource(chord, key) : null;
    if (source) {
      const from = `${tonicName(key)} ${source === 'aeolian' ? 'minor' : SCALE_LABEL[source]}`;
      const members = borrowing.get(from) ?? new Set<string>();
      members.add(names[index]);
      borrowing.set(from, members);
      return from;
    }
    const tag = colourTag(chord, numerals[at], key, chords[at + 1]);
    if (tag) colours.add(proposed.length > 1 ? `${names[index]} · ${tag}` : tag);
    return null;
  });
  return {
    tags: [...tags],
    colourTags: [
      ...[...borrowing].map(([source, members]) => ({
        label: `From ${source}`,
        title: `${[...members].join(', ')} · Borrowed from ${source}`,
        tone: 'colour' as const,
      })),
      ...[...colours].map((label) => ({ label, tone: 'colour' as const })),
    ],
    borrowedFrom,
    proposed: numerals.slice(start, start + proposed.length),
  };
}
