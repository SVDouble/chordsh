/** Play a piece into the engine as if live, sample what it shows, and score it against the truth. */
import { vi } from 'vitest';
import { Session, type ChordEntry } from '../../src/engine/session';
import { DEFAULT_PARAMS, Harmonizer, type HarmonizerParams, SegmentBuilder } from '../../src/engine/harmonizer';
import { AccentDetector, BeatTracker } from '../../src/engine/beats';
import { type Chord, chordName } from '../../src/theory/chords';
import { numeralOf } from '../../src/theory/roman';
import { type Key, keyEq, keyShort, relativeKey } from '../../src/theory/scales';
import type { Family, Piece, TruthChord } from './truth';

const SAMPLE_MS = 250;
const LAG_MS = 200; // the engine needs a moment (onset grouping + commit) — don't penalise that

export interface Score {
  id: string;
  samples: number;
  rootLive: number;
  chordLive: number;
  chordFinal: number;
  keyLive: number;
  keyFinal: number;
  keyCloseFinal: number;
  /** Engine chord changes per true chord change (1 = perfect, >1 = over-thinking). */
  overSeg: number;
  keyChanges: number;
  truthKeyChanges: number;
  timeline: string[];
}

const family = (c: Chord): Family =>
  c.quality === 'sus4' || c.quality === 'sus2' ? 'sus' : c.quality === 'power' ? 'maj' : (c.quality as Family);
const close = (a: Key | null, b: Key | null) => !!a && !!b && (keyEq(a, b) || keyEq(relativeKey(a), b) || a.tonic === b.tonic);

