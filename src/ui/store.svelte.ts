import { Session } from '../engine/session';
import { Midi } from '../io/midi';
import { Synth } from '../io/synth';
import { BUILT_IN, type Piece } from '../library/pieces';
import { Recorder, saveRecording } from '../io/recorder';
import { writeMidi } from '../io/midiexport';

/** Bridge between the framework-free engine and Svelte: one throttled tick per frame. */
export const session = new Session();
export const synth = new Synth();
/** Everything you play (MIDI, computer keys, on-screen piano) goes through here: analysis + optional sound. */
export const recorder = new Recorder();
export const live = {
  noteOn: (n: number, v: number, t = performance.now(), monitor = ui.monitor, forward = true) => {
    recorder.input('on', n, v, t);
    session.noteOn(n, v, t);
    if (monitor) synth.noteOn(n, v);
    if (forward && (ui.sound === 'midi' || ui.sound === 'both') && outputReady()) midi.message([0x90, n, v]);
  },
  noteOff: (n: number, t = performance.now(), forward = true) => {
    recorder.input('off', n, 0, t);
    session.noteOff(n, t);
    synth.noteOff(n);
    if (forward && (ui.sound === 'midi' || ui.sound === 'both')) midi.message([0x80, n, 0]);
  },
  pedal: (on: boolean, t = performance.now(), forward = true) => {
    recorder.input('pedal', 0, on ? 127 : 0, t);
    session.pedal(on, t);
    synth.setPedal(on);
    if (forward && (ui.sound === 'midi' || ui.sound === 'both')) midi.control(64, on ? 127 : 0);
  },
};
export const midi = new Midi({
  noteOn: (n, v, t) => live.noteOn(n, v, t, ui.monitor, false),
  noteOff: (n, t) => live.noteOff(n, t, false),
  pedal: (on, t) => live.pedal(on, t, false),
});
midi.onRaw = (d, port, t) => recorder.midi(d, port, t);

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem('chordsh') ?? localStorage.getItem('musify') ?? '{}');
  } catch {
    return {};
  }
})();

export const ui = $state({
  tick: 0,
  sound: (saved.sound ?? 'synth') as 'synth' | 'midi' | 'both' | 'off',
  tempo: (saved.tempo ?? 80) as number,
  /** Notes currently being auditioned (shown on the piano). */
  playing: null as number[] | null,
  playingId: '',
  playingStep: -1,
  /** User charts, saved in the browser. */
  charts: (saved.charts ?? []) as { title: string; text: string }[],
  /** Title of the library piece currently playing. */
  nowPlaying: null as string | null,
  preview: null as string | null,
  loading: false,
  playbackRequest: 0,
  playbackPosition: 0,
  playbackDuration: 0,
  loadedTitle: '',
  sourceId: 'piece:demo',
  performanceChoices: BUILT_IN.map((p) => ({ id: p.id, title: p.title })),
  playbackError: '',
  panels: {
    now: saved.panels?.now ?? true,
    next: saved.panels?.next ?? true,
    map: saved.panels?.map ?? true,
    piano: saved.panels?.piano ?? true,
  },
  /** Main panel: the live progression, a song chart, or the library. */
  tab: 'editor' as 'editor' | 'progression' | 'library',
  /** Chord suggestions and key-change routes share Where next. */
  nextTab: 'chords' as 'chords' | 'key',
  /** Play what you play through the browser synth (for controllers without speakers, e.g. MPK mini). */
  monitor: (saved.monitor ?? true) as boolean,
  audioBlocked: true,
  recording: false,
  /** Where bars come from: estimated from playing, a metronome, or a MIDI file's tempo. */
  bars: 'auto' as 'auto' | 'metronome' | 'file',
  meter: (saved.meter ?? 4) as number,
  click: (saved.click ?? true) as boolean,
  theme: (saved.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) as 'light' | 'dark',
  recNote: '',
  recMsg: '',
});
synth.onState = () => (ui.audioBlocked = synth.blocked);
synth.init(); // show the browser's actual audio state before the first note
synth.setMuted(!ui.monitor);

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
  Object.assign(
    saved,
    {
      sound: ui.sound,
      tempo: ui.tempo,
      style: session.style,
      input: midi.inputId,
      output: midi.outputId,
      monitor: ui.monitor,
      theme: ui.theme,
      meter: ui.meter,
      click: ui.click,
      charts: $state.snapshot(ui.charts),
      panels: $state.snapshot(ui.panels),
    },
    extra,
  );
  try {
    localStorage.setItem('chordsh', JSON.stringify(saved));
  } catch {
    /* private mode */
  }
}
export const savedSettings = saved as { style?: 'jazz' | 'triads'; input?: string; output?: string };

