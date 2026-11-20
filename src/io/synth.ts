import { DEFAULT_SETTINGS, type AudioSettings } from '../config/settings';

interface Voice {
  note: number;
  scheduled: boolean;
  start: number;
  level: number;
  stopAt: number;
  releaseAt?: number;
  releaseLevel?: number;
  releaseTime?: number;
  disconnected: boolean;
  osc: OscillatorNode[];
  gain: GainNode;
  nodes: AudioNode[];
}

/** A small electric-piano-ish WebAudio synth: live notes (held / pedal) and scheduled auditions. */
export class Synth {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private voices = new Set<Voice>();
  private options = { ...DEFAULT_SETTINGS.audio };
  private live = new Map<number, Voice>();
  private waiting = new Map<number, number>();
  private sustained = new Set<number>();
  private pedal = false;
  private muted = false;
  /** Called when the browser's autoplay block lifts or engages. */
  onState: () => void = () => {};

  /** Patch changes come only from shared Sound settings, never from chord detection or saving. */
  configure(options: AudioSettings) {
    this.options = { ...options };
    if (!this.ctx) return;
    this.out.gain.setTargetAtTime(this.muted ? 0 : options.volume, this.ctx.currentTime, 0.02);
    this.limiter.threshold.setValueAtTime(options.limiterThresholdDb, this.ctx.currentTime);
  }

  /** Audio may need a page gesture when the browser blocks autoplay; MIDI notes don't count. */
  get blocked(): boolean {
    return this.ctx?.state !== 'running';
  }

  /** Create the audio engine now, so `blocked` reflects the browser's real autoplay decision. */
  init() {
    this.ensure();
    this.onState();
  }

  /** Call from a click/keydown handler to unlock audio. */
  unlock() {
    const ctx = this.ensure();
    if (ctx.state !== 'running')
      void ctx.resume().then(
        () => this.stateChanged(),
        () => this.onState(),
      );
  }

