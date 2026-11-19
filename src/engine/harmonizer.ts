import { mod12 } from '../theory/pitch';
import { type Chord, type KindName, chordOf } from '../theory/chords';
import { ALL_KEYS, type Key, keyPcSet } from '../theory/scales';
import { TRANSITIONS } from './transitions';

/**
 * Probabilistic harmonic analysis (an HMM over (key, chord) solved with Viterbi).
 *
 * The note stream is cut into segments at each new onset. Every segment scores how well
 * each chord explains its notes (emission) and how plausible that chord is in each key;
 * changing chord costs a little, changing key costs a lot. Because the best path is
 * recomputed as music arrives, earlier readings are revised in hindsight ("that E♭ was
 * the V of A♭ after all"), and the best path per key gives competing theories.
 */

import { DEFAULT_PARAMS, DEFAULT_SETTINGS, type HarmonizerParams, type SegmentationSettings } from '../config/settings';
export { DEFAULT_PARAMS, type HarmonizerParams } from '../config/settings';

// Chord vocabulary: tones as [interval, weight]. Weights reflect how defining a tone is.
const TYPES: { kind: KindName; tones: [number, number][] }[] = [
  {
    kind: 'maj',
    tones: [
      [0, 1],
      [4, 1],
      [7, 0.6],
    ],
  },
  {
    kind: 'min',
    tones: [
      [0, 1],
      [3, 1],
      [7, 0.6],
    ],
  },
  {
    kind: 'dim',
    tones: [
      [0, 1],
      [3, 1],
      [6, 0.8],
    ],
  },
  {
    kind: 'aug',
    tones: [
      [0, 1],
      [4, 1],
      [8, 0.8],
    ],
  },
  {
    kind: 'sus4',
    tones: [
      [0, 1],
      [5, 1],
      [7, 0.6],
    ],
  },
  {
    kind: 'sus2',
    tones: [
      [0, 1],
      [2, 1],
      [7, 0.6],
    ],
  },
  {
    kind: '7',
    tones: [
      [0, 1],
      [4, 1],
      [7, 0.5],
      [10, 0.9],
    ],
  },
  {
    kind: 'maj7',
    tones: [
      [0, 1],
      [4, 1],
      [7, 0.5],
      [11, 0.9],
    ],
  },
  {
    kind: 'm7',
    tones: [
      [0, 1],
      [3, 1],
      [7, 0.5],
      [10, 0.9],
    ],
  },
  {
    kind: 'm7b5',
    tones: [
      [0, 1],
      [3, 1],
      [6, 0.8],
      [10, 0.9],
    ],
  },
  {
    kind: 'dim7',
    tones: [
      [0, 1],
      [3, 1],
      [6, 0.8],
      [9, 0.9],
    ],
  },
];
const NT = TYPES.length;
const NC = 12 * NT; // chord states
const NS = 24 * NC; // (key, chord) states
export const chordState = (root: number, t: number) => mod12(root) * NT + t;
const stateOf = (k: number, c: number) => k * NC + c;

interface Template {
  root: number;
  pcs: number[];
  w: number[];
  mask: number;
}
const TEMPLATES: Template[] = [];
for (let r = 0; r < 12; r++)
  for (const ty of TYPES) {
    const pcs = ty.tones.map(([i]) => mod12(r + i));
    TEMPLATES.push({ root: r, pcs, w: ty.tones.map(([, w]) => w), mask: pcs.reduce((m, p) => m | (1 << p), 0) });
  }

