import { DEFAULT_SETTINGS, MUSIC_LIMITS, editorSchema, type EditorSettings } from '../config/settings';
import { analyzeChart, parseChart, type Chart } from './chart';
import { chordName } from '../theory/chords';
import { barQuarters, meterPosition, validateMeter, type TimeSignature } from '../theory/meter';
import { mod12 } from '../theory/pitch';
import type { Key } from '../theory/scales';
import { parseChordSymbol } from '../theory/symbols';
import { voiceChord } from '../theory/voicing';
import { analyzeRoman } from '../theory/roman';
import type { Piece } from '../library/pieces';
import {
  accompanimentNotes,
  marksFromBarStyles,
  validPlaybackStyle,
  type BarStyle,
  type StyleMark,
} from './accompaniment';

export interface SequenceStep {
  id: string;
  symbol: string;
  /** Absolute position and duration in quarter notes, independent of time signature. */
  start: number;
  beats: number;
  notes: number[];
  velocity: number;
  section?: string;
  key?: Key;
}

export interface KeyRegion {
  id: string;
  start: number;
  key: Key | null;
  label?: string;
}

export interface Sequence {
  id: string;
  title: string;
  bpm: number;
  meter: number;
  /** Bottom number; absent in legacy songs means 4. Positions/durations stay in quarter notes. */
  denominator?: number;
  key: Key | null;
  steps: SequenceStep[];
  regions?: KeyRegion[];
  /** Accompaniment is musical presentation, separate from analysis/coaching vocabulary. */
  style?: string;
  barStyles?: BarStyle[];
  /** From each marker's bar onward, the accompaniment plays its style (like key regions, for playback). */
  styleMarks?: StyleMark[];
  /** The tune, separate from the chords: what the harmony has to fit (see engine/assist.ts). */
  melody?: MelodyNote[];
}

/** A melody note in quarter notes, like chord steps. */
export interface MelodyNote {
  start: number;
  beats: number;
  pitch: number;
  velocity: number;
}

/** Checks and orders melody notes; throws on anything that cannot be played. */
export function validMelody(notes: MelodyNote[]): MelodyNote[] {
  for (const n of notes)
    if (
      !Number.isFinite(n.start) ||
      n.start < 0 ||
      !Number.isFinite(n.beats) ||
      n.beats <= 0 ||
      !Number.isInteger(n.pitch) ||
      n.pitch < 0 ||
      n.pitch > 127 ||
      !Number.isInteger(n.velocity) ||
      n.velocity < 1 ||
      n.velocity > 127
    )
      throw new Error('Melody notes need a position, a positive length, a MIDI pitch and a velocity.');
  return [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch).map((n) => ({ ...n }));
}

export interface ChordInput {
  symbol: string;
  beats?: number;
  notes?: number[];
  velocity?: number;
  section?: string;
  key?: Key;
}

export function emptySequence(
  title = 'Untitled',
  id: string = crypto.randomUUID(),
  settings: EditorSettings = DEFAULT_SETTINGS.editor,
): Sequence {
  return {
    id,
    title,
    bpm: settings.newTempo,
    meter: settings.newMeter,
    denominator: settings.newDenominator,
    key: { tonic: 0, mode: 'major' },
    steps: [],
    style: settings.newPlaybackStyle,
  };
}

export function sequenceRegions(sequence: Sequence): KeyRegion[] {
  if (sequence.regions?.length) return sequence.regions;
  const regions: KeyRegion[] = [{ id: `${sequence.id}:key:0`, start: 0, key: sequence.key }];
  for (const step of sequence.steps)
    if (step.key && JSON.stringify(step.key) !== JSON.stringify(regions.at(-1)!.key))
      if (regions.at(-1)!.start === step.start) regions[regions.length - 1] = { ...regions.at(-1)!, key: step.key };
      else regions.push({ id: `${sequence.id}:key:${step.start}`, start: step.start, key: step.key });
  return regions;
}

export function sequenceKeyAt(sequence: Sequence, beat: number): Key | null {
  return sequenceRegions(sequence).findLast((r) => r.start <= beat + 1e-8)?.key ?? null;
}

