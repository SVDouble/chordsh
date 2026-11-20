import { type Chord, chordName, chordOf, isDominant, type KindName } from '../theory/chords';
import { mod12 } from '../theory/pitch';
import { isDiatonic, numeralOf } from '../theory/roman';
import { type Key, keyPcSet, nameInKey } from '../theory/scales';
import { TRANSITIONS } from './transitions';

/**
 * Chord assistance: no automatic harmonization, only ranked suggestions for one slot, constrained by
 *  1. the melody over that slot (does it land on rest, colour or pull?), and
 *  2. motion with the neighbouring chords (does the move resolve, glide or stay?).
 * See docs/harmony-model.md §0 and §4. Positions and durations are in quarter notes.
 */

export interface MelodyNote {
  pitch: number;
  start: number;
  beats: number;
}
export interface Span {
  start: number;
  end: number;
}
export type NoteRole = 'rest' | 'colour' | 'lean' | 'pull';

const pcsMemo = new WeakMap<Chord, readonly number[]>();
/** The chord's pitch classes (memoised per chord object; the array is frozen, so callers cannot change it). */
export const chordPcs = (c: Chord): number[] => {
  let pcs = pcsMemo.get(c);
  if (!pcs) {
    pcs = Object.freeze([...new Set(c.tones.map((t) => mod12(c.root + t.interval)))]);
    pcsMemo.set(c, pcs);
  }
  return pcs as number[];
};

/** rest = chord tone; lean/pull = a semitone under/over a chord tone; colour = anything else (a step away). */
export function noteRole(pitch: number, chord: Chord): NoteRole {
  const pcs = new Set(chordPcs(chord));
  const p = mod12(pitch);
  if (pcs.has(p)) return 'rest';
  if (pcs.has(mod12(p - 1))) return 'pull';
  if (pcs.has(mod12(p + 1))) return 'lean';
  return 'colour';
}

/** Metric weight of a position: downbeat 1, half bar 0.8 (even meters), other beats 0.6, off-beats 0.35. */
export function metricWeight(position: number, meter: number): number {
  const p = mod(position, meter);
  if (near(p, 0)) return 1;
  if (meter % 2 === 0 && near(p, meter / 2)) return 0.8;
  return near(p, Math.round(p)) ? 0.6 : 0.35;
}

export interface NoteFit {
  note: MelodyNote;
  role: NoteRole;
  strong: boolean;
  /** A lean/pull that steps (≤ 2 semitones) to a resting note: a passing or neighbour note. */
  resolved: boolean;
}
export interface MelodyFit {
  /** 0 (clashes) … 1 (every note at rest). */
  score: number;
  notes: NoteFit[];
  /** Strong-beat leans/pulls that never resolve: the "wrong notes". */
  clashes: number;
}

const ROLE_VALUE: Record<NoteRole, number> = { rest: 1, colour: 0.55, lean: 0, pull: 0 };

/** How well a chord explains the melody inside a span. `after` is the chord that follows (for resolutions). */
export function melodyFit(
  chord: Chord,
  melody: MelodyNote[],
  span: Span,
  meter = 4,
  after: Chord | null = null,
): MelodyFit | null {
  const sorted = [...melody].sort((a, b) => a.start - b.start);
  let total = 0;
  let weight = 0;
  let clashes = 0;
  const notes: NoteFit[] = [];
  sorted.forEach((note, i) => {
    const overlap = Math.min(note.start + note.beats, span.end) - Math.max(note.start, span.start);
    if (overlap <= 1e-6) return;
    const startsHere = note.start >= span.start - 1e-6;
    const metric = startsHere ? metricWeight(note.start, meter) : 0.6;
    const strong = startsHere && (metric >= 0.6 || note.beats >= 1);
    const role = noteRole(note.pitch, chord);
    let value = ROLE_VALUE[role];
    let resolved = false;
    if (role === 'lean' || role === 'pull') {
      const next = sorted[i + 1];
      const nextChord = next && next.start >= span.end - 1e-6 ? (after ?? chord) : chord;
      resolved = !!next && Math.abs(next.pitch - note.pitch) <= 2 && noteRole(next.pitch, nextChord) === 'rest';
      value = resolved ? (strong ? 0.35 : 0.5) : strong ? 0 : 0.2;
      if (strong && !resolved) clashes++;
    }
    const w = overlap * metric;
    total += w * value;
    weight += w;
    notes.push({ note, role, strong, resolved });
  });
  return weight ? { score: total / weight, notes, clashes } : null;
}

