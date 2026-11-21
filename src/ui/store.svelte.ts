import { restoreSettings, settingsSchema, type Settings } from '../config/settings';
import { keyFromIndex, type Key } from '../theory/scales';
import { chordName, identify } from '../theory/chords';
import { beatQuarters } from '../theory/meter';
import { Session } from '../engine/session';
import { Midi } from '../io/midi';
import { Synth } from '../io/synth';
import { BUILT_IN, type Piece } from '../library/pieces';
import { Recorder, saveRecording, type Recording } from '../io/recorder';
import { writeMidi } from '../io/midiexport';
import { songFromPerformance } from '../library/toSong';
import type { MelodyNote, Sequence } from '../engine/sequence';

const saved = (() => {
  try {
    const value = JSON.parse(localStorage.getItem('chordsh') ?? localStorage.getItem('musify') ?? '{}');
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
})();

export const savedData = saved;

const restored = restoreSettings(
  saved.settings ?? {
    preferences: Object.fromEntries(
      ['sound', 'tempo', 'monitor', 'theme', 'style', 'input', 'output', 'meter', 'click']
        .filter((key) => saved[key] !== undefined)
        .map((key) => [key, saved[key]]),
    ),
    panels: saved.panels,
  },
);
export const settings = $state(restored.settings);
if (saved.settings?.preferences?.theme === undefined && saved.theme === undefined)
  settings.preferences.theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
export const settingsWarnings = restored.warnings;

/** Bridge between the framework-free engine and Svelte: one throttled tick per frame. */
export const session = new Session($state.snapshot(settings));
export const synth = new Synth();
synth.configure($state.snapshot(settings.audio));
/** Everything you play (MIDI, computer keys, on-screen piano) goes through here: analysis + optional sound. */
export const recorder = new Recorder();
/** Only physical/interactive input enters the sketch editor; scheduled performances bypass these hooks. */
export const inputHooks = {
  noteOn: (_note: number, _velocity: number) => {},
  noteOff: (_note: number) => {},
  pedal: (_on: boolean) => {},
  cancel: () => {},
};
const inputAttacks = new Map<number, number>();
export const live = {
  noteOn: (
    n: number,
    v: number,
    t = performance.now(),
    monitor = settings.preferences.monitor,
    forward = true,
    playback = false,
  ) => {
    if (!playback && (ui.preview || ui.previewScore)) stopAudition();
    if (!playback) inputHooks.noteOn(n, v);
    ui.inputSerial++;
    inputAttacks.set(n, ui.inputSerial);
    if (!playback) {
      ui.harmonyContext = 'input';
      ui.inputVelocity = v;
    }
    if (!playback) {
      if (ui.recording) recordingHooks.noteOn(t);
      recorder.input('on', n, v, t);
    }
    session.noteOn(n, v, t);
    if (monitor) synth.noteOn(n, v);
    if (forward && (settings.preferences.sound === 'midi' || settings.preferences.sound === 'both') && outputReady())
      midi.message([0x90, n, v]);
  },
  noteOff: (n: number, t = performance.now(), forward = true, playback = false) => {
    inputAttacks.delete(n);
    if (!playback) recorder.input('off', n, 0, t);
    session.noteOff(n, t);
    if (!playback) inputHooks.noteOff(n);
    synth.noteOff(n);
    if (forward && (settings.preferences.sound === 'midi' || settings.preferences.sound === 'both'))
      midi.message([0x80, n, 0]);
  },
  pedal: (on: boolean, t = performance.now(), forward = true, playback = false) => {
    ui.inputPedal = on;
    if (!playback) recorder.input('pedal', 0, on ? 127 : 0, t);
    session.pedal(on, t);
    if (!playback) inputHooks.pedal(on);
    synth.setPedal(on);
    if (forward && (settings.preferences.sound === 'midi' || settings.preferences.sound === 'both'))
      midi.control(64, on ? 127 : 0);
  },
};
export const midi = new Midi({
  noteOn: (n, v, t) => live.noteOn(n, v, t, settings.preferences.monitor, false),
  noteOff: (n, t) => live.noteOff(n, t, false),
  pedal: (on, t) => live.pedal(on, t, false),
});
midi.onRaw = (d, port, t) => recorder.midi(d, port, t);

export interface PreviewCue {
  name: string;
  notes: number[];
  startMs: number;
  durationMs: number;
  key?: Key | null;
  stage?: 'before' | 'idea' | 'after';
}
export interface PreviewInfo {
  id?: string;
  sources?: string[];
  names?: string[];
  key?: Key | null;
  cues?: PreviewCue[];
  maxDurationMs?: number;
  suggestionSpan?: { start: number; end: number };
  stage?: PreviewCue['stage'];
  melody?: { start: number; bpm: number; notes: readonly MelodyNote[] };
  context?: {
    before?: Pick<PreviewCue, 'name' | 'key'>;
    after?: Pick<PreviewCue, 'name' | 'key'>;
  };
}
export interface PreviewScore {
  id: string;
  label: string;
  sources: string[];
  cues: PreviewCue[];
  context?: PreviewInfo['context'];
  suggestionSpan?: PreviewInfo['suggestionSpan'];
  active: number;
  status: 'playing' | 'finished' | 'stopped';
}

export const ui = $state({
  tick: 0,
  /** Notes currently being auditioned (shown on the piano). */
  playing: null as number[] | null,
  playingId: '',
  playingStep: -1,
  /** User charts, saved in the browser. */
  charts: (saved.charts ?? []) as { title: string; text: string }[],
  /** Title of the library piece currently playing. */
  nowPlaying: null as string | null,
  preview: null as string | null,
  /** A stable score for the audition; note releases never change its chord labels. */
  previewScore: null as PreviewScore | null,
  loading: false,
  playbackRequest: 0,
  playbackPosition: 0,
  playbackDuration: 0,
  loadedTitle: '',
  sourceId: 'piece:demo',
  performanceChoices: BUILT_IN.map((p) => ({ id: p.id, title: p.title })),
  playbackError: '',
  playbackPaused: false,
  metronome: false,
  savedLocally: true,
  projectSavePending: false,
  notice: null as { message: string; action?: () => void; actionLabel?: string } | null,
  /** Main panel: one song timeline, or the library. */
  tab: 'editor' as 'editor' | 'library',
  harmonyContext: 'timeline' as 'timeline' | 'input',
  /** Play what you play through the browser synth (for controllers without speakers, e.g. MPK mini). */
  audioBlocked: true,
  recording: false,
  recordingElapsed: 0,
  inputSerial: 0,
  inputCancelSerial: 0,
  inputVelocity: 80,
  inputPedal: false,
  /** Where bars come from: estimated from playing, a metronome, or a MIDI file's tempo. */
  bars: 'auto' as 'auto' | 'metronome' | 'file',
  recNote: '',
  recMsg: '',
});
synth.onState = () => (ui.audioBlocked = synth.blocked);
synth.init(); // show the browser's actual audio state before the first note
synth.setMuted(!settings.preferences.monitor);

let queued = false;
const bump = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    ui.tick++;
  });
};
session.onChange = bump;
midi.onPorts = bump;