/** Plausibility of each chord in each key (scale-degree based, so it works in every key). */
function buildPriors(p: HarmonizerParams): Float64Array {
  const out = new Float64Array(24 * NC);
  ALL_KEYS.forEach((key, ki) => {
    const scale = keyPcSet(key);
    for (let c = 0; c < NC; c++) {
      const t = TEMPLATES[c],
        kind = TYPES[c % NT].kind;
      const deg = mod12(t.root - key.tonic);
      const inKey = t.pcs.every((x) => scale.has(x));
      const dominant = kind === '7' || (kind === 'maj' && !inKey);
      let v: number;
      if (inKey) v = p.prior.diatonic;
      else if (
        (dominant || kind === 'dim7' || kind === 'dim') &&
        scale.has(mod12(t.root + (kind === '7' || kind === 'maj' ? 5 : 1)))
      )
        v = p.prior.secondary;
      else if (t.pcs.filter((x) => !scale.has(x)).length === 1) v = p.prior.borrowed;
      else v = p.prior.other;
      const tonicQ = key.mode === 'major' ? kind === 'maj' || kind === 'maj7' : kind === 'min' || kind === 'm7';
      if (deg === 0 && tonicQ) v += p.prior.tonic;
      if (deg === 7 && (kind === 'maj' || kind === '7')) v += p.prior.dominant;
      out[ki * NC + c] = v;
    }
  });
  return out;
}

export interface Segment {
  t0: number;
  t1: number;
  /** Pitch-class salience, normalised to sum 1. */
  sal: Float64Array;
  bass: number | null;
  /** Lowest sounding MIDI note (for inversions). */
  bassNote: number | null;
}

export interface PathItem {
  t0: number;
  t1: number;
  key: Key;
  chord: Chord;
  segs: number;
}
export interface Theory {
  key: Key;
  prob: number;
  path: PathItem[];
}

/** Builds onset segments from a live note stream (handles held notes and the sustain pedal). */
export class SegmentBuilder {
  private sounding = new Map<number, { t: number; vel: number }>();
  private sustained = new Set<number>();
  private pedal = false;
  private lastRelease = -Infinity;
  /** The open segment: its onsets and every note that sounded during it (snapshotted, so releases don't erase them). */
  private open: {
    t0: number;
    onsets: Map<number, number>;
    present: Map<number, { t: number; vel: number }>;
    released: Map<number, number>;
  } | null = null;

  constructor(
    private params: HarmonizerParams,
    private emit: (s: Segment) => void,
    private timing: SegmentationSettings = DEFAULT_SETTINGS.segmentation,
  ) {}

  reset() {
    this.sounding.clear();
    this.sustained.clear();
    this.pedal = false;
    this.lastRelease = -Infinity;
    this.open = null;
  }

  noteOn(note: number, vel: number, t: number) {
    if (this.open && t - this.open.t0 > this.timing.analysisGroupMs) this.close(t); // a new onset group starts a new segment
    this.open ??= { t0: t, onsets: new Map(), present: new Map(this.sounding), released: new Map() };
    this.open.onsets.set(note, vel);
    this.sounding.set(note, { t, vel });
    this.open.present.set(note, { t, vel });
    this.sustained.delete(note);
  }
  noteOff(note: number, t = performance.now()) {
    if (this.pedal) this.sustained.add(note);
    else this.sounding.delete(note);
    this.lastRelease = t;
    if (this.open?.present.has(note) && !this.pedal) this.open.released.set(note, t);
  }
  /** True while notes sound or are still dying away — the open segment is still growing. */
  active(t: number): boolean {
    return !!this.open && (this.sounding.size > 0 || t - this.lastRelease < this.timing.releaseActiveMs);
  }
  setPedal(on: boolean) {
    this.pedal = on;
    if (!on) {
      for (const n of this.sustained) this.sounding.delete(n);
      this.sustained.clear();
    }
  }
  /** Close the open segment (call at the next onset, or to flush). */
  close(t: number) {
    const o = this.open;
    if (!o) return;
    this.open = null;
    const seg = this.segment(o, t);
    if (seg) this.emit(seg);
  }
  /** The still-open segment, evaluated up to time t (for live display). */
  peek(t: number): Segment | null {
    if (!this.open) return null;
    // once everything is released, the segment lasts until the sound has died away
    const end = this.sounding.size
      ? t
      : Math.min(t, Math.max(this.lastRelease, this.open.t0) + this.timing.releaseTailMs);
    return this.segment(this.open, end);
  }