// ───────────────────────────── motion between chords ─────────────────────────────

export type MotionKind = 'resolves' | 'slides' | 'glides' | 'opens' | 'steps' | 'leaps' | 'stays';
export interface Motion {
  /** 0 … 1: how natural the move is, from fixed rules (kind of motion + smoothness + staying in key). */
  score: number;
  kind: MotionKind;
  /** Shared pitch classes. */
  common: number;
  /** Smallest total semitone movement from the first chord's notes to the second's. */
  movement: number;
  /** Steps on the circle of fifths: + brighter (sharpwards), − darker (flatwards). */
  brightness: number;
  text: string;
}

/** Sum over the target's notes of the distance to the nearest note of the source (a cheap voice-leading cost). */
function movementCost(a: number[], b: number[]): number {
  return b.reduce((sum, p) => sum + Math.min(...a.map((q) => Math.min(mod12(p - q), mod12(q - p)))), 0);
}

/** The chord's place on the circle of fifths: minor chords sit with their relative major, diminished with the m3 above. */
const centre = (c: Chord) => (c.quality === 'min' || c.quality === 'dim' ? c.root + 3 : c.root);
const signedFifths = (from: number, to: number) => {
  const d = mod12((to - from) * 7);
  return d > 6 ? d - 12 : d;
};

export function motion(from: Chord, to: Chord, key: Key): Motion {
  const a = chordPcs(from);
  const b = chordPcs(to);
  const common = b.filter((p) => a.includes(p)).length;
  const movement = movementCost(a, b);
  const d = mod12(to.root - from.root);
  const brightness = signedFifths(centre(from), centre(to));
  const tritoneResolves = isDominant(from) && (d === 5 || d === 11);
  const leading = from.quality === 'dim' && d === 1;
  let kind: MotionKind;
  let text: string;
  const nm = (c: Chord) => chordName(c, key);
  if (d === 0 && from.quality === to.quality) [kind, text] = ['stays', `stays on ${nm(to)}`];
  else if (tritoneResolves || leading || (d === 5 && from.quality !== 'min'))
    [kind, text] = [
      'resolves',
      d === 11 ? `slides down a semitone into ${nm(to)} and resolves` : `resolves into ${nm(to)} (root falls a fifth)`,
    ];
  else if (d === 1 || d === 11) [kind, text] = ['slides', `slides a semitone to ${nm(to)}`];
  else if (common >= 2) [kind, text] = ['glides', `glides to ${nm(to)}, keeping ${common} notes`];
  else if (d === 5) [kind, text] = ['resolves', `root falls a fifth to ${nm(to)}`];
  else if (d === 7) [kind, text] = ['opens', `root rises a fifth to ${nm(to)}, opening up`];
  else if (d === 2 || d === 10) [kind, text] = ['steps', `steps to ${nm(to)}`];
  else [kind, text] = ['leaps', `leaps to ${nm(to)}`];
  if (brightness) text += brightness > 0 ? ', brighter' : ', darker';
  // Rules, not statistics (harmony model §4): resolving is best, gliding and sliding are smooth,
  // stepping and opening are plain, leaping needs a reason. Leaving the key costs a little unless the
  // chord points somewhere (a dominant or °7 heading to its target).
  const KIND: Record<MotionKind, number> = {
    resolves: 1,
    glides: 0.8,
    slides: 0.6,
    opens: 0.6,
    steps: 0.5,
    stays: 0.4,
    leaps: 0.2,
  };
  const smooth = Math.max(0, 1 - movement / 8);
  const points = isDominant(to) || to.quality === 'dim';
  const leaveKey = isDiatonic(to, key) || points ? 0 : 0.1;
  const score = Math.max(0, 0.7 * KIND[kind] + 0.3 * smooth - leaveKey);
  return { score, kind, common, movement, brightness, text };
}