export function persist(extra: Record<string, unknown> = {}) {
  if ('sequences' in extra) ui.projectSavePending = true;
  Object.assign(
    saved,
    {
      settings: $state.snapshot(settings),
      charts: $state.snapshot(ui.charts),
    },
    extra,
  );
  try {
    localStorage.setItem('chordsh', JSON.stringify(saved));
    ui.savedLocally = true;
    ui.projectSavePending = false;
  } catch {
    ui.savedLocally = false;
  }
}
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
export function dismissNotice() {
  clearTimeout(noticeTimer);
  ui.notice = null;
}
export function notify(message: string, action?: () => void, actionLabel = 'Undo') {
  dismissNotice();
  ui.notice = { message, action, actionLabel };
  if (!action) noticeTimer = setTimeout(dismissNotice, 10000);
}

/** Validate once and apply atomically. Invalid settings never stop playback or replace working settings. */
export function applySettings(value: unknown) {
  const next = settingsSchema.parse(value);
  inputHooks.cancel();
  const engineChanged = ['beats', 'accents', 'segmentation', 'harmony', 'analysis'].some(
    (key) => JSON.stringify(next[key as keyof Settings]) !== JSON.stringify(settings[key as keyof Settings]),
  );
  const previous = settings.preferences;
  const routingChanged = previous.sound !== next.preferences.sound || previous.output !== next.preferences.output;
  const metronomeChanged = previous.bars !== next.preferences.bars || previous.click !== next.preferences.click;
  const timingChanged =
    previous.bars !== next.preferences.bars ||
    previous.tempo !== next.preferences.tempo ||
    previous.meter !== next.preferences.meter ||
    previous.meterDenominator !== next.preferences.meterDenominator;
  if (engineChanged || routingChanged || timingChanged) stopPlayback();
  if (engineChanged) session.configure(next);
  Object.assign(settings, next);
  session.settings.prediction = structuredClone(next.prediction);
  session.setStyle(next.preferences.style);
  session.seg.splitMode =
    next.preferences.splitMode === 'fixed' ? next.preferences.splitNote : next.preferences.splitMode;
  session.setKeyLock(next.preferences.keyLock < 0 ? null : keyFromIndex(next.preferences.keyLock));
  if (midi.inputId !== next.preferences.input) {
    midi.inputId = next.preferences.input;
    midi.refresh();
  }
  midi.outputId = next.preferences.output;
  synth.setMuted(!next.preferences.monitor);
  synth.configure(next.audio);
  if (engineChanged || timingChanged) setBars(next.preferences.bars);
  if (metronomeChanged) setMetronome(next.preferences.bars === 'metronome' && next.preferences.click);
  else if (timingChanged && metronomeTimer !== undefined && selectedPiece.bpm === undefined) syncMetronome();
  ui.tick++;
  persist();
}

