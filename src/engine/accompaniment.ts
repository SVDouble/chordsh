import { mod12 } from '../theory/pitch';
import { parseChordSymbol } from '../theory/symbols';

interface Hit {
  at: number;
  beats: number;
  part: 'chord' | 'bass';
  voices: number[] | 'all';
  velocity: number;
  strum?: boolean;
}

export interface PlaybackStyle {
  id: string;
  name: string;
  group: string;
  description: string;
  cycle: number;
  swing: number;
  hits: Hit[];
}

const comp = (positions: number[], beats = 0.45, strum = false): Hit[] =>
  positions.map((at, i) => ({ at, beats, part: 'chord', voices: 'all', velocity: i % 2 ? 0.9 : 1, strum }));
const bass = (positions: number[], voices = [0], beats = 0.8): Hit[] =>
  positions.map((at, i) => ({ at, beats, part: 'bass', voices: [voices[i % voices.length]], velocity: 1 }));
const arp = (voices: number[], step = 0.5, cycle = 4): Hit[] =>
  Array.from({ length: Math.ceil(cycle / step) }, (_, i) => ({
    at: i * step,
    beats: step * 1.4,
    part: 'chord' as const,
    voices: [voices[i % voices.length]],
    velocity: i % 2 ? 0.86 : 1,
  })).filter((hit) => hit.voices[0] >= 0);
const split = (parts: number[][], step = 0.5): Hit[] =>
  Array.from({ length: Math.ceil(4 / step) }, (_, i) => ({
    at: i * step,
    beats: step * 0.9,
    part: 'chord',
    voices: parts[i % parts.length],
    velocity: i % 2 ? 0.85 : 1,
  }));
const eighths = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const quarters = [0, 1, 2, 3];
const preset = (
  id: string,
  name: string,
  group: string,
  description: string,
  hits: Hit[],
  cycle = 4,
  swing = 0.5,
): PlaybackStyle => ({ id, name, group, description, hits, cycle, swing });