// ───────────────────────────── context: is the chord's tension explained? ─────────────────────────────

export interface TensionTone {
  pc: number;
  /** Why it is unstable: outside the key, part of a tritone, a 7th, or an extension. */
  why: 'outside' | 'tritone' | 'seventh' | 'extension';
  weight: number;
  /** 0…1: moves by step (or is held) into the next chord. */
  resolved: number;
  /** 0…1: already sounding in the previous chord, or approached by a semitone. */
  prepared: number;
}
export interface ContextVerdict {
  /** 0…1: 1 = no tension, or all of it accounted for; low = tension that goes nowhere. */
  score: number;
  tension: number;
  tones: TensionTone[];
  text: string;
}

/**
 * Preparation → dissonance → resolution, the old counterpoint rule: a plain chord needs no excuse, but each
 * unstable note of a complex chord should be prepared (already sounding before) or resolved (step into the
 * next chord). A weird chord followed by the chord it resolves into is in context; left hanging, it sticks out.
 */
const tensionMemo = new WeakMap<Chord, { key: Key; prev: Chord | null; next: Chord | null; v: ContextVerdict }>();
/** Memoised on the last call per chord: the rules ask the same question several times per chord. */
export function tensionContext(chord: Chord, key: Key, prev: Chord | null, next: Chord | null): ContextVerdict {
  const m = tensionMemo.get(chord);
  if (m && m.key === key && m.prev === prev && m.next === next) return m.v;
  const v = tensionContextOf(chord, key, prev, next);
  tensionMemo.set(chord, { key, prev, next, v });
  return v;
}
function tensionContextOf(chord: Chord, key: Key, prev: Chord | null, next: Chord | null): ContextVerdict {
  const scale = keyPcSet(key);
  const pcs = chordPcs(chord);
  const tones: TensionTone[] = [];
  for (const t of chord.tones) {
    const pc = mod12(chord.root + t.interval);
    let why: TensionTone['why'] | null = null;
    let weight = 0;
    if (!scale.has(pc)) [why, weight] = ['outside', 1];
    else if (pcs.includes(mod12(pc + 6))) [why, weight] = ['tritone', 0.6];
    else if (t.role === 'b7' || t.role === '7' || t.role === 'bb7') [why, weight] = ['seventh', 0.4];
    else if (!['1', '3', 'b3', '5'].includes(t.role)) [why, weight] = ['extension', 0.4];
    if (!why) continue;
    // resolution: a step into a note of the next chord that is itself stable (in the key); a held chromatic note stays tense
    const stepTo = (others: number[]) => {
      let best = 0;
      for (const o of others) {
        const d = Math.min(mod12(o - pc), mod12(pc - o));
        const v = d === 1 ? 1 : d === 2 ? 0.8 : d === 0 ? (scale.has(pc) ? 0.6 : 0.2) : 0;
        best = Math.max(best, scale.has(o) || d === 0 ? v : v * 0.3);
      }
      return best;
    };
    const resolved = next ? stepTo(chordPcs(next)) : 0;
    const prev12 = prev ? chordPcs(prev) : [];
    const prepared = prev12.includes(pc)
      ? 1
      : prev12.some((o) => Math.min(mod12(o - pc), mod12(pc - o)) === 1)
        ? 0.6
        : 0;
    tones.push({ pc, why, weight, resolved, prepared });
  }
  const tension = tones.reduce((sum, t) => sum + t.weight, 0);
  const explained = tones.reduce((sum, t) => sum + t.weight * Math.max(t.resolved, 0.6 * t.prepared), 0);
  const score = 1 - (tension - explained) / (tension + 1);
  const name = (pc: number) => nameInKey(pc, key);
  const open = tones.filter((t) => Math.max(t.resolved, 0.6 * t.prepared) < 0.5).map((t) => name(t.pc));
  const text = !tones.length
    ? 'stable: nothing to resolve'
    : open.length
      ? `${open.join(', ')} ${open.length > 1 ? 'are' : 'is'} left hanging`
      : next
        ? `its tension (${tones.map((t) => name(t.pc)).join(', ')}) resolves into ${chordName(next, key)}`
        : 'its tension is prepared by the chord before';
  return { score, tension, tones, text };
}

