import {
  emptySequence,
  SequenceEditor,
  sequenceChart,
  sequenceFromChart,
  sequencePiece,
  type ChordInput,
  type Sequence,
} from '../engine/sequence';
import { EXAMPLES } from '../engine/chart';
import { computeReach, type Path } from '../engine/coach';
import { parseChordSymbol } from '../theory/symbols';
import { keyIndex } from '../theory/scales';
import {
  downloadMidi,
  persist,
  playSelection,
  preparePiece,
  resumePlayback,
  session,
  stopPlayback,
  ui,
} from './store.svelte';

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem('chordsh') ?? localStorage.getItem('musify') ?? '{}');
  } catch {
    return {};
  }
})();

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
      const document = editor.document;
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
const initial = restored.find((s) => s.id === saved.activeSequenceId) ?? restored[0] ?? emptySequence();
let editor = new SequenceEditor(initial);
export const composition = $state({
  revision: 0,
  selectedId: (initial.steps[initial.steps.length - 1]?.id ?? null) as string | null,
  cursor: initial.steps.reduce((end, s) => Math.max(end, s.start + s.beats), 0),
  documents: restored.length ? restored : [initial],
  error: '',
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
  preparePiece(sequencePiece(document));
  session.loadSong(sequenceChart(document));
  ui.tempo = document.bpm;
  ui.meter = document.meter;
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
    action(editor);
    stopPlayback();
    sync();
    ui.tab = 'editor';
    if (playing) resumePlayback((beat * 60000) / editor.document.bpm);
  } catch (error) {
    composition.error = (error as Error).message;
  }
}

export function selectSequence(id: string, autoplay = false) {
  const document = composition.documents.find((s) => s.id === id) ?? exampleSequences.find((s) => s.id === id);
  if (!document) return;
  stopPlayback();
  editor = new SequenceEditor($state.snapshot(document));
  composition.selectedId = document.steps[document.steps.length - 1]?.id ?? null;
  composition.cursor = document.steps.reduce((end, s) => Math.max(end, s.start + s.beats), 0);
  composition.error = '';
  sync();
  ui.tab = 'editor';
  if (autoplay) playSelection();
}

export function newSequence() {
  stopPlayback();
  editor = new SequenceEditor(emptySequence());
  composition.selectedId = null;
  composition.cursor = 0;
  composition.error = '';
  sync();
  ui.tab = 'editor';
}

export function deleteSequence() {
  const id = editor.document.id;
  composition.documents = composition.documents.filter((s) => s.id !== id);
  if (composition.documents.length) selectSequence(composition.documents[0].id);
  else newSequence();
}

export function selectStep(id: string) {
  composition.selectedId = id;
  const s = editor.document.steps.find((s) => s.id === id);
  if (s) composition.cursor = s.start + s.beats;
  composition.error = '';
}

export function selectTimeline(at: number) {
  composition.selectedId = null;
  composition.cursor = Math.max(0, at);
  composition.error = '';
}

export function compositionContext() {
  void composition.revision;
  void ui.tick;
  const document = editor.document;
  const editing = ui.sourceId === `sequence:${document.id}`;
  const index = composition.selectedId
    ? document.steps.findIndex((s) => s.id === composition.selectedId)
    : document.steps.findLastIndex((s) => s.start + s.beats <= composition.cursor + 1e-8);
  const upto = index + 1;
  const current = document.steps[upto - 1];
  const key = editing
    ? (session.keyLock ?? current?.key ?? document.key ?? sequenceChart(document).key)
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

export function acceptChords(inputs: ChordInput[], replace = false) {
  const key = compositionContext().key ?? undefined;
  const home = editor.document.key;
  const region = key && (!home || keyIndex(key) !== keyIndex(home)) ? key : undefined;
  editSequence((e) => {
    const chords = inputs.map((input) => ({ ...input, key: input.key ?? region }));
    composition.selectedId =
      replace && composition.selectedId
        ? e.replaceWith(composition.selectedId, chords)
        : e.place(chords, composition.cursor);
  });
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

export function captureProgression() {
  const chords = session.chords;
  if (!chords.length) return;
  const bpm = session.tempo.bpm ?? ui.tempo;
  const document = emptySequence('From playing');
  document.bpm = bpm;
  document.key = session.activeKey;
  stopPlayback();
  editor = new SequenceEditor(document);
  editor.insert(
    chords.map((c) => ({
      symbol: c.name,
      notes: c.notes,
      key: c.key ?? undefined,
      beats: Math.max(0.25, Math.min(64, ((c.t1 - c.t0) * bpm) / 60000)),
    })),
  );
  composition.selectedId = null;
  composition.cursor = editor.document.steps.reduce((end, s) => Math.max(end, s.start + s.beats), 0);
  sync();
  ui.tab = 'editor';
}

export const exportSequenceMidi = () => downloadMidi(sequencePiece(editor.document));
sync(false);
