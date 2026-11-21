import { barQuarters, beatQuarters, isMeterDenominator, meterPosition } from '../theory/meter';
import { MUSIC_LIMITS } from '../config/settings';
import { validPlaybackStyle } from '../engine/accompaniment';
import { ChordEntry, type PlayedInput } from '../engine/chordEntry';
import { settings } from './store.svelte';
import {
  emptySequence,
  SequenceEditor,
  sequenceChart,
  sequenceFromChart,
  sequencePiece,
  sequenceKeyAt,
  sequenceRegions,
  type ChordInput,
  type MelodyNote,
  type Sequence,
  type SequenceStep,
  type TrackMutes,
} from '../engine/sequence';
import { type Development, estimateKey, type FilledChord, fillGaps } from '../engine/advisor';
import type { ProgressionStats } from '../engine/progressions';
import type { Recording } from '../io/recorder';
import { computeReach, type Path } from '../engine/coach';
import { parseChordSymbol } from '../theory/symbols';
import { type Chord, chordName, identify } from '../theory/chords';
import { voiceChord } from '../theory/voicing';
import { analyzeRoman } from '../theory/roman';
import { type Key, keyIndex, keyLong } from '../theory/scales';
import {
  savedData as saved,
  downloadMidi,
  persist,
  playSelection,
  preparePiece,
  previewArrangement,
  resumePlayback,
  updatePlaybackClock,
  session,
  stopPlayback,
  ui,
  notify,
  recordingHooks,
  inputHooks,
  stopRecording,
  recorder,
  performanceHooks,
  audition,
  stopAudition,
  type PreviewCue,
  type PreviewInfo,
} from './store.svelte';

let regroupedSongs = 0;
function restore(): Sequence[] {
  const documents: Sequence[] = [];
  for (const raw of (Array.isArray(saved.sequences) ? saved.sequences : []) as Sequence[]) {
    try {
      if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || !Array.isArray(raw.steps)) continue;
      const editor = new SequenceEditor(emptySequence(raw.title, raw.id));
      // Legacy songs retain held chords even when the new-song default has changed.
      editor.setStyle(validPlaybackStyle(raw.style) ? raw.style : 'once');
      let denominator = raw.denominator ?? 4;
      const regroup =
        Number.isInteger(denominator) &&
        denominator > 0 &&
        denominator <= MUSIC_LIMITS.maxDenominator &&
        !isMeterDenominator(denominator);
      if (regroup) denominator = 4;
      editor.update({ bpm: raw.bpm, meter: raw.meter, denominator, key: raw.key });
      let end = 0;
      for (const s of raw.steps) {
        const at = s.start ?? end;
        editor.place([s], at);
        end = at + s.beats;
      }
      if (Array.isArray(raw.styleMarks))
        for (const mark of raw.styleMarks)
          if (Number.isSafeInteger(mark.bar) && mark.bar > 0 && validPlaybackStyle(mark.style))
            editor.setStyleMark(mark.bar, mark.style);
      if (Array.isArray(raw.barStyles))
        for (const entry of raw.barStyles)
          if (Number.isSafeInteger(entry.bar) && entry.bar >= 0 && validPlaybackStyle(entry.style))
            editor.setBarStyle(entry.bar, entry.style);
      // older songs: one-bar overrides become "from here on" markers that sound the same
      editor.convertBarStyles();
      if (Array.isArray(raw.regions))
        for (const region of raw.regions) editor.setRegion(region.start, region.key, region.label);
      if (Array.isArray(raw.melody) && raw.melody.length)
        try {
          editor.recordMelody(raw.melody);
        } catch {
          /* An unreadable melody is dropped; the chords are kept. */
        }
      const document = editor.document;
      document.regions?.forEach((region) => {
        const previous = raw.regions?.find((r) => r.start === region.start);
        if (typeof previous?.id === 'string') region.id = previous.id;
      });
      document.steps.forEach((s, i) => {
        if (typeof raw.steps[i].id === 'string') s.id = raw.steps[i].id;
      });
      documents.push(document);
      if (regroup) regroupedSongs++;
    } catch {
      /* Ignore a malformed saved document without losing the others. */
    }
  }
  if (!documents.length && Array.isArray(saved.charts))
    for (const chart of saved.charts as { title: string; text: string }[]) {
      try {
        documents.push(sequenceFromChart(chart.text, chart.title));
      } catch {
        /* Legacy chart could not be read. */
      }
    }
  return documents;
}

const restored = restore();
const initial =
  restored.find((s) => s.id === saved.activeSequenceId) ??
  restored[0] ??
  emptySequence('Untitled', undefined, $state.snapshot(settings.editor));
let editor = new SequenceEditor(initial, $state.snapshot(settings.editor));
export const composition = $state({
  revision: 0,
  selectedId: null as string | null,
  cursor: initial.steps.reduce((end, s) => Math.max(end, s.start + s.beats), 0),
  documents: restored.length ? restored : [initial],
  error: '',
  mode: 'chords' as 'chords' | 'melody',
  mutedTracks: { melody: false, chords: false } as TrackMutes,
  input: null as PlayedInput<InputTarget> | null,
  take: null as {
    started: number;
    at: number;
    bpm: number;
    songId: string;
    inputSerial: number;
    heldAtStart: boolean;
    origin: number | null;
    target: typeof assist.recordTarget;
  } | null,
});

/** Chord-advisor choices: the style rulebook, how adventurous ideas are, and what a recording take captures. */
export const assist = $state({
  style: 'pop',
  adventurous: 0.3,
  recordTarget: 'both' as 'both' | 'melody' | 'chords',
  perBar: 1 as 1 | 2,
  developLevel: 'rich' as 'light' | 'rich',
});

export const currentSequence = () => editor.document;
const chart = $derived.by(() => {
  void composition.revision;
  return sequenceChart(currentSequence());
});
export const currentChart = () => chart;
export const canUndo = () => editor.canUndo;
export const canRedo = () => editor.canRedo;