  private stateChanged() {
    if (this.ctx?.state === 'running') {
      const notes = [...this.waiting];
      this.waiting.clear();
      for (const [note, velocity] of notes) this.noteOn(note, velocity);
    }
    this.onState();
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.out = this.ctx.createGain();
      this.out.gain.value = this.muted ? 0 : this.options.volume;
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.setValueAtTime(this.options.limiterThresholdDb, this.ctx.currentTime);
      this.limiter.knee.setValueAtTime(0, this.ctx.currentTime);
      this.limiter.ratio.setValueAtTime(20, this.ctx.currentTime);
      this.out.connect(this.limiter).connect(this.ctx.destination);
      this.ctx.onstatechange = () => this.stateChanged();
    }
    return this.ctx;
  }

  private voice(note: number, t0: number, vel: number, scheduled = false): Voice {
    const ctx = this.ensure();
    for (const previous of this.voices) {
      if (previous.stopAt <= ctx.currentTime) this.cleanup(previous);
      else if (previous.note === note && previous.scheduled === scheduled && previous.start <= t0)
        this.release(previous, t0, this.options.retriggerMs / 1000);
    }
    const f = 440 * 2 ** ((note - 69) / 12);
    const gain = ctx.createGain();
    // Cancelling future automation must never expose GainNode's default gain of one.
    gain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const reference = this.velocity(80);
    const cutoff = this.options.brightnessHz * (1 + this.options.velocityTone * (vel - reference));
    filter.frequency.setValueAtTime(cutoff, t0);
    if (this.options.toneDecayMs)
      filter.frequency.exponentialRampToValueAtTime(
        Math.min(cutoff, this.options.tailBrightnessHz),
        t0 + this.options.toneDecayMs / 1000,
      );
    // piano-like: fast attack, then a long natural decay while held
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.18 * vel, t0 + 0.005);
    gain.gain.setTargetAtTime(0.03 * vel, t0 + 0.01, 1.4);
    const nodes: AudioNode[] = [gain, filter];
    const osc = (['triangle', 'sine'] as const).map((type, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * (i + 1);
      const g = ctx.createGain();
      nodes.push(g, o);
      g.gain.value = i ? 0.25 : 1;
      o.connect(g).connect(filter);
      o.start(t0);
      return o;
    });
    filter.connect(gain).connect(this.out);
    const voice: Voice = {
      note,
      scheduled,
      start: t0,
      level: vel,
      stopAt: Infinity,
      disconnected: false,
      osc,
      gain,
      nodes,
    };
    let ended = 0;
    for (const o of osc)
      o.onended = () => {
        if (++ended === osc.length) this.cleanup(voice);
      };
    this.voices.add(voice);
    return voice;
  }

  private cleanup(v: Voice) {
    if (v.disconnected) return;
    v.disconnected = true;
    for (const node of v.nodes) node.disconnect();
    this.voices.delete(v);
    if (this.live.get(v.note) === v) {
      this.live.delete(v.note);
      this.sustained.delete(v.note);
    }
  }

  private amplitude(v: Voice, at: number) {
    if (at < v.start) return 0;
    if (v.releaseAt !== undefined && at >= v.releaseAt)
      return v.releaseLevel! * Math.exp(-(at - v.releaseAt) / v.releaseTime!);
    const elapsed = at - v.start;
    const peak = 0.18 * v.level;
    if (elapsed < 0.005) return (peak * elapsed) / 0.005;
    if (elapsed < 0.01) return peak;
    const sustain = 0.03 * v.level;
    return sustain + (peak - sustain) * Math.exp(-(elapsed - 0.01) / 1.4);
  }

  private release(v: Voice, at: number, time = this.options.releaseMs / 1000) {
    if (v.disconnected) return;
    if (at <= v.start) {
      v.gain.gain.cancelScheduledValues(at);
      v.gain.gain.setValueAtTime(0, at);
      for (const o of v.osc) o.stop(at);
      this.cleanup(v);
      return;
    }
    const stop = at + time * 7.5;
    if (stop >= v.stopAt) return; // Repeated Stop/release must not extend a previous tail.
    const level = this.amplitude(v, at);
    v.gain.gain.cancelScheduledValues(at);
    v.gain.gain.setValueAtTime(level, at);
    v.gain.gain.setTargetAtTime(0, at, time);
    v.releaseAt = at;
    v.releaseLevel = level;
    v.releaseTime = time;
    v.stopAt = stop;
    v.osc.forEach((o) => o.stop(stop));
  }

  private velocity(value: number) {
    return (Math.max(1, Math.min(127, value)) / 127) ** 0.8;
  }

  // ── live playing ──
  noteOn(note: number, velocity: number) {
    const ctx = this.ensure();
    if (ctx.state !== 'running') {
      // Keep held notes through a permitted resume; released notes must not sound later.
      this.waiting.set(note, velocity);
      this.unlock();
      return this.onState();
    }
    this.sustained.delete(note);
    this.live.set(note, this.voice(note, ctx.currentTime, this.velocity(velocity)));
  }

  noteOff(note: number) {
    this.waiting.delete(note);
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
  play(notes: number[], delay: number, dur: number, velocity = DEFAULT_SETTINGS.editor.velocity) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + delay;
    for (const n of notes) {
      const v = this.voice(n, t0, this.velocity(velocity), true);
      this.release(v, t0 + dur);
    }
  }

  stop() {
    if (!this.ctx) return;
    for (const v of this.voices)
      if (v.scheduled) this.release(v, this.ctx.currentTime, this.options.retriggerMs / 1000);
  }

  /** Release the context when a development update replaces this audio engine. */
  dispose() {
    this.silence();
    if (!this.ctx) return;
    this.ctx.onstatechange = null;
    for (const v of this.voices) this.cleanup(v);
    void this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx) this.out.gain.setTargetAtTime(muted ? 0 : this.options.volume, this.ctx.currentTime, 0.02);
  }

  /** Stop every sound, including held, sustained and not-yet-started notes. */
  silence() {
    if (this.ctx) for (const v of this.voices) this.release(v, this.ctx.currentTime, this.options.retriggerMs / 1000);
    this.live.clear();
    this.waiting.clear();
    this.sustained.clear();
    this.pedal = false;
  }
}