/** Names surveyed from OneMotion's public style chooser. Musical generators are implemented here. */
export const PLAYBACK_STYLES: PlaybackStyle[] = [
  preset('once', 'Once', 'Basic', 'Play the written voicing once and hold it.', []),
  preset('basic-1', 'Basic 1', 'Basic', 'Alternating upper voices and the lowest chord tone.', [
    ...split([[1, 2], [0]]),
    ...bass([0], [0], 4),
  ]),
  preset('basic-2', 'Basic 2', 'Basic', 'Flowing up-and-back eighth-note arpeggio.', [
    ...arp([0, 1, 2, 1]),
    ...bass([0], [0], 4),
  ]),
  preset('basic-3', 'Basic 3', 'Basic', 'A skipping arpeggio with a mirrored second half.', [
    ...arp([0, 2, 1, 2, 2, 1, 2, 0]),
    ...bass([0], [0], 4),
  ]),
  preset('basic-4', 'Basic 4', 'Basic', 'A rising six-note figure over held bass.', [
    ...arp([0, 1, 2, 0, 1, 3]),
    ...bass([0], [0], 4),
  ]),
  preset(
    'pop-1',
    'Pop 1',
    'Pop & dance',
    'Shuffle chords with a moving root-and-fifth bass.',
    [...comp(quarters, 0.65), ...bass(eighths, [0, 0, 1, 2, 0, 1, 3, 1], 0.4)],
    4,
    2 / 3,
  ),
  preset('pop-2', 'Pop 2', 'Pop & dance', 'Broken chords with a light sixteenth-note pickup.', [
    ...arp([0, 1, 2, 1, 0, 2, 1, 3], 0.25),
    ...bass([0, 1.75, 2, 3.5], [0, 1, 0, 2]),
  ]),
  preset('pop-3', 'Pop 3', 'Pop & dance', 'Syncopated piano stabs over a pulsing bass.', [
    ...comp([0, 0.75, 1.5, 2, 2.75, 3.5], 0.35),
    ...bass([0, 0.5, 1.5, 2, 2.5, 3.75], [0, 0, 1, 0, 2, 1], 0.35),
  ]),
  preset('pop-4', 'Pop 4', 'Pop & dance', 'A sparse broken-chord hook and steady bass.', [
    ...arp([0, -1, 2, 1, -1, 3, 1, 2], 0.25),
    ...bass(eighths, [0, 0, 1, 0, 2, 0, 1, 0], 0.4),
  ]),
  preset('dance-1', 'Dance 1', 'Pop & dance', 'Offbeat stabs with an octave-pumping bass.', [
    ...comp([0.5, 1.5, 2.5, 3.5], 0.3),
    ...bass(eighths, [0, 2], 0.35),
  ]),
  preset('dance-2', 'Dance 2', 'Pop & dance', 'Sixteenth-note chord pulses and an octave pickup.', [
    ...comp([0, 0.75, 1, 1.75, 2, 2.75, 3, 3.5, 3.75], 0.18),
    ...bass([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.75], [0, 2, 0, 2], 0.3),
  ]),
  preset('rock-1', 'Rock 1', 'Rock', 'Driving eighth-note chords and root/fifth bass.', [
    ...comp(eighths, 0.4),
    ...bass(quarters, [0, 0, 1, 0]),
  ]),
  preset('rock-2', 'Rock 2', 'Rock', 'Backbeat chords over a busier bass riff.', [
    ...comp([0, 1, 2.5, 3], 0.65),
    ...bass(eighths, [0, 0, 2, 1, 0, 0, 1, 3], 0.4),
  ]),
  preset('rock-3', 'Rock 3', 'Rock', 'A tight, syncopated sixteenth-note riff.', [
    ...split([[0, 2], [0], [1, 2], [0]], 0.25),
    ...bass([0, 0.75, 1.5, 2, 2.75, 3.5], [0, 0, 1], 0.4),
  ]),
  preset('rock-4', 'Rock 4', 'Rock', 'Open half-bar chords over repeated octaves.', [
    ...comp([0, 2], 1.8),
    ...bass(eighths, [0, 2], 0.4),
  ]),
  preset(
    'swing-1',
    'Swing 1',
    'Swing & waltz',
    'Swung piano comping with a walking bass.',
    [...comp([0, 1.5, 2.5, 3.5], 0.45), ...bass(quarters, [0, 3, 1, 2])],
    4,
    2 / 3,
  ),
  preset(
    'swing-2',
    'Swing 2',
    'Swing & waltz',
    'An answering swung chord figure and walking bass.',
    [...comp([0.5, 1, 2.5, 3], 0.4), ...bass(eighths, [0, 3, 1, 2, 0, 1, 3, 2], 0.45)],
    4,
    2 / 3,
  ),
  preset(
    'waltz-1',
    'Waltz',
    'Swing & waltz',
    'Bass followed by two light chord answers.',
    [...comp([1, 2], 0.7), ...bass([0], [0], 1.4)],
    3,
  ),
  preset(
    'jazz-waltz-1',
    'Jazz Waltz',
    'Swing & waltz',
    'A swung three-pulse bass-and-chord conversation.',
    [...comp([0.5, 1.5, 2.5], 0.4), ...bass([0, 1, 2], [0, 1, 3], 0.7)],
    3,
    2 / 3,
  ),
  preset(
    'reggae-1',
    'Reggae',
    'World',
    'Short offbeat skanks over a spacious bass.',
    [...comp([0.5, 1.5, 2.5, 3.5], 0.18), ...bass([0, 1.5, 2.75], [0, 1, 0], 0.7)],
    4,
    2 / 3,
  ),
  preset(
    'salsa-1',
    'Salsa 1',
    'Latin',
    'A 3–2 clave chord rhythm and anticipated bass.',
    [...comp([0, 1.5, 3, 5, 6], 0.5), ...bass([0, 2.5, 3.5, 4, 6.5, 7.5], [0, 1, 0], 0.8)],
    8,
  ),
  preset(
    'salsa-2',
    'Salsa 2',
    'Latin',
    'A 2–3 clave with an answering broken chord.',
    [...comp([1, 2, 4, 5.5, 7], 0.5), ...arp([0, 2, 1, 3], 1, 8), ...bass([0, 2.5, 4, 6.5, 7.5], [0, 1], 0.8)],
    8,
  ),
  preset('bossa-nova-1', 'Bossa Nova 1', 'Latin', 'Soft syncopated chords and alternating bass.', [
    ...comp([0, 1.5, 2.5, 3.5], 0.65),
    ...bass([0, 1.5, 2, 3.5], [0, 1], 0.65),
  ]),
  preset('bossa-nova-2', 'Bossa Nova 2', 'Latin', 'An alternate bossa phrase with a late answer.', [
    ...comp([0.5, 1.5, 2, 3.25], 0.5),
    ...bass([0, 1.75, 2.5, 3.5], [0, 1, 0, 2], 0.6),
  ]),
  preset('samba-1', 'Samba', 'Latin', 'Bright offbeats and short alternating bass.', [
    ...comp([0.5, 1.25, 2, 2.75, 3.5], 0.3),
    ...bass(eighths, [0, 1, 0, 2], 0.3),
  ]),
  preset('merengue-1', 'Merengue', 'Latin', 'A brisk two-pulse pattern with running chord tones.', [
    ...arp([0, 2, 1, 2], 0.25),
    ...bass(eighths, [0, 1], 0.35),
  ]),
  preset('cumbia-1', 'Cumbia', 'Latin', 'Alternating bass and offbeat chord answers.', [
    ...comp([0.5, 1.5, 2.5, 3.5], 0.45),
    ...bass([0, 1, 2, 3], [0, 1], 0.65),
  ]),
  preset('reggaeton-1', 'Reggaeton', 'Latin', 'A clipped dembow-like chord rhythm.', [
    ...comp([0, 0.75, 1.5, 2, 2.75, 3.5], 0.25),
    ...bass([0, 1.5, 2, 3.5], [0, 1, 0, 2], 0.5),
  ]),
  preset('tango-1', 'Tango', 'Latin', 'A firm habanera bass beneath accented chords.', [
    ...comp([0, 1.5, 2, 3], 0.45),
    ...bass([0, 0.75, 1, 1.5, 2, 2.75, 3, 3.5], [0, 1, 0, 2], 0.4),
  ]),
  preset(
    'flamenco-1',
    'Flamenco 1',
    'Latin',
    'A three-pulse strum with alternating bass.',
    [...comp([0, 1, 2], 0.5, true), ...bass([0, 1.5], [0, 1], 0.7)],
    3,
  ),
  preset(
    'flamenco-2',
    'Flamenco 2',
    'Latin',
    'Six-part strumming with cross accents.',
    [...comp([0, 0.5, 1, 1.5, 2, 2.5], 0.28, true), ...bass([0, 1, 2], [0, 1, 2], 0.6)],
    3,
  ),
  preset('flamenco-3', 'Flamenco 3', 'Latin', 'A fast rolled-chord flourish over steady bass.', [
    ...comp([0, 0.75, 1.5, 2, 2.75, 3.25, 3.5, 3.75], 0.22, true),
    ...bass(quarters, [0, 1]),
  ]),
  preset('ragtime-1', 'Ragtime', 'Roots', 'Syncopated upper chords over stride bass.', [
    ...comp([0.5, 1.5, 2.5, 3.5], 0.35),
    ...bass(quarters, [0, 1, 2, 1]),
  ]),
  preset(
    'country-1',
    'Country 1',
    'Roots',
    'A shuffled boom-chuck root-and-fifth pattern.',
    [...comp([1, 3], 0.55), ...bass(quarters, [0, 1], 0.7)],
    4,
    2 / 3,
  ),
  preset(
    'country-2',
    'Country 2',
    'Roots',
    'A picked country figure with alternating bass.',
    [...arp([0, 2, 1, 3]), ...bass(quarters, [0, 1, 0, 3], 0.6)],
    4,
    2 / 3,
  ),
  preset(
    'polyrhythm-1',
    'Polyrhythm',
    'Picking & strumming',
    'Three chord pulses against two bass pulses.',
    [...arp([0, 2], 1, 3), ...bass([0, 1.5], [0, 1], 1)],
    3,
  ),
  preset('straddle-run-1', 'Straddle run', 'Picking & strumming', 'A wide alternating chord-tone run.', [
    ...arp([0, 2, 1, 3, 0, 3, 1, 2]),
    ...bass([0], [0], 4),
  ]),
  preset('strumming-1', 'Strumming 1', 'Picking & strumming', 'Even down-and-up eighth-note strums.', [
    ...comp(eighths, 0.42, true),
    ...bass([0], [0], 4),
  ]),
  preset('strumming-2', 'Strumming 2', 'Picking & strumming', 'A syncopated down-and-up strumming groove.', [
    ...comp([0, 1, 1.5, 2.5, 3, 3.5], 0.4, true),
    ...bass([0], [0], 4),
  ]),
  preset(
    'boogie-1',
    'Boogie',
    'Roots',
    'Swung chords over a rolling boogie bass.',
    [...comp([0, 1.5, 2, 3.5], 0.45), ...bass(eighths, [0, 3, 1, 4, 5, 4, 1, 3], 0.45)],
    4,
    2 / 3,
  ),
  preset(
    'funk-1',
    'Funk 1',
    'Funk',
    'Backbeat stabs and a tight, syncopated root riff.',
    [...comp([1, 3], 0.18), ...bass([0, 0.75, 1.5, 2, 2.75, 3.5], [0, 0, 2], 0.2)],
    4,
    2 / 3,
  ),
  preset(
    'funk-2',
    'Funk 2',
    'Funk',
    'Backbeat chords with octave bass answers.',
    [...comp([1, 3], 0.22), ...bass([0, 0.5, 1.75, 2.5, 3.25, 3.75], [0, 2, 1], 0.18)],
    4,
    2 / 3,
  ),
  preset(
    'funk-3',
    'Funk 3',
    'Funk',
    'Clipped backbeats and a busy, low bass phrase.',
    [...comp([1, 3], 0.16), ...bass([0, 0.25, 0.75, 1.5, 2, 2.75, 3.25], [0, 0, 3, 1], 0.16)],
    4,
    2 / 3,
  ),
  preset(
    'funk-4',
    'Funk 4',
    'Funk',
    'Space between backbeats with a late bass pickup.',
    [...comp([1, 3], 0.28), ...bass([0, 1.25, 1.75, 2.5, 3.5, 3.75], [0, 1, 2, 0], 0.2)],
    4,
    2 / 3,
  ),
  preset(
    'funk-5',
    'Funk 5',
    'Funk',
    'Sixteenth-note split chords and syncopated bass.',
    [...split([[1, 2], [0], [2], [0, 1]], 0.25), ...bass([0, 0.75, 1.75, 2.25, 3, 3.75], [0, 2, 1], 0.18)],
    4,
    2 / 3,
  ),
  preset('melodic-1', 'Melodic 1', 'Melodic', 'A spacious upper melody over moving bass.', [
    ...arp([3, 2], 2),
    ...bass(eighths, [0, 3, 1, 2], 0.65),
  ]),
  preset('melodic-2', 'Melodic 2', 'Melodic', 'A rising and falling chord-tone melody.', [
    ...arp([0, 1, 2, 3, 2, 1]),
    ...bass([0], [0], 4),
  ]),
  preset('melodic-3', 'Melodic 3', 'Melodic', 'An ornamented sixteenth-note melody.', [
    ...arp([0, 2, 1, 2, 3, 2, 1, 3], 0.25),
    ...bass([0], [0], 4),
  ]),
  preset('melodic-4', 'Melodic 4', 'Melodic', 'A high-register answer to alternating bass.', [
    ...arp([2, 3, 1, 2, 3, 1, 0, 2]),
    ...bass(quarters, [0, 1, 3, 2]),
  ]),
  preset('melodic-5', 'Melodic 5', 'Melodic', 'A descending melodic figure over held bass.', [
    ...arp([3, 2, 1, 0, 2, 1, 0, 1]),
    ...bass([0], [0], 4),
  ]),
  preset('melodic-6', 'Melodic 6', 'Melodic', 'An arch-shaped melody with an extended top note.', [
    ...arp([0, 1, 2, 3, 4, 3, 2, 1]),
    ...bass([0], [0], 4),
  ]),
  preset('melodic-7', 'Melodic 7', 'Melodic', 'A three-tone cross-pattern in sixteenths.', [
    ...arp([0, 1, 2, 1, 2, 0], 0.25),
    ...bass(eighths, [0, 1, 2, 1], 0.55),
  ]),
  preset('melodic-8', 'Melodic 8', 'Melodic', 'An alternating upper melody and bass countermotion.', [
    ...arp([0, 3, 1, 4, 2, 3, 1, 2]),
    ...bass(eighths, [2, 1, 3, 0], 0.5),
  ]),
  preset('modulation-1', 'Mod 1', 'Modulation', 'A repeating three-accent chord pulse.', [
    ...comp([0, 0.75, 1.5, 2.25, 3], 0.3),
    ...bass(quarters, [0, 2]),
  ]),
  preset('modulation-2', 'Mod 2', 'Modulation', 'Five evenly spaced chord pulses against bass.', [
    ...comp([0, 0.8, 1.6, 2.4, 3.2], 0.32),
    ...bass([0, 2], [0, 1], 1),
  ]),
  preset('modulation-3', 'Mod 3', 'Modulation', 'A rotating six-part split-voice pulse.', [
    ...arp([0, 2, 1, 3, 1, 2], 2 / 3),
    ...bass([0, 1.5, 3], [0, 1, 2]),
  ]),
  preset('modulation-4', 'Mod 4', 'Modulation', 'A seven-part arpeggio against four bass beats.', [
    ...arp([0, 2, 1, 3, 2, 1, 0], 4 / 7),
    ...bass(quarters, [0, 1, 3, 2]),
  ]),
];