  private segment(
    o: {
      t0: number;
      onsets: Map<number, number>;
      present: Map<number, { t: number; vel: number }>;
      released: Map<number, number>;
    },
    t1: number,
  ): Segment | null {
    const sal = new Float64Array(12);
    const notes = new Map<number, number>();
    for (const [n, h] of o.present) {
      const fresh = o.onsets.has(n);
      const age = o.t0 - h.t;
      // a held key fades (like a piano) but never below a floor: you're still holding the harmony
      const base =
        Math.sqrt(h.vel / 100) * (fresh ? 1 : 0.7 * Math.max(0.35, Math.exp(-age / this.params.heldDecayMs)));
      // share of the segment the note actually sounded (passing notes are short)
      const end = o.released.get(n) ?? t1,
        start = Math.max(o.t0, h.t);
      const share = Math.min(1, Math.max(0.05, (end - start) / Math.max(1, t1 - o.t0)));
      notes.set(n, base * (1 - this.params.durationWeight + this.params.durationWeight * share));
    }
    if (!notes.size) return null;
    const bassNote = Math.min(...notes.keys());
    for (const [n, w] of notes) sal[mod12(n)] += w * (n === bassNote ? 1.5 : n > 72 ? 0.8 : 1);
    const sum = sal.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 12; i++) sal[i] /= sum;
    return { t0: o.t0, t1: Math.max(t1, o.t0 + 1), sal, bass: mod12(bassNote), bassNote };
  }
}

/** The Viterbi analyser. Push segments in time order; read the online state, the hindsight path or theories. */
export class Harmonizer {
  readonly segments: Segment[] = [];
  private V: Float64Array = new Float64Array(NS);
  /** Per segment: the previous chord and key of the best way into each state. */
  private back: Int16Array[] = [];
  private backKey: Int8Array[] = [];
  private priors: Float64Array;
  private changeCosts: Float64Array;
  private keySets = ALL_KEYS.map((k) => keyPcSet(k));

  /** Keep every forward column (needed for top-k / max-marginals; offline analysis). */
  keepColumns = false;
  private cols: Float32Array[] = [];

  constructor(readonly params: HarmonizerParams = DEFAULT_PARAMS) {
    this.priors = buildPriors(params);
    this.changeCosts = new Float64Array(24 * 12 * 12);
    ALL_KEYS.forEach((key, k) => {
      const probabilities = TRANSITIONS.probabilities[key.mode === 'major' ? 0 : 1];
      for (let from = 0; from < 12; from++)
        for (let to = 0; to < 12; to++) {
          const probability = probabilities[mod12(from - key.tonic)][mod12(to - key.tonic)];
          this.changeCosts[(k * 12 + from) * 12 + to] =
            params.chordChange * Math.exp(-params.transitionWeight * Math.log(12 * probability));
        }
    });
  }

  /** Emission: how well chord c explains a segment (per second of music). */
  emission(seg: Segment, c: number): number {
    const t = TEMPLATES[c],
      p = this.params;
    let fit = 0,
      inside = 0;
    for (let i = 0; i < t.pcs.length; i++) {
      const s = seg.sal[t.pcs[i]];
      inside += s;
      fit += t.w[i] * Math.min(1, s * p.saturation);
      if (s < 0.02) fit -= t.w[i] * p.missingTone;
    }
    fit -= p.extraNote * (1 - inside) * 3;
    if (seg.bass !== null)
      fit += seg.bass === t.root ? p.bassRoot : t.mask & (1 << seg.bass) ? p.bassInChord : p.bassOutside;
    return fit;
  }

  private weight(seg: Segment): number {
    return Math.min(3, Math.max(0.05, (seg.t1 - seg.t0) / 1000)) ** this.params.durExp;
  }

  push(seg: Segment) {
    const col = this.column(seg);
    this.V = col.V;
    if (this.keepColumns) this.cols.push(Float32Array.from(col.V));
    this.back.push(col.back);
    this.backKey.push(col.backKey);
    this.segments.push(seg);
  }

