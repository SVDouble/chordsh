import { Session } from '../engine/session';
import { Midi } from '../io/midi';
import { Synth } from '../io/synth';
import type { MidiEvent } from '../io/midifile';
import { Recorder, saveRecording } from '../io/recorder';

/** Bridge between the framework-free engine and Svelte: one throttled tick per frame. */
export const session = new Session();
export const synth = new Synth();
/** Everything you play (MIDI, computer keys, on-screen piano) goes through here: analysis + optional sound. */
export const recorder = new Recorder();
export const live = {
  noteOn: (n: number, v: number, t = performance.now()) => { recorder.input('on', n, v, t); session.noteOn(n, v, t); if (ui.monitor) synth.noteOn(n, v); },
  noteOff: (n: number, t = performance.now()) => { recorder.input('off', n, 0, t); session.noteOff(n, t); synth.noteOff(n); },
  pedal: (on: boolean, t = performance.now()) => { recorder.input('pedal', 0, on ? 127 : 0, t); session.pedal(on, t); synth.setPedal(on); },
};
export const midi = new Midi(live);
midi.onRaw = (d, port, t) => recorder.midi(d, port, t);

const saved = (() => { try { return JSON.parse(localStorage.getItem('musify') ?? '{}'); } catch { return {}; } })();

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
  filePlaying: false,
  demo: false,
  /** Right-hand panel: song chart or key-change routes. */
  tab: 'song' as 'song' | 'route',
  /** Play what you play through the browser synth (for controllers without speakers, e.g. MPK mini). */
  monitor: (saved.monitor ?? true) as boolean,
  audioBlocked: true,
  recording: false,
  theme: (saved.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) as 'light' | 'dark',
  recNote: '',
  recMsg: '',
});
synth.onState = () => (ui.audioBlocked = synth.blocked);

let queued = false;
const bump = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; ui.tick++; });
};
session.onChange = bump;
midi.onPorts = bump;

export function persist(extra: Record<string, unknown> = {}) {
  Object.assign(saved, { sound: ui.sound, tempo: ui.tempo, style: session.style, input: midi.inputId, output: midi.outputId, monitor: ui.monitor, theme: ui.theme, charts: $state.snapshot(ui.charts) }, extra);
  try { localStorage.setItem('musify', JSON.stringify(saved)); } catch { /* private mode */ }
}
export const savedSettings = saved as { style?: 'jazz' | 'triads'; input?: string; output?: string };

let timers: ReturnType<typeof setTimeout>[] = [];

/** Play a sequence of voicings through the synth and/or MIDI out, highlighting each step. */
export function audition(seq: number[][], id = '', beats = 2) {
  stopAudition();
  const dur = (60 / ui.tempo) * beats;
  const t0 = performance.now() + 60;
  seq.forEach((notes, i) => {
    if (ui.sound === 'synth' || ui.sound === 'both') synth.play(notes, 0.06 + i * dur, dur * 0.95);
    if (ui.sound === 'midi' || ui.sound === 'both') midi.send(notes, t0 + i * dur * 1000, dur * 950);
    timers.push(setTimeout(() => { ui.playing = notes; ui.playingId = id; ui.playingStep = i; }, 60 + i * dur * 1000));
  });
  timers.push(setTimeout(stopAudition, 60 + seq.length * dur * 1000));
}

export function stopAudition() {
  timers.forEach(clearTimeout);
  timers = [];
  synth.stop();
  midi.panic();
  ui.playing = null;
  ui.playingId = '';
  ui.playingStep = -1;
}

let fileTimers: ReturnType<typeof setTimeout>[] = [];

/** Replay a MIDI file through the engine (as if you played it) and the synth. */
export function playMidiFile(events: MidiEvent[]) {
  stopMidiFile();
  const lead = 300;
  const onAt = new Map<number, number>();
  for (const e of events) {
    const at = (f: () => void) => fileTimers.push(setTimeout(f, lead + e.t));
    if (e.type === 'on') {
      onAt.set(e.note, e.t);
      at(() => session.noteOn(e.note, e.vel));
    } else if (e.type === 'off') {
      const start = onAt.get(e.note) ?? e.t;
      const dur = Math.max(0.05, (e.t - start) / 1000);
      fileTimers.push(setTimeout(() => synth.play([e.note], 0, dur, 0.6), lead + start));
      at(() => session.noteOff(e.note));
    } else at(() => session.pedal(e.vel >= 64));
  }
  ui.filePlaying = true;
  fileTimers.push(setTimeout(() => (ui.filePlaying = false), lead + (events[events.length - 1]?.t ?? 0) + 200));
}

export function stopMidiFile() {
  fileTimers.forEach(clearTimeout);
  fileTimers = [];
  synth.stop();
  ui.filePlaying = false;
}

export function startRecording() {
  recorder.start({ style: session.style, split: session.seg.splitMode, keyLock: session.keyLock, monitor: ui.monitor, inputs: midi.devices, userAgent: navigator.userAgent });
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