let timers: ReturnType<typeof setTimeout>[] = [];
function showPreview(label: string, info: PreviewInfo, cues: PreviewCue[]) {
  const id = info.id ?? '';
  ui.previewScore = {
    id,
    label,
    sources: info.sources ?? [],
    cues,
    context: info.context,
    suggestionSpan: info.suggestionSpan,
    active: 0,
    status: 'playing',
  };
  ui.playingId = id;
  cues.forEach((cue, index) => {
    timers.push(
      setTimeout(() => {
        if (ui.previewScore) ui.previewScore.active = index;
        ui.playingStep = index;
      }, 60 + cue.startMs),
    );
  });
}

function finishAudition() {
  stopAudition(true);
  if (ui.previewScore) ui.previewScore.status = 'finished';
}

function outputReady() {
  if (settings.preferences.sound === 'midi' && (!midi.outputId || !midi.outputs.some((p) => p.id === midi.outputId))) {
    ui.playbackError = 'Choose a MIDI output in Settings to play through your DAW.';
    return false;
  }
  ui.playbackError = '';
  return true;
}

const previewTimeScale = (durationMs: number, maxDurationMs = Infinity) =>
  durationMs > 0 ? Math.min(1, maxDurationMs / durationMs) : 1;

/** Play a sequence of voicings through the synth and/or MIDI out, highlighting each step. */
export function audition(
  seq: number[][],
  id = '',
  beats: number | number[] = 2,
  label = 'Chord preview',
  velocities: number | number[] = settings.editor.velocity,
  info: PreviewInfo = {},
) {
  if (!seq.length || !outputReady()) return;
  ui.playbackRequest++;
  ui.loading = false;
  stopPiece();
  stopAudition();
  ui.preview = label;
  const beatAtTempo = 60 / (info.melody?.bpm ?? selectedPiece.bpm ?? settings.preferences.tempo);
  const durations = seq.map((_, i) => (Array.isArray(beats) ? (beats[i] ?? 2) : beats));
  const totalBeats = durations.reduce((sum, duration) => sum + duration, 0);
  const beat = beatAtTempo * previewTimeScale(1000 * beatAtTempo * totalBeats, info.maxDurationMs);
  const t0 = performance.now() + 60;
  let at = 0; // seconds
  const cues: PreviewCue[] = [];
  const sounds: { notes: number[]; at: number; duration: number; velocity: number }[] = [];
  seq.forEach((notes, i) => {
    const velocity = Array.isArray(velocities) ? (velocities[i] ?? settings.editor.velocity) : velocities;
    const dur = beat * durations[i];
    const chord = identify(notes, info.key).best;
    cues.push({
      name: info.names?.[i] ?? (chord ? chordName(chord, info.key) : label),
      notes: [...notes],
      startMs: at * 1000,
      durationMs: dur * 1000,
      key: info.key,
      stage: info.stage,
    });
    sounds.push({ notes, at, duration: dur * settings.editor.gate, velocity });
    timers.push(
      setTimeout(
        () => {
          ui.playing = notes;
          ui.playingId = id;
          ui.playingStep = i;
        },
        60 + at * 1000,
      ),
    );
    at += dur;
  });
  if (info.melody) {
    const from = info.melody.start;
    const to = from + totalBeats;
    for (const note of info.melody.notes) {
      const start = Math.max(note.start, from);
      const end = Math.min(note.start + note.beats, to);
      if (end > start)
        sounds.push({
          notes: [note.pitch],
          at: (start - from) * beat,
          duration: (end - start) * beat,
          velocity: note.velocity,
        });
    }
  }
  for (const sound of sounds.sort((a, b) => a.at - b.at)) {
    if (settings.preferences.sound === 'synth' || settings.preferences.sound === 'both')
      synth.play(sound.notes, 0.06 + sound.at, sound.duration, sound.velocity);
    if (settings.preferences.sound === 'midi' || settings.preferences.sound === 'both')
      midi.send(sound.notes, t0 + sound.at * 1000, sound.duration * 1000, sound.velocity);
  }
  showPreview(label, { ...info, id: info.id ?? id }, cues);
  timers.push(setTimeout(finishAudition, 60 + at * 1000));
}

