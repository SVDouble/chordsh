interface Voice {
  osc: OscillatorNode[];
  gain: GainNode;
}

/** A small electric-piano-ish WebAudio synth: live notes (held / pedal) and scheduled auditions. */
export class Synth {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private scheduled = new Set<Voice>();
  private live = new Map<number, Voice>();
  private sustained = new Set<number>();
  private pedal = false;
  /** Called when the browser's autoplay block lifts or engages. */
  onState: () => void = () => {};

  /** Browsers only allow audio after a user gesture on the page; MIDI notes don't count. */
  get blocked(): boolean {
    return !this.ctx || this.ctx.state !== 'running';
  }

  /** Call from a click/keydown handler to unlock audio. */
  unlock() {
    const ctx = this.ensure();
    if (ctx.state !== 'running') void ctx.resume().then(() => this.onState());
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.out.connect(comp).connect(this.ctx.destination);
      this.ctx.onstatechange = () => this.onState();
    }
    return this.ctx;
  }

  private voice(note: number, t0: number, vel: number): Voice {
    const ctx = this.ensure();
    const f = 440 * Math.pow(2, (note - 69) / 12);
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500 + 3500 * vel, t0);
    filter.frequency.exponentialRampToValueAtTime(900, t0 + 1.2);
    // piano-like: fast attack, then a long natural decay while held
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.18 * vel, t0 + 0.005);
    gain.gain.setTargetAtTime(0.03 * vel, t0 + 0.01, 1.4);
    const osc = (['triangle', 'sine'] as const).map((type, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * (i + 1);
      const g = ctx.createGain();
      g.gain.value = i ? 0.25 : 1;
      o.connect(g).connect(filter);
      o.start(t0);
      return o;
    });
    filter.connect(gain).connect(this.out);
    return { osc, gain };
  }

  private release(v: Voice, at: number) {
    v.gain.gain.cancelScheduledValues(at);
    v.gain.gain.setTargetAtTime(0, at, 0.08);
    v.osc.forEach((o) => o.stop(at + 0.6));
  }

  // ── live playing ──
  noteOn(note: number, velocity: number) {
    const ctx = this.ensure();
    if (ctx.state !== 'running') return this.onState(); // still blocked: tell the UI
    const old = this.live.get(note);
    if (old) this.release(old, ctx.currentTime);
    this.sustained.delete(note);
    this.live.set(note, this.voice(note, ctx.currentTime, Math.pow(velocity / 127, 0.8)));
  }

  noteOff(note: number) {
    if (!this.ctx || !this.live.has(note)) return;
    if (this.pedal) {
      this.sustained.add(note);
      return;
    }
    this.release(this.live.get(note)!, this.ctx.currentTime);
    this.live.delete(note);
  }

  setPedal(on: boolean) {
    this.pedal = on;
    if (on || !this.ctx) return;
    for (const n of this.sustained) {
      const v = this.live.get(n);
      if (v) this.release(v, this.ctx.currentTime);
      this.live.delete(n);
    }
    this.sustained.clear();
  }

  /** Metronome tick; louder and higher on the downbeat. */
  click(accent: boolean, delay = 0) {
    const ctx = this.ensure();
    if (ctx.state !== 'running') return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(accent ? 0.35 : 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    o.connect(g).connect(this.out);
    o.start(t0);
    o.stop(t0 + 0.06);
  }

  // ── auditions ──
  /** Play notes `delay` seconds from now for `dur` seconds. */
  play(notes: number[], delay: number, dur: number, vel = 0.7) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + delay;
    for (const n of notes) {
      const v = this.voice(n, t0, vel);
      this.release(v, t0 + dur);
      this.scheduled.add(v);
      v.osc[0].onended = () => this.scheduled.delete(v);
    }
  }

  stop() {
    if (!this.ctx) return;
    for (const v of this.scheduled) this.release(v, this.ctx.currentTime);
    this.scheduled.clear();
  }
}