interface InputTarget {
  songId: string;
  revision: number;
  selectedId: string | null;
  start: number;
  beats: number;
  key: Key | null;
}
const sequenceEnd = () => editor.document.steps.reduce((end, step) => Math.max(end, step.start + step.beats), 0);
const chordEntry = new ChordEntry<InputTarget>({
  delay: () => null,
  target: () => {
    const doc = editor.document;
    const selected =
      doc.steps.find((step) => step.id === composition.selectedId) ??
      doc.steps.find(
        (step) => step.start <= composition.cursor + 1e-8 && step.start + step.beats > composition.cursor + 1e-8,
      );
    const start = selected?.start ?? composition.cursor;
    const next = doc.steps.find((step) => step.start > start + 1e-8);
    return {
      songId: doc.id,
      revision: composition.revision,
      selectedId: selected?.id ?? null,
      start,
      beats: selected?.beats ?? Math.min(barQuarters(doc.meter, doc.denominator), (next?.start ?? Infinity) - start),
      key: sequenceKeyAt(doc, start),
    };
  },
  identify: (notes, velocity, target) => {
    const result = identify(notes, target.key);
    return result.best ? { symbol: chordName(result.best, target.key), notes, velocity } : null;
  },
  preview: (input) => {
    composition.input = input;
  },
  commit: ({ target, chords }) => {
    if (
      target.songId !== editor.document.id ||
      target.revision !== composition.revision ||
      composition.take ||
      composition.mode !== 'chords'
    )
      return;
    const applied = editSequence((e) => {
      const chord = chords.at(-1)!;
      if (target.selectedId) e.replace(target.selectedId, chord);
      else e.place([{ ...chord, beats: target.beats }], target.start);
    }, true);
    if (applied) {
      if (!target.selectedId) selectTimeline(target.start + target.beats);
      ui.harmonyContext = 'timeline';
    }
  },
});
inputHooks.noteOn = (note, velocity) => {
  if (composition.mode === 'chords' && !ui.recording) chordEntry.noteOn(note, velocity);
};
inputHooks.noteOff = (note) => {
  if (!ui.recording) chordEntry.noteOff(note);
};
inputHooks.pedal = (on) => chordEntry.setPedal(on);
inputHooks.cancel = () => chordEntry.cancel();

export function confirmPlayedChord() {
  chordEntry.confirm();
}

export function selectEditorMode(mode: typeof composition.mode, at?: number) {
  if (ui.recording) return;
  if (mode !== composition.mode) chordEntry.cancel();
  composition.mode = mode;
  if (at !== undefined) selectTimeline(at);
}

export function clearChordFocus() {
  selectTimeline(sequenceEnd());
}

function sync(updateLibrary = true) {
  const document = editor.document;
  composition.revision++;
  const selected = document.steps.find((s) => s.id === composition.selectedId);
  if (!selected) composition.selectedId = null;
  else composition.cursor = selected.start + selected.beats;
  preparePiece(sequencePiece(document, $state.snapshot(settings.editor), composition.mutedTracks));
  session.loadSong(currentChart());
  if (updateLibrary) {
    const at = composition.documents.findIndex((s) => s.id === document.id);
    composition.documents =
      at < 0 ? [...composition.documents, document] : composition.documents.map((s, i) => (i === at ? document : s));
    persistProjects(document.id);
  }
}

export function editSequence(action: (editor: SequenceEditor) => void, playedInput = false) {
  try {
    composition.error = '';
    const playing = !!ui.nowPlaying && ui.sourceId === `sequence:${editor.document.id}`;
    if (playing) updatePlaybackClock();
    const beat = (ui.playbackPosition * editor.document.bpm) / 60000;
    editor.settings = $state.snapshot(settings.editor);
    const before = editor.document;
    action(editor);
    const after = editor.document;
    if (composition.selectedId && !after.steps.some((s) => s.id === composition.selectedId)) {
      const removed = before.steps.filter((s) => !after.steps.some((n) => n.id === s.id));
      if (removed.length) selectTimeline(Math.min(...removed.map((s) => s.start)));
    } else if (!composition.selectedId) {
      const added = after.steps.filter((s) => !before.steps.some((n) => n.id === s.id));
      const last = added.at(-1);
      if (last) composition.cursor = last.start + last.beats;
    }
    if (!playedInput || ui.nowPlaying) stopPlayback(playedInput);
    sync();
    ui.tab = 'editor';
    if (playing) resumePlayback((beat * 60000) / editor.document.bpm, playedInput);
    return true;
  } catch (error) {
    composition.error = (error as Error).message;
    return false;
  }
}

export function selectSequence(id: string, autoplay = false) {
  if (ui.recording) void stopRecording();
  const document = composition.documents.find((s) => s.id === id);
  if (!document) return;
  stopPlayback();
  if (editor.document.id !== document.id) composition.mutedTracks = { melody: false, chords: false };
  editor = new SequenceEditor($state.snapshot(document), $state.snapshot(settings.editor));
  composition.selectedId = null;
  composition.cursor = 0;
  composition.error = '';
  sync();
  ui.tab = 'editor';
  if (autoplay) playSelection();
}

export function newSequence() {
  if (ui.recording) void stopRecording();
  stopPlayback();
  composition.mutedTracks = { melody: false, chords: false };
  editor = new SequenceEditor(
    emptySequence(availableTitle('Untitled'), undefined, $state.snapshot(settings.editor)),
    $state.snapshot(settings.editor),
  );
  composition.selectedId = null;
  composition.cursor = 0;
  composition.error = '';
  sync();
  ui.tab = 'editor';
}

function availableTitle(base: string) {
  const titles = new Set(composition.documents.map((s) => s.title));
  let title = base;
  for (let n = 2; titles.has(title); n++) title = `${base} ${n}`;
  return title;
}

export function duplicateSequence(id: string) {
  if (id === editor.document.id && ui.recording) void stopRecording();
  const original = composition.documents.find((s) => s.id === id);
  if (!original) return;
  const copy = {
    ...$state.snapshot(original),
    id: crypto.randomUUID(),
    title: availableTitle(`${original.title} (copy)`),
  };
  composition.documents = [...composition.documents, copy];
  selectSequence(copy.id);
  notify(`Created ${copy.title}`);
}

export function deleteSequence(id: string) {
  const active = id === editor.document.id;
  if (active && ui.recording) void stopRecording();
  const removed = composition.documents.find((s) => s.id === id);
  if (!removed) return;
  composition.documents = composition.documents.filter((s) => s.id !== id);
  if (active) {
    const next = composition.documents[0];
    if (next) selectSequence(next.id);
    else newSequence();
  } else persistProjects();
  notify(
    `Deleted ${removed.title}`,
    () => {
      composition.documents = [...composition.documents, removed];
      if (active) selectSequence(id);
      else persistProjects();
      notify(`Restored ${removed.title}`);
    },
    'Restore',
  );
}