/** Audition an already rendered arrangement without replacing the song or recording it as live input. */
export function previewArrangement(piece: Piece, label: string, info: PreviewInfo = {}) {
  if (!piece.notes.length || !outputReady()) return;
  ui.playbackRequest++;
  ui.loading = false;
  stopPiece();
  stopAudition();
  ui.preview = label;
  const durationMs = piece.durationMs ?? piece.notes.reduce((end, [at, length]) => Math.max(end, at + length), 0);
  const scale = previewTimeScale(durationMs, info.maxDurationMs);
  if (info.cues?.length)
    showPreview(
      label,
      info,
      info.cues.map((cue) => ({ ...cue, startMs: cue.startMs * scale, durationMs: cue.durationMs * scale })),
    );
  const held = new Map<number, number>();
  const lead = 60;
  const start = performance.now() + lead;
  for (const [onset, length, note, velocity] of piece.notes) {
    const at = onset * scale;
    const duration = length * scale;
    if (settings.preferences.sound === 'synth' || settings.preferences.sound === 'both')
      synth.play([note], (lead + at) / 1000, duration / 1000, velocity);
    if (settings.preferences.sound === 'midi' || settings.preferences.sound === 'both')
      midi.send([note], start + at, duration, velocity);
    timers.push(
      setTimeout(() => {
        held.set(note, (held.get(note) ?? 0) + 1);
        ui.playing = [...held.keys()];
      }, lead + at),
    );
    timers.push(
      setTimeout(
        () => {
          const count = (held.get(note) ?? 1) - 1;
          if (count) held.set(note, count);
          else held.delete(note);
          ui.playing = [...held.keys()];
        },
        lead + at + duration,
      ),
    );
  }
  timers.push(setTimeout(finishAudition, lead + durationMs * scale));
}