let timers: ReturnType<typeof setTimeout>[] = [];

function outputReady() {
  if (ui.sound === 'midi' && (!midi.outputId || !midi.outputs.some((p) => p.id === midi.outputId))) {
    ui.playbackError = 'Choose a MIDI output in Settings to play through your DAW.';
    return false;
  }
  ui.playbackError = '';
  return true;
}

/** Play a sequence of voicings through the synth and/or MIDI out, highlighting each step. */
export function audition(seq: number[][], id = '', beats: number | number[] = 2, label = 'Chord preview') {
  if (!outputReady()) return;
  ui.playbackRequest++;
  ui.loading = false;
  stopPiece();
  stopAudition();
  ui.preview = label;
  const beat = 60 / ui.tempo;
  const t0 = performance.now() + 60;
  let at = 0; // seconds
  seq.forEach((notes, i) => {
    const dur = beat * (Array.isArray(beats) ? (beats[i] ?? 2) : beats);
    if (ui.sound === 'synth' || ui.sound === 'both') synth.play(notes, 0.06 + at, dur * 0.95);
    if (ui.sound === 'midi' || ui.sound === 'both') midi.send(notes, t0 + at * 1000, dur * 950);
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
  timers.push(setTimeout(stopAudition, 60 + at * 1000));
}

let metronome: ReturnType<typeof setTimeout> | null = null;
/** Bars from the metronome (exact), a MIDI file, or estimated from playing. */
export function setBars(
  mode: 'auto' | 'metronome' | 'file',
  bpm = ui.tempo,
  beatsPerBar = ui.meter,
  start = performance.now() + 100,
) {
  ui.bars = mode;
  if (metronome) clearTimeout(metronome);
  metronome = null;
  session.setTempo(mode === 'auto' ? null : bpm, beatsPerBar, start);
  if (mode !== 'metronome') return;
  const period = 60000 / bpm;
  let i = 0;
  const tick = () => {
    if (ui.click) synth.click(i % beatsPerBar === 0);
    i++;
    metronome = setTimeout(tick, start + i * period - performance.now());
  };
  metronome = setTimeout(tick, start - performance.now());
}

export function stopAudition() {
  timers.forEach(clearTimeout);
  timers = [];
  synth.stop();
  midi.panic();
  ui.playing = null;
  ui.playingId = '';
  ui.playingStep = -1;
  ui.preview = null;
}

let pieceTimers: ReturnType<typeof setTimeout>[] = [];
const pieceNotes = new Set<number>();
let selectedPiece = BUILT_IN[0];
const performanceLoaders = new Map<string, () => Promise<Piece>>(BUILT_IN.map((p) => [p.id, async () => p]));
let playbackStarted = 0;
let playbackOffset = 0;

export function registerPerformance(id: string, title: string, load: () => Promise<Piece>) {
  performanceLoaders.set(id, load);
  const existing = ui.performanceChoices.find((p) => p.id === id);
  if (!existing) ui.performanceChoices = [...ui.performanceChoices, { id, title }];
  else if (existing.title !== title) existing.title = title;
}

export function preparePiece(piece: Piece) {
  selectedPiece = piece;
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

export async function choosePerformance(id: string, autoplay = false) {
  const load = performanceLoaders.get(id);
  if (!load) return;
  stopPlayback();
  const request = ui.playbackRequest;
  ui.loading = true;
  ui.playbackError = '';
  try {
    const piece = await load();
    if (request !== ui.playbackRequest) return;
    preparePiece(piece);
    session.loadSong(null);
    if (autoplay) playPiece(piece);
    ui.tab = 'progression';
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

export function updatePlaybackClock() {
  if (ui.nowPlaying)
    ui.playbackPosition = Math.min(
      ui.playbackDuration,
      Math.max(playbackOffset, performance.now() - playbackStarted + playbackOffset),
    );
}

/** Play the selected chart or performance from the global transport. */
export function playSelection() {
  if (!selectedPiece.notes.length || !outputReady()) return;
  playPiece(selectedPiece, ui.playbackPosition >= ui.playbackDuration ? 0 : ui.playbackPosition);
}

/** Refresh a running arrangement without returning its playhead to the beginning. */
export function resumePlayback(at: number) {
  if (at < ui.playbackDuration && selectedPiece.notes.length && outputReady()) playPiece(selectedPiece, at, 40);
}

export function seekPlayback(at: number) {
  const position = Math.max(0, Math.min(ui.playbackDuration, at));
  if (ui.nowPlaying) playPiece(selectedPiece, position);
  else ui.playbackPosition = position;
}

/** Play any library piece into the app, exactly as if you played it (analysis, sound, recording). */
export function playPiece(p: Piece, from = 0, lead = 300) {
  stopPlayback();
  session.clear();
  if (p.source !== 'sequence') session.loadSong(null);
  preparePiece(p);
  playbackOffset = Math.max(0, Math.min(ui.playbackDuration, from));
  ui.playbackPosition = playbackOffset;
  const start = performance.now() + lead;
  playbackStarted = start;
  setBars(p.bpm ? 'file' : 'auto', p.bpm ?? ui.tempo, p.beatsPerBar ?? 4, start - playbackOffset);
  const initialPedal = p.pedal?.findLast(([at]) => at <= playbackOffset)?.[1] ?? false;
  if (initialPedal) {
    pieceTimers.push(setTimeout(() => live.pedal(true, performance.now(), false), lead));
    if (ui.sound === 'midi' || ui.sound === 'both') midi.control(64, 127, start);
  }
  for (const [at, on] of p.pedal ?? [])
    if (at > playbackOffset) {
      pieceTimers.push(setTimeout(() => live.pedal(on, performance.now(), false), lead + at - playbackOffset));
      if (ui.sound === 'midi' || ui.sound === 'both') midi.control(64, on ? 127 : 0, start + at - playbackOffset);
    }
  for (const [t, d, note, vel] of p.notes) {
    if (t + d <= playbackOffset) continue;
    pieceTimers.push(
      setTimeout(
        () => {
          pieceNotes.add(note);
          live.noteOn(note, vel, performance.now(), false, false);
          if (ui.sound === 'synth' || ui.sound === 'both') synth.noteOn(note, vel);
        },
        lead + Math.max(0, t - playbackOffset),
      ),
    );
    if (ui.sound === 'midi' || ui.sound === 'both')
      midi.send([note], start + Math.max(0, t - playbackOffset), t + d - Math.max(t, playbackOffset), vel);
    pieceTimers.push(
      setTimeout(
        () => {
          pieceNotes.delete(note);
          live.noteOff(note, performance.now(), false);
        },
        lead + t + Math.max(20, d) - playbackOffset,
      ),
    );
  }
  ui.nowPlaying = p.title;
  pieceTimers.push(setTimeout(stopPiece, lead + ui.playbackDuration - playbackOffset + 200));
}

export function stopPiece() {
  updatePlaybackClock();
  pieceTimers.forEach(clearTimeout);
  pieceTimers = [];
  live.pedal(false);
  for (const n of pieceNotes) live.noteOff(n, performance.now(), false);
  pieceNotes.clear();
  ui.nowPlaying = null;
  if (ui.bars === 'file') setBars('auto');
}

/** One global stop action for library playback, previews, metronome and lingering notes. */
export function stopPlayback() {
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

export function startRecording() {
  recorder.start({
    style: session.style,
    split: session.seg.splitMode,
    keyLock: session.keyLock,
    monitor: ui.monitor,
    bars: ui.bars,
    bpm: ui.tempo,
    meter: ui.meter,
    inputs: midi.devices,
    userAgent: navigator.userAgent,
  });
  session.trace = (e) => recorder.engine(e);
  ui.recording = true;
  ui.recMsg = '';
}

export async function stopRecording() {
  session.trace = null;
  const rec = recorder.stop(ui.recNote);
  ui.recording = false;
  ui.recMsg = 'Saving…';
  ui.recMsg = `Saved ${await saveRecording(rec)} — ${rec.input.filter((e) => e.kind === 'on').length} notes, ${rec.engine.length} engine events`;
  setTimeout(() => (ui.recMsg = ''), 8000);
  ui.recNote = '';
}
