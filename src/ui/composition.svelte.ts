import { MUSIC_LIMITS } from '../config/settings';
import { settings } from './store.svelte';
import {
  emptySequence,
  SequenceEditor,
  sequenceChart,
  sequenceFromChart,
  sequencePiece,
  sequenceKeyAt,
  type ChordInput,
  type Sequence,
} from '../engine/sequence';
import { EXAMPLES } from '../engine/chart';
import { computeReach, type Path } from '../engine/coach';
import { parseChordSymbol } from '../theory/symbols';
import { chordName, identify } from '../theory/chords';
import { analyzeRoman } from '../theory/roman';
import { keyIndex } from '../theory/scales';
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
  stopRecording,
} from './store.svelte';

function restore(): Sequence[] {
  const documents: Sequence[] = [];
  for (const raw of (Array.isArray(saved.sequences) ? saved.sequences : []) as Sequence[]) {
    try {
      if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || !Array.isArray(raw.steps)) continue;
      const editor = new SequenceEditor(emptySequence(raw.title, raw.id));
      editor.update({ bpm: raw.bpm, meter: raw.meter, key: raw.key });
      let end = 0;
      for (const s of raw.steps) {
        const at = s.start ?? end;
        editor.place([s], at);
        end = at + s.beats;
      }
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
  selectedId: (initial.steps[initial.steps.length - 1]?.id ?? null) as string | null,
  cursor: initial.steps.reduce((end, s) => Math.max(end, s.start + s.beats), 0),
  documents: restored.length ? restored : [initial],
  error: '',
  take: null as { started: number; at: number; bpm: number; songId: string; inputSerial: number } | null,
});

export const currentSequence = () => editor.document;
export const canUndo = () => editor.canUndo;
export const canRedo = () => editor.canRedo;

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

export function editSequence(action: (editor: SequenceEditor) => void) {
  try {
    composition.error = '';
    const playing = !!ui.nowPlaying && ui.sourceId === `sequence:${editor.document.id}`;
    const beat = (ui.playbackPosition * editor.document.bpm) / 60000;
    editor.settings = $state.snapshot(settings.editor);
    action(editor);
    stopPlayback();
    sync();
    ui.tab = 'editor';
    if (playing) resumePlayback((beat * 60000) / editor.document.bpm);
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
  composition.selectedId = document.steps[document.steps.length - 1]?.id ?? null;
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

export function timelinePosition(beat: number, meter: number) {
  const within = +((beat % meter) + 1).toFixed(2);
  return `bar ${Math.floor(beat / meter) + 1}, beat ${within}`;
}

export function suggestionDestination() {
  void composition.revision;
  const doc = editor.document;
  const live = ui.harmonyContext === 'input';
  return { title: doc.title, position: timelinePosition(composition.cursor, doc.meter), live };
}

export function selectStep(id: string) {
  ui.harmonyContext = 'timeline';
  composition.selectedId = id;
  const s = editor.document.steps.find((s) => s.id === id);
  if (s) composition.cursor = s.start + s.beats;
  composition.error = '';
}

export function selectTimeline(at: number) {
  ui.harmonyContext = 'timeline';
  composition.selectedId = null;
  composition.cursor = Math.max(0, at);
  composition.error = '';
}

export function compositionContext() {
  void composition.revision;
  void ui.tick;
  const document = editor.document;
  const editing = ui.harmonyContext === 'timeline' && ui.sourceId === `sequence:${document.id}`;
  const playbackIndex =
    ui.nowPlaying && ui.sourceId === `sequence:${document.id}`
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
  const key = editing
    ? (sequenceKeyAt(
        document,
        playbackIndex >= 0 ? (ui.playbackPosition * document.bpm) / 60000 : (current?.start ?? composition.cursor),
      ) ?? sequenceChart(document).key)
    : session.activeKey;
  const last = editing ? (current ? parseChordSymbol(current.symbol) : null) : session.now.best;
  const voicing = editing ? (current?.notes ?? null) : session.lastVoicing;
  const recent = editing
    ? document.steps
        .slice(0, upto)
        .slice(-8)
        .map((s) => parseChordSymbol(s.symbol)!)
    : session.chords.slice(-8).map((s) => s.chord);
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
    composition.selectedId =
      replace && composition.selectedId
        ? e.replaceWith(composition.selectedId, chords)
        : e.place(chords, composition.cursor);
  });
  if (added && announce)
    notify(
      `${replace ? 'Replaced with' : 'Added'} ${inputs.map((c) => c.symbol).join(' → ')} · ${destination.title} · ${destination.position}`,
    );
}

export function acceptPath(path: Path) {
  const from = compositionContext().key ?? undefined;
  const to = session.target ?? from;
  acceptChords(
    path.steps.map((s, i) => ({ symbol: s.name, notes: s.voicing, key: i === path.steps.length - 1 ? to : from })),
  );
  if (!composition.error) {
    session.setTarget(null);
    ui.nextTab = 'chords';
  }
}

export function importChart(text: string) {
  try {
    const imported = sequenceFromChart(text, editor.document.title);
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
    if (ui.inputSerial === take.inputSerial) return [];
    const now = take.started + ui.recordingElapsed;
    return session.chords
      .filter((c) => c.t1 > take.started && c.t0 < now)
      .map((c, i, chords) => {
        const start = Math.max(take.started, c.t0);
        const end = Math.max(start, Math.min(now, chords[i + 1]?.t0 ?? c.t1));
        return {
          id: `input:${c.id}`,
          symbol: c.name,
          start: take.at + ((start - take.started) * take.bpm) / 60000,
          beats: Math.max(MUSIC_LIMITS.minChordBeats, ((end - start) * take.bpm) / 60000),
          notes: c.notes,
          key: c.key ?? undefined,
          velocity: settings.editor.velocity,
        };
      });
  }
  if (ui.harmonyContext !== 'input' || !session.now.best) return [];
  return [
    {
      id: 'input-preview',
      symbol: chordName(session.now.best, session.activeKey),
      start: composition.cursor,
      beats: doc.meter,
      notes: session.now.notes,
      key: session.activeKey ?? undefined,
      velocity: settings.editor.velocity,
    },
  ].filter((s) => s.symbol);
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
      : doc.steps.find((s) => s.id === composition.selectedId));
  const key =
    (step?.id.startsWith('input')
      ? (session.keyLock ?? step.key)
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
    position: step ? `${timelinePosition(step.start, doc.meter)} · ${+step.beats.toFixed(2)} beats` : '',
  };
}

export function commitInputPreview() {
  const steps = inputTimeline();
  if (!steps.length || composition.take) return;
  acceptChords(steps.map((s) => ({ ...s, beats: editor.document.meter })));
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
  composition.take = {
    started: performance.now(),
    at: composition.cursor,
    bpm: doc.bpm,
    songId: doc.id,
    inputSerial: ui.inputSerial,
  };
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
    steps.map((s, i) => ({
      ...s,
      beats: Math.max(
        MUSIC_LIMITS.minChordBeats,
        Math.min(MUSIC_LIMITS.maxChordBeats, (steps[i + 1]?.start ?? s.start + s.beats) - s.start),
      ),
    })),
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