// ───────────────────────────── suggestions for one slot ─────────────────────────────

export interface SlotContext {
  key: Key;
  /** Chord before the slot, if any. */
  prev?: Chord | null;
  /** Chord after the slot, if any. */
  next?: Chord | null;
  melody?: MelodyNote[];
  span: Span;
  meter?: number;
  style?: 'triads' | 'jazz';
  /** 0 = only in-key chords rank high, 1 = colour chords compete on equal terms. */
  adventurous?: number;
  /** How much each judge counts (default: melody 0.5, context 0.25, rules 0.25, habit 0). */
  judges?: Partial<Record<JudgeName, number>>;
  limit?: number;
}

/**
 * Independent judges. Each gives a verdict 0…1 (or null when it has nothing to judge); the ranking is a
 * weighted mean of the verdicts, so judges can be switched on/off and compared (scripts/assist.test.ts).
 * - melody: rules — does the melody rest, colour or rub over the chord (§0)?
 * - context: rules — is the chord's tension prepared by the chord before or resolved into the next one?
 * - rules:  rules — motion from the previous and into the next chord (resolve, glide, step, leap; §4).
 * - habit:  data — how often songs make these root moves (learned scale-degree table, fixed and repeatable).
 */
export const JUDGES = ['melody', 'context', 'rules', 'habit'] as const;
export type JudgeName = (typeof JUDGES)[number];
export const DEFAULT_JUDGES: Record<JudgeName, number> = { melody: 0.5, context: 0.25, rules: 0.25, habit: 0 };

/** Learned root-motion habit between two chords, 0…1 (relative to the most common move from `from`). */
export function habit(from: Chord, to: Chord, key: Key): number {
  const row = TRANSITIONS.probabilities[key.mode === 'major' ? 0 : 1][mod12(from.root - key.tonic)];
  return row[mod12(to.root - key.tonic)] / Math.max(...row);
}
export interface SlotSuggestion {
  chord: Chord;
  name: string;
  roman: string;
  inKey: boolean;
  melody: MelodyFit | null;
  into: Motion | null;
  onward: Motion | null;
  /** Each judge's verdict (null = nothing to judge, e.g. no melody in the span). */
  verdicts: Record<JudgeName, number | null>;
  score: number;
  reasons: string[];
}

const DIATONIC: Record<Key['mode'], [number, KindName, KindName][]> = {
  major: [
    [0, 'maj', 'maj7'],
    [2, 'min', 'm7'],
    [4, 'min', 'm7'],
    [5, 'maj', 'maj7'],
    [7, 'maj', '7'],
    [9, 'min', 'm7'],
    [11, 'dim', 'm7b5'],
  ],
  minor: [
    [0, 'min', 'm7'],
    [2, 'dim', 'm7b5'],
    [3, 'maj', 'maj7'],
    [5, 'min', 'm7'],
    [7, 'maj', '7'],
    [8, 'maj', 'maj7'],
    [10, 'maj', '7'],
  ],
};
const BORROWED: Record<Key['mode'], [number, KindName, KindName][]> = {
  major: [
    [5, 'min', 'm7'],
    [8, 'maj', 'maj7'],
    [10, 'maj', '7'],
    [3, 'maj', 'maj7'],
  ],
  minor: [
    [5, 'maj', '7'],
    [0, 'maj', 'maj7'],
  ],
};