export function evaluate(piece: Piece, opts: { timelineBars?: number } = {}): Score {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  const s = new Session();
  s.historyLimit = Infinity;
  const base = performance.now();
  const live: { t: number; chord: Chord | null; key: Key | null }[] = [];

  // interleave note events with sampling points
  let ei = 0;
  for (let t = 0; t <= piece.durationMs + 1000; t += SAMPLE_MS) {
    while (ei < piece.events.length && piece.events[ei].t <= t) {
      const e = piece.events[ei++];
      vi.advanceTimersByTime(Math.max(0, base + e.t - performance.now()));
      if (e.kind === 'on') s.noteOn(e.note, e.vel, performance.now());
      else s.noteOff(e.note, performance.now());
    }
    vi.advanceTimersByTime(Math.max(0, base + t - performance.now()));
    live.push({ t, chord: s.now.best, key: s.activeKey });
  }
  vi.advanceTimersByTime(2000);
  vi.useRealTimers();

  // final (hindsight) view: the history after the whole piece, with any retrospective relabelling
  const entries = s.chords.map((e) => ({ ...e, t0: e.t0 - base }));
  const finalAt = (t: number): ChordEntry | null => {
    let lo = 0, hi = entries.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (entries[m].t0 <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 ? entries[ans] : null;
  };
  let ti = 0;
  const truthAt = (t: number): TruthChord | null => {
    while (ti < piece.chords.length && piece.chords[ti].t1 <= t) ti++;
    const c = piece.chords[ti];
    return c && c.t0 <= t ? c : null;
  };

  let n = 0, rootLive = 0, chordLive = 0, chordFinal = 0, keyLive = 0, keyFinal = 0, keyClose = 0;
  for (const smp of live) {
    const tr = truthAt(smp.t - LAG_MS);
    if (!tr) continue;
    n++;
    if (smp.chord?.root === tr.root) rootLive++;
    if (smp.chord?.root === tr.root && family(smp.chord) === tr.family) chordLive++;
    const fin = finalAt(smp.t);
    if (fin && fin.chord.root === tr.root && family(fin.chord) === tr.family) chordFinal++;
    if (keyEq(smp.key, tr.key)) keyLive++;
    if (keyEq(fin?.key, tr.key)) keyFinal++;
    if (close(fin?.key ?? null, tr.key)) keyClose++;
  }

  let truthChanges = 0, truthKeyChanges = 0;
  piece.chords.forEach((c, i) => {
    const p = piece.chords[i - 1];
    if (!p || p.root !== c.root || p.family !== c.family) truthChanges++;
    if (p && !keyEq(p.key, c.key)) truthKeyChanges++;
  });

  // bar-by-bar story: what the score says vs what the engine concluded
  const timeline: string[] = [];
  const bars = piece.bars.length ? piece.bars : [0];
  for (let b = 0; b < Math.min(opts.timelineBars ?? 0, bars.length); b++) {
    const a = bars[b], z = bars[b + 1] ?? piece.durationMs;
    const truth = [...new Set(piece.chords.filter((c) => c.t1 > a && c.t0 < z).map((c) => c.label))].join(' ');
    const eng = entries.filter((e) => e.t0 >= a && e.t0 < z);
    const key = finalAt(z - 1)?.key;
    const liveKey = live.find((x) => x.t >= z - SAMPLE_MS)?.key;
    timeline.push(
      `bar ${String(b + 1).padStart(3)} | ${truth.padEnd(28)} | ${eng.map((e) => `${e.name}${e.roman ? ` ${e.roman.numeral}` : ''}`).join(', ').padEnd(40)} | key ${key ? keyShort(key) : '—'}${liveKey && !keyEq(liveKey, key) ? ` (live ${keyShort(liveKey)})` : ''}`,
    );
  }

  const pct = (x: number) => (n ? x / n : 0);
  return {
    id: piece.id, samples: n,
    rootLive: pct(rootLive), chordLive: pct(chordLive), chordFinal: pct(chordFinal),
    keyLive: pct(keyLive), keyFinal: pct(keyFinal), keyCloseFinal: pct(keyClose),
    overSeg: truthChanges ? entries.length / truthChanges : 0,
    keyChanges: s.history.filter((h) => h.type === 'key').length - 1,
    truthKeyChanges,
    timeline,
  };
}

/** Score the probabilistic harmonizer directly (no UI session). */
export function evaluateHarmonizer(piece: Piece, params: HarmonizerParams = DEFAULT_PARAMS, opts: { timelineBars?: number } = {}): Score {
  const h = new Harmonizer(params);
  const online: { t: number; root: number; family: Family; key: Key }[] = [];
  const sb = new SegmentBuilder(params, (seg) => {
    h.push(seg);
    const cur = h.current()!;
    online.push({ t: seg.t0, root: cur.chord.root, family: family(cur.chord), key: cur.key });
  });
  for (const e of piece.events) e.kind === 'on' ? sb.noteOn(e.note, e.vel, e.t) : sb.noteOff(e.note, e.t);
  sb.close(piece.durationMs + 500);
  const path = h.path();

  // the online reading at time t is the one decided at the last segment start (+ lag)
  let oi = 0, fi = 0, ti = 0, n = 0, root = 0, chordL = 0, chordF = 0, keyL = 0, keyF = 0, keyC = 0;
  for (let t = 0; t <= piece.durationMs; t += SAMPLE_MS) {
    while (ti < piece.chords.length && piece.chords[ti].t1 <= t) ti++;
    const tr = piece.chords[ti];
    if (!tr || tr.t0 > t) continue;
    while (oi + 1 < online.length && online[oi + 1].t <= t + LAG_MS) oi++;
    while (fi + 1 < path.length && path[fi + 1].t0 <= t) fi++;
    const on = online[oi], fin = path[fi];
    if (!on || on.t > t + LAG_MS) continue;
    n++;
    if (on.root === tr.root) root++;
    if (on.root === tr.root && on.family === tr.family) chordL++;
    if (fin && fin.chord.root === tr.root && family(fin.chord) === tr.family) chordF++;
    if (keyEq(on.key, tr.key)) keyL++;
    if (keyEq(fin?.key, tr.key)) keyF++;
    if (close(fin?.key ?? null, tr.key)) keyC++;
  }
  let truthChanges = 0, truthKeyChanges = 0;
  piece.chords.forEach((c, i) => {
    const pr = piece.chords[i - 1];
    if (!pr || pr.root !== c.root || pr.family !== c.family) truthChanges++;
    if (pr && !keyEq(pr.key, c.key)) truthKeyChanges++;
  });
  const chordChanges = path.filter((x, i) => i === 0 || x.chord.root !== path[i - 1].chord.root || family(x.chord) !== family(path[i - 1].chord)).length;
  const timeline: string[] = [];
  const bars = piece.bars.length ? piece.bars : [0];
  for (let b = 0; b < Math.min(opts.timelineBars ?? 0, bars.length); b++) {
    const a = bars[b], z = bars[b + 1] ?? piece.durationMs;
    const truth = [...new Set(piece.chords.filter((c) => c.t1 > a && c.t0 < z).map((c) => c.label))].join(' ');
    const items = path.filter((x) => x.t1 > a && x.t0 < z);
    const eng = [...new Set(items.map((x) => chordLabel(x.chord, x.key)))].join(' ');
    const keys = [...new Set(items.map((x) => keyShort(x.key)))].join('/');
    timeline.push(`bar ${String(b + 1).padStart(3)} | ${truth.padEnd(28)} | ${eng.padEnd(40)} | key ${keys}`);
  }
  const pct = (x: number) => (n ? x / n : 0);
  return {
    id: piece.id, samples: n, rootLive: pct(root), chordLive: pct(chordL), chordFinal: pct(chordF),
    keyLive: pct(keyL), keyFinal: pct(keyF), keyCloseFinal: pct(keyC),
    overSeg: truthChanges ? chordChanges / truthChanges : 0,
    keyChanges: path.filter((x, i) => i > 0 && !keyEq(x.key, path[i - 1].key)).length, truthKeyChanges, timeline,
  };
}

function chordLabel(c: Chord, key: Key): string {
  return `${chordName(c, key)}(${numeralOf(c, key)})`;
}

/** Bar tracking: F-measure of estimated bar lines vs true downbeats (±100 ms), plus tempo found. */
export function evaluateBars(piece: Piece, beatsPerBar = 4): { f: number; beatF: number; meter: number; bpm: number | null; confidence: number } {
  const bt = new BeatTracker();
  bt.beatsPerBar = beatsPerBar;
  const acc = new AccentDetector();
  let groupT = -Infinity, group: number[] = [];
  const flush = () => { if (group.length) bt.onset(groupT, Math.sqrt(group.length), acc.accent(groupT, group)); group = []; };
  for (const e of piece.events) {
    if (e.kind !== 'on') continue;
    if (e.t - groupT > 30) { flush(); groupT = e.t; }
    group.push(e.note);
  }
  flush();
  bt.update(piece.durationMs);
  const fm = (est: number[], truth: number[]) => {
    const hit = (xs: number[], ys: number[]) => { let j = 0, h = 0; for (const x of xs) { while (j < ys.length && ys[j] < x - 100) j++; if (j < ys.length && Math.abs(ys[j] - x) < 100) h++; } return h; };
    const p = est.length ? hit(est, truth) / est.length : 0, r = truth.length ? hit(truth, est) / truth.length : 0;
    return p + r ? (2 * p * r) / (p + r) : 0;
  };
  const end = (xs: number[]) => xs.filter((b) => b >= 0 && b <= piece.durationMs);
  const meter = piece.bars.length > 2 ? Math.round((piece.bars[2] - piece.bars[1]) / ((piece.beats[1] - piece.beats[0]) || 1)) : 4;
  return { f: fm(end(bt.bars()), piece.bars), beatF: fm(end(bt.beats), piece.beats), meter, bpm: bt.bpm, confidence: bt.confidence };
}
