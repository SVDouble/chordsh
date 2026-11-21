/**
 * Sequence suggestions: fill a span (a bar, a phrase) with a run of chords, not one chord at a time.
 *
 * A beam search adds one chord per step. A chord is judged once both its neighbours are known (the chord after
 * the span counts too), by three judges:
 *  - melody: how well it explains the melody notes in its part of the span (assist.ts melodyFit);
 *  - rules:  the style rulebook's verdict with its real neighbours (rules.ts);
 *  - habit:  how common the continuation is in the chosen tradition (progressions.ts, counted by the study).
 * Rule breaks that the study found frequent in a tradition and context ("idioms") are forgiven there and
 * reported. Deterministic: the same input always gives the same ideas. See docs/harmonize.md.
 */
import { type Chord, chordName, chordOf, type KindName } from '../theory/chords';
import { mod12 } from '../theory/pitch';
import { numeralOf } from '../theory/roman';
import { type Key, keyPcSet } from '../theory/scales';
import { type MelodyNote, melodyFit, motion, openingScore, tonicAnchor } from './assist';
import { habitScore, type Idiom, kindOf, type ProgressionStats, statsKey, tokenOf } from './progressions';
import { judgeAll, RULEBOOKS, RULES, rulebookVerdict, SCHEMAS } from './rules';

export type Tradition = 'popular' | 'art' | 'jazz';

export interface SequenceContext {
  key: Key;
  /** Chords before the span, oldest first (the last few are used). */
  before: Chord[];
  /** The chord right after the span, if any: the sequence has to lead into it. */
  after: Chord | null;
  melody: MelodyNote[];
  span: { start: number; end: number };
  meter: number;
  /** How many chords fill the span (equal lengths). */
  count: number;
  /** Style rulebook id (rules.ts RULEBOOKS). */
  style: string;
  tradition: Tradition;
  stats?: ProgressionStats | null;
  /** 0 = familiar chords and moves first, 1 = colour chords compete equally. */
  adventurous?: number;
  /** The span closes a phrase: cadence rules apply to its last chord. */
  phraseEnd?: boolean;
  /** The span starts the song / ends it: the frame rule wants the tonic there (default: no chords before / after). */
  songStart?: boolean;
  songEnd?: boolean;
  limit?: number;
}

export interface SequenceIdea {
  chords: Chord[];
  names: string[];
  numerals: string[];
  /** 0 … 1. */
  score: number;
  /** Mean judge verdicts over the chords (null: that judge had nothing to say). */
  melody: number | null;
  rules: number | null;
  habit: number | null;
  anchor: number | null;
  motion: number | null;
  schema: string | null;
  reasons: string[];
  /** Rule breaks forgiven as idioms of the tradition, in plain words. */
  idioms: string[];
}

type ProgressionContext = Omit<SequenceContext, 'count' | 'limit'>;

// ───────────────────────────── vocabulary ─────────────────────────────

const MAJOR_DIATONIC: [number, KindName][] = [
  [0, 'maj'],
  [2, 'min'],
  [4, 'min'],
  [5, 'maj'],
  [7, 'maj'],
  [9, 'min'],
  [11, 'dim'],
];
const MINOR_DIATONIC: [number, KindName][] = [
  [0, 'min'],
  [2, 'dim'],
  [3, 'maj'],
  [5, 'min'],
  [7, 'maj'], // harmonic-minor V
  [7, 'min'],
  [8, 'maj'],
  [10, 'maj'],
  [11, 'dim'],
];
/** Common colour chords: borrowed from the parallel mode and applied dominants. */
const MAJOR_COLOUR: [number, KindName][] = [
  [10, 'maj'],
  [8, 'maj'],
  [3, 'maj'],
  [5, 'min'],
  [2, '7'],
  [4, '7'],
  [9, '7'],
  [0, '7'],
];
const MINOR_COLOUR: [number, KindName][] = [
  [0, 'maj'],
  [5, 'maj'],
  [1, 'maj'],
  [0, '7'],
  [2, '7'],
];
const SEVENTHS: Partial<Record<KindName, KindName>> = { maj: 'maj7', min: 'm7', dim: 'm7b5' };

