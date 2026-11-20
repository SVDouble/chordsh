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
  type Sequence,
} from '../engine/sequence';
import { EXAMPLES } from '../engine/chart';
import { computeReach, type Path } from '../engine/coach';
import { parseChordSymbol } from '../theory/symbols';
import { chordName, identify } from '../theory/chords';
import { analyzeRoman } from '../theory/roman';
import { type Key, keyIndex } from '../theory/scales';
import {
  savedData as saved,
  downloadMidi,
  persist,
  playSelection,
  preparePiece,
  resumePlayback,
  session,
  stopPlayback,
  ui,
  notify,
  recordingHooks,
  inputHooks,
  stopRecording,
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
      if (Array.isArray(raw.barStyles))
        for (const entry of raw.barStyles)
          if (Number.isSafeInteger(entry.bar) && entry.bar >= 0 && validPlaybackStyle(entry.style))
            editor.setBarStyle(entry.bar, entry.style);
      if (Array.isArray(raw.regions))
        for (const region of raw.regions) editor.setRegion(region.start, region.key, region.label);
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

export const exampleSequences = EXAMPLES.map((c, i) => sequenceFromChart(c.text, c.title, `example:${i}`));
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
  input: null as PlayedInput<InputTarget> | null,
  take: null as {
    started: number;
    at: number;
    bpm: number;
    songId: string;
    inputSerial: number;
    heldAtStart: boolean;
    origin: number | null;
  } | null,
});

export const currentSequence = () => editor.document;
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
  delay: () => settings.editor.inputIdleMs,
  target: () => {
    const doc = editor.document;
    const selected = doc.steps.find((step) => step.id === composition.selectedId);
    const start = selected?.start ?? sequenceEnd();
    return {
      songId: doc.id,
      revision: composition.revision,
      selectedId: selected?.id ?? null,
      start,
      beats: selected?.beats ?? barQuarters(doc.meter, doc.denominator),
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
      !settings.editor.autoCaptureChords
    )
      return;
    const applied = editSequence((e) => {
      if (target.selectedId) {
        e.replace(target.selectedId, chords.at(-1)!);
      } else {
        e.place(
          chords.map((chord) => ({ ...chord, beats: target.beats })),
          sequenceEnd(),
        );
      }
    }, true);
    if (applied) {
      if (!target.selectedId) selectTimeline(sequenceEnd());
      ui.harmonyContext = 'timeline';
    }
  },
});
inputHooks.noteOn = (note, velocity) => {
  if (settings.editor.autoCaptureChords && !ui.recording) chordEntry.noteOn(note, velocity);
};
inputHooks.noteOff = (note) => {
  if (!ui.recording) chordEntry.noteOff(note);
};
inputHooks.pedal = (on) => chordEntry.setPedal(on);
inputHooks.cancel = () => chordEntry.cancel();

export function clearChordFocus() {
  selectTimeline(sequenceEnd());
}

function sync(save = true) {
  const document = editor.document;
  composition.revision++;
  const selected = document.steps.find((s) => s.id === composition.selectedId);
  if (!selected) composition.selectedId = null;
  else composition.cursor = selected.start + selected.beats;
  preparePiece(sequencePiece(document, $state.snapshot(settings.editor)));
  session.loadSong(sequenceChart(document));
  if (save) {
    composition.documents = [...composition.documents.filter((s) => s.id !== document.id), document];
    persist({ sequences: $state.snapshot(composition.documents), activeSequenceId: document.id });
  }
}