function step(
  input: ChordInput,
  previous: number[] | null,
  defaultBeats: number,
  velocityDefault: number,
): SequenceStep {
  const chord = parseChordSymbol(input.symbol.trim());
  if (!chord) throw new Error(`Can't read chord: ${input.symbol}`);
  const beats = input.beats ?? defaultBeats;
  if (!Number.isFinite(beats) || beats < MUSIC_LIMITS.minChordBeats || beats > MUSIC_LIMITS.maxChordBeats)
    throw new Error(`Duration must be between ${MUSIC_LIMITS.minChordBeats} and ${MUSIC_LIMITS.maxChordBeats} beats.`);
  const notes = [...new Set(input.notes ?? voiceChord(chord, previous))].sort((a, b) => a - b);
  if (!notes.length || notes.some((n) => !Number.isInteger(n) || n < 0 || n > 127))
    throw new Error('Voicing needs MIDI notes from 0 to 127.');
  const velocity = input.velocity ?? velocityDefault;
  if (!Number.isInteger(velocity) || velocity < 1 || velocity > 127) throw new Error('Velocity must be from 1 to 127.');
  if (
    input.key &&
    (!Number.isInteger(input.key.tonic) ||
      input.key.tonic < 0 ||
      input.key.tonic > 11 ||
      !['major', 'minor'].includes(input.key.mode))
  )
    throw new Error('Invalid chord key.');
  return {
    id: crypto.randomUUID(),
    symbol: input.symbol.trim(),
    start: 0,
    beats,
    notes,
    velocity,
    section: input.section,
    key: input.key ? { ...input.key } : undefined,
  };
}

/** Immutable snapshots make edits atomic and allow undo/redo without coupling the editor to the UI. */
export class SequenceEditor {
  private value: Sequence;
  private past: Sequence[] = [];
  private future: Sequence[] = [];

  private options: EditorSettings;
  get settings() {
    return this.options;
  }
  set settings(value: EditorSettings) {
    this.options = editorSchema.parse(value);
    if (this.past.length > this.options.undoLimit) this.past.splice(0, this.past.length - this.options.undoLimit);
  }
  constructor(sequence: Sequence, settings: EditorSettings = DEFAULT_SETTINGS.editor) {
    this.options = editorSchema.parse(settings);
    validateMeter(sequence.meter, sequence.denominator ?? 4);
    this.value = structuredClone(sequence);
    this.value.denominator ??= 4;
    this.value.regions = structuredClone(sequenceRegions(sequence));
    if (!validPlaybackStyle(sequence.style ?? 'once')) throw new Error('Choose a known playback style.');
    if (
      sequence.barStyles?.some(
        (entry) => !Number.isSafeInteger(entry.bar) || entry.bar < 0 || !validPlaybackStyle(entry.style),
      )
    )
      throw new Error('Invalid bar accompaniment style.');
    if (sequence.styleMarks?.some((m) => !Number.isSafeInteger(m.bar) || m.bar < 0 || !validPlaybackStyle(m.style)))
      throw new Error('Invalid style marker.');
    if (sequence.melody) this.value.melody = validMelody(sequence.melody);
    let end = 0;
    this.value.steps = this.value.steps.map((s) => {
      const start = s.start ?? end;
      end = start + s.beats;
      return { ...s, start };
    });
  }
  get document(): Sequence {
    return structuredClone(this.value);
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }

  private commit(next: Sequence) {
    if (next.regions === this.value.regions)
      next.regions = next.regions
        ?.map((r) => {
          if (r.start === 0) return r;
          const anchor = this.value.steps.findLast((s) => s.start <= r.start);
          const moved = anchor && next.steps.find((s) => s.id === anchor.id);
          return moved && anchor ? { ...r, start: moved.start + r.start - anchor.start } : r;
        })
        .sort((a, b) => a.start - b.start);
    this.past.push(this.value);
    if (this.past.length > this.settings.undoLimit) this.past.splice(0, this.past.length - this.settings.undoLimit);
    this.value = next;
    this.future = [];
  }

  /** Several edits as one undo step. If one of them fails, none is applied. */
  batch(action: (editor: this) => void) {
    const past = [...this.past];
    const future = this.future;
    const start = this.value;
    try {
      action(this);
    } catch (error) {
      this.past = past;
      this.future = future;
      this.value = start;
      throw error;
    }
    if (this.value === start) return;
    this.past = [...past, start].slice(-Math.max(1, this.settings.undoLimit));
  }

  update(patch: Partial<Pick<Sequence, 'title' | 'bpm' | 'meter' | 'denominator' | 'key'>>) {
    const next = { ...this.value, ...patch };
    if (!next.title.trim()) throw new Error('Give the sequence a title.');
    if (!Number.isFinite(next.bpm) || next.bpm < MUSIC_LIMITS.minBpm || next.bpm > MUSIC_LIMITS.maxBpm)
      throw new Error(`Tempo must be between ${MUSIC_LIMITS.minBpm} and ${MUSIC_LIMITS.maxBpm} BPM.`);
    validateMeter(next.meter, next.denominator ?? 4);
    if (
      next.key &&
      (!Number.isInteger(next.key.tonic) ||
        next.key.tonic < 0 ||
        next.key.tonic > 11 ||
        !['major', 'minor'].includes(next.key.mode))
    )
      throw new Error('Invalid sequence key.');
    if ('key' in patch) next.regions = [{ id: `${next.id}:key:0`, start: 0, key: next.key }];
    this.commit(next);
  }