function vocabulary(ctx: SequenceContext): { chord: Chord; colour: boolean }[] {
  const minor = ctx.key.mode === 'minor';
  const out = new Map<string, { chord: Chord; colour: boolean }>();
  const add = (deg: number, kind: KindName, colour: boolean) => {
    const c = chordOf(ctx.key.tonic + deg, kind);
    const t = tokenOf(c, ctx.key);
    if (!out.has(t)) out.set(t, { chord: c, colour });
  };
  for (const [d, k] of minor ? MINOR_DIATONIC : MAJOR_DIATONIC) {
    add(d, k, false);
    if (ctx.tradition === 'jazz') add(d, d === 7 && k === 'maj' ? '7' : (SEVENTHS[k] ?? k), false);
  }
  add(7, '7', false);
  for (const [d, k] of minor ? MINOR_COLOUR : MAJOR_COLOUR) add(d, k, true);
  // the tradition's own most-used chords (from the study), when counted
  const stats = ctx.stats?.traditions[statsKey(ctx.key, ctx.tradition)];
  if (stats) {
    const single = Object.entries(stats.grams)
      .filter(([g]) => !g.includes(' '))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);
    for (const [g] of single) {
      const [deg, kind] = g.split(':');
      const c = chordOf(ctx.key.tonic + Number(deg), kind as KindName);
      const scale = keyPcSet(ctx.key);
      const colour = c.tones.some((x) => !scale.has(mod12(c.root + x.interval)));
      add(Number(deg), kind as KindName, colour);
    }
  }
  return [...out.values()];
}

// ───────────────────────────── search ─────────────────────────────

interface Beam {
  chords: Chord[];
  colour: boolean[];
  /** Finished per-chord scores (a chord is finished when its successor is chosen). */
  parts: {
    melody: number | null;
    rules: number | null;
    habit: number | null;
    anchor: number | null;
    motion: number | null;
    total: number;
  }[];
  /** Habit of each chord, computed when it is added (it only needs the past). */
  habits: (number | null)[];
  forgiven: Idiom[];
  sum: number;
}

const emptyBeam = (): Beam => ({ chords: [], colour: [], parts: [], habits: [], forgiven: [], sum: 0 });