/** Candidate vocabulary: in-key chords, borrowed chords, and chords that point at the next one. */
function candidates(ctx: SlotContext): Chord[] {
  const { key, next } = ctx;
  const jazz = ctx.style === 'jazz';
  const pick = ([deg, triad, seventh]: [number, KindName, KindName]) =>
    chordOf(key.tonic + deg, jazz ? seventh : triad);
  const out = [...DIATONIC[key.mode].map(pick), ...BORROWED[key.mode].map(pick)];
  if (next) {
    out.push(chordOf(next.root + 7, '7'), chordOf(next.root + 1, '7'), chordOf(next.root - 1, 'dim7'));
    if (!jazz) out.push(chordOf(next.root + 7, 'maj'));
  }
  // dominants of the in-key targets (V/x), so a chord can point anywhere in the key
  for (const [deg, triad] of DIATONIC[key.mode])
    if (deg && triad !== 'dim') out.push(chordOf(key.tonic + deg + 7, '7'));
  const seen = new Set<string>();
  return out.filter((c) => {
    const id = `${c.root}:${c.suffix}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function suggestForSlot(ctx: SlotContext): SlotSuggestion[] {
  const { key, prev = null, next = null, span } = ctx;
  const meter = ctx.meter ?? 4;
  const adventurous = ctx.adventurous ?? 0.3;
  const melody = ctx.melody ?? [];
  const nm = (c: Chord) => chordName(c, key);
  const out = candidates(ctx).map((chord): SlotSuggestion => {
    const fit = melody.length ? melodyFit(chord, melody, span, meter, next) : null;
    const into = prev ? motion(prev, chord, key) : null;
    const onward = next ? motion(chord, next, key) : null;
    const inKey = isDiatonic(chord, key);
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x !== null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const tension = tensionContext(chord, key, prev, next);
    const verdicts: Record<JudgeName, number | null> = {
      melody: fit ? fit.score : null,
      context: prev || next ? tension.score : null,
      rules: avg([into?.score ?? null, onward?.score ?? null]),
      habit: avg([prev ? habit(prev, chord, key) : null, next ? habit(chord, next, key) : null]),
    };
    const weights = { ...DEFAULT_JUDGES, ...ctx.judges };
    let num = 0;
    let den = 0;
    for (const j of JUDGES)
      if (verdicts[j] !== null && weights[j] > 0) {
        num += weights[j] * verdicts[j]!;
        den += weights[j];
      }
    const base = den ? num / den : 0.5;
    const score = base - (inKey ? 0 : 0.12 * (1 - adventurous)) - (fit?.clashes ?? 0) * 0.08;
    const reasons: string[] = [];
    if (fit) {
      const rest = fit.notes.filter((n) => n.role === 'rest' && n.strong).map((n) => nameInKey(n.note.pitch, key));
      const rub = fit.notes.filter((n) => n.strong && !n.resolved && (n.role === 'pull' || n.role === 'lean'));
      if (rest.length) reasons.push(`melody rests on ${[...new Set(rest)].join(', ')}`);
      if (rub.length)
        reasons.push(
          `${[...new Set(rub.map((n) => nameInKey(n.note.pitch, key)))].join(', ')} rubs against ${nm(chord)}`,
        );
    }
    if (into) reasons.push(`from ${nm(prev!)}: ${into.text}`);
    if (onward) reasons.push(`then ${onward.text}`);
    if (tension.tones.length && (prev || next)) reasons.push(tension.text);
    if (!inKey) reasons.push('outside the key: a colour chord');
    return {
      chord,
      name: nm(chord),
      roman: numeralOf(chord, key),
      inKey,
      melody: fit,
      into,
      onward,
      verdicts,
      score,
      reasons,
    };
  });
  return out.sort((a, b) => b.score - a.score).slice(0, ctx.limit ?? 12);
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
