/**
 * Online beat and bar tracking from note onsets.
 *
 * Tempo: autocorrelation of an onset-strength envelope over the last few seconds, with a
 * mild preference for 60–140 bpm. Phase: the offset whose beat positions carry most onset
 * energy. Downbeat: the beat (of N per bar) where bass notes and chord changes cluster.
 * Recent beats are re-gridded on every update, so bars are revised as evidence grows —
 * older beats are frozen. A fixed tempo (metronome) bypasses estimation.
 */
const BIN = 10; // ms
const WINDOW = 8000;
const MIN_P = 380, MAX_P = 1250; // ~158 … 48 bpm

export class BeatTracker {
  beatsPerBar = 4;
  /** Choose 3 or 4 beats per bar from where accents fall. */
  autoMeter = true;
  /** Beat times (ms), frozen in the past and re-estimated near the present. */
  beats: number[] = [];
  private cache: { key: string; bars: number[] } | null = null;
  period: number | null = null;
  confidence = 0;
  /** Set to force a tempo (metronome); null = estimate. */
  fixed: { period: number; phase: number } | null = null;

  private onsets: { t: number; w: number; accent: number }[] = [];
  /** Accent events are kept for the whole session (bars are decoded over all of it). */
  private accents: { t: number; accent: number }[] = [];
  private lastUpdate = -Infinity;

  /** `accent` > 0 for bass notes / chord changes (downbeat evidence). */
  onset(t: number, w: number, accent = 0) {
    if (accent > 0) this.accents.push({ t, accent });
    const last = this.onsets[this.onsets.length - 1];
    if (last && t - last.t < 30) { last.w += w; last.accent += accent; }
    else this.onsets.push({ t, w, accent });
    while (this.onsets.length && this.onsets[0].t < t - 4 * WINDOW) this.onsets.shift();
    if (t - this.lastUpdate > 1000) this.update(t);
  }

  update(now: number) {
    this.lastUpdate = now;
    const recent = this.onsets.filter((o) => o.t > now - WINDOW);
    if (this.fixed) { this.period = this.fixed.period; this.confidence = 1; this.regrid(now, this.fixed.phase, this.fixed.period); return; }
    if (recent.length < 6) return;
    const t0 = now - WINDOW, n = Math.ceil(WINDOW / BIN);
    const env = new Float64Array(n);
    for (const o of recent) {
      const i = Math.floor((o.t - t0) / BIN);
      for (let d = -3; d <= 3; d++) if (i + d >= 0 && i + d < n) env[i + d] += o.w * Math.exp(-(d * d) / 4);
    }
    // tempo: autocorrelation × prior, with half-tempo support (metrical consistency)
    const ac = (lagF: number) => { const lag = Math.round(lagF); let s = 0; for (let i = lag; i < n; i++) s += env[i] * env[i - lag]; return s; };
    let bestP = 0, bestS = -1, total = 0;
    for (let p = MIN_P; p <= MAX_P; p += 2 * BIN) {
      const lag = p / BIN;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(p / 600) / 0.6, 2));
      const s = (ac(lag) + 0.5 * ac(2 * lag)) * prior;
      total += s;
      if (s > bestS) { bestS = s; bestP = p; }
    }
    if (bestS <= 0) return;
    const conf = Math.min(1, (bestS / (total / ((MAX_P - MIN_P) / (2 * BIN) + 1))) / 6);
    if (this.period && Math.abs(bestP - this.period) / this.period < 0.08) bestP = 0.7 * this.period + 0.3 * bestP; // smooth
    this.period = bestP;
    this.confidence = 0.6 * this.confidence + 0.4 * conf;
    // phase: where beat positions catch most onset energy
    let bestPh = 0, bestE = -1;
    for (let ph = 0; ph < bestP; ph += BIN) {
      let e = 0;
      for (let t = now - ph; t > t0; t -= bestP) { const i = Math.round((t - t0) / BIN); if (i >= 0 && i < n) e += env[i]; }
      if (e > bestE) { bestE = e; bestPh = ph; }
    }
    this.regrid(now, now - bestPh, bestP);
  }

  private regrid(now: number, anchor: number, period: number) {
    const freezeBefore = now - 4000;
    const kept = this.beats.filter((b) => b < freezeBefore);
    const lastKept = kept[kept.length - 1];
    // first new beat: on the new grid, after the last frozen beat
    let b = anchor - Math.floor((anchor - (lastKept ?? anchor - WINDOW)) / period) * period;
    if (lastKept !== undefined) while (b < lastKept + period * 0.5) b += period;
    const fresh: number[] = [];
    for (; b <= now + period; b += period) fresh.push(b);
    this.beats = [...kept, ...fresh];
  }

  private nearestBeat(t: number): number {
    let lo = 0, hi = this.beats.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.beats[m] < t) lo = m + 1; else hi = m; }
    if (lo > 0 && Math.abs(this.beats[lo - 1] - t) < Math.abs(this.beats[lo] - t)) lo--;
    return this.period && Math.abs(this.beats[lo] - t) < this.period * 0.3 ? lo : -1;
  }

  /** Bar start times. */
  bars(): number[] {
    const key = `${this.beats.length}:${this.beats[this.beats.length - 1]}:${this.accents.length}`;
    if (this.cache?.key === key) return this.cache.bars;
    const acc = this.beatAccents();
    const metres = this.autoMeter ? [3, 4] : [this.beatsPerBar];
    let best: { m: number; pos: number[]; contrast: number } | null = null;
    for (const m of metres) {
      const pos = decodeBars(acc, m);
      const on = acc.filter((_, i) => pos[i] === 0), off = acc.filter((_, i) => pos[i] !== 0);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const contrast = avg(on) - avg(off) - (m === 3 ? 0.05 : 0); // slight preference for 4/4
      if (!best || contrast > best.contrast) best = { m, pos, contrast };
    }
    this.beatsPerBar = best!.m;
    const bars = this.beats.filter((_, i) => best!.pos[i] === 0);
    this.cache = { key, bars };
    return bars;
  }

  /** Downbeat evidence gathered around each beat. */
  private beatAccents(): number[] {
    const acc = new Array(this.beats.length).fill(0);
    for (const o of this.accents) {
      const i = this.nearestBeat(o.t);
      if (i >= 0) acc[i] += o.accent;
    }
    return acc;
  }

  get bpm(): number | null { return this.period ? Math.round(60000 / this.period) : null; }
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Downbeat evidence for an onset group: a new bass note or fresh harmony counts most. */
export class AccentDetector {
  private bass: number | null = null;
  private recent: { t: number; pc: number }[] = [];