export function timelinePosition(beat: number, meter: number, denominator = 4) {
  const position = meterPosition(beat, meter, denominator);
  return `bar ${position.bar}, beat ${+position.beat.toFixed(2)}`;
}

export function suggestionDestination() {
  void composition.revision;
  const doc = editor.document;
  const live = ui.harmonyContext === 'input';
  const input = composition.input;
  const at = input
    ? input.target.start + input.target.beats * (input.target.selectedId ? 1 : input.chords.length)
    : composition.cursor;
  return { title: doc.title, position: timelinePosition(at, doc.meter, doc.denominator), live };
}

/** The same timeline range used for ranking, auditioning and placing a suggestion. */
export function suggestionScope(bars: number) {
  void composition.revision;
  const doc = editor.document;
  const bar = barQuarters(doc.meter, doc.denominator);
  const selected = doc.steps.find((step) => step.id === composition.selectedId);
  const cursor = selected?.start ?? composition.cursor;
  const barStart = Math.floor(cursor / bar + 1e-8) * bar;
  if (bars) {
    const straddles = doc.steps.some(
      (step) => step.start < barStart - 1e-8 && step.start + step.beats > barStart + 1e-8,
    );
    return { bar, span: { start: barStart, end: barStart + bars * bar }, straddles, selected };
  }
  const replacement =
    selected ??
    doc.steps.find((step) => step.start <= barStart + 1e-8 && barStart < step.start + step.beats - 1e-8) ??
    doc.steps.find((step) => step.start <= cursor + 1e-8 && cursor < step.start + step.beats - 1e-8);
  const next = doc.steps.find((step) => step.start > cursor + 1e-8);
  const span = replacement
    ? { start: replacement.start, end: replacement.start + replacement.beats }
    : { start: cursor, end: Math.min(cursor + bar, next?.start ?? Infinity) };
  return { bar, span, straddles: false, selected: replacement };
}

export function selectStep(id: string) {
  if (ui.previewScore) stopAudition();
  chordEntry.cancel();
  ui.harmonyContext = 'timeline';
  composition.selectedId = id;
  const s = editor.document.steps.find((s) => s.id === id);
  if (s) composition.cursor = s.start + s.beats;
  composition.error = '';
}

export function selectTimeline(at: number) {
  if (ui.previewScore) stopAudition();
  chordEntry.cancel();
  ui.harmonyContext = 'timeline';
  composition.selectedId = null;
  composition.cursor = Math.max(0, at);
  composition.error = '';
}

export function compositionContext() {
  void composition.revision;
  void ui.tick;
  const document = editor.document;
  const input = composition.input;
  const played = input?.chords.at(-1);
  const editing = !!input || (ui.harmonyContext === 'timeline' && ui.sourceId === `sequence:${document.id}`);
  const playbackIndex =
    !input && ui.nowPlaying && ui.sourceId === `sequence:${document.id}`
      ? document.steps.findIndex(
          (s) =>
            s.start <= (ui.playbackPosition * document.bpm) / 60000 &&
            s.start + s.beats > (ui.playbackPosition * document.bpm) / 60000,
        )
      : -1;
  const index =
    playbackIndex >= 0
      ? playbackIndex
      : composition.selectedId
        ? document.steps.findIndex((s) => s.id === composition.selectedId)
        : document.steps.findLastIndex((s) => s.start + s.beats <= composition.cursor + 1e-8);
  const upto = index + 1;
  const current = document.steps[upto - 1];
  const contextBeat = input
    ? input.target.start
    : playbackIndex >= 0
      ? (ui.playbackPosition * document.bpm) / 60000
      : composition.selectedId
        ? (current?.start ?? composition.cursor)
        : composition.cursor;
  const key = input
    ? (input.target.key ?? session.activeKey)
    : editing
      ? (sequenceKeyAt(document, contextBeat) ?? currentChart().key)
      : session.activeKey;
  const last = played
    ? parseChordSymbol(played.symbol)
    : editing
      ? current
        ? parseChordSymbol(current.symbol)
        : null
      : session.now.best;
  const voicing = played?.notes ?? (editing ? (current?.notes ?? null) : session.lastVoicing);
  const regionStart = sequenceRegions(document).findLast((region) => region.start <= contextBeat + 1e-8)?.start ?? 0;
  const inputChords = session.chords;
  const inputBoundary = inputChords.findLastIndex(
    (entry) => !key || !entry.key || keyIndex(entry.key) !== keyIndex(key),
  );
  const recent = input
    ? [
        ...document.steps
          .filter((step) => step.start < input.target.start - 1e-8 && step.start >= regionStart - 1e-8)
          .map((step) => parseChordSymbol(step.symbol)!),
        ...input.chords.map((chord) => parseChordSymbol(chord.symbol)!),
      ].slice(-8)
    : editing
      ? document.steps
          .slice(0, upto)
          .filter((step) => step.start >= regionStart - 1e-8)
          .slice(-8)
          .map((s) => parseChordSymbol(s.symbol)!)
      : inputChords
          .slice(inputBoundary + 1)
          .slice(-8)
          .map((s) => s.chord);
  const probabilities = editing ? new Float64Array(24) : session.keyProbs;
  if (editing && key) probabilities[keyIndex(key)] = 1;
  return { key, last, voicing, recent, reach: computeReach(key, probabilities, recent, [], session.style) };
}

export function acceptChords(inputs: ChordInput[], replace = false, announce = true) {
  const key = compositionContext().key ?? undefined;
  const home = editor.document.key;
  const region = key && (!home || keyIndex(key) !== keyIndex(home)) ? key : undefined;
  const destination = suggestionDestination();
  const added = editSequence((e) => {
    const chords = inputs.map((input) => ({ ...input, key: input.key ?? region }));
    if (replace && composition.selectedId) composition.selectedId = e.replaceWith(composition.selectedId, chords);
    else {
      e.place(chords, composition.cursor);
      composition.selectedId = null;
    }
  });
  if (added && announce)
    notify(
      `${replace ? 'Replaced with' : 'Added'} ${inputs.map((c) => c.symbol).join(' → ')} · ${destination.title} · ${destination.position}`,
    );
}