/** Analysis bars from fixed tempo, a MIDI file, or estimated from playing. */
export function setBars(
  mode: 'auto' | 'metronome' | 'file',
  bpm = settings.preferences.tempo,
  beatsPerBar = settings.preferences.meter,
  start = performance.now() + 100,
  denominator: number = settings.preferences.meterDenominator,
) {
  ui.bars = mode;
  session.setTempo(mode === 'auto' ? null : bpm, beatsPerBar, start, denominator);
}

export function stopAudition(keepPreview = false) {
  stopInputChord();
  timers.forEach(clearTimeout);
  timers = [];
  synth.stop();
  midi.panic();
  ui.playing = null;
  ui.playingId = '';
  ui.playingStep = -1;
  ui.preview = null;
  if (keepPreview && ui.previewScore) ui.previewScore.status = 'stopped';
  else {
    ui.previewScore = null;
  }
}

let pieceTimers: ReturnType<typeof setTimeout>[] = [];
const pieceNotes = new Set<number>();
let selectedPiece = BUILT_IN[0];

/** Release only attacks owned by this gesture, preserving held or subsequently retriggered notes. */
export function holdInputNotes(notes: number[], velocity = settings.editor.velocity) {
  const owned = new Map<number, number>();
  const at = performance.now();
  for (const n of new Set(notes)) {
    if (session.seg.held.has(n)) continue;
    live.noteOn(n, velocity, at);
    owned.set(n, inputAttacks.get(n)!);
  }
  return () => {
    const at = performance.now();
    for (const [n, attack] of owned) if (inputAttacks.get(n) === attack) live.noteOff(n, at);
    owned.clear();
  };
}

let inputChordTimer: ReturnType<typeof setTimeout> | undefined;
let releaseInputChord: (() => void) | undefined;
export function stopInputChord() {
  clearTimeout(inputChordTimer);
  inputChordTimer = undefined;
  releaseInputChord?.();
  releaseInputChord = undefined;
}

/** Enter a simultaneous live chord so analysis, timeline preview and recording all hear it. */
export function playInputChord(notes: number[]) {
  if (!notes.length || !outputReady()) return;
  stopInputChord();
  if (ui.preview) stopAudition();
  releaseInputChord = holdInputNotes(notes);
  const beat = (60000 / (selectedPiece.bpm ?? settings.preferences.tempo)) * (4 / (selectedPiece.denominator ?? 4));
  inputChordTimer = setTimeout(stopInputChord, beat * settings.editor.pianoChordBeats * settings.editor.gate);
}
const performanceLoaders = new Map<string, () => Promise<Piece>>(BUILT_IN.map((p) => [p.id, async () => p]));
let playbackStarted = 0;
let playbackOffset = 0;
let metronomeTimer: ReturnType<typeof setTimeout> | undefined;

function stopMetronome() {
  clearTimeout(metronomeTimer);
  metronomeTimer = undefined;
}

function scheduleMetronome(origin: number, from = origin) {
  stopMetronome();
  if (!ui.metronome) return;
  const { bpm = settings.preferences.tempo, beatsPerBar = 4, denominator = 4 } = selectedPiece;
  const period = (60000 / bpm) * beatQuarters(denominator);
  let beat = Math.ceil((from - origin) / period - 1e-8);
  const tick = () => {
    const now = performance.now();
    // Skip missed beats after a stalled or backgrounded tab.
    beat = Math.max(beat, Math.floor((now - origin) / period));
    synth.click(beat % beatsPerBar === 0);
    metronomeTimer = setTimeout(tick, origin + ++beat * period - now);
  };
  metronomeTimer = setTimeout(tick, origin + beat * period - performance.now());
}

