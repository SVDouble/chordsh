import { Session } from '../engine/session';
import { Midi } from '../io/midi';
import { Synth } from '../io/synth';
import type { MidiEvent } from '../io/midifile';

/** Bridge between the framework-free engine and Svelte: one throttled tick per frame. */
export const session = new Session();
export const synth = new Synth();
export const midi = new Midi({
  noteOn: (n, v, t) => session.noteOn(n, v, t),
  noteOff: (n, t) => session.noteOff(n, t),
  pedal: (on, t) => session.pedal(on, t),
});

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
});

let queued = false;
const bump = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; ui.tick++; });
};
session.onChange = bump;
midi.onPorts = bump;

export function persist(extra: Record<string, unknown> = {}) {
  Object.assign(saved, { sound: ui.sound, tempo: ui.tempo, style: session.style, input: midi.inputId, output: midi.outputId, charts: $state.snapshot(ui.charts) }, extra);
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