export function acceptPath(path: Path, destination?: Key) {
  const from = compositionContext().key ?? undefined;
  const to = destination ?? session.target ?? from;
  acceptChords(
    path.steps.map((s, i) => ({ symbol: s.name, notes: s.voicing, key: i === path.steps.length - 1 ? to : from })),
  );
  if (!composition.error) {
    session.setTarget(null);
  }
}

export function importChart(text: string) {
  try {
    const imported = sequenceFromChart(text, editor.document.title, undefined, {
      numerator: editor.document.meter,
      denominator: editor.document.denominator ?? 4,
    });
    acceptChords(imported.steps);
  } catch (error) {
    composition.error = (error as Error).message;
  }
}

/** The input preview and a recording take are drawn on the song's own timeline. */
export function inputTimeline() {
  void ui.tick;
  void ui.recordingElapsed;
  const doc = editor.document;
  const take = composition.take;
  if (take && take.songId === doc.id) {
    if (take.target === 'melody') return [];
    if (ui.inputSerial === take.inputSerial && !take.heldAtStart) return [];
    const now = take.started + ui.recordingElapsed;
    const origin = take.origin ?? take.started;
    const attacks = heardChordAttacks(recorder.snapshot());
    if (!attacks.length) return [];
    return session.chords
      .filter((c) => c.t1 > take.started && c.t0 < now && (c.t0 >= take.started - 1 || take.heldAtStart))
      .filter((c) => attacks.some((at) => at >= c.t0 - take.started - 1 && at <= c.t1 - take.started + 1))
      .map((c, i, chords) => {
        const start = Math.max(origin, c.t0);
        const end = Math.max(start, Math.min(now, chords[i + 1]?.t0 ?? c.t1));
        return {
          id: `input:${c.id}`,
          symbol: c.name,
          start: take.at + ((start - origin) * take.bpm) / 60000,
          beats: Math.max(MUSIC_LIMITS.minChordBeats, ((end - start) * take.bpm) / 60000),
          notes: c.notes,
          key: c.key ?? undefined,
          velocity: settings.editor.velocity,
        };
      });
  }
  const input = composition.input;
  if (input) {
    const chords = input.chords.slice(-1);
    return chords.map((chord, index) => ({
      ...chord,
      id: `input-preview:${index}`,
      start: input.target.start + index * input.target.beats,
      beats: input.target.beats,
      key: input.target.key ?? undefined,
    }));
  }
  return [];
}

/** The first played attack anchors a sketch take at the insertion cursor. */
export function recordingBeat() {
  const take = composition.take;
  if (!take) return composition.cursor;
  if (take.origin === null) return take.at;
  return take.at + (Math.max(0, ui.recordingElapsed - (take.origin - take.started)) * take.bpm) / 60000;
}

/** One chord focus for the inspector, keyboard and timeline, regardless of how it was entered. */
export function focusedChord() {
  void composition.revision;
  void ui.tick;
  const doc = editor.document;
  const preview = ui.previewScore;
  const cue = preview?.cues[preview.active];
  const beat = (ui.playbackPosition * doc.bpm) / 60000;
  const incoming = inputTimeline();
  const playing = ui.sourceId === `sequence:${doc.id}` && (!!ui.nowPlaying || ui.playbackPaused);
  const step =
    incoming.at(-1) ??
    (playing
      ? doc.steps.find((s) => s.start <= beat && beat < s.start + s.beats)
      : (doc.steps.find((s) => s.id === composition.selectedId) ??
        doc.steps.findLast((s) => s.start + s.beats <= composition.cursor + 1e-8)));
  const key =
    cue?.key ??
    (step?.id.startsWith('input')
      ? (composition.input?.target.key ?? session.keyLock ?? step.key)
      : step
        ? (sequenceKeyAt(doc, playing ? beat : step.start) ?? currentChart().key)
        : doc.key) ??
    session.activeKey;
  const chord = cue
    ? parseChordSymbol(cue.name)
    : ui.playing
      ? (parseChordSymbol(ui.preview ?? '') ?? identify(ui.playing, key).best)
      : step
        ? parseChordSymbol(step.symbol)
        : null;
  const notes = cue?.notes ?? ui.playing ?? step?.notes ?? [];
  const name =
    cue?.name ?? (chord ? (ui.playing ? chordName(chord, key) : (step?.symbol ?? chordName(chord, key))) : '');
  const timelineRoman =
    !cue && !ui.playing && step && !incoming.length ? currentChart().chords[doc.steps.indexOf(step)]?.roman : null;
  const nextCue = preview ? (preview.cues[preview.active + 1] ?? preview.context?.after) : undefined;
  return {
    chord,
    notes,
    name,
    key,
    roman:
      timelineRoman ??
      (chord && key ? analyzeRoman(chord, key, nextCue ? parseChordSymbol(nextCue.name) : null) : null),
    step: cue ? undefined : step,
    heading: cue
      ? 'Preview'
      : ui.recording
        ? 'Recording'
        : ui.playing
          ? 'Preview'
          : playing
            ? ui.playbackPaused
              ? 'Paused'
              : 'Playing'
            : 'Chord',
    position:
      cue && preview
        ? `${preview.active + 1} of ${preview.cues.length} · ${preview.status === 'playing' ? 'Playing' : preview.status === 'finished' ? 'Finished' : 'Stopped'}`
        : step
          ? `${timelinePosition(step.start, doc.meter, doc.denominator)} · ${+(step.beats / beatQuarters(doc.denominator)).toFixed(2)} beats`
          : '',
  };
}

export function resetWorkspace() {
  if (ui.recording) void stopRecording();
  stopPlayback();
  session.clear();
  composition.take = null;
  composition.selectedId = null;
  composition.cursor = 0;
  editSequence((e) => e.clear());
  notify(`Cleared ${editor.document.title}: chords and melody. Undo brings them back.`);
}