  insert(inputs: ChordInput[], afterId: string | null = null): string | null {
    const previous =
      afterId === null ? this.value.steps[this.value.steps.length - 1] : this.value.steps[this.index(afterId)];
    return this.place(inputs, previous ? previous.start + previous.beats : 0);
  }

  /** Place chords on a beat timeline. Existing later chords move only when the new material overlaps. */
  place(inputs: ChordInput[], at: number, removeId?: string): string | null {
    if (!Number.isFinite(at) || at < 0) throw new Error('Choose a timeline position at or after beat zero.');
    const remaining = this.value.steps.filter((s) => s.id !== removeId);
    const before = remaining.filter((s) => s.start < at - 1e-8);
    if (before.some((s) => s.start + s.beats > at + 1e-8)) throw new Error('Choose an empty spot or a chord boundary.');
    let previous = before[before.length - 1]?.notes ?? null;
    let cursor = at;
    const added = inputs.map((input) => {
      const s = step(input, previous, barQuarters(this.value.meter, this.value.denominator), this.settings.velocity);
      s.start = cursor;
      cursor += s.beats;
      previous = s.notes;
      return s;
    });
    if (!added.length) {
      if (removeId) this.commit({ ...this.value, steps: remaining });
      return null;
    }
    const next = {
      ...this.value,
      steps: this.ripple([...before, ...added, ...remaining.filter((s) => s.start >= at - 1e-8)]),
      regions: structuredClone(this.value.regions ?? []),
    };
    // Existing region boundaries anchored to later chords follow ripple edits.
    next.regions = next.regions.map((r) => {
      if (r.start === 0) return r;
      const anchor = this.value.steps.findLast((s) => s.start <= r.start);
      const moved = anchor && next.steps.find((s) => s.id === anchor.id);
      return moved && anchor ? { ...r, start: moved.start + r.start - anchor.start } : r;
    });
    for (const s of added)
      if (s.key && JSON.stringify(sequenceKeyAt(next, s.start)) !== JSON.stringify(s.key))
        next.regions = [
          ...next.regions.filter((r) => r.start !== s.start),
          { id: crypto.randomUUID(), start: s.start, key: s.key },
        ].sort((a, b) => a.start - b.start);
    this.commit(next);
    return added[added.length - 1].id;
  }

  replace(id: string, input: ChordInput) {
    const index = this.index(id),
      old = this.value.steps[index];
    const next = step(
      { ...old, ...input, notes: input.notes ?? (input.symbol === old.symbol ? old.notes : undefined) },
      this.value.steps[index - 1]?.notes ?? null,
      barQuarters(this.value.meter, this.value.denominator),
      this.settings.velocity,
    );
    next.id = id;
    next.start = old.start;
    this.commit({ ...this.value, steps: this.ripple(this.value.steps.map((s) => (s.id === id ? next : s))) });
  }

  replaceWith(id: string, inputs: ChordInput[]): string | null {
    const old = this.value.steps[this.index(id)];
    return this.place(inputs, old.start, id);
  }

  setRegion(start: number, key: Key | null, label = '') {
    if (!Number.isFinite(start) || start < 0) throw new Error('Choose a key-region position at or after beat zero.');
    if (
      key &&
      (!Number.isInteger(key.tonic) || key.tonic < 0 || key.tonic > 11 || !['major', 'minor'].includes(key.mode))
    )
      throw new Error('Choose a valid key.');
    const existing = this.value.regions?.find((r) => Math.abs(r.start - start) < 1e-8);
    if (existing) start = existing.start;
    const region = {
      id: existing?.id ?? crypto.randomUUID(),
      start,
      key: key ? { ...key } : null,
      ...(label.trim() ? { label: label.trim() } : {}),
    };
    this.commit({
      ...this.value,
      key: start === 0 ? key : this.value.key,
      regions: [...(this.value.regions ?? []).filter((r) => r.start !== start), region].sort(
        (a, b) => a.start - b.start,
      ),
    });
  }

  setStyle(style: string) {
    if (!validPlaybackStyle(style)) throw new Error('Choose a known playback style.');
    if ((this.value.style ?? 'once') === style) return;
    this.commit({ ...this.value, style });
  }