function syncMetronome() {
  const now = performance.now();
  if (ui.nowPlaying) scheduleMetronome(playbackStarted - playbackOffset, Math.max(playbackStarted, now));
  else scheduleMetronome(now + 80);
}

export function setMetronome(enabled: boolean) {
  ui.metronome = enabled;
  if (!enabled) {
    stopMetronome();
    return;
  }
  synth.unlock();
  syncMetronome();
}

export function registerPerformance(id: string, title: string, load: () => Promise<Piece>) {
  performanceLoaders.set(id, load);
  const existing = ui.performanceChoices.find((p) => p.id === id);
  if (!existing) ui.performanceChoices = [...ui.performanceChoices, { id, title }];
  else if (existing.title !== title) existing.title = title;
}

export function preparePiece(piece: Piece) {
  const timingChanged =
    piece.bpm !== selectedPiece.bpm ||
    piece.beatsPerBar !== selectedPiece.beatsPerBar ||
    piece.denominator !== selectedPiece.denominator;
  selectedPiece = piece;
  if (timingChanged && metronomeTimer !== undefined && !ui.nowPlaying) syncMetronome();
  ui.playbackPaused = false;
  ui.harmonyContext = 'timeline';
  ui.sourceId = `${piece.source === 'sequence' ? 'sequence' : 'piece'}:${piece.id}`;
  ui.loadedTitle = piece.title;
  ui.playbackDuration =
    piece.durationMs ??
    (piece.pedal ?? []).reduce(
      (end, [at]) => Math.max(end, at),
      piece.notes.reduce((end, [t, d]) => Math.max(end, t + d), 0),
    );
  ui.playbackPosition = 0;
  ui.playbackError = '';
  if (piece.source !== 'sequence') registerPerformance(piece.id, piece.title, async () => piece);
}

/** Keep the editable timeline in sync even when listening to the original performance. */
export const performanceHooks = { open: (_song: Sequence) => {} };

export async function choosePerformance(
  id: string,
  autoplay = false,
  makeSong: (piece: Piece) => Sequence | Promise<Sequence> = songFromPerformance,
) {
  const load = performanceLoaders.get(id);
  if (!load) return;
  stopPlayback();
  const request = ui.playbackRequest;
  ui.loading = true;
  ui.playbackError = '';
  try {
    const piece = await load();
    if (request !== ui.playbackRequest) return;
    const song = await makeSong(piece);
    if (request !== ui.playbackRequest) return;
    performanceHooks.open({ ...song, id: `song:${piece.id}` });
    preparePiece(piece);
    ui.harmonyContext = 'timeline';
    if (autoplay) playPiece(piece);
    ui.tab = 'editor';
  } catch (error) {
    if (request === ui.playbackRequest) ui.playbackError = (error as Error).message;
  } finally {
    if (request === ui.playbackRequest) ui.loading = false;
  }
}