  /** Local evidence for every (key, chord) state in a segment: emission + chord-in-key prior + key fit. */
  private local(seg: Segment): Float64Array {
    const p = this.params,
      w = this.weight(seg);
    const E = new Float64Array(NC);
    for (let c = 0; c < NC; c++) E[c] = w * this.emission(seg, c);
    const L = new Float64Array(NS);
    for (let k = 0; k < 24; k++) {
      let inScale = 0;
      for (const pc of this.keySets[k]) inScale += seg.sal[pc];
      const kf = w * p.keyFit * (2 * inScale - 1);
      for (let c = 0; c < NC; c++) L[stateOf(k, c)] = E[c] + w * this.priors[k * NC + c] + kf;
    }
    return L;
  }

  /**
   * Offline top-k: for every segment, chords and keys ranked by the score of the best complete
   * explanation passing through them (max-marginals = forward Viterbi + backward Viterbi).
   * Requires keepColumns. Scores are relative to the best path (0 = on the best path).
   */
  ranked(
    kChords = 5,
    kKeys = 3,
  ): { chords: { root: number; kind: KindName; delta: number }[]; keys: { key: Key; delta: number }[] }[] {
    const n = this.segments.length,
      p = this.params;
    if (!n || this.cols.length !== n) return [];
    const out: ReturnType<Harmonizer['ranked']> = Array.from({ length: n }, () => ({ chords: [], keys: [] }));
    let B = new Float64Array(NS); // backward scores for the last segment: 0
    for (let t = n - 1; t >= 0; t--) {
      const F = this.cols[t];
      const M = new Float64Array(NS);
      let top = -Infinity;
      for (let s = 0; s < NS; s++) {
        M[s] = F[s] + B[s];
        if (M[s] > top) top = M[s];
      }
      const byChord = new Float64Array(NC).fill(-Infinity),
        byKey = new Float64Array(24).fill(-Infinity);
      for (let k = 0; k < 24; k++)
        for (let c = 0; c < NC; c++) {
          const v = M[stateOf(k, c)];
          if (v > byChord[c]) byChord[c] = v;
          if (v > byKey[k]) byKey[k] = v;
        }
      const cs = [...byChord.keys()].sort((a, b) => byChord[b] - byChord[a]).slice(0, kChords);
      const ks = [...byKey.keys()].sort((a, b) => byKey[b] - byKey[a]).slice(0, kKeys);
      out[t] = {
        chords: cs.map((c) => ({ root: TEMPLATES[c].root, kind: kindOfState(c), delta: byChord[c] - top })),
        keys: ks.map((k) => ({ key: ALL_KEYS[k], delta: byKey[k] - top })),
      };
      if (t === 0) break;
      // backward step: best continuation from each state at t-1 into segment t
      const L = this.local(this.segments[t]);
      const W = new Float64Array(NS);
      for (let s = 0; s < NS; s++) W[s] = L[s] + B[s];
      const Mk = new Float64Array(24 * 12).fill(-Infinity),
        Mc = new Float64Array(NC).fill(-Infinity);
      let G = -Infinity;
      for (let k = 0; k < 24; k++)
        for (let c = 0; c < NC; c++) {
          const v = W[stateOf(k, c)];
          const root = k * 12 + TEMPLATES[c].root;
          if (v > Mk[root]) Mk[root] = v;
          if (v > Mc[c]) Mc[c] = v;
          if (v > G) G = v;
        }
      const nb = new Float64Array(NS);
      const continuation = new Float64Array(24 * 12).fill(-Infinity);
      for (let k = 0; k < 24; k++)
        for (let from = 0; from < 12; from++)
          for (let to = 0; to < 12; to++) {
            const index = k * 12 + from;
            continuation[index] = Math.max(continuation[index], Mk[k * 12 + to] - this.changeCosts[index * 12 + to]);
          }
      for (let k = 0; k < 24; k++)
        for (let c = 0; c < NC; c++) {
          const s = stateOf(k, c);
          nb[s] = Math.max(
            W[s],
            continuation[k * 12 + TEMPLATES[c].root],
            Mc[c] - p.keyChange,
            G - p.keyChange - p.chordChange,
          );
        }
      B = nb;
    }
    return out;
  }