  setBarStyle(bar: number, style: string | null) {
    if (!Number.isSafeInteger(bar) || bar < 0) throw new Error('Choose a valid bar.');
    if (style !== null && !validPlaybackStyle(style)) throw new Error('Choose a known playback style.');
    if ((this.value.barStyles?.find((entry) => entry.bar === bar)?.style ?? null) === style) return;
    const barStyles = (this.value.barStyles ?? []).filter((entry) => entry.bar !== bar);
    if (style !== null) barStyles.push({ bar, style });
    this.commit({ ...this.value, barStyles: barStyles.sort((a, b) => a.bar - b.bar) });
  }

  /** From `bar` onward play `style`; null removes the marker at that bar (the style before it continues). */
  setStyleMark(bar: number, style: string | null) {
    if (!Number.isSafeInteger(bar) || bar < 0) throw new Error('Choose a valid bar.');
    if (style !== null && !validPlaybackStyle(style)) throw new Error('Choose a known playback style.');
    if (bar === 0 && style !== null) return this.setStyle(style);
    const marks = (this.value.styleMarks ?? []).filter((m) => m.bar !== bar);
    if (style !== null) marks.push({ bar, style });
    this.commit({ ...this.value, styleMarks: marks.sort((a, b) => a.bar - b.bar) });
  }

  /** Turn one-bar overrides into markers with the same sound (older songs). */
  convertBarStyles() {
    if (!this.value.barStyles?.length) return;
    this.commit({ ...this.value, styleMarks: marksFromBarStyles(this.value), barStyles: [] });
  }

  removeRegion(id: string) {
    const region = this.value.regions?.find((r) => r.id === id);
    if (!region || region.start === 0)
      throw new Error('The opening key region cannot be removed; choose Auto instead.');
    this.commit({ ...this.value, regions: this.value.regions!.filter((r) => r.id !== id) });
  }

  clear() {
    if (
      this.value.steps.length ||
      (this.value.regions?.length ?? 0) > 1 ||
      this.value.barStyles?.length ||
      this.value.styleMarks?.length ||
      this.value.melody?.length
    )
      this.commit({
        ...this.value,
        steps: [],
        regions: this.value.regions?.filter((r) => r.start === 0),
        ...(this.value.barStyles?.length ? { barStyles: [] } : {}),
        ...(this.value.styleMarks?.length ? { styleMarks: [] } : {}),
        ...(this.value.melody?.length ? { melody: [] } : {}),
      });
  }

  /** Replace the melody between `from` and `to` (quarters) with `notes`, e.g. a recorded take. */
  recordMelody(notes: MelodyNote[], from = 0, to = Number.POSITIVE_INFINITY) {
    const kept = (this.value.melody ?? []).filter((n) => n.start < from - 1e-8 || n.start >= to - 1e-8);
    this.commit({ ...this.value, melody: validMelody([...kept, ...notes]) });
  }

  clearMelody() {
    if (this.value.melody?.length) this.commit({ ...this.value, melody: [] });
  }

  remove(id: string) {
    this.index(id);
    this.commit({ ...this.value, steps: this.value.steps.filter((s) => s.id !== id) });
  }
  duplicate(id: string) {
    const s = this.value.steps[this.index(id)];
    return this.insert([s], id);
  }
  move(id: string, delta: number) {
    const from = this.index(id),
      to = Math.max(0, Math.min(this.value.steps.length - 1, from + delta));
    if (to === from) return;
    const steps = [...this.value.steps];
    steps.splice(to, 0, ...steps.splice(from, 1));
    let at = this.value.steps[0]?.start ?? 0;
    this.commit({
      ...this.value,
      steps: steps.map((s) => {
        const next = { ...s, start: at };
        at += s.beats;
        return next;
      }),
    });
  }

  moveTo(id: string, at: number) {
    const old = this.value.steps[this.index(id)];
    if (!Number.isFinite(at) || at < 0) throw new Error('Choose a valid timeline position.');
    const remaining = this.value.steps.filter((s) => s.id !== id);
    if (remaining.some((s) => s.start < at - 1e-8 && s.start + s.beats > at + 1e-8))
      throw new Error('Choose an empty spot or a chord boundary.');
    this.commit({
      ...this.value,
      steps: this.ripple([
        ...remaining.filter((s) => s.start < at - 1e-8),
        { ...old, start: at },
        ...remaining.filter((s) => s.start >= at - 1e-8),
      ]),
    });
  }