export const STYLE_GROUPS = [...new Set(PLAYBACK_STYLES.map((style) => style.group))];
export const playbackStyle = (id = 'once') => PLAYBACK_STYLES.find((style) => style.id === id) ?? PLAYBACK_STYLES[0];
export const validPlaybackStyle = (id: unknown): id is string => PLAYBACK_STYLES.some((style) => style.id === id);

export interface BarStyle {
  /** Zero-based bar index, independent of chord positions. */
  bar: number;
  style: string;
}
/** A style marker: from this bar onward, play in this style (until the next marker). */
export interface StyleMark {
  /** Zero-based bar index. */
  bar: number;
  style: string;
}
interface Arrangement {
  bpm: number;
  meter: number;
  denominator?: number;
  /** The opening style (and the style of songs without markers). */
  style?: string;
  /** One-bar overrides (older songs); the app converts them to markers on load. */
  barStyles?: BarStyle[];
  styleMarks?: StyleMark[];
  steps: { start: number; beats: number; notes: number[]; velocity: number; symbol: string }[];
}
interface PerformanceOptions {
  gate: number;
  accompanimentBassLevel: number;
  accompanimentBassOctave: number;
  accompanimentStrumMs: number;
  accompanimentSwing: string;
}
/** The style of a bar: a one-bar override, else the last marker at or before it, else the song style. */
export const barPlaybackStyle = (song: Pick<Arrangement, 'style' | 'barStyles' | 'styleMarks'>, bar: number) =>
  playbackStyle(
    song.barStyles?.find((entry) => entry.bar === bar)?.style ??
      song.styleMarks?.findLast((mark) => mark.bar <= bar)?.style ??
      song.style,
  );

