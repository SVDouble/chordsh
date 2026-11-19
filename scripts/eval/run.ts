/** Play a piece into the analyser as if live, and score live + hindsight readings against the truth. */
import { DEFAULT_PARAMS, Harmonizer, type HarmonizerParams, SegmentBuilder } from '../../src/engine/harmonizer';
import { AccentDetector, BeatTracker } from '../../src/engine/beats';
import { type KindName, chordName } from '../../src/theory/chords';
import { numeralOf } from '../../src/theory/roman';
import { ALL_KEYS, type Key, keyEq, keyShort, relativeKey } from '../../src/theory/scales';
import type { Family, Piece } from './truth';

const SAMPLE_MS = 250;
const LAG_MS = 200; // the live reading may trail a change by this much without penalty
const BOUNDARY_MS = 300;

export const KIND_FAMILY: Record<KindName, Family> = {
  maj: 'maj',
  '7': 'maj',
  maj7: 'maj',
  '6': 'maj',
  '9': 'maj',
  '13': 'maj',
  '7b9': 'maj',
  maj9: 'maj',
  min: 'min',
  m7: 'min',
  m6: 'min',
  m9: 'min',
  mMaj7: 'min',
  dim: 'dim',
  m7b5: 'dim',
  dim7: 'dim',
  aug: 'aug',
  sus4: 'sus',
  sus2: 'sus',
  '7sus4': 'sus',
};

/** Accuracy counters (per sample of 250 ms), summed over pieces. */
export interface Counts {
  n: number;
  chordLive1: number;
  chordLive3: number;
  chord1: number;
  chord3: number;
  chord5: number;
  root1: number;
  keyLive1: number;
  key1: number;
  key3: number;
  keyClose: number;
  /** Why the hindsight top-1 chord was wrong. */
  errBoundary: number;
  errQuality: number;
  errFifth: number;
  errOther: number;
  /** Why the hindsight key was wrong. */
  keyRelative: number;
  keyParallel: number;
  keyFifth: number;
  keyOther: number;
  chordChanges: number;
  truthChanges: number;
  keyChanges: number;
  truthKeyChanges: number;
}
export const zero = (): Counts => ({
  n: 0,
  chordLive1: 0,
  chordLive3: 0,
  chord1: 0,
  chord3: 0,
  chord5: 0,
  root1: 0,
  keyLive1: 0,
  key1: 0,
  key3: 0,
  keyClose: 0,
  errBoundary: 0,
  errQuality: 0,
  errFifth: 0,
  errOther: 0,
  keyRelative: 0,
  keyParallel: 0,
  keyFifth: 0,
  keyOther: 0,
  chordChanges: 0,
  truthChanges: 0,
  keyChanges: 0,
  truthKeyChanges: 0,
});
export function add(a: Counts, b: Counts): Counts {
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof Counts)[]) out[k] += b[k];
  return out;
}