recordingHooks.start = () => {
  const doc = editor.document;
  const held = [...session.seg.held].map(([note, data]) => ({ note, velocity: data.vel }));
  const sustained = [...session.seg.sustained].filter((note) => !session.seg.held.has(note));
  const started = recorder.startedAt;
  const selected = doc.steps.find((step) => step.id === composition.selectedId);
  composition.take = {
    started,
    at: selected?.start ?? composition.cursor,
    target: assist.recordTarget,
    bpm: doc.bpm,
    songId: doc.id,
    inputSerial: ui.inputSerial,
    heldAtStart: held.length + sustained.length > 0,
    origin: held.length + sustained.length > 0 ? started : null,
  };
  // Start a fresh analysis take, so a repeated chord cannot merge into pre-recording history.
  // Feed sounding notes into analysis only; the synth and MIDI output continue without a retrigger.
  session.clear();
  if (ui.inputPedal) session.pedal(true, started);
  for (const { note, velocity } of held) session.noteOn(note, velocity, started);
  if (sustained.length) {
    for (const note of sustained) {
      session.noteOn(note, ui.inputVelocity, started);
      session.noteOff(note, started);
    }
  }
};
recordingHooks.noteOn = (t) => {
  if (composition.take && composition.take.origin === null) composition.take.origin = t;
};
/**
 * The melody of a take: notes the session heard as melody (above the chords), or every note's top voice when
 * recording melody only. Times are aligned like the take's chords (first attack = the insertion cursor).
 */
function heardChordAttacks(recording: Recording) {
  return recording.engine
    .filter((event) => event.kind === 'harmony' && typeof event.chord === 'string')
    .map((event) => event.t);
}

function takeMelody(take: NonNullable<typeof composition.take>, recording: Recording): MelodyNote[] {
  const offset = (take.origin ?? take.started) - take.started;
  const ons = recording.input.filter((e) => e.kind === 'on').sort((a, b) => a.t - b.t);
  let picks: { t: number; note: number; vel: number }[] = [];
  if (take.target === 'melody' || !heardChordAttacks(recording).length) {
    for (let i = 0; i < ons.length; ) {
      let j = i;
      let top = ons[i];
      while (j < ons.length && ons[j].t - ons[i].t < 35) {
        if (ons[j].note > top.note) top = ons[j];
        j++;
      }
      picks.push({ t: top.t, note: top.note, vel: top.vel });
      i = j;
    }
  } else
    picks = recording.engine
      .filter((m) => m.kind === 'melody' && typeof m.note === 'number')
      .map((m) => {
        const rel = m.t;
        const on = ons.find((e) => e.note === m.note && Math.abs(e.t - rel) < 80);
        return { t: on?.t ?? rel, note: m.note as number, vel: on?.vel ?? settings.editor.velocity };
      });
  const beat = (t: number) => take.at + ((t - offset) * take.bpm) / 60000;
  const snap = (b: number) => Math.round(b * 8) / 8;
  return picks
    .map((p, i) => {
      const off = recording.input.find((e) => e.kind === 'off' && e.note === p.note && e.t > p.t);
      const end = Math.min(off?.t ?? picks[i + 1]?.t ?? recording.durationMs, recording.durationMs);
      return {
        start: snap(beat(p.t)),
        beats: Math.max(0.125, snap(beat(end) - beat(p.t))),
        pitch: p.note,
        velocity: Math.min(127, Math.max(1, p.vel)),
      };
    })
    .filter((n) => n.start >= take.at - 1e-6);
}

/** The same notes that will be saved, including the current held note as it grows. */
export function recordingMelody(): MelodyNote[] {
  void ui.tick;
  void ui.recordingElapsed;
  const take = composition.take;
  return take && take.songId === editor.document.id && take.target !== 'chords'
    ? takeMelody(take, recorder.snapshot())
    : [];
}

recordingHooks.stop = (recording) => {
  const take = composition.take;
  if (!take) return;
  ui.recordingElapsed = recording.durationMs;
  if (editor.document.id !== take.songId) selectSequence(take.songId);
  const steps = inputTimeline();
  composition.take = null;
  if (!recording.input.some((e) => e.kind === 'on')) return;
  const melody = take.target === 'chords' ? [] : takeMelody(take, recording);
  const chords =
    take.target === 'melody'
      ? []
      : steps.map((s, i) => {
          const offset = (take.origin ?? take.started) - take.started;
          const onset = ((s.start - take.at) * 60000) / take.bpm + offset;
          const nextOnset = (((steps[i + 1]?.start ?? s.start + s.beats) - take.at) * 60000) / take.bpm + offset;
          const attacks = recording.input.filter((e) => e.kind === 'on' && e.t >= onset - 1 && e.t < nextOnset);
          return {
            ...s,
            velocity: attacks.length
              ? Math.round(attacks.reduce((sum, e) => sum + e.vel, 0) / attacks.length)
              : s.velocity,
            beats: Math.max(
              MUSIC_LIMITS.minChordBeats,
              Math.min(MUSIC_LIMITS.maxChordBeats, (steps[i + 1]?.start ?? s.start + s.beats) - s.start),
            ),
          };
        });
  if (!melody.length && !chords.length) return;
  const end = [...melody, ...chords].reduce((end, n) => Math.max(end, n.start + n.beats), take.at);
  let found: Key | null = null;
  const done = editSequence((e) =>
    e.batch(() => {
      if (melody.length) e.recordMelody(melody, take.at, end);
      if (chords.length) e.recordChords(chords, take.at, end);
      found = keyFromMelody(e);
    }),
  );
  if (done) {
    selectTimeline(end);
    if (found) notify(`Key set to ${keyLong(found)} from the melody (undo keeps the old key).`);
  }
};

/** Pipeline step 1: start from a chord template (one chord per bar at the cursor). */
export function insertTemplate(symbols: string[]) {
  const doc = editor.document;
  const bar = barQuarters(doc.meter, doc.denominator);
  acceptChords(symbols.map((symbol) => ({ symbol, beats: bar })));
}

/** Pipeline step 3: one basic chord per bar wherever the melody has none. */
/**
 * A song without chords takes its key from the melody (new songs start in C major, which an A-minor tune would
 * otherwise be harmonised in). Returns the new key, or null when the key stays.
 */
function keyFromMelody(e: SequenceEditor): Key | null {
  const doc = e.document;
  if (doc.steps.length || !doc.melody?.length || (doc.regions?.length ?? 0) > 1) return null;
  const found = estimateKey(doc.melody);
  if (doc.key && keyIndex(doc.key) === keyIndex(found)) return null;
  e.update({ key: found });
  return found;
}