/**
 * One-bar overrides as markers, with the same sound: an override on bar 5 becomes "bar 5: its style" plus
 * "bar 6: back to what played before", unless bar 6 has its own override. Markers that change nothing are dropped.
 */
export function marksFromBarStyles(song: Pick<Arrangement, 'style' | 'barStyles' | 'styleMarks'>): StyleMark[] {
  const overrides = new Map((song.barStyles ?? []).map((e) => [e.bar, e.style]));
  const base = (bar: number) => song.styleMarks?.findLast((m) => m.bar <= bar)?.style ?? song.style ?? 'once';
  const marks = new Map((song.styleMarks ?? []).map((m) => [m.bar, m.style]));
  for (const [bar, style] of overrides) {
    marks.set(bar, style);
    if (!overrides.has(bar + 1) && !marks.has(bar + 1)) marks.set(bar + 1, base(bar + 1));
  }
  const out: StyleMark[] = [];
  let current = song.style ?? 'once';
  for (const [bar, style] of [...marks].sort((a, b) => a[0] - b[0]))
    if (style !== current) {
      out.push({ bar, style });
      current = style;
    }
  return out;
}

/** Deterministic musical events; times are milliseconds, shared by preview, transport and MIDI export. */
export function accompanimentNotes(song: Arrangement, options: PerformanceOptions): [number, number, number, number][] {
  const quarterMs = 60000 / song.bpm;
  const barLength = (song.meter * 4) / (song.denominator ?? 4);
  const output: [number, number, number, number][] = [];
  for (const chord of song.steps) {
    const end = chord.start + chord.beats;
    let at = chord.start;
    const symbol = parseChordSymbol(chord.symbol);
    const low = 12 * (options.accompanimentBassOctave + 1);
    const root = low + (symbol?.root ?? mod12(chord.notes[0]));
    const bassRoot = low + (symbol?.bass ?? mod12(chord.notes[0]));
    const third = symbol?.tones.find((tone) => tone.step === 2)?.interval ?? 4;
    const fifth = symbol?.tones.find((tone) => tone.step === 4)?.interval ?? 7;
    const bassNotes = [bassRoot, root + fifth, bassRoot + 12, root + third, root + 9, root + 10];
    while (at < end - 1e-8) {
      const bar = Math.floor((at + 1e-8) / barLength);
      const style = barPlaybackStyle(song, bar);
      let sliceEnd = Math.min(end, (bar + 1) * barLength);
      if (style.id === 'once') {
        // Keep legacy held voicings intact across adjacent unstyled bars.
        while (sliceEnd < end - 1e-8 && barPlaybackStyle(song, Math.round(sliceEnd / barLength)).id === 'once')
          sliceEnd = Math.min(end, sliceEnd + barLength);
        for (const note of chord.notes)
          output.push([at * quarterMs, (sliceEnd - at) * quarterMs * options.gate, note, chord.velocity]);
      } else {
        const scale = barLength / style.cycle;
        const swing = options.accompanimentSwing === 'preset' ? style.swing : Number(options.accompanimentSwing);
        const swung = (beat: number) => {
          const whole = Math.floor(beat);
          const fraction = beat - whole;
          return whole + (fraction < 0.5 ? fraction * 2 * swing : swing + (fraction - 0.5) * 2 * (1 - swing));
        };
        const before = output.length;
        for (const hit of style.hits) {
          const start = bar * barLength + swung(hit.at) * scale;
          if (start < at - 1e-8 || start >= sliceEnd - 1e-8) continue;
          const available = (sliceEnd - start) * quarterMs;
          const duration = Math.min(hit.beats * scale * quarterMs * options.gate, available);
          const notes = hit.part === 'bass' ? bassNotes : chord.notes;
          const voices = hit.voices === 'all' ? notes : hit.voices.map((i) => notes[i % notes.length]);
          const ordered = hit.strum && Math.floor(hit.at * 2) % 2 ? [...voices].reverse() : voices;
          const level = hit.part === 'bass' ? options.accompanimentBassLevel : 1;
          if (level === 0) continue;
          const velocity = Math.max(1, Math.min(127, Math.round(chord.velocity * hit.velocity * level)));
          [...new Set(ordered)].forEach((note, i) => {
            const delay = hit.strum ? Math.min(i * options.accompanimentStrumMs, duration * 0.5) : 0;
            output.push([start * quarterMs + delay, duration - delay, Math.max(0, Math.min(127, note)), velocity]);
          });
        }
        // Very short off-grid chords still get a sounding attack.
        if (output.length === before)
          for (const note of chord.notes)
            output.push([at * quarterMs, (sliceEnd - at) * quarterMs * options.gate, note, chord.velocity]);
      }
      at = sliceEnd;
    }
  }
  // Retriggers of a pitch release its previous attack before starting the next, in every output backend.
  output.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const last = new Map<number, [number, number, number, number]>();
  const merged: typeof output = [];
  for (const event of output) {
    const previous = last.get(event[2]);
    if (previous && Math.abs(previous[0] - event[0]) < 1e-6) {
      previous[1] = Math.max(previous[1], event[1]);
      previous[3] = Math.max(previous[3], event[3]);
      continue;
    }
    if (previous) previous[1] = Math.min(previous[1], event[0] - previous[0]);
    merged.push(event);
    last.set(event[2], event);
  }
  return merged;
}