export function downloadMidi(piece: Piece = selectedPiece) {
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = writeMidi(piece);
  } catch (error) {
    ui.playbackError = (error as Error).message;
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${piece.title.replace(/[^\p{L}\p{N}_ -]/gu, '').trim() || 'sequence'}.mid`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read the transport clock without publishing a reactive update to the rest of the app. */
export function playbackPositionAt(now = performance.now()) {
  if (!ui.nowPlaying) return ui.playbackPosition;
  return Math.min(ui.playbackDuration, Math.max(playbackOffset, now - playbackStarted + playbackOffset));
}

export function updatePlaybackClock() {
  if (ui.nowPlaying) ui.playbackPosition = playbackPositionAt();
}

/** Play the selected chart or performance from the global transport. */
export function playSelection() {
  if ((!selectedPiece.notes.length && selectedPiece.source !== 'sequence') || !ui.playbackDuration || !outputReady())
    return;
  playPiece(selectedPiece, ui.playbackPosition >= ui.playbackDuration ? 0 : ui.playbackPosition);
}

/** Silence all output but retain the position for the next Play. */
export function pausePlayback() {
  if (!ui.nowPlaying) return;
  updatePlaybackClock();
  const at = ui.playbackPosition;
  stopPlayback();
  ui.playbackPosition = at;
  ui.playbackPaused = true;
}

/** Refresh a running arrangement without returning its playhead to the beginning. */
export function resumePlayback(at: number, preserveInput = false) {
  if (at < ui.playbackDuration && (selectedPiece.notes.length || selectedPiece.source === 'sequence') && outputReady())
    playPiece(selectedPiece, at, 40, preserveInput);
}

export function seekPlayback(at: number) {
  const position = Math.max(0, Math.min(ui.playbackDuration, at));
  if (ui.nowPlaying) playPiece(selectedPiece, position);
  else ui.playbackPosition = position;
}

/** Play any library piece into the app, exactly as if you played it (analysis, sound, recording). */
export function playPiece(p: Piece, from = 0, lead = 300, preserveInput = false) {
  stopPlayback(preserveInput);
  session.clear();
  if (p.source !== 'sequence') session.loadSong(null);
  preparePiece(p);
  ui.nowPlaying = p.title;
  schedulePieceCycle(p, Math.max(0, Math.min(ui.playbackDuration, from)), performance.now() + lead);
}

/** Repeat at the exact score boundary, without a new transport lead-in or clearing live/recorded analysis. */
function schedulePieceCycle(p: Piece, from: number, start: number) {
  playbackOffset = from;
  ui.playbackPosition = playbackOffset;
  playbackStarted = start;
  const lead = start - performance.now();
  setBars(
    p.bpm ? 'file' : 'auto',
    p.bpm ?? settings.preferences.tempo,
    p.beatsPerBar ?? 4,
    start - playbackOffset,
    p.denominator ?? 4,
  );
  scheduleMetronome(start - playbackOffset, start);
  const initialPedal = p.pedal?.findLast(([at]) => at <= playbackOffset)?.[1] ?? false;
  if (initialPedal) {
    pieceTimers.push(setTimeout(() => live.pedal(true, performance.now(), false, true), lead));
    if (settings.preferences.sound === 'midi' || settings.preferences.sound === 'both') midi.control(64, 127, start);
  }
  for (const [at, on] of p.pedal ?? [])
    if (at > playbackOffset) {
      pieceTimers.push(setTimeout(() => live.pedal(on, performance.now(), false, true), lead + at - playbackOffset));
      if (settings.preferences.sound === 'midi' || settings.preferences.sound === 'both')
        midi.control(64, on ? 127 : 0, start + at - playbackOffset);
    }
  for (const [t, d, note, vel] of p.notes) {
    if (t + d <= playbackOffset) continue;
    pieceTimers.push(
      setTimeout(
        () => {
          pieceNotes.add(note);
          live.noteOn(note, vel, performance.now(), false, false, true);
          if (settings.preferences.sound === 'synth' || settings.preferences.sound === 'both') synth.noteOn(note, vel);
        },
        lead + Math.max(0, t - playbackOffset),
      ),
    );
    if (settings.preferences.sound === 'midi' || settings.preferences.sound === 'both')
      midi.send([note], start + Math.max(0, t - playbackOffset), t + d - Math.max(t, playbackOffset), vel);
    pieceTimers.push(
      setTimeout(
        () => {
          pieceNotes.delete(note);
          live.noteOff(note, performance.now(), false, true);
        },
        lead + t + d - playbackOffset,
      ),
    );
  }
  const boundary = start + ui.playbackDuration - playbackOffset;
  pieceTimers.push(
    setTimeout(
      () => {
        // Drop any final callbacks still queued by browser timer rounding before the next pass attacks.
        pieceTimers.forEach(clearTimeout);
        pieceTimers = [];
        if (settings.preferences.loopPlayback && ui.nowPlaying && ui.playbackDuration > 0) {
          if (p.pedal?.length) {
            live.pedal(false, performance.now(), false, true);
            if (settings.preferences.sound === 'midi' || settings.preferences.sound === 'both')
              midi.control(64, 0, boundary);
          }
          for (const note of pieceNotes) live.noteOff(note, performance.now(), false, true);
          pieceNotes.clear();
          const now = performance.now();
          // A background-tab stall skips missed passes instead of replaying their attacks in a burst.
          const late = now - boundary;
          if (late >= ui.playbackDuration) schedulePieceCycle(p, late % ui.playbackDuration, now);
          else schedulePieceCycle(p, 0, boundary);
        } else {
          stopPiece();
          ui.playbackPosition = ui.playbackDuration;
        }
      },
      Math.max(0, boundary - performance.now()),
    ),
  );
}

export function stopPiece() {
  updatePlaybackClock();
  if (ui.nowPlaying) stopMetronome();
  pieceTimers.forEach(clearTimeout);
  pieceTimers = [];
  live.pedal(false, performance.now(), true, true);
  for (const n of pieceNotes) live.noteOff(n, performance.now(), false, true);
  pieceNotes.clear();
  ui.nowPlaying = null;
  if (ui.bars === 'file') setBars('auto');
}

/** Reset playback, previews and lingering notes for project changes or a transport restart. */
export function stopPlayback(preserveInput = false) {
  if (!preserveInput) {
    inputHooks.cancel();
    ui.inputCancelSerial++;
  }
  ui.playbackPaused = false;
  ui.playbackRequest++;
  ui.loading = false;
  stopPiece();
  stopAudition();
  if (ui.bars === 'metronome') setBars('auto');
  live.pedal(false);
  for (const n of session.seg.held.keys()) live.noteOff(n);
  synth.silence();
  ui.playbackPosition = 0;
}

/** Stop all output and save an active take. */
export function stopTransport() {
  setMetronome(false);
  stopPlayback();
  if (ui.recording) void stopRecording();
}

export const recordingHooks = { start: () => {}, noteOn: (_t: number) => {}, stop: (_recording: Recording) => {} };

export function startRecording() {
  if (ui.recording) return;
  if (ui.nowPlaying || ui.preview) stopPlayback();
  inputHooks.cancel();
  const clock = selectedPiece.source === 'sequence' ? selectedPiece : null;
  recorder.start({
    configuration: $state.snapshot(settings),
    style: session.style,
    split: session.seg.splitMode,
    keyLock: session.keyLock,
    monitor: settings.preferences.monitor,
    bars: clock ? 'file' : ui.bars,
    bpm: clock?.bpm ?? session.tempo.bpm ?? settings.preferences.tempo,
    meter: clock?.beatsPerBar ?? session.tempo.beatsPerBar,
    meterDenominator: clock?.denominator ?? session.tempo.denominator,
    inputs: midi.devices,
    userAgent: navigator.userAgent,
  });
  // A take includes notes already sounding when Record is pressed, without retriggering the synth.
  for (const [note, data] of session.seg.held) recorder.input('on', note, data.vel);
  for (const note of session.seg.sustained)
    if (!session.seg.held.has(note)) recorder.input('on', note, ui.inputVelocity);
  if (ui.inputPedal) recorder.input('pedal', 0, 127);
  session.trace = (e) => recorder.engine(e);
  ui.recording = true;
  ui.recordingElapsed = 0;
  ui.recMsg = '';
  recordingHooks.start();
  if (ui.metronome && metronomeTimer === undefined) syncMetronome();
}

export async function stopRecording() {
  session.trace = null;
  const rec = recorder.stop(ui.recNote);
  ui.recording = false;
  recordingHooks.stop(rec);
  ui.recMsg = 'Saving…';
  ui.recMsg = `Saved ${await saveRecording(rec)} — ${rec.input.filter((e) => e.kind === 'on').length} notes, ${rec.engine.length} engine events`;
  setTimeout(() => (ui.recMsg = ''), 8000);
  ui.recNote = '';
}

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    stopMetronome();
    stopPlayback();
    synth.dispose();
  });