export function editSequence(action: (editor: SequenceEditor) => void, playedInput = false) {
  try {
    composition.error = '';
    const playing = !!ui.nowPlaying && ui.sourceId === `sequence:${editor.document.id}`;
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
  const document = composition.documents.find((s) => s.id === id) ?? exampleSequences.find((s) => s.id === id);
  if (!document) return;
  stopPlayback();
  editor = new SequenceEditor($state.snapshot(document), $state.snapshot(settings.editor));
  composition.selectedId = null;
  composition.cursor = document.steps.reduce((end, s) => Math.max(end, s.start + s.beats), 0);
  composition.error = '';
  sync();
  ui.tab = 'editor';
  if (autoplay) playSelection();
}

export function newSequence() {
  stopPlayback();
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

export function duplicateSequence() {
  const original = editor.document;
  const copy = { ...original, id: crypto.randomUUID(), title: availableTitle(`${original.title} (copy)`) };
  composition.documents = [...composition.documents, copy];
  selectSequence(copy.id);
  notify(`Created ${copy.title}`);
}

export function deleteSequence() {
  const removed = editor.document;
  composition.documents = composition.documents.filter((s) => s.id !== removed.id);
  if (composition.documents.length) selectSequence(composition.documents[0].id);
  else newSequence();
  notify(
    `Deleted ${removed.title}`,
    () => {
      composition.documents = [...composition.documents.filter((s) => s.id !== removed.id), removed];
      selectSequence(removed.id);
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

export function selectStep(id: string) {
  chordEntry.cancel();
  ui.harmonyContext = 'timeline';
  composition.selectedId = id;
  const s = editor.document.steps.find((s) => s.id === id);
  if (s) composition.cursor = s.start + s.beats;
  composition.error = '';
}

export function selectTimeline(at: number) {
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
      ? (sequenceKeyAt(document, contextBeat) ?? sequenceChart(document).key)
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
  chordEntry.finishReleased();
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
    if (ui.inputSerial === take.inputSerial && !take.heldAtStart) return [];
    const now = take.started + ui.recordingElapsed;
    const origin = take.origin ?? take.started;
    return session.chords
      .filter((c) => c.t1 > take.started && c.t0 < now && (c.t0 >= take.started - 1 || take.heldAtStart))
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
    const chords = input.target.selectedId ? input.chords.slice(-1) : input.chords;
    return chords.map((chord, index) => ({
      ...chord,
      id: `input-preview:${index}`,
      start: input.target.start + index * input.target.beats,
      beats: input.target.beats,
      key: input.target.key ?? undefined,
    }));
  }
  if (settings.editor.autoCaptureChords && ui.sourceId === `sequence:${doc.id}`) return [];
  if (ui.harmonyContext !== 'input' || !session.now.best) return [];
  return [
    {
      id: 'input-preview',
      symbol: chordName(session.now.best, session.activeKey),
      start: composition.selectedId
        ? (doc.steps.find((s) => s.id === composition.selectedId)?.start ?? sequenceEnd())
        : sequenceEnd(),
      beats: barQuarters(doc.meter, doc.denominator),
      notes: session.now.notes,
      key: session.activeKey ?? undefined,
      velocity: ui.inputVelocity,
    },
  ].filter((s) => s.symbol);
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
    (step?.id.startsWith('input')
      ? (composition.input?.target.key ?? session.keyLock ?? step.key)
      : step
        ? sequenceKeyAt(doc, playing ? beat : step.start)
        : doc.key) ?? session.activeKey;
  const chord = ui.playing
    ? (parseChordSymbol(ui.preview ?? '') ?? identify(ui.playing, key).best)
    : step
      ? parseChordSymbol(step.symbol)
      : null;
  const notes = ui.playing ?? step?.notes ?? [];
  const name = chord ? (ui.playing ? chordName(chord, key) : (step?.symbol ?? chordName(chord, key))) : '';
  return {
    chord,
    notes,
    name,
    key,
    roman: chord && key ? analyzeRoman(chord, key) : null,
    step,
    heading: ui.recording
      ? 'Recording'
      : ui.playing
        ? 'Preview'
        : playing
          ? ui.playbackPaused
            ? 'Paused'
            : 'Playing'
          : 'Chord',
    position: step
      ? `${timelinePosition(step.start, doc.meter, doc.denominator)} · ${+(step.beats / beatQuarters(doc.denominator)).toFixed(2)} beats`
      : '',
  };
}

export async function resetWorkspace() {
  if (ui.recording) await stopRecording();
  stopPlayback();
  session.clear();
  composition.take = null;
  composition.selectedId = null;
  composition.cursor = 0;
  editSequence((e) => e.clear());
  notify('Timeline and input reset. Undo restores the chords.');
}

recordingHooks.start = () => {
  const doc = editor.document;
  const held = [...session.seg.held].map(([note, data]) => ({ note, velocity: data.vel }));
  const sustained = [...session.seg.sustained].filter((note) => !session.seg.held.has(note));
  const started = performance.now();
  composition.take = {
    started,
    at: composition.cursor,
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
recordingHooks.stop = (recording) => {
  const take = composition.take;
  if (!take) return;
  ui.recordingElapsed = recording.durationMs;
  if (editor.document.id !== take.songId) selectSequence(take.songId);
  const steps = inputTimeline();
  composition.take = null;
  if (!recording.input.some((e) => e.kind === 'on') || !steps.length) return;
  selectTimeline(steps[0].start);
  acceptChords(
    steps.map((s, i) => {
      const onset = ((s.start - take.at) * 60000) / take.bpm + ((take.origin ?? take.started) - take.started);
      const nextOnset =
        (((steps[i + 1]?.start ?? s.start + s.beats) - take.at) * 60000) / take.bpm +
        ((take.origin ?? take.started) - take.started);
      const attacks = recording.input.filter((e) => e.kind === 'on' && e.t >= onset - 1 && e.t < nextOnset);
      return {
        ...s,
        velocity: attacks.length ? Math.round(attacks.reduce((sum, e) => sum + e.vel, 0) / attacks.length) : s.velocity,
        beats: Math.max(
          MUSIC_LIMITS.minChordBeats,
          Math.min(MUSIC_LIMITS.maxChordBeats, (steps[i + 1]?.start ?? s.start + s.beats) - s.start),
        ),
      };
    }),
  );
};

export function refreshCompositionSettings() {
  editor.settings = $state.snapshot(settings.editor);
  if (ui.sourceId !== `sequence:${editor.document.id}`) return;
  const playing = !!ui.nowPlaying;
  const at = ui.playbackPosition;
  preparePiece(sequencePiece(editor.document, editor.settings));
  ui.playbackPosition = at;
  if (playing) resumePlayback(at);
}

export const exportSequenceMidi = () => downloadMidi(sequencePiece(editor.document, $state.snapshot(settings.editor)));
sync(false);
if (regroupedSongs) {
  persist({ sequences: $state.snapshot(composition.documents) });
  notify(
    'Saved songs with unsupported meter denominators now use /4 grouping. Notes and playback timing are unchanged.',
  );
}