export function fillMelodyGaps() {
  const doc = editor.document;
  if (!doc.melody?.length) {
    notify('Record or play a melody first.');
    return;
  }
  let found: Key | null = null;
  let filled: FilledChord[] = [];
  editSequence((e) =>
    e.batch(() => {
      found = keyFromMelody(e);
      const now = e.document;
      filled = fillGaps(now, assist.style, barQuarters(now.meter, now.denominator), assist.perBar);
      for (const f of filled) e.place([{ symbol: f.symbol, beats: f.beats }], f.start);
    }),
  );
  if (!filled.length) {
    notify('Every bar with melody already has a chord.');
    return;
  }
  const key = found ? ` in ${keyLong(found)} (key taken from the melody)` : '';
  notify(
    `Added ${filled.length} chord${filled.length > 1 ? 's' : ''} under the melody${key}: ${filled.map((f) => f.symbol).join(' · ')}`,
  );
}

export function clearMelody() {
  if (!editor.document.melody?.length) return;
  if (editSequence((e) => e.clearMelody())) notify('Melody cleared; the chords stay. Undo brings it back.');
}

/** Remove every chord (the melody, key changes and styles stay): one undo step. */
export function clearChords() {
  const ids = editor.document.steps.map((s) => s.id);
  if (!ids.length) return;
  if (
    editSequence((e) =>
      e.batch(() => {
        for (const id of ids) e.remove(id);
      }),
    )
  ) {
    composition.selectedId = null;
    composition.cursor = 0;
    notify('Chords cleared; the melody stays. Undo brings them back.');
  }
}

/** Put the current project away and show an empty timeline. */
export function closeSong() {
  if (ui.recording) void stopRecording();
  const doc = editor.document;
  const blank = composition.documents.find((d) => d.id !== doc.id && !d.steps.length && !d.melody?.length);
  if (blank) selectSequence(blank.id);
  else newSequence();
  notify(`Closed ${doc.title}.`);
}

export function refreshCompositionSettings(useProject = false) {
  editor.settings = $state.snapshot(settings.editor);
  if (!useProject && ui.sourceId !== `sequence:${editor.document.id}`) return;
  const playing = !!ui.nowPlaying;
  const paused = ui.playbackPaused;
  if (playing) updatePlaybackClock();
  const at = ui.playbackPosition;
  if (playing) stopPlayback(true);
  preparePiece(sequencePiece(editor.document, editor.settings, composition.mutedTracks));
  ui.playbackPosition = Math.min(at, ui.playbackDuration);
  if (playing) resumePlayback(ui.playbackPosition, true);
  else ui.playbackPaused = paused;
}

export function toggleTrackMute(track: keyof TrackMutes) {
  composition.mutedTracks[track] = !composition.mutedTracks[track];
  if (ui.preview) stopAudition(true);
  refreshCompositionSettings(true);
}

export const exportSequenceMidi = () => downloadMidi(sequencePiece(editor.document, $state.snapshot(settings.editor)));
sync(false);
if (regroupedSongs) {
  persistProjects();
  notify(
    'Saved projects with unsupported meter denominators now use /4 grouping. Notes and playback timing are unchanged.',
  );
}

/** Pipeline step 4, all at once: apply every development in one undoable edit. */
export function developAll(list: Development[]) {
  const steps = new Map(editor.document.steps.map((s) => [s.id, s]));
  const done = editSequence((e) =>
    e.batch(() => {
      for (const d of list) {
        const step = steps.get(d.stepId);
        const chords = d.names.map((symbol) => ({ symbol, beats: (step?.beats ?? 0) / d.names.length }));
        if (step) e.replaceWith(d.stepId, chords);
      }
    }),
  );
  if (done) {
    composition.selectedId = null;
    notify(`Developed ${list.length} chord${list.length > 1 ? 's' : ''}. Undo goes back to the basic chords.`);
  }
}

/** A/B listening: the song as it is, or with the developments applied to a copy (nothing is changed). */
export function previewDevelopment(list: Development[] | null) {
  const options = $state.snapshot(settings.editor);
  if (!list) {
    const doc = editor.document;
    previewArrangement(sequencePiece(doc, options, { melody: composition.mutedTracks.melody }), 'Original project', {
      id: 'development:original',
      sources: ['Original project'],
      cues: sequenceCues(doc),
    });
    return;
  }
  const copy = new SequenceEditor(editor.document, options);
  const steps = new Map(copy.document.steps.map((s) => [s.id, s]));
  for (const d of list) {
    const step = steps.get(d.stepId);
    if (step)
      copy.replaceWith(
        d.stepId,
        d.names.map((symbol) => ({ symbol, beats: step.beats / d.names.length })),
      );
  }
  const doc = copy.document;
  previewArrangement(sequencePiece(doc, options, { melody: composition.mutedTracks.melody }), 'Developed', {
    id: 'development:all',
    sources: list.map((development) => development.label),
    cues: sequenceCues(doc),
  });
}

/** Versions: keep the basic song and switch to a developed copy of it (both stay in the song list). */
export function developAsVersion(list: Development[]) {
  const original = editor.document;
  const copy = { ...original, id: crypto.randomUUID(), title: availableTitle(`${original.title} (developed)`) };
  composition.documents = [...composition.documents, copy];
  selectSequence(copy.id);
  developAll(list);
  notify(`Created ${copy.title}; ${original.title} is unchanged.`);
}

// ───────────────────────────── sequences for a span ─────────────────────────────