  accent(t: number, notes: number[]): number {
    const low = Math.min(...notes);
    this.recent = this.recent.filter((r) => t - r.t < 700);
    const known = new Set(this.recent.map((r) => r.pc));
    const fresh = new Set(notes.map((n) => n % 12).filter((pc) => !known.has(pc))).size;
    const bassMove = low < 60 && (this.bass === null || low % 12 !== this.bass % 12);
    if (low < 60) this.bass = low;
    for (const n of notes) this.recent.push({ t, pc: n % 12 });
    return (bassMove ? 1.5 : low < 55 ? 0.4 : 0) + 0.3 * fresh;
  }
}

/** Viterbi over beat-in-bar positions: advance one per beat, jumping costs; downbeats earn their accents. */
function decodeBars(acc: number[], m: number, jump = 2.5): number[] {
  const n = acc.length;
  if (!n) return [];
  let V = Array.from({ length: m }, (_, p) => (p === 0 ? acc[0] : 0));
  const back: Int8Array[] = [];
  for (let i = 1; i < n; i++) {
    const best = Math.max(...V), arg = V.indexOf(best);
    const nv = new Array(m), bk = new Int8Array(m);
    for (let p = 0; p < m; p++) {
      const stay = V[mod(p - 1, m)], jumpV = best - jump;
      [nv[p], bk[p]] = stay >= jumpV ? [stay, mod(p - 1, m)] : [jumpV, arg];
      // downbeats earn their accent, the half-bar (beat 3 of 4) a little
      nv[p] += p === 0 ? acc[i] : m === 4 && p === 2 ? 0.3 * acc[i] : 0;
    }
    V = nv;
    back.push(bk);
  }
  const pos = new Array(n);
  pos[n - 1] = V.indexOf(Math.max(...V));
  for (let i = n - 1; i > 0; i--) pos[i - 1] = back[i - 1][pos[i]];
  return pos;
}