  /** The Viterbi column a segment would produce (without committing it). */
  private column(seg: Segment): { V: Float64Array; back: Int16Array; backKey: Int8Array } {
    const p = this.params;
    const L = this.local(seg);
    const next = new Float64Array(NS);
    const back = new Int16Array(NS); // previous chord state
    const backKey = new Int8Array(NS); // previous key
    if (!this.segments.length) {
      for (let s = 0; s < NS; s++) {
        next[s] = L[s];
        back[s] = -1;
        backKey[s] = -1;
      }
    } else {
      const V = this.V;
      // maxima of the previous column, for the four ways to arrive in (k, c)
      const Mk = new Float64Array(24 * 12).fill(-Infinity),
        MkArg = new Int16Array(24 * 12);
      const Mc = new Float64Array(NC).fill(-Infinity),
        McArg = new Int8Array(NC);
      let G = -Infinity,
        Gk = 0,
        Gc = 0;
      for (let k = 0; k < 24; k++)
        for (let c = 0; c < NC; c++) {
          const v = V[stateOf(k, c)];
          const root = k * 12 + TEMPLATES[c].root;
          if (v > Mk[root]) {
            Mk[root] = v;
            MkArg[root] = c;
          }
          if (v > Mc[c]) {
            Mc[c] = v;
            McArg[c] = k;
          }
          if (v > G) {
            G = v;
            Gk = k;
            Gc = c;
          }
        }
      const arrival = new Float64Array(24 * 12).fill(-Infinity);
      const arrivalArg = new Int16Array(24 * 12);
      for (let k = 0; k < 24; k++)
        for (let to = 0; to < 12; to++)
          for (let from = 0; from < 12; from++) {
            const index = k * 12 + to;
            const score = Mk[k * 12 + from] - this.changeCosts[(k * 12 + from) * 12 + to];
            if (score > arrival[index]) {
              arrival[index] = score;
              arrivalArg[index] = MkArg[k * 12 + from];
            }
          }
      for (let k = 0; k < 24; k++)
        for (let c = 0; c < NC; c++) {
          const s = stateOf(k, c);
          let best = V[s],
            bc = c,
            bk = k; // stay
          const root = k * 12 + TEMPLATES[c].root;
          if (arrival[root] > best) {
            best = arrival[root];
            bc = arrivalArg[root];
            bk = k;
          } // new chord, same key
          if (Mc[c] - p.keyChange > best) {
            best = Mc[c] - p.keyChange;
            bc = c;
            bk = McArg[c];
          } // pivot: same chord, new key
          if (G - p.keyChange - p.chordChange > best) {
            best = G - p.keyChange - p.chordChange;
            bc = Gc;
            bk = Gk;
          }
          next[s] = best + L[s];
          back[s] = bc;
          backKey[s] = bk;
        }
    }
    return { V: next, back, backKey };
  }

  /** Columns to read from: the committed ones, plus an optional still-open segment. */
  private view(tentative?: Segment | null) {
    if (!tentative) return { V: this.V, back: this.back, backKey: this.backKey, segments: this.segments };
    const col = this.column(tentative);
    return {
      V: col.V,
      back: [...this.back, col.back],
      backKey: [...this.backKey, col.backKey],
      segments: [...this.segments, tentative],
    };
  }

  private argmax(V: Float64Array, filterKey?: number): number {
    let best = -Infinity,
      arg = 0;
    const k0 = filterKey ?? 0,
      k1 = filterKey ?? 23;
    for (let k = k0; k <= k1; k++)
      for (let c = 0; c < NC; c++) {
        const v = V[stateOf(k, c)];
        if (v > best) {
          best = v;
          arg = stateOf(k, c);
        }
      }
    return arg;
  }