function sequenceScoring(ctx: ProgressionContext, count: number) {
  const book = RULEBOOKS.find((b) => b.id === ctx.style) ?? RULEBOOKS[0];
  const stats = ctx.stats?.traditions[statsKey(ctx.key, ctx.tradition)];
  const idioms = (ctx.stats?.idioms ?? []).filter((i) => i.tradition === ctx.tradition);
  const part = (ctx.span.end - ctx.span.start) / count;
  const sub = (i: number) => ({ start: ctx.span.start + i * part, end: ctx.span.start + (i + 1) * part });
  const hasMelody = ctx.melody.some((n) => n.start < ctx.span.end && n.start + n.beats > ctx.span.start);
  const adventurous = ctx.adventurous ?? 0.3;
  const w = {
    melody: hasMelody ? 0.45 : 0,
    rules: stats ? 0.3 : 0.55,
    habit: stats ? 0.25 : 0,
  };
  const wSum = w.melody + w.rules + w.habit;
  const before = ctx.before.slice(-3);
  const standalone = !hasMelody && !before.length && !ctx.after;
  const singleOpening = standalone && count === 1;
  const songStart = ctx.songStart ?? ctx.before.length === 0;
  const songEnd = ctx.songEnd ?? (!ctx.after && (ctx.phraseEnd ?? false));
  const history = (b: Beam) => [...before, ...b.chords].map((c) => tokenOf(c, ctx.key));

  /** Score chord i of a beam now that its neighbours are known. */
  const finish = (b: Beam, i: number, next: Chord | null) => {
    const chord = b.chords[i];
    const prev = i > 0 ? b.chords[i - 1] : (before.at(-1) ?? null);
    const span = sub(i);
    const fit = hasMelody ? melodyFit(chord, ctx.melody, span, ctx.meter, next) : null;
    const verdicts = judgeAll({
      key: ctx.key,
      chord,
      prev,
      next,
      melody: ctx.melody,
      span,
      meter: ctx.meter,
      phraseEnd: (ctx.phraseEnd ?? false) && i === count - 1,
    });
    // idioms: a rule break this tradition commonly makes in this very context is not held against the chord
    const context = `${prev ? numeralOf(prev, ctx.key) : '·'} → [${numeralOf(chord, ctx.key)}] → ${next ? numeralOf(next, ctx.key) : '·'}`;
    for (const idiom of idioms)
      if (idiom.context === context && (verdicts[idiom.rule] ?? 0) < 0) {
        verdicts[idiom.rule] = 0;
        b.forgiven.push(idiom);
      }
    const v = rulebookVerdict(book, verdicts);
    const rules = v === null ? null : (v + 1) / 2;
    const habit = singleOpening ? null : b.habits[i];
    const melody = fit?.score ?? null;
    if (singleOpening) {
      const anchor = tonicAnchor(chord, ctx.key);
      const total = openingScore(anchor, rules, !b.colour[i], adventurous);
      b.parts[i] = { melody, rules, habit, anchor, motion: null, total };
      b.sum += total;
      return;
    }
    const anchor = standalone && !prev ? tonicAnchor(chord, ctx.key) : null;
    const movement = standalone && prev ? motion(prev, chord, ctx.key).score : null;
    let total =
      (w.melody * (melody ?? 0.5) + w.rules * (rules ?? 0.5) + w.habit * (habit ?? 0.5)) / Math.max(1e-9, wSum);
    if (standalone) {
      const rulesWeight = rules === null ? 0 : w.rules;
      const habitWeight = habit === null ? 0 : w.habit;
      total =
        ((anchor ?? movement ?? 0) + rulesWeight * (rules ?? 0) + habitWeight * (habit ?? 0)) /
        (1 + rulesWeight + habitWeight);
    }
    if (b.colour[i]) total -= 0.08 * (1 - adventurous);
    if (prev && i > 0 && tokenOf(prev, ctx.key) === tokenOf(chord, ctx.key)) total -= 0.1; // a repeat inside the span
    // the frame: a song starts at home, and ends there (its last chord the tonic, best reached from V)
    const home = ctx.key.mode === 'minor' ? ['min', 'm7'] : ['maj', 'maj7'];
    const tonic = mod12(chord.root - ctx.key.tonic) === 0 && home.includes(kindOf(chord));
    if (i === 0 && songStart) total += tonic ? 0.12 : -0.04;
    if (i === count - 1 && songEnd) {
      total += tonic ? 0.15 : -0.08;
      if (tonic && prev && mod12(prev.root - chord.root) === 7) total += 0.05;
    }
    b.parts[i] = { melody, rules, habit, anchor, motion: movement, total };
    b.sum += total;
  };

  function advance(b: Beam, chord: Chord, colour: boolean): Beam {
    const grown = {
      chords: [...b.chords, chord],
      colour: [...b.colour, colour],
      parts: [...b.parts],
      habits: [...b.habits, habitScore(stats, history(b), tokenOf(chord, ctx.key))],
      forgiven: [...b.forgiven],
      sum: b.sum,
    };
    if (b.chords.length) finish(grown, b.chords.length - 1, chord);
    return grown;
  }

  // Rank by finished chords plus an optimistic guess for the newest one's habit and melody fit.
  function guess(b: Beam) {
    const last = b.chords.length - 1;
    if (standalone)
      return (
        b.sum +
        (last === 0 ? tonicAnchor(b.chords[0], ctx.key) : motion(b.chords[last - 1], b.chords[last], ctx.key).score)
      );
    const fit = hasMelody ? (melodyFit(b.chords[last], ctx.melody, sub(last), ctx.meter)?.score ?? 0.5) : 0.5;
    return b.sum + (w.melody * fit + w.habit * (b.habits[last] ?? 0.5) + w.rules * 0.6) / Math.max(1e-9, wSum);
  }

  function close(b: Beam) {
    finish(b, count - 1, ctx.after);
    if (ctx.after && stats) {
      const h = habitScore(stats, history(b), tokenOf(ctx.after, ctx.key));
      if (h !== null) b.sum += (w.habit * (h - 0.5)) / Math.max(1e-9, wSum);
    }
  }
  return { advance, guess, close };
}

/** Judge a fixed progression with the same context and score used by the search. */
export function rateProgression(ctx: ProgressionContext, chords: Chord[]): SequenceIdea | null {
  const count = chords.length;
  if (!count) return null;
  const scorer = sequenceScoring(ctx, count);
  const scale = keyPcSet(ctx.key);
  const beam = chords.reduce((b, chord) => {
    const colour = chord.tones.some((tone) => !scale.has(mod12(chord.root + tone.interval)));
    return scorer.advance(b, chord, colour);
  }, emptyBeam());
  scorer.close(beam);
  return describe(
    beam,
    chords.map((chord) => chordName(chord, ctx.key)),
    ctx,
    count,
  );
}