  private ripple(steps: SequenceStep[]): SequenceStep[] {
    let end = 0;
    return steps.map((s) => {
      const start = Math.max(s.start, end);
      end = start + s.beats;
      return { ...s, start };
    });
  }

  transpose(semitones: number) {
    if (!Number.isInteger(semitones)) throw new Error('Transpose by a whole number of semitones.');
    const key = this.value.key ? { ...this.value.key, tonic: mod12(this.value.key.tonic + semitones) } : null;
    const steps = this.value.steps.map((s) => {
      const c = parseChordSymbol(s.symbol)!;
      const notes = s.notes.map((n) => n + semitones);
      if (notes.some((n) => n < 0 || n > 127)) throw new Error('Transposition would move notes outside MIDI range.');
      return {
        ...s,
        notes,
        key: s.key ? { ...s.key, tonic: mod12(s.key.tonic + semitones) } : undefined,
        symbol: chordName({ ...c, root: mod12(c.root + semitones), bass: mod12(c.bass + semitones) }, key),
      };
    });
    const melody = this.value.melody?.map((n) => ({ ...n, pitch: n.pitch + semitones }));
    if (melody?.some((n) => n.pitch < 0 || n.pitch > 127))
      throw new Error('Transposition would move notes outside MIDI range.');
    this.commit({
      ...this.value,
      key,
      steps,
      ...(melody ? { melody } : {}),
      regions: this.value.regions?.map((r) => ({
        ...r,
        key: r.key ? { ...r.key, tonic: mod12(r.key.tonic + semitones) } : null,
      })),
    });
  }

  undo() {
    const previous = this.past.pop();
    if (previous) {
      this.future.push(this.value);
      this.value = previous;
    }
  }
  redo() {
    const next = this.future.pop();
    if (next) {
      this.past.push(this.value);
      this.value = next;
    }
  }
  private index(id: string) {
    const i = this.value.steps.findIndex((s) => s.id === id);
    if (i < 0) throw new Error('Select a chord first.');
    return i;
  }
}

export function sequenceFromChart(text: string, title: string, id?: string, signature?: TimeSignature): Sequence {
  const chart = parseChart(text, title);
  if (chart.errors.length) throw new Error(`Can't read: ${chart.errors.join(', ')}`);
  const initial = emptySequence(title, id);
  initial.key = chart.key;
  if (signature) {
    initial.meter = signature.numerator;
    initial.denominator = signature.denominator;
  }
  const editor = new SequenceEditor(initial);
  editor.insert(
    chart.chords.map((c) => ({
      symbol: c.symbol,
      section: c.section,
      beats: barQuarters(initial.meter, initial.denominator) / chart.chords.filter((x) => x.bar === c.bar).length,
    })),
  );
  return editor.document;
}

export function sequenceChart(sequence: Sequence): Chart {
  const chords = sequence.steps.map((s, i) => {
    const cell = {
      i,
      symbol: s.symbol,
      chord: parseChordSymbol(s.symbol)!,
      bar: meterPosition(s.start, sequence.meter, sequence.denominator).bar,
      section: s.section,
    };
    return cell;
  });
  const chart = analyzeChart(
    {
      title: sequence.title,
      text: sequence.steps.map((s) => s.symbol).join(' '),
      chords,
      errors: [],
      key: sequence.key,
      insights: [],
    },
    sequence.key ?? undefined,
  );
  chart.chords.forEach((c, i) => {
    const key = sequenceKeyAt(sequence, sequence.steps[i].start) ?? chart.key;
    if (key) c.roman = analyzeRoman(c.chord, key, chart.chords[i + 1]?.chord);
  });
  return chart;
}

export function sequencePiece(sequence: Sequence, settings: EditorSettings = DEFAULT_SETTINGS.editor): Piece {
  const ms = 60000 / sequence.bpm;
  const notes = accompanimentNotes(sequence, settings);
  for (const n of sequence.melody ?? []) notes.push([n.start * ms, n.beats * ms, n.pitch, n.velocity]);
  notes.sort((a, b) => a[0] - b[0]);
  const melodyEnd = (sequence.melody ?? []).reduce((end, n) => Math.max(end, n.start + n.beats), 0);
  return {
    id: sequence.id,
    title: sequence.title,
    source: 'sequence',
    notes,
    bpm: sequence.bpm,
    beatsPerBar: sequence.meter,
    denominator: sequence.denominator ?? 4,
    durationMs:
      Math.max(
        melodyEnd,
        sequence.steps.reduce((end, s) => Math.max(end, s.start + s.beats), 0),
      ) * ms,
  };
}
