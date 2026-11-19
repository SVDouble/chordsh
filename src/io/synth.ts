/** A small electric-piano-ish WebAudio synth for auditioning suggestions. */
export class Synth {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private voices: { osc: OscillatorNode[]; gain: GainNode }[] = [];

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.out.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Play notes `delay` seconds from now for `dur` seconds. */
  play(notes: number[], delay: number, dur: number, vel = 0.7) {
    const ctx = this.ensure();
    const t0 = ctx.currentTime + delay;
    for (const n of notes) {
      const f = 440 * Math.pow(2, (n - 69) / 12);
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4000, t0);
      filter.frequency.exponentialRampToValueAtTime(900, t0 + 1.2);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.16 * vel, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.05 * vel, t0 + 1.4);
      gain.gain.setTargetAtTime(0, t0 + dur, 0.08);
      const osc = (['triangle', 'sine'] as const).map((type, i) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * (i + 1);
        const g = ctx.createGain();
        g.gain.value = i ? 0.25 : 1;
        o.connect(g).connect(filter);
        o.start(t0);
        o.stop(t0 + dur + 0.6);
        return o;
      });
      filter.connect(gain).connect(this.out);
      const v = { osc, gain };
      this.voices.push(v);
      osc[0].onended = () => { this.voices = this.voices.filter((x) => x !== v); };
    }
  }

  stop() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setTargetAtTime(0, now, 0.03);
      v.osc.forEach((o) => o.stop(now + 0.2));
    }
    this.voices = [];
  }
}