type ChordId = [root: number, family: Family];
const same = ([root, fam]: ChordId, t: { root: number; family: Family }) => root === t.root && fam === t.family;
function dedupe(xs: ChordId[]): ChordId[] {
  const seen = new Set<string>();
  return xs.filter(([r, f]) => {
    const k = `${r}${f}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export interface Result {
  counts: Counts;
  timeline: string[];
}

export function evaluate(
  piece: Piece,
  params: HarmonizerParams = DEFAULT_PARAMS,
  opts: { timelineBars?: number } = {},
): Result {
  const h = new Harmonizer(params);
  h.keepColumns = true;
  const live: { t: number; chords: ChordId[]; key: Key }[] = [];
  const sb = new SegmentBuilder(params, (seg) => {
    h.push(seg);
    const dist = h.keyDistribution();
    let bk = 0;
    for (let k = 1; k < 24; k++) if (dist[k] > dist[bk]) bk = k;
    live.push({
      t: seg.t0,
      chords: dedupe(h.liveChords(6).map((x) => [x.root, KIND_FAMILY[x.kind]])),
      key: ALL_KEYS[bk],
    });
  });
  for (const e of piece.events) {
    if (e.kind === 'on') sb.noteOn(e.note, e.vel, e.t);
    else sb.noteOff(e.note, e.t);
  }
  sb.close(piece.durationMs + 800);
  const path = h.path();
  const ranked = h.ranked(8, 3);
  const segs = h.segments;
  const truth = piece.chords;

  const c = zero();
  let li = 0,
    si = 0,
    ti = 0;
  for (let t = 0; t <= piece.durationMs; t += SAMPLE_MS) {
    while (ti < truth.length && truth[ti].t1 <= t) ti++;
    const tr = truth[ti];
    if (!tr || tr.t0 > t) continue;
    while (li + 1 < live.length && live[li + 1].t <= t + LAG_MS) li++;
    while (si + 1 < segs.length && segs[si + 1].t0 <= t) si++;
    const on = live[li],
      rk = ranked[si];
    if (!on || on.t > t + LAG_MS || !rk) continue;
    c.n++;
    if (same(on.chords[0], tr)) c.chordLive1++;
    if (on.chords.slice(0, 3).some((x) => same(x, tr))) c.chordLive3++;
    if (keyEq(on.key, tr.key)) c.keyLive1++;

    const fams = dedupe(rk.chords.map((x) => [x.root, KIND_FAMILY[x.kind]]));
    const hit = (k: number) => fams.slice(0, k).some((x) => same(x, tr));
    if (hit(1)) c.chord1++;
    if (hit(3)) c.chord3++;
    if (hit(5)) c.chord5++;
    const pr = fams[0][0];
    if (pr === tr.root) c.root1++;
    if (!hit(1)) {
      const d = (pr - tr.root + 12) % 12;
      if (truth.some((x) => Math.abs(x.t0 - t) < BOUNDARY_MS)) c.errBoundary++;
      else if (pr === tr.root) c.errQuality++;
      else if (d === 5 || d === 7) c.errFifth++;
      else c.errOther++;
    }
    const k1 = rk.keys[0].key;
    if (keyEq(k1, tr.key)) c.key1++;
    else if (tr.key) {
      if (keyEq(relativeKey(k1), tr.key)) c.keyRelative++;
      else if (k1.tonic === tr.key.tonic) c.keyParallel++;
      else if (k1.mode === tr.key.mode && [5, 7].includes((k1.tonic - tr.key.tonic + 12) % 12)) c.keyFifth++;
      else c.keyOther++;
    }
    if (rk.keys.some((k) => keyEq(k.key, tr.key))) c.key3++;
    if (tr.key && (keyEq(k1, tr.key) || keyEq(relativeKey(k1), tr.key) || k1.tonic === tr.key.tonic)) c.keyClose++;
  }
  truth.forEach((x, i) => {
    const p = truth[i - 1];
    if (!p || p.root !== x.root || p.family !== x.family) c.truthChanges++;
    if (p && !keyEq(p.key, x.key)) c.truthKeyChanges++;
  });
  c.chordChanges = path.filter(
    (x, i) => i === 0 || x.chord.root !== path[i - 1].chord.root || x.chord.quality !== path[i - 1].chord.quality,
  ).length;
  c.keyChanges = path.filter((x, i) => i > 0 && !keyEq(x.key, path[i - 1].key)).length;

  const timeline: string[] = [];
  for (let b = 0; b < Math.min(opts.timelineBars ?? 0, piece.bars.length); b++) {
    const a = piece.bars[b],
      z = piece.bars[b + 1] ?? piece.durationMs;
    const tr = [...new Set(truth.filter((x) => x.t1 > a && x.t0 < z).map((x) => x.label))].join(' ');
    const items = path.filter((x) => x.t1 > a && x.t0 < z);
    const eng = [...new Set(items.map((x) => `${chordName(x.chord, x.key)}(${numeralOf(x.chord, x.key)})`))].join(' ');
    timeline.push(
      `bar ${String(b + 1).padStart(3)} | ${tr.padEnd(30)} | ${eng.padEnd(42)} | ${[...new Set(items.map((x) => keyShort(x.key)))].join('/')}`,
    );
  }
  return { counts: c, timeline };
}

/** Bar tracking: F-measure of estimated bars / beats vs truth (±100 ms). */
export function evaluateBars(piece: Piece): { barF: number; beatF: number; bpm: number | null } {
  const bt = new BeatTracker();
  const acc = new AccentDetector();
  let groupT = -Infinity,
    group: number[] = [];
  const flush = () => {
    if (group.length) bt.onset(groupT, Math.sqrt(group.length), acc.accent(groupT, group));
    group = [];
  };
  for (const e of piece.events) {
    if (e.kind !== 'on') continue;
    if (e.t - groupT > 30) {
      flush();
      groupT = e.t;
    }
    group.push(e.note);
  }
  flush();
  bt.update(piece.durationMs);
  const inside = (xs: number[]) => xs.filter((b) => b >= 0 && b <= piece.durationMs);
  return { barF: fm(inside(bt.bars()), piece.bars), beatF: fm(inside(bt.beats), piece.beats), bpm: bt.bpm };
}

/** Count events in xs that have a partner in ys within ±100 ms (both sorted). */
function hits(xs: number[], ys: number[]): number {
  let j = 0,
    k = 0;
  for (const x of xs) {
    while (j < ys.length && ys[j] < x - 100) j++;
    if (j < ys.length && Math.abs(ys[j] - x) < 100) k++;
  }
  return k;
}
/** F-measure of estimated vs true event times. */
function fm(est: number[], truth: number[]): number {
  const p = est.length ? hits(est, truth) / est.length : 0,
    r = truth.length ? hits(truth, est) / truth.length : 0;
  return p + r ? (2 * p * r) / (p + r) : 0;
}