/** Pattern counts from the rules study, shipped in public/data/progressions.json; null = rules only. */
export const habits = $state<{ stats: ProgressionStats | null; status: 'loading' | 'ready' | 'none' }>({
  stats: null,
  status: 'loading',
});
if (typeof fetch !== 'undefined')
  fetch(`${import.meta.env.BASE_URL}data/progressions.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data: ProgressionStats | null) => {
      habits.stats = data?.traditions ? data : null;
      habits.status = habits.stats ? 'ready' : 'none';
    })
    .catch(() => (habits.status = 'none'));

/** Replace the chords that start inside the span with a sequence of equal chords. */
function writeSequence(
  e: SequenceEditor,
  span: { start: number; end: number },
  names: string[],
  voicings?: number[][],
  keys?: (Key | null)[],
) {
  for (const s of e.document.steps.filter((s) => s.start >= span.start - 1e-8 && s.start < span.end - 1e-8))
    e.remove(s.id);
  const beats = (span.end - span.start) / names.length;
  e.place(
    names.map((symbol, index) => ({ symbol, beats, notes: voicings?.[index], key: keys?.[index] ?? undefined })),
    span.start,
  );
}

export function useSequence(
  span: { start: number; end: number },
  names: string[],
  voicings?: number[][],
  keys?: (Key | null)[],
) {
  if (editSequence((e) => e.batch(() => writeSequence(e, span, names, voicings, keys)))) {
    composition.selectedId = null;
    composition.cursor = span.end;
    notify(`Placed ${names.join(' → ')}. Undo brings back what was there.`);
  }
}

function sequenceCues(doc: Sequence, fromBeat = 0, toBeat = Number.POSITIVE_INFINITY) {
  const ms = 60000 / doc.bpm;
  return doc.steps
    .filter((step) => step.start < toBeat && step.start + step.beats > fromBeat)
    .map((step) => ({
      name: step.symbol,
      notes: step.notes,
      key: sequenceKeyAt(doc, step.start),
      startMs: (Math.max(step.start, fromBeat) - fromBeat) * ms,
      durationMs: (Math.min(step.start + step.beats, toBeat) - Math.max(step.start, fromBeat)) * ms,
    }));
}

function surroundingChords(doc: Sequence, span: { start: number; end: number }) {
  return {
    before: doc.steps.findLast((step) => step.start + step.beats <= span.start + 1e-8),
    after: doc.steps.find((step) => step.start >= span.end - 1e-8),
  };
}

/**
 * Substitute the idea in a copy and render it with the melody and up to a bar on either side.
 */
function contextPreview(span: { start: number; end: number }, names: string[], info: PreviewInfo) {
  const options = $state.snapshot(settings.editor);
  const copy = new SequenceEditor(editor.document, options);
  try {
    writeSequence(copy, span, names);
  } catch (error) {
    composition.error = (error as Error).message;
    return;
  }
  const doc = copy.document;
  const bar = barQuarters(doc.meter, doc.denominator);
  const { before, after } = surroundingChords(doc, span);
  const fromBeat = !before ? span.start : Math.max(before.start, span.start - bar);
  const toBeat = !after ? span.end : Math.min(after.start + after.beats, span.end + bar);
  const piece = sequencePiece(doc, options, { melody: composition.mutedTracks.melody });
  const ms = 60000 / doc.bpm;
  const from = fromBeat * ms;
  const to = toBeat * ms;
  const notes = piece.notes
    .filter(([at, duration]) => at + duration > from && at < to)
    .map(([at, d, n, v]): [number, number, number, number] => [
      Math.max(0, at - from),
      Math.min(at + d, to) - Math.max(at, from),
      n,
      v,
    ]);
  const label = [before?.symbol, `[${names.join(' ')}]`, after?.symbol].filter(Boolean).join(' → ');
  const cues = sequenceCues(doc, fromBeat, toBeat).map((cue): PreviewCue => {
    const beat = cue.startMs / ms + fromBeat;
    const stage = beat < span.start - 1e-8 ? 'before' : beat < span.end - 1e-8 ? 'idea' : 'after';
    return { ...cue, key: cue.key ?? (stage === 'idea' ? info.key : (currentChart().key ?? info.key)), stage };
  });
  return { piece: { ...piece, notes, durationMs: to - from }, label, info: { ...info, cues } };
}

/** Audition the idea, or the passage with its melody and neighbouring chords. */
export function previewSuggestion(
  span: { start: number; end: number },
  names: string[],
  options: { info?: PreviewInfo; voicings?: number[][]; beats?: number; velocity?: number; inContext?: boolean } = {},
) {
  const { info = {}, voicings, beats, velocity, inContext } = options;
  const previewInfo = { ...info, suggestionSpan: span };
  if (inContext) {
    const preview = contextPreview(span, names, previewInfo);
    if (preview) {
      previewArrangement(preview.piece, preview.label, { ...preview.info, maxDurationMs: 4000 });
      return;
    }
  }
  const doc = editor.document;
  const { before, after } = surroundingChords(doc, span);
  const describe = (step: SequenceStep | undefined) =>
    step ? { name: step.symbol, key: sequenceKeyAt(doc, step.start) ?? currentChart().key ?? info.key } : undefined;
  previewChords(
    names,
    {
      ...previewInfo,
      maxDurationMs: Math.min(3000, names.length * 700),
      context: { before: describe(before), after: describe(after) },
    },
    voicings,
    beats ?? (span.end - span.start) / names.length,
    velocity,
    span.start,
  );
}

/** A single attack per chord. A timeline position adds the overlapping melody as backing. */
export function previewChords(
  names: string[],
  info: PreviewInfo = {},
  voicings?: number[][],
  beats = 2,
  velocity = settings.editor.velocity,
  start?: number,
) {
  const key = info.key ?? compositionContext().key;
  let previous: number[] | null = null;
  const notes = names.map((name, index) => {
    const chord = parseChordSymbol(name);
    const notes = voicings?.[index] ?? (chord ? voiceChord(chord, previous) : []);
    previous = notes;
    return notes;
  });
  const doc = editor.document;
  const melody =
    start === undefined
      ? undefined
      : { start, bpm: doc.bpm, notes: composition.mutedTracks.melody ? [] : (doc.melody ?? []) };
  audition(notes, info.id ?? '', beats, names.join(' → '), velocity, { ...info, names, key, stage: 'idea', melody });
}

// ───────────────────────────── loading a melody and chords separately ─────────────────────────────

export interface FileMeta {
  bpm: number;
  beatsPerBar: number;
  denominator: number;
}

/** An empty song takes the file's tempo and meter. */
function adoptMeta(e: SequenceEditor, meta: FileMeta | null) {
  const doc = e.document;
  if (!meta || doc.steps.length || doc.melody?.length) return;
  e.update({ bpm: Math.round(meta.bpm), meter: meta.beatsPerBar, denominator: meta.denominator });
}

/** Replace the song's melody (its chords stay). */
export function loadMelody(notes: MelodyNote[], meta: FileMeta | null, from: string) {
  if (!notes.length) {
    notify(`No notes in ${from}.`);
    return;
  }
  let key: Key | null = null;
  const done = editSequence((e) =>
    e.batch(() => {
      adoptMeta(e, meta);
      e.recordMelody(notes);
      key = keyFromMelody(e);
    }),
  );
  if (done)
    notify(
      `Loaded ${notes.length} melody notes from ${from}${key ? `; key ${keyLong(key)} from the melody` : ''}. Chords unchanged.`,
    );
}

/** Replace the song's chords (its melody stays). */
export function loadChords(
  chords: { start: number; beats: number; symbol: string }[],
  meta: FileMeta | null,
  from: string,
) {
  if (!chords.length) {
    notify(`No chords found in ${from}.`);
    return;
  }
  let key: Key | null = null;
  const done = editSequence((e) =>
    e.batch(() => {
      const hadChords = e.document.steps.length > 0;
      adoptMeta(e, meta);
      for (const s of e.document.steps) e.remove(s.id);
      for (const c of [...chords].sort((a, b) => a.start - b.start))
        e.place([{ symbol: c.symbol, beats: c.beats }], c.start);
      // a song that had no chords takes its key from the loaded chords (and the melody, if any)
      const doc = e.document;
      if (!hadChords && (doc.regions?.length ?? 0) <= 1) {
        const parsed = chords.map((c) => parseChordSymbol(c.symbol)).filter((c): c is Chord => !!c);
        const found = estimateKey(doc.melody ?? [], parsed);
        if (!doc.key || keyIndex(doc.key) !== keyIndex(found)) {
          e.update({ key: found });
          key = found;
        }
      }
    }),
  );
  if (done) {
    composition.selectedId = null;
    notify(`Loaded ${chords.length} chords from ${from}${key ? ` in ${keyLong(key)}` : ''}. Melody unchanged.`);
  }
}

/** Chords from a chord chart (text), placed from the start of the song. */
export function chordsFromChart(text: string) {
  const doc = editor.document;
  const imported = sequenceFromChart(text, doc.title, undefined, {
    numerator: doc.meter,
    denominator: doc.denominator ?? 4,
  });
  return imported.steps.map((s) => ({ start: s.start, beats: s.beats, symbol: s.symbol }));
}

/** Hear the notes of a file part (before loading it). */
export function previewPart(
  notes: { start: number; beats: number; pitch: number; velocity: number }[],
  bpm: number,
  label: string,
) {
  const ms = 60000 / bpm;
  const first = notes.length ? Math.min(...notes.map((n) => n.start)) : 0;
  const shown = notes.filter((n) => n.start < first + 16);
  previewArrangement(
    {
      id: `part:${label}`,
      title: label,
      source: 'midi file',
      notes: shown.map((n): [number, number, number, number] => [
        (n.start - first) * ms,
        n.beats * ms,
        n.pitch,
        n.velocity,
      ]),
    },
    label,
  );
}

// ───────────────────────────── dragging ideas into the timeline ─────────────────────────────

/** An idea being dragged: one slot's chords (they share the slot they land on) or a run of fixed length. */
export interface ChordDrag {
  kind: 'slot' | 'run';
  names: string[];
  voicings?: number[][];
  keys?: (Key | null)[];
  /** Run length in quarter notes. */
  beats?: number;
}
export const DRAG_TYPE = 'application/x-chordsh-chords';
/** The idea being dragged (drag data is unreadable until the drop, so the timeline reads this to preview). */
export const dragging = $state<{ idea: ChordDrag | null }>({ idea: null });

export function startChordDrag(e: DragEvent, idea: ChordDrag) {
  dragging.idea = idea;
  e.dataTransfer?.setData(DRAG_TYPE, JSON.stringify(idea));
  e.dataTransfer?.setData('text/plain', idea.names.join(' '));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}

/**
 * Where a dragged idea lands at `beat`: on a chord it replaces that chord (a run starts there); in a gap it fills
 * up to the next chord or one bar.
 */
export function dropTarget(idea: ChordDrag, beat: number): { start: number; beats: number; replaceId: string | null } {
  const doc = editor.document;
  const bar = barQuarters(doc.meter, doc.denominator);
  const under = doc.steps.find((s) => s.start <= beat + 1e-8 && beat < s.start + s.beats - 1e-8) ?? null;
  const start = under ? under.start : beat;
  if (idea.kind === 'run') return { start, beats: idea.beats ?? bar, replaceId: under?.id ?? null };
  if (under) return { start, beats: under.beats, replaceId: under.id };
  const next = doc.steps
    .filter((s) => s.start > beat + 1e-8)
    .reduce((m, s) => Math.min(m, s.start), Number.POSITIVE_INFINITY);
  return { start, beats: Math.min(bar, next - beat), replaceId: null };
}

export function dropChords(idea: ChordDrag, beat: number) {
  const target = dropTarget(idea, beat);
  if (target.beats / idea.names.length < MUSIC_LIMITS.minChordBeats - 1e-9) {
    composition.error = 'Not enough room there: drop on a chord to replace it, or on a wider gap.';
    return;
  }
  if (idea.kind === 'run') {
    useSequence({ start: target.start, end: target.start + target.beats }, idea.names, idea.voicings, idea.keys);
    return;
  }
  const inputs = idea.names.map((symbol, index) => ({
    symbol,
    beats: target.beats / idea.names.length,
    notes: idea.voicings?.[index],
  }));
  if (target.replaceId) {
    selectStep(target.replaceId);
    acceptChords(inputs, true);
  } else {
    selectTimeline(target.start);
    acceptChords(inputs);
  }
}

// ───────────────────────────── saving ─────────────────────────────

function persistProjects(activeSequenceId = editor.document.id) {
  persist({ sequences: $state.snapshot(composition.documents), activeSequenceId });
}

export function saveSong() {
  const doc = editor.document;
  persistProjects(doc.id);
  if (ui.savedLocally) notify(`Saved ${doc.title} in this browser.`);
}

/** Open a library entry as a project or return to its existing copy. */
export function openSong(song: Sequence) {
  if (!composition.documents.some((d) => d.id === song.id)) composition.documents = [...composition.documents, song];
  selectSequence(song.id);
  notify(
    `Opened ${song.title}: ${song.steps.length} chords${song.melody?.length ? `, ${song.melody.length} melody notes` : ''}.`,
  );
}

performanceHooks.open = openSong;
