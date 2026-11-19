import { mod12 } from '../theory/pitch';
import { type Chord, corePcs, isDominantLike } from '../theory/chords';
import { type Key, SCALES, type ScaleName, keyFromIndex, keyIndex, keyPcSet } from '../theory/scales';

// Krumhansl–Kessler key profiles (index 0 = tonic).
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const TONE_WEIGHT: Record<string, number> = { '1': 1.5, '3': 1, b3: 1, '5': 0.7, b7: 0.8, '7': 0.8 };

function correlate(h: ArrayLike<number>, profile: number[], rot: number): number {
  let mh = 0,
    mp = 0;
  for (let i = 0; i < 12; i++) {
    mh += h[i];
    mp += profile[i];
  }
  mh /= 12;
  mp /= 12;
  let num = 0,
    dh = 0,
    dp = 0;
  for (let i = 0; i < 12; i++) {
    const a = h[mod12(i + rot)] - mh,
      b = profile[i] - mp;
    num += a * b;
    dh += a * a;
    dp += b * b;
  }
  return dh && dp ? num / Math.sqrt(dh * dp) : 0;
}

/**
 * Key probabilities from three kinds of evidence, all decaying over time so the
 * estimate follows modulations: a pitch-class histogram (profile correlation),
 * chord fit (diatonic chords, tonic and dominant chords), and cadences.
 */
export class KeyDetector {
  private hist = new Float64Array(12);
  private fit = new Float64Array(24);
  private fitW = 0;
  private cad = new Float64Array(24);
  private last = 0;

  /** `chordDecay` < 1 makes recent chords dominate (live); use 1 and Infinity to weigh a whole chart evenly. */
  constructor(
    public halfLifeMs = 40000,
    public chordDecay = 0.85,
  ) {}

  reset() {
    this.hist.fill(0);
    this.fit.fill(0);
    this.cad.fill(0);
    this.fitW = 0;
  }

  /** Time decay, plus an extra factor per event so recent chords dominate at any tempo. */
  private decay(t: number, extra = 1) {
    const dt = t - this.last;
    const f = (dt > 0 && this.last ? 0.5 ** (dt / this.halfLifeMs) : 1) * extra;
    for (let i = 0; i < 12; i++) this.hist[i] *= f;
    for (let i = 0; i < 24; i++) {
      this.fit[i] *= f;
      this.cad[i] *= f;
    }
    this.fitW *= f;
    this.last = t;
  }

  addMelody(pc: number, t: number, w = 0.5) {
    this.decay(t);
    this.hist[mod12(pc)] += w;
  }

  addChord(c: Chord, t: number, w = 1) {
    this.decay(t, this.chordDecay);
    for (const tone of c.tones) this.hist[mod12(c.root + tone.interval)] += w * (TONE_WEIGHT[tone.role] ?? 0.4);
    if (c.rootless) this.hist[c.root] += w;
    const core = corePcs(c);
    for (let i = 0; i < 24; i++) {
      const k = keyFromIndex(i);
      const set = keyPcSet(k);
      const inKey = core.every((p) => set.has(p));
      const deg = mod12(c.root - k.tonic);
      let v = inKey ? 1 : -0.6;
      const tonicChord = k.mode === 'major' ? c.quality === 'maj' && c.seventh !== 'b7' : c.quality === 'min';
      if (inKey && deg === 0 && tonicChord) v += 1.2;
      if (deg === 7 && isDominantLike(c)) v += 0.5;
      this.fit[i] += w * v;
    }
    this.fitW += w;
  }

  addCadence(k: Key, strength: number, t: number) {
    this.decay(t);
    this.cad[keyIndex(k)] += strength;
  }

  probabilities(): Float64Array {
    const s = new Float64Array(24);
    const norm = Math.max(this.fitW, 1);
    let max = -Infinity;
    for (let i = 0; i < 24; i++) {
      const k = keyFromIndex(i);
      s[i] =
        3 * correlate(this.hist, k.mode === 'major' ? MAJOR : MINOR, k.tonic) +
        1.2 * (this.fit[i] / norm) +
        this.cad[i];
      max = Math.max(max, s[i]);
    }
    let sum = 0;
    for (let i = 0; i < 24; i++) {
      s[i] = Math.exp((s[i] - max) / 0.5);
      sum += s[i];
    }
    for (let i = 0; i < 24; i++) s[i] /= sum;
    return s;
  }

  /** Modal colour of the current key (e.g. Mixolydian when ♭7 dominates), if clear. */
  flavour(k: Key): ScaleName | null {
    const total = this.hist.reduce((a, b) => a + b, 0);
    if (total < 2) return null;
    const cands: ScaleName[] =
      k.mode === 'major' ? ['ionian', 'mixolydian', 'lydian'] : ['aeolian', 'dorian', 'phrygian', 'harmonicMinor'];
    const fitOf = (s: ScaleName) => {
      const set = new Set(SCALES[s].map((i) => mod12(i + k.tonic)));
      let v = 0;
      for (let p = 0; p < 12; p++) v += set.has(p) ? this.hist[p] : -this.hist[p];
      return v / total;
    };
    const base = fitOf(cands[0]);
    let best = cands[0],
      bv = base;
    for (const s of cands.slice(1)) {
      const v = fitOf(s);
      if (v > bv) {
        bv = v;
        best = s;
      }
    }
    return best !== cands[0] && bv - base > 0.06 ? best : null;
  }
}
