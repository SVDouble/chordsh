export interface MidiHandlers {
  noteOn(note: number, vel: number, t: number): void;
  noteOff(note: number, t: number): void;
  pedal(on: boolean, t: number): void;
}
export interface Port {
  id: string;
  name: string;
  device: string;
  error?: string;
}

/** "MPK mini Plus II:MPK mini Plus II MIDI Port 36:0" → "MPK mini Plus II" */
const deviceOf = (name: string) =>
  name
    .split(':')[0]
    .replace(/\s+(MIDI|Port)\b.*$/i, '')
    .trim() || name;
/** Loopback ports would feed our own output back in as "playing". */
const isLoopback = (name: string) => /midi through|loopback/i.test(name);

/** Web MIDI input (all or one device) and optional output for auditioning. */
export class Midi {
  status: 'unsupported' | 'pending' | 'ready' | 'denied' = 'pending';
  inputs: Port[] = [];
  outputs: Port[] = [];
  inputId = 'all';
  outputId = '';
  /** Last message received — shown as an activity light, handy when a device "isn't recognised". */
  last: { port: string; text: string; t: number } | null = null;
  onPorts: () => void = () => {};
  /** Every raw message (for session recording). */
  onRaw: (data: Uint8Array, port: string, t: number) => void = () => {};
  private access: MIDIAccess | null = null;
  private errors = new Map<string, string>();

  constructor(private h: MidiHandlers) {}

  async init() {
    if (!navigator.requestMIDIAccess) {
      this.status = 'unsupported';
      return this.onPorts();
    }
    try {
      this.access = await navigator.requestMIDIAccess();
      this.status = 'ready';
      this.access.onstatechange = (e) => {
        if (e.port?.state === 'disconnected') this.errors.delete(e.port.id); // retry when it comes back
        this.refresh();
      };
      this.refresh();
    } catch {
      this.status = 'denied';
      this.onPorts();
    }
  }

  get devices(): string[] {
    return [...new Set(this.inputs.filter((p) => !isLoopback(p.name)).map((p) => p.device))];
  }

  refresh() {
    if (!this.access) return;
    const list = (m: MIDIInputMap | MIDIOutputMap) =>
      [...m.values()].map((p) => ({
        id: p.id,
        name: p.name ?? p.id,
        device: deviceOf(p.name ?? p.id),
        error: this.errors.get(p.id),
      }));
    this.inputs = list(this.access.inputs);
    this.outputs = list(this.access.outputs);
    for (const input of this.access.inputs.values()) {
      const wanted = this.inputId === input.id || (this.inputId === 'all' && !isLoopback(input.name ?? ''));
      input.onmidimessage = wanted ? (e) => this.handle(e, input.name ?? input.id) : null;
      if (wanted && input.connection !== 'open' && !this.errors.has(input.id))
        input.open().catch((err: Error) => {
          this.errors.set(input.id, `can't open (${err.name}) — is another app (DAW, a2jmidid) holding it?`);
          this.refresh();
        });
    }
    this.onPorts();
  }

  private handle(e: MIDIMessageEvent, port: string) {
    const d = e.data;
    if (!d || d.length < 1 || d[0] === 0xf8 || d[0] === 0xfe) return; // ignore clock / active sensing
    const t = performance.now();
    this.onRaw(d, port, t);
    this.last = { port: deviceOf(port), text: [...d].map((b) => b.toString(16).padStart(2, '0')).join(' '), t };
    this.onPorts();
    if (d.length < 2) return;
    const type = d[0] & 0xf0; // any channel
    if (type === 0x90 && d[2] > 0) this.h.noteOn(d[1], d[2], t);
    else if (type === 0x80 || type === 0x90) this.h.noteOff(d[1], t);
    else if (type === 0xb0 && d[1] === 64) this.h.pedal(d[2] >= 64, t);
  }

  /** Schedule notes on the output port (times in performance.now() ms). */
  send(notes: number[], at: number, durMs: number, vel = 80) {
    const out = this.outputId ? this.access?.outputs.get(this.outputId) : undefined;
    if (!out) return false;
    for (const n of notes) {
      out.send([0x90, n, vel], at);
      out.send([0x80, n, 0], at + durMs);
    }
    return true;
  }

  panic() {
    const out = this.outputId ? this.access?.outputs.get(this.outputId) : undefined;
    (out as (MIDIOutput & { clear?: () => void }) | undefined)?.clear?.(); // drop scheduled notes
    out?.send([0xb0, 64, 0]); // release sustain before silencing the audition channel
    out?.send([0xb0, 123, 0]);
    out?.send([0xb0, 120, 0]); // all sound off, including sustained voices
  }
}