export function suggestSequences(ctx: SequenceContext): SequenceIdea[] {
  const count = Math.max(1, Math.min(8, Math.round(ctx.count)));
  const vocab = vocabulary(ctx);
  const scorer = sequenceScoring(ctx, count);
  let beams: Beam[] = [emptyBeam()];
  const width = 48;
  for (let i = 0; i < count; i++) {
    const grown: Beam[] = [];
    for (const b of beams) for (const v of vocab) grown.push(scorer.advance(b, v.chord, v.colour));
    beams = grown
      .map((b) => ({ b, g: scorer.guess(b) }))
      .sort((x, y) => y.g - x.g)
      .slice(0, width)
      .map((x) => x.b);
  }
  // the last chord leads into the chord after the span; that move's habit counts too
  for (const b of beams) scorer.close(b);
  const seen = new Set<string>();
  const ideas: SequenceIdea[] = [];
  for (const b of beams.sort((x, y) => y.sum - x.sum)) {
    const names = b.chords.map((c) => chordName(c, ctx.key));
    const id = names.join(' ');
    if (seen.has(id)) continue;
    // variety: each idea differs from every one listed before in at least a quarter of its chords
    const differs = (other: SequenceIdea) => names.filter((n, k) => n !== other.names[k]).length;
    if (ideas.some((o) => differs(o) < Math.max(1, Math.ceil(count / 4)))) continue;
    seen.add(id);
    ideas.push(describe(b, names, ctx, count));
    if (ideas.length >= (ctx.limit ?? 6)) break;
  }
  return ideas;
}

// ───────────────────────────── explanations ─────────────────────────────

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function describe(b: Beam, names: string[], ctx: ProgressionContext, count: number): SequenceIdea {
  const melody = mean(b.parts.map((p) => p.melody));
  const rules = mean(b.parts.map((p) => p.rules));
  const habit = mean(b.parts.map((p) => p.habit));
  const reasons: string[] = [];
  const schema = schemaOf(b.chords, ctx.key);
  if (schema) reasons.push(`a known pattern: ${schema}`);
  if (melody !== null)
    reasons.push(melody >= 0.85 ? 'the melody rests on every chord' : `melody fit ${Math.round(100 * melody)}%`);
  if (habit !== null)
    reasons.push(
      habit >= 0.6 ? `common in ${ctx.tradition} music` : habit < 0.3 ? `rare in ${ctx.tradition} music` : '',
    );
  if (ctx.after) {
    const last = b.chords[count - 1];
    const d = mod12(ctx.after.root - last.root);
    if (d === 5) reasons.push(`resolves into ${chordName(ctx.after, ctx.key)}`);
  }
  if (b.colour.some(Boolean)) reasons.push('uses colour chords');
  return {
    chords: b.chords,
    names,
    numerals: b.chords.map((c) => numeralOf(c, ctx.key)),
    score: Math.max(0, Math.min(1, b.sum / count)),
    melody,
    rules,
    habit,
    anchor: b.parts[0].anchor,
    motion: mean(b.parts.map((p) => p.motion)),
    schema,
    reasons: reasons.filter(Boolean),
    idioms: describeIdioms(b.forgiven),
  };
}

/** One line per context: how often the tradition makes the move, and which rules it breaks. */
function describeIdioms(list: Idiom[]): string[] {
  const byContext = new Map<string, Idiom[]>();
  for (const i of list) {
    const same = byContext.get(i.context) ?? [];
    if (!same.some((x) => x.rule === i.rule)) same.push(i);
    byContext.set(i.context, same);
  }
  return [...byContext.values()].map((same) => {
    const { context, tradition } = same[0];
    const count = Math.max(...same.map((x) => x.count));
    const rules = same.map((x) => `“${RULES.find((r) => r.id === x.rule)?.statement ?? x.rule}”`).join(', ');
    return `${context.replace(/[[\]]/g, '')} is common in ${tradition} music (${count.toLocaleString('en')} times), though it breaks ${rules}`;
  });
}

/** A complete harmonic schema, allowing it to start on any chord in the cycle. */
function schemaOf(chords: Chord[], key: Key): string | null {
  const tok = (c: Chord) => `${mod12(c.root - key.tonic)}${c.quality === 'min' ? 'm' : c.quality === 'dim' ? 'o' : ''}`;
  const run = chords.map(tok);
  if (run.length < 3) return null;
  for (const { name, degrees } of SCHEMAS) {
    const n = degrees.length;
    for (let from = 0; from + n <= run.length; from++)
      for (let start = 0; start < n; start++)
        if (degrees.every((_, offset) => run[from + offset] === degrees[(start + offset) % n])) return name;
  }
  return null;
}
