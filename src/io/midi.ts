export interface MidiHandlers {
  noteOn(note: number, vel: number, t: number): void;
  noteOff(note: number, t: number): void;
  pedal(on: boolean, t: number): void;
}
export interface Port { id: string; name: string }

/** Web MIDI input (all or one device) and optional output for auditioning. */
export class Midi {
  status: 'unsupported' | 'pending' | 'ready' | 'denied' = 'pending';
  inputs: Port[] = [];
  outputs: Port[] = [];
  inputId = 'all';
  outputId = '';
  onPorts: () => void = () => {};
  private access: MIDIAccess | null = null;

  constructor(private h: MidiHandlers) {}

  async init() {
    if (!navigator.requestMIDIAccess) { this.status = 'unsupported'; return this.onPorts(); }
    try {
      this.access = await navigator.requestMIDIAccess();
      this.status = 'ready';
      this.access.onstatechange = () => this.refresh();
      this.refresh();
    } catch {
      this.status = 'denied';
      this.onPorts();
    }
  }

  refresh() {
    if (!this.access) return;
    const list = (m: MIDIInputMap | MIDIOutputMap) => [...m.values()].map((p) => ({ id: p.id, name: p.name ?? p.id }));
    this.inputs = list(this.access.inputs);
    this.outputs = list(this.access.outputs);
    for (const input of this.access.inputs.values())
      input.onmidimessage = this.inputId === 'all' || this.inputId === input.id ? (e) => this.handle(e) : null;
    this.onPorts();
  }

  private handle(e: MIDIMessageEvent) {
    const d = e.data;
    if (!d || d.length < 2) return;
    const t = e.timeStamp || performance.now();
    const type = d[0] & 0xf0;
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
    out?.send([0xb0, 123, 0]);
  }
}