  /** Current best (key, chord) — what the analyser thinks right now. */
  current(tentative?: Segment | null): { key: Key; chord: Chord } | null {
    const v = this.view(tentative);
    if (!v.segments.length) return null;
    const s = this.argmax(v.V);
    return this.describe(Math.floor(s / NC), s % NC, v.segments[v.segments.length - 1]);
  }

  /** Live top-k chords: ranked by the forward (filtered) scores, i.e. what is known right now. */
  liveChords(k = 3, tentative?: Segment | null): { root: number; kind: KindName; delta: number }[] {
    const V = this.view(tentative).V;
    const byChord = new Float64Array(NC).fill(-Infinity);
    for (let s = 0; s < NS; s++) {
      const c = s % NC;
      if (V[s] > byChord[c]) byChord[c] = V[s];
    }
    const top = Math.max(...byChord);
    return [...byChord.keys()]
      .sort((a, b2) => byChord[b2] - byChord[a])
      .slice(0, k)
      .map((c) => ({ root: TEMPLATES[c].root, kind: kindOfState(c), delta: byChord[c] - top }));
  }

  /** Probability of each key being the current one (softmax over the best path per key). */
  keyDistribution(tentative?: Segment | null, temperature = 0.6): Float64Array {
    const v = this.view(tentative),
      out = new Float64Array(24);
    if (!v.segments.length) return out;
    const best = new Float64Array(24).fill(-Infinity);
    for (let k = 0; k < 24; k++) for (let c = 0; c < NC; c++) best[k] = Math.max(best[k], v.V[stateOf(k, c)]);
    const top = Math.max(...best);
    let sum = 0;
    for (let k = 0; k < 24; k++) {
      out[k] = Math.exp((best[k] - top) / temperature);
      sum += out[k];
    }
    for (let k = 0; k < 24; k++) out[k] /= sum;
    return out;
  }

  /** The best path with hindsight (optionally the best path ending in a given key). */
  path(endKey?: number, tentative?: Segment | null): PathItem[] {
    const v = this.view(tentative);
    const n = v.segments.length;
    if (!n) return [];
    let s = this.argmax(v.V, endKey);
    const states: number[] = Array.from({ length: n }, () => 0);
    for (let i = n - 1; i >= 0; i--) {
      states[i] = s;
      const bc = v.back[i][s],
        bk = v.backKey[i][s];
      if (bc < 0) break;
      s = stateOf(bk, bc);
    }
    const out: PathItem[] = [];
    for (let i = 0; i < n; i++) {
      const seg = v.segments[i],
        k = Math.floor(states[i] / NC),
        c = states[i] % NC;
      if (i > 0 && states[i] === states[i - 1]) {
        const last = out[out.length - 1];
        last.t1 = seg.t1;
        last.segs++;
      } else out.push({ t0: seg.t0, t1: seg.t1, segs: 1, ...this.describe(k, c, seg) });
    }
    return out;
  }

  /** Competing explanations: the best path per final key, with relative likelihoods. */
  theories(n = 3, tentative?: Segment | null): Theory[] {
    const dist = this.keyDistribution(tentative);
    return [...dist.keys()]
      .sort((a, b) => dist[b] - dist[a])
      .slice(0, n)
      .filter((k) => dist[k] > 0.01)
      .map((k) => ({ key: ALL_KEYS[k], prob: dist[k], path: this.path(k, tentative) }));
  }

  reset() {
    this.segments.length = 0;
    this.back = [];
    this.backKey = [];
    this.cols = [];
    this.V = new Float64Array(NS);
  }

  private describe(k: number, c: number, seg: Segment): { key: Key; chord: Chord } {
    const t = TEMPLATES[c];
    const bass = seg.bass !== null && t.mask & (1 << seg.bass) ? seg.bass : t.root;
    return { key: ALL_KEYS[k], chord: chordOf(t.root, kindOfState(c), bass) };
  }
}

export const kindOfState = (c: number): KindName => TYPES[c % NT].kind;
