import type { TraceEvent } from '../engine/session';

export interface InputEvent {
  t: number;
  kind: 'on' | 'off' | 'pedal';
  note: number;
  vel: number;
}
export interface RawMidi {
  t: number;
  port: string;
  data: number[];
}
export interface Recording {
  version: 1;
  started: string;
  durationMs: number;
  /** What the player says they were doing — the ground truth for analysis. */
  note: string;
  settings: Record<string, unknown>;
  input: InputEvent[];
  midi: RawMidi[];
  engine: TraceEvent[];
}

/** Records input and engine decisions on one clock (ms since start). */
export class Recorder {
  active = false;
  private t0 = 0;
  private started = '';
  private settings: Record<string, unknown> = {};
  private inputs: InputEvent[] = [];
  private raw: RawMidi[] = [];
  private trace: TraceEvent[] = [];

  get elapsed(): number {
    return this.active ? performance.now() - this.t0 : 0;
  }
  get startedAt(): number {
    return this.t0;
  }
  get counts() {
    return { input: this.inputs.length, engine: this.trace.length };
  }

  start(settings: Record<string, unknown>) {
    Object.assign(this, {
      active: true,
      t0: performance.now(),
      started: new Date().toISOString(),
      settings,
      inputs: [],
      raw: [],
      trace: [],
    });
  }

  input(kind: InputEvent['kind'], note: number, vel: number, t = performance.now()) {
    if (this.active) this.inputs.push({ t: Math.round(t - this.t0), kind, note, vel });
  }
  midi(data: Uint8Array, port: string, t = performance.now()) {
    if (this.active) this.raw.push({ t: Math.round(t - this.t0), port, data: [...data] });
  }
  engine(e: TraceEvent) {
    if (this.active) this.trace.push({ ...e, t: Math.round(e.t - this.t0) });
  }

  snapshot(note = ''): Recording {
    return {
      version: 1,
      started: this.started,
      durationMs: Math.round(performance.now() - this.t0),
      note,
      settings: this.settings,
      input: this.inputs,
      midi: this.raw,
      engine: this.trace,
    };
  }

  stop(note: string): Recording {
    const recording = this.snapshot(note);
    this.active = false;
    return recording;
  }
}

/** Save to the project's local/recordings/ folder via the dev server; fall back to a download. */
export async function saveRecording(rec: Recording): Promise<string> {
  const body = JSON.stringify(rec);
  try {
    const res = await fetch('/__recordings', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    if (res.ok) return ((await res.json()) as { file: string }).file;
  } catch {
    /* not running under the dev server */
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  a.download = `chordsh-session-${rec.started.replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  return `${a.download} (downloaded)`;
}
