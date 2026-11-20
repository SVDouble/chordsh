/**
 * Harmony rules: explicit, derivable criteria for "does this chord make sense here?".
 *
 * Every rule states one idea from music theory (with its source), computes a verdict in −1 … +1
 * (−1 violates, 0 neutral, +1 satisfies) or null when it does not apply, and explains itself.
 * There are no learned weights: each number follows from the formula in the rule's comment.
 * The catalogue is documented and measured in docs/rules.md (scripts/rules.test.ts).
 */
import { type Chord, chordName, isDominant } from '../theory/chords';
import { mod12 } from '../theory/pitch';
import { isDiatonic } from '../theory/roman';
import { type Key, keyPcSet, nameInKey, scalePcSet } from '../theory/scales';
import { chordPcs, type MelodyNote, metricWeight, noteRole, type Span, tensionContext } from './assist';
import type { Feature, Phrase, PieceChord } from './features';

export interface RuleContext {
  key: Key;
  chord: Chord;
  prev: Chord | null;
  next: Chord | null;
  /** Melody notes near the slot (positions in quarter notes). */
  melody: MelodyNote[];
  span: Span;
  meter: number;
  /** The slot closes a phrase (end of a 4-bar group, a melodic pause, or the end of the piece). */
  phraseEnd: boolean;
}

export type RuleFamily =
  | 'melody'
  | 'function'
  | 'tension'
  | 'root motion'
  | 'voice leading'
  | 'key & colour'
  | 'sonority'
  | 'modern';
export interface Rule {
  id: string;
  family: RuleFamily;
  /** The rule in plain words. */
  statement: string;
  /** Where it comes from. */
  source: string;
  /** How the verdict is computed. */
  formula: string;
  /**
   * preference: scores every chord (−1…+1), so it can rank chords.
   * constraint: can only object (−1…0): a chord that satisfies it, or that it does not concern, gets 0.
   */
  kind: 'preference' | 'constraint';
  /** Constraints: does the rule have anything to say about this chord here? (for compliance rates) */
  concerns?: (ctx: RuleContext) => boolean;
  judge: (ctx: RuleContext) => number | null;
}

// ───────────────────────────── shared helpers ─────────────────────────────

const clamp = (x: number) => Math.max(-1, Math.min(1, x));
/** Mean of the non-null values (null if none); a plain loop, as it runs millions of times in the study. */
const mean = (xs: (number | null)[]) => {
  let sum = 0;
  let n = 0;
  for (const x of xs)
    if (x !== null) {
      sum += x;
      n++;
    }
  return n ? sum / n : null;
};
const has = (c: Chord, pc: number) => chordPcs(c).includes(mod12(pc));
const dist = (a: number, b: number) => Math.min(mod12(a - b), mod12(b - a));
/** Root interval (0–11) for both neighbouring transitions, each scored by `f`, averaged. */
const sides = (ctx: RuleContext, f: (d: number, from: Chord, to: Chord) => number | null) => {
  const a = ctx.prev ? f(mod12(ctx.chord.root - ctx.prev.root), ctx.prev, ctx.chord) : null;
  const b = ctx.next ? f(mod12(ctx.next.root - ctx.chord.root), ctx.chord, ctx.next) : null;
  return a === null ? b : b === null ? a : (a + b) / 2;
};
/** Melody notes overlapping the slot, with the overlap length and whether they start on a strong beat. */
const slotMemo = new WeakMap<MelodyNote[], { span: Span; meter: number; v: ReturnType<typeof slotNotesOf> }>();
/** The melody notes of the slot, memoised per melody and span (they do not depend on the chord being judged). */
function slotNotes(ctx: RuleContext) {
  const m = slotMemo.get(ctx.melody);
  if (m && m.span === ctx.span && m.meter === ctx.meter) return m.v;
  const v = slotNotesOf(ctx);
  slotMemo.set(ctx.melody, { span: ctx.span, meter: ctx.meter, v });
  return v;
}
function slotNotesOf(ctx: RuleContext) {
  const out: { note: MelodyNote; w: number; strong: boolean; index: number }[] = [];
  const sorted = [...ctx.melody].sort((a, b) => a.start - b.start);
  sorted.forEach((note, index) => {
    const overlap = Math.min(note.start + note.beats, ctx.span.end) - Math.max(note.start, ctx.span.start);
    if (overlap <= 1e-6) return;
    const startsHere = note.start >= ctx.span.start - 1e-6;
    const metric = startsHere ? metricWeight(note.start, ctx.meter) : 0.6;
    out.push({ note, w: overlap * metric, strong: startsHere && (metric >= 0.6 || note.beats >= 1), index });
  });
  return { notes: out, sorted };
}

/** Riemann function of a chord in the key: T (rest), S (departure), D (tension); null if unclear. */
export function harmonicFunction(c: Chord, key: Key): 'T' | 'S' | 'D' | null {
  const d = mod12(c.root - key.tonic);
  const minorish = c.quality === 'min' || c.quality === 'dim';
  if (key.mode === 'major') {
    if (!isDiatonic(c, key)) {
      if (d === 5 && minorish) return 'S'; // borrowed iv
      if (d === 8 || d === 10 || d === 2) return 'S'; // ♭VI, ♭VII, II (V/V acts on the way to D but is S-like)
      if (d === 3) return 'T'; // ♭III
      return null;
    }
    return ({ 0: 'T', 4: 'T', 9: 'T', 2: 'S', 5: 'S', 7: 'D', 11: 'D' } as Record<number, 'T' | 'S' | 'D'>)[d] ?? null;
  }
  const minor: Record<number, 'T' | 'S' | 'D'> = { 0: 'T', 3: 'T', 8: 'T', 2: 'S', 5: 'S', 7: 'D', 11: 'D', 10: 'D' };
  return minor[d] ?? null;
}

// ───────────────────────────── the rules ─────────────────────────────

/**
 * Pop/rock harmonic schemas as scale degrees above the tonic (m = minor, o = diminished), read cyclically.
 * Open Music Theory (“Four-chord schemas”, “Modal schemas”, “Pentatonic harmony”); Biamonte 2010; Richards 2017.
 */
export const SCHEMAS: { name: string; degrees: string[] }[] = [
  { name: 'axis / “four chords” I–V–vi–IV', degrees: ['0', '7', '9m', '5'] },
  { name: 'axis, minor start vi–IV–I–V', degrees: ['9m', '5', '0', '7'] },
  { name: 'doo-wop I–vi–IV–V', degrees: ['0', '9m', '5', '7'] },
  { name: 'turnaround I–vi–ii–V', degrees: ['0', '9m', '2m', '7'] },
  { name: 'singer/songwriter I–V–vi–iii–IV', degrees: ['0', '7', '9m', '4m', '5'] },
  { name: 'Puff I–iii–IV', degrees: ['0', '4m', '5'] },
  { name: 'plagal sigh I–IV–I', degrees: ['0', '5', '0'] },
  { name: 'double plagal ♭VII–IV–I', degrees: ['10', '5', '0'] },
  { name: 'Mixolydian I–♭VII–IV', degrees: ['0', '10', '5'] },
  { name: 'Mixolydian shuttle I–♭VII', degrees: ['0', '10', '0'] },
  { name: 'Aeolian ♭VI–♭VII–I', degrees: ['8', '10', '0'] },
  { name: 'Aeolian loop i–♭VII–♭VI–♭VII', degrees: ['0m', '10', '8', '10'] },
  { name: 'minor loop i–♭VI–♭III–♭VII', degrees: ['0m', '8', '3', '10'] },
  { name: 'Andalusian i–♭VII–♭VI–V', degrees: ['0m', '10', '8', '7'] },
  { name: 'Dorian shuttle i–IV', degrees: ['0m', '5', '0m'] },
  { name: 'lament i–v–♭VI', degrees: ['0m', '7m', '8'] },
  { name: 'blues I–IV–I–V–IV–I', degrees: ['0', '5', '0', '7', '5', '0'] },
  { name: 'pentatonic I–♭III–IV', degrees: ['0', '3', '5'] },
];
/** Diminished, augmented or with a note outside the key: a chord that needs a reason. */
const unstable = (ctx: RuleContext) =>
  ctx.chord.quality === 'dim' ||
  ctx.chord.quality === 'aug' ||
  chordPcs(ctx.chord).some((p) => !keyPcSet(ctx.key).has(p));

const SCHEMA_TRIPLES = new Set(
  SCHEMAS.flatMap(({ degrees }) => {
    const out: string[] = [];
    const n = degrees.length;
    for (let i = 0; i < n; i++) out.push([degrees[i], degrees[(i + 1) % n], degrees[(i + 2) % n]].join(' '));
    return out;
  }),
);

export const RULES: Rule[] = [
  // ── melody against the chord (vertical) ──
  {
    id: 'mel-chord-tones',
    family: 'melody',
    statement: 'Strong-beat melody notes belong to the chord.',
    source: 'Temperley 2001, harmonic preference rule 1 (compatibility); common-practice harmony',
    formula: '2 × (strong-beat melody time on chord tones ÷ strong-beat melody time) − 1',
    kind: 'preference',
    judge: (ctx) => {
      const { notes } = slotNotes(ctx);
      const strong = notes.filter((n) => n.strong);
      const total = strong.reduce((s, n) => s + n.w, 0);
      if (!total) return null;
      return (
        2 * (strong.filter((n) => noteRole(n.note.pitch, ctx.chord) === 'rest').reduce((s, n) => s + n.w, 0) / total) -
        1
      );
    },
  },
  {
    id: 'mel-stable-tones',
    family: 'melody',
    statement: 'The melody sits best on the root and fifth, then the third; sevenths and others less so.',
    source: 'Temperley 2001 (1̂ > 5̂ > 3̂ > ♭7̂ compatibility ranking); Rameau’s stability of the fundamental',
    formula: 'time-weighted mean over melody notes of: root +1, fifth +0.8, third +0.5, seventh 0, other −0.6',
    kind: 'preference',
    judge: (ctx) => {
      const { notes } = slotNotes(ctx);
      const total = notes.reduce((s, n) => s + n.w, 0);
      if (!total) return null;
      const value = (p: number) => {
        const i = mod12(p - ctx.chord.root);
        const t = ctx.chord.tones.find((x) => mod12(x.interval) === i);
        if (!t) return -0.6;
        return t.role === '1' ? 1 : t.role === '5' ? 0.8 : t.role === '3' || t.role === 'b3' ? 0.5 : 0;
      };
      return notes.reduce((s, n) => s + n.w * value(n.note.pitch), 0) / total;
    },
  },
  {
    id: 'mel-ornaments-resolve',
    family: 'melody',
    statement: 'Melody notes outside the chord are ornaments: they leave by step to a chord tone.',
    source: 'Temperley 2001, harmonic preference rule 4 (ornamental dissonance); species counterpoint',
    formula: '2 × (non-chord tones followed by a step of ≤ 2 semitones to a chord tone ÷ non-chord tones) − 1',
    kind: 'preference',
    judge: (ctx) => {
      const { notes, sorted } = slotNotes(ctx);
      const nct = notes.filter((n) => noteRole(n.note.pitch, ctx.chord) !== 'rest');
      if (!nct.length) return null;
      const ok = nct.filter((n) => {
        const nx = sorted[n.index + 1];
        if (!nx) return false;
        const target = nx.start >= ctx.span.end - 1e-6 ? (ctx.next ?? ctx.chord) : ctx.chord;
        return Math.abs(nx.pitch - n.note.pitch) <= 2 && noteRole(nx.pitch, target) === 'rest';
      });
      return (2 * ok.length) / nct.length - 1;
    },
  },
  {
    id: 'mel-no-minor-ninth',
    family: 'melody',
    statement: 'No strong-beat melody note sits a semitone above a chord tone (the ♭9 / “avoid note” clash).',
    source: 'Jazz avoid-note practice; Levine, The Jazz Theory Book (1995); roughness of the minor 9th',
    formula: 'constraint — −(strong-beat melody time a semitone above a chord tone ÷ strong-beat melody time)',
    kind: 'constraint',
    concerns: (ctx) => slotNotes(ctx).notes.some((n) => n.strong),
    judge: (ctx) => {
      const strong = slotNotes(ctx).notes.filter((n) => n.strong);
      const total = strong.reduce((s, n) => s + n.w, 0);
      if (!total) return null;
      const clash = strong.filter((n) => noteRole(n.note.pitch, ctx.chord) === 'pull').reduce((s, n) => s + n.w, 0);
      return clash ? -clash / total : 0;
    },
  },
  {
    id: 'mel-leading-tone-harmonized',
    family: 'melody',
    statement: 'When the melody stresses the leading tone (7̂), the chord contains it (V or vii°).',
    source: 'Common-practice harmonization of 7̂; Huron 2006 (tendency of the leading tone)',
    formula: '+1 if a strong melody note is 7̂ and the chord contains 7̂; −1 if it does not; n/a otherwise',
    kind: 'preference',
    judge: (ctx) => {
      const lt = mod12(ctx.key.tonic + 11);
      const stressed = slotNotes(ctx).notes.some((n) => n.strong && mod12(n.note.pitch) === lt);
      return stressed ? (has(ctx.chord, lt) ? 1 : -1) : null;
    },
  },
  {
    id: 'mel-cadence-tonic',
    family: 'melody',
    statement: 'If a phrase ends with the melody on the tonic, the chord is the tonic chord.',
    source: 'Authentic cadence: melody 1̂ over I (Caplin 1998; Aldwell & Schachter)',
    formula: '+1 if phrase end, last melody note is 1̂ and the chord is I/i; −1 if not I/i; n/a otherwise',
    kind: 'preference',
    judge: (ctx) => {
      if (!ctx.phraseEnd) return null;
      const { notes } = slotNotes(ctx);
      const last = notes.at(-1);
      if (!last || mod12(last.note.pitch - ctx.key.tonic) !== 0) return null;
      return mod12(ctx.chord.root - ctx.key.tonic) === 0 ? 1 : -1;
    },
  },

  // ── function: the T → S → D → T cycle ──
  {
    id: 'function-order',
    family: 'function',
    statement: 'Harmony moves forward through the cycle tonic → subdominant → dominant → tonic.',
    source: 'Riemann 1893 (functions); Kostka & Payne’s “normative progression”',
    formula:
      'mean over both neighbour moves of: forward step +1, T→D +0.6, plagal S→T +0.3, same function +0.2, D→S −1',
    kind: 'preference',
    judge: (ctx) => {
      const order: Record<string, number> = {
        TS: 1,
        SD: 1,
        DT: 1,
        TD: 0.6,
        ST: 0.3,
        TT: 0.2,
        SS: 0.2,
        DD: 0.2,
        DS: -1,
      };
      return sides(ctx, (_d, from, to) => {
        const a = harmonicFunction(from, ctx.key);
        const b = harmonicFunction(to, ctx.key);
        return a && b ? order[a + b] : null;
      });
    },
  },
  {
    id: 'cadence',
    family: 'function',
    statement: 'Phrases end on the tonic (full close) or the dominant (half close).',
    source: 'Caplin 1998 (cadence types); common practice',
    formula: 'at a phrase end: I/i +1, V +0.6, anything else −0.6; n/a elsewhere',
    kind: 'preference',
    judge: (ctx) => {
      if (!ctx.phraseEnd) return null;
      const d = mod12(ctx.chord.root - ctx.key.tonic);
      return d === 0 ? 1 : d === 7 ? 0.6 : -0.6;
    },
  },
  {
    id: 'dominant-resolves',
    family: 'function',
    statement: 'A dominant goes to the chord a fifth below (or deceptively one step up).',
    source: 'Rameau 1722; authentic and deceptive resolution in every harmony textbook',
    formula:
      'constraint — a dominant (V7, or a major triad on 5̂) followed by: root a fifth below 0, a step up (deceptive) −0.3, anything else −1',
    kind: 'constraint',
    concerns: (ctx) =>
      !!ctx.next &&
      (isDominant(ctx.chord) || (ctx.chord.quality === 'maj' && mod12(ctx.chord.root - ctx.key.tonic) === 7)),
    judge: (ctx) => {
      const c = ctx.chord;
      const dominant = isDominant(c) || (c.quality === 'maj' && mod12(c.root - ctx.key.tonic) === 7);
      if (!ctx.next) return null;
      if (!dominant) return 0;
      const d = mod12(ctx.next.root - c.root);
      return d === 5 ? 0 : d === 2 ? -0.3 : -1;
    },
  },
  {
    id: 'applied-chord-target',
    family: 'function',
    statement: 'An applied (secondary) dominant is followed by the chord it applies to.',
    source: 'Secondary dominants / tonicization (Schenker; Aldwell & Schachter)',
    formula: 'constraint — an out-of-key major or dominant-7th chord: next root a fifth below 0, otherwise −1',
    kind: 'constraint',
    concerns: (ctx) => !!ctx.next && ctx.chord.quality === 'maj' && !isDiatonic(ctx.chord, ctx.key),
    judge: (ctx) => {
      const c = ctx.chord;
      if (!ctx.next) return null;
      if (!(c.quality === 'maj') || isDiatonic(c, ctx.key)) return 0;
      return mod12(ctx.next.root - c.root) === 5 ? 0 : -1;
    },
  },

  // ── tension and its resolution ──
  {
    id: 'tension-explained',
    family: 'tension',
    statement: 'Each unstable note of a chord is prepared by the chord before or resolved by step into the next.',
    source: 'Preparation – dissonance – resolution (Fux 1725, suspensions); our context judge (docs/harmony-model.md)',
    formula:
      'constraint — −(unexplained tension) ÷ (tension + 1); tension = outside notes ×1, tritone notes ×0.6, sevenths/extensions ×0.4; explained = resolved by step into the next chord or prepared in the previous one',
    kind: 'constraint',
    concerns: (ctx) => (!!ctx.prev || !!ctx.next) && tensionContext(ctx.chord, ctx.key, ctx.prev, ctx.next).tension > 0,
    judge: (ctx) => {
      if (!ctx.prev && !ctx.next) return null;
      const t = tensionContext(ctx.chord, ctx.key, ctx.prev, ctx.next);
      return t.score - 1; // = −(unexplained tension) ÷ (tension + 1); a plain chord or a fully explained one 0
    },
  },
  {
    id: 'tritone-resolves',
    family: 'tension',
    statement: 'If a chord holds a tritone, both of its notes move by step into the next chord.',
    source: 'Resolution of the dominant-seventh tritone (common practice; Piston, Harmony)',
    formula:
      'constraint — mean over the two tritone notes of: semitone step 0, whole step −0.3, held −0.5, otherwise −1; no tritone 0',
    kind: 'constraint',
    concerns: (ctx) => !!ctx.next && chordPcs(ctx.chord).some((p, _i, all) => all.includes(mod12(p + 6))),
    judge: (ctx) => {
      if (!ctx.next) return null;
      const pcs = chordPcs(ctx.chord);
      const pair = pcs.find((p) => pcs.includes(mod12(p + 6)));
      if (pair === undefined) return 0;
      const next = chordPcs(ctx.next);
      const move = (p: number) => {
        const d = Math.min(...next.map((q) => dist(p, q)));
        return d === 1 ? 0 : d === 2 ? -0.3 : d === 0 ? -0.5 : -1;
      };
      return (move(pair) + move(pair + 6)) / 2;
    },
  },
  {
    id: 'leading-tone-rises',
    family: 'tension',
    statement:
      'The leading tone (7̂) leads to the tonic: chords before a tonic chord contain it, and chords that contain it move to the tonic.',
    source: 'Tendency of the leading tone (Huron 2006, Sweet Anticipation)',
    formula:
      'next is I/i: +1 if the chord holds 7̂, −0.5 if not; otherwise, if the chord holds 7̂: +1 when next holds 1̂, −1 when not; else 0',
    kind: 'preference',
    judge: (ctx) => {
      if (!ctx.next) return null;
      const lt = ctx.key.tonic + 11;
      const hasLt = has(ctx.chord, lt);
      if (mod12(ctx.next.root - ctx.key.tonic) === 0) return hasLt ? 1 : -0.5;
      if (!hasLt) return 0;
      return has(ctx.next, ctx.key.tonic) ? 1 : -1;
    },
  },
  {
    id: 'seventh-falls',
    family: 'tension',
    statement: 'A chord’s minor seventh resolves down by step in the next chord.',
    source: 'Common-practice resolution of chordal sevenths (Aldwell & Schachter; Piston)',
    formula: 'constraint — a chord with a ♭7 or °7: next has the note a step below 0, keeps it −0.3, otherwise −1',
    kind: 'constraint',
    concerns: (ctx) => !!ctx.next && ctx.chord.tones.some((x) => x.role === 'b7' || x.role === 'bb7'),
    judge: (ctx) => {
      const t = ctx.chord.tones.find((x) => x.role === 'b7' || x.role === 'bb7');
      if (!ctx.next) return null;
      if (!t) return 0;
      const s = ctx.chord.root + t.interval;
      return has(ctx.next, s - 1) || has(ctx.next, s - 2) ? 0 : has(ctx.next, s) ? -0.3 : -1;
    },
  },

  // ── root motion (the fundamental bass) ──
  {
    id: 'fifth-relation',
    family: 'root motion',
    statement: 'Neighbouring roots are related by a fifth.',
    source: 'Rameau 1722 (basse fondamentale)',
    formula: 'mean over both neighbour moves of: fifth +1, third 0, step −0.5, tritone −1',
    kind: 'preference',
    judge: (ctx) =>
      sides(ctx, (d) =>
        [5, 7].includes(d) ? 1 : [3, 4, 8, 9].includes(d) ? 0 : [1, 2, 10, 11].includes(d) ? -0.5 : d === 6 ? -1 : null,
      ),
  },
  {
    id: 'dominant-direction',
    family: 'root motion',
    statement: 'Roots move in the “dominant” direction: down a fifth, down a third, or up a step.',
    source: 'Meeùs 2000 (harmonic vectors); Schoenberg 1954 (strong vs. descending progressions)',
    formula:
      'mean over both neighbour moves of: dominant vector +1, subdominant vector (up a fifth, up a third, down a step) −1, tritone 0',
    kind: 'preference',
    judge: (ctx) =>
      sides(ctx, (d) => ([5, 8, 9, 1, 2].includes(d) ? 1 : [7, 3, 4, 10, 11].includes(d) ? -1 : d === 6 ? 0 : null)),
  },
  {
    id: 'bass-stepwise',
    family: 'root motion',
    statement: 'The bass moves by step (a melodic bass line).',
    source: 'Line clichés and stepwise bass in pop; Rameau’s and Fux’s preference for conjunct motion',
    formula: 'mean over both neighbour moves of: step +1, fifth 0, third −0.3, tritone −1',
    kind: 'preference',
    judge: (ctx) =>
      sides(ctx, (d) =>
        [1, 2, 10, 11].includes(d) ? 1 : [5, 7].includes(d) ? 0 : [3, 4, 8, 9].includes(d) ? -0.3 : d === 6 ? -1 : null,
      ),
  },

  // ── voice leading ──
  {
    id: 'parsimony',
    family: 'voice leading',
    statement: 'Voices move as little as possible between chords.',
    source: 'Tymoczko 2011 (efficient voice leading); Cohn 1997 (parsimonious voice leading)',
    formula:
      'mean over both neighbour moves of 1 − m ÷ 3 (clamped), m = total semitones the chord’s notes move to the nearest notes',
    kind: 'preference',
    judge: (ctx) =>
      sides(ctx, (_d, from, to) => {
        const a = chordPcs(from);
        const m = chordPcs(to).reduce((s, p) => s + Math.min(...a.map((q) => dist(p, q))), 0);
        return clamp(1 - m / 3);
      }),
  },
  {
    id: 'common-tones',
    family: 'voice leading',
    statement: 'Neighbouring chords share notes (the “law of the shortest way”).',
    source: 'Bruckner / Schoenberg 1911 (Harmonielehre), common-tone connection',
    formula: 'mean over both neighbours of: ≥ 2 shared notes +1, 1 shared +0.4, none −0.6',
    kind: 'preference',
    judge: (ctx) =>
      sides(ctx, (_d, from, to) => {
        const a = chordPcs(from);
        const n = chordPcs(to).filter((p) => a.includes(p)).length;
        return n >= 2 ? 1 : n === 1 ? 0.4 : -0.6;
      }),
  },

  // ── key and colour (macroharmony) ──
  {
    id: 'in-key',
    family: 'key & colour',
    statement: 'Chords use the notes of the key.',
    source: 'Tymoczko 2011 (limited macroharmony)',
    formula: 'all notes in the key +1, one outside 0, two or more −1',
    kind: 'preference',
    judge: (ctx) => {
      const scale = keyPcSet(ctx.key);
      const out = chordPcs(ctx.chord).filter((p) => !scale.has(p)).length;
      return out === 0 ? 1 : out === 1 ? 0 : -1;
    },
  },
  {
    id: 'colour-has-a-name',
    family: 'key & colour',
    statement:
      'Out-of-key chords are explainable: borrowed from the parallel mode, an applied dominant, or a tritone sub.',
    source: 'Modal mixture, applied dominants, tritone substitution (Aldwell & Schachter; Levine)',
    formula: 'constraint — a chord outside the key that is none of those three −1; otherwise 0',
    kind: 'constraint',
    concerns: (ctx) => !isDiatonic(ctx.chord, ctx.key),
    judge: (ctx) => {
      const c = ctx.chord;
      if (isDiatonic(c, ctx.key)) return 0;
      const parallel = scalePcSet(ctx.key.tonic, ctx.key.mode === 'major' ? 'aeolian' : 'ionian');
      const melodic = ctx.key.mode === 'minor' ? scalePcSet(ctx.key.tonic, 'melodicMinor') : null;
      const borrowed = chordPcs(c).every((p) => parallel.has(p) || melodic?.has(p));
      const applied = c.quality === 'maj' && (c.seventh === 'none' || c.seventh === 'b7');
      const tritoneSub = isDominant(c) && !!ctx.next && mod12(ctx.next.root - c.root) === 11;
      return borrowed || applied || tritoneSub ? 0 : -1;
    },
  },
  {
    id: 'colour-persists',
    family: 'key & colour',
    statement: 'Out-of-key notes are shared with a neighbouring chord: the colour is a passage, not a blip.',
    source: 'Modal mixture as a region (pop/rock ♭VII–IV loops); Tymoczko’s macroharmony over time',
    formula: 'constraint — −(share of the chord’s outside notes that neither neighbour has); in key 0',
    kind: 'constraint',
    concerns: (ctx) => (!!ctx.prev || !!ctx.next) && chordPcs(ctx.chord).some((p) => !keyPcSet(ctx.key).has(p)),
    judge: (ctx) => {
      const scale = keyPcSet(ctx.key);
      const out = chordPcs(ctx.chord).filter((p) => !scale.has(p));
      if (!ctx.prev && !ctx.next) return null;
      if (!out.length) return 0;
      const shared = out.filter((p) => (ctx.prev && has(ctx.prev, p)) || (ctx.next && has(ctx.next, p))).length;
      return shared / out.length - 1;
    },
  },
  {
    id: 'brightness-small-steps',
    family: 'key & colour',
    statement:
      'Brightness changes gradually: each move shifts the harmony by at most one step on the circle of fifths.',
    source:
      'Jacob Collier’s sharpwards/flatwards “brightness”; Lerdahl 2001 (chordal distance on the circle of fifths)',
    formula: 'mean over both neighbour moves of: |Δ| ≤ 1 → +1, 2 → 0, ≥ 3 → −1 (chord centre on the circle of fifths)',
    kind: 'preference',
    judge: (ctx) => {
      const centre = (c: Chord) => (c.quality === 'min' || c.quality === 'dim' ? c.root + 3 : c.root);
      const step = (a: Chord, b: Chord) => {
        const d = mod12((centre(b) - centre(a)) * 7);
        const s = Math.abs(d > 6 ? d - 12 : d);
        return s <= 1 ? 1 : s === 2 ? 0 : -1;
      };
      return mean([ctx.prev ? step(ctx.prev, ctx.chord) : null, ctx.next ? step(ctx.chord, ctx.next) : null]);
    },
  },

  // ── modern practice: pop & rock, jazz, film ──
  {
    id: 'plagal-motion',
    family: 'modern',
    statement: 'Roots may move the “subdominant” way: IV → I, ♭VII → IV → I (plagal and double-plagal motion).',
    source:
      'de Clercq & Temperley 2011 (IV is the most common chord after I, especially before the tonic); Biamonte 2010 (double plagal)',
    formula: 'mean over both neighbour moves of: root up a fifth (down a fourth) +1, any other move 0',
    kind: 'preference',
    judge: (ctx) => sides(ctx, (d) => (d === 7 ? 1 : 0)),
  },
  {
    id: 'flat-side-colour',
    family: 'modern',
    statement: 'In a major key, the flat-side major triads ♭VII, ♭VI and ♭III are normal colours, not exceptions.',
    source: 'Biamonte 2010 (modal schemas); Everett 2004 (rock’s tonal systems); Moore 2012',
    formula: 'major triad or 7th on ♭7̂, ♭6̂ or ♭3̂ in a major key +1; other chords 0',
    kind: 'preference',
    judge: (ctx) => {
      if (ctx.key.mode !== 'major') return 0;
      const d = mod12(ctx.chord.root - ctx.key.tonic);
      return ctx.chord.quality === 'maj' && [10, 8, 3].includes(d) ? 1 : 0;
    },
  },
  {
    id: 'schema-member',
    family: 'modern',
    statement: 'The chord takes part in a known pop/rock schema with its neighbours (a loop or modal formula).',
    source:
      'Open Music Theory, “Modal schemas” and “Four-chord schemas” (Gotham et al.); Biamonte 2010; Richards 2017 (four-chord loops)',
    formula:
      '+1 if (previous, chord, next) as scale degrees and qualities appear consecutively in a schema (read cyclically); else 0',
    kind: 'preference',
    judge: (ctx) => {
      if (!ctx.prev || !ctx.next) return null;
      const tok = (c: Chord) =>
        `${mod12(c.root - ctx.key.tonic)}${c.quality === 'min' ? 'm' : c.quality === 'dim' ? 'o' : ''}`;
      const triple = [tok(ctx.prev), tok(ctx.chord), tok(ctx.next)].join(' ');
      return SCHEMA_TRIPLES.has(triple) ? 1 : 0;
    },
  },
  {
    id: 'planing',
    family: 'modern',
    statement: 'Chords may move in parallel: the same chord type sliding by step (planing, power-chord riffs).',
    source: 'Everett 2009 (The Foundations of Rock); Tymoczko 2011 (planing from Debussy to rock)',
    formula: 'mean over both neighbours of: same quality and root a step away (1–2 semitones) +1; else 0',
    kind: 'preference',
    judge: (ctx) =>
      sides(ctx, (d, from, to) =>
        from.quality === to.quality && from.seventh === to.seventh && [1, 2, 10, 11].includes(d) ? 1 : 0,
      ),
  },
  {
    id: 'chromatic-mediant',
    family: 'modern',
    statement: 'Two major (or two minor) triads a third apart, sharing one note: the cinematic “chromatic mediant”.',
    source: 'Lehman 2018 (Hollywood Harmony); Cohn 2012 (Audacious Euphony); Kopp 2002',
    formula:
      'mean over both neighbours of: same mode and roots a major or minor third apart with exactly one common tone +1; else 0',
    kind: 'preference',
    judge: (ctx) =>
      sides(ctx, (d, from, to) => {
        if (
          from.quality !== to.quality ||
          !(from.quality === 'maj' || from.quality === 'min') ||
          ![3, 4, 8, 9].includes(d)
        )
          return 0;
        const a = chordPcs(from);
        return chordPcs(to).filter((p) => a.includes(p)).length === 1 ? 1 : 0;
      }),
  },
  {
    id: 'ii-v-pair',
    family: 'modern',
    statement: 'Jazz pairs chords: a minor 7th goes to the dominant a fourth up, and a dominant is prepared by its ii.',
    source: 'Levine 1995 (The Jazz Theory Book); Rohrmeier 2020 (syntax of jazz harmony: preparation)',
    formula:
      '+1 if (minor chord → dominant a fourth up) with the next chord, or (its ii → dominant) with the previous; else 0',
    kind: 'preference',
    judge: (ctx) => {
      const minorish = (c: Chord) => c.quality === 'min' || c.quality === 'dim';
      const iiV = (a: Chord, b: Chord) => minorish(a) && isDominant(b) && mod12(b.root - a.root) === 5;
      return (ctx.next && iiV(ctx.chord, ctx.next)) || (ctx.prev && iiV(ctx.prev, ctx.chord)) ? 1 : 0;
    },
  },
  {
    id: 'extended-sonority',
    family: 'modern',
    statement: 'Seventh chords (and richer) are the default sonority, not a special event.',
    source: 'Jazz harmony practice (Levine 1995; Strunk, “Harmony” in The New Grove Dictionary of Jazz)',
    formula: 'chord with a seventh or tensions +1; plain triad 0',
    kind: 'preference',
    judge: (ctx) => (ctx.chord.seventh !== 'none' || ctx.chord.tensions.length ? 1 : 0),
  },
  {
    id: 'tritone-substitute',
    family: 'modern',
    statement: 'A dominant may resolve down a semitone instead of down a fifth (tritone substitution).',
    source: 'Levine 1995; Rohrmeier 2020 (substitution rules)',
    formula: 'dominant 7th whose next chord is a semitone lower +1; else 0',
    kind: 'preference',
    judge: (ctx) => (ctx.next && isDominant(ctx.chord) && mod12(ctx.next.root - ctx.chord.root) === 11 ? 1 : 0),
  },
  {
    id: 'dominant-chain',
    family: 'modern',
    statement: 'Dominants can chain: each one resolves to another dominant a fourth up (extended dominants).',
    source: 'Levine 1995 (extended dominants); Rohrmeier 2020 (recursive preparation)',
    formula:
      '+1 if the chord is a dominant 7th and the next chord is a dominant 7th a fourth up (or a semitone down); else 0',
    kind: 'preference',
    judge: (ctx) => {
      if (!ctx.next || !isDominant(ctx.chord) || !isDominant(ctx.next)) return 0;
      const d = mod12(ctx.next.root - ctx.chord.root);
      return d === 5 || d === 11 ? 1 : 0;
    },
  },
  {
    id: 'backdoor-dominant',
    family: 'modern',
    statement: 'A ♭VII7 can lead home by a whole step up instead of a fifth down (the “backdoor” dominant).',
    source: 'Levine 1995 (backdoor ii–V); found as a frequent unnamed move in the study (docs/rules.md)',
    formula: 'dominant 7th on ♭VII of the key followed by the tonic +1; else 0',
    kind: 'preference',
    judge: (ctx) =>
      ctx.next &&
      isDominant(ctx.chord) &&
      mod12(ctx.chord.root - ctx.key.tonic) === 10 &&
      mod12(ctx.next.root - ctx.key.tonic) === 0
        ? 1
        : 0,
  },
  {
    id: 'modal-fifth',
    family: 'modern',
    statement:
      'In a major-key song, a minor v is the Mixolydian fifth chord: it moves to IV or I without a leading tone.',
    source: 'Biamonte 2010 (Mixolydian progressions in rock); the study’s v → IV, 1,724 times in popular music',
    formula: 'minor triad on the 5th degree of a major key next to IV or I (either side) +1; else 0',
    kind: 'preference',
    judge: (ctx) => {
      if (ctx.key.mode !== 'major' || ctx.chord.quality !== 'min' || mod12(ctx.chord.root - ctx.key.tonic) !== 7)
        return 0;
      const homeOrIV = (c: Chord | null) => !!c && [0, 5].includes(mod12(c.root - ctx.key.tonic));
      return homeOrIV(ctx.prev) || homeOrIV(ctx.next) ? 1 : 0;
    },
  },
  {
    id: 'passing-chord',
    family: 'voice leading',
    statement:
      'A diminished, augmented or chromatic chord passes: its bass connects the neighbouring chords by step in one direction.',
    source: 'Aldwell & Schachter 2011 (passing chords); the study’s V → ♯iv° and v → IV (docs/rules.md)',
    formula:
      'constraint — concerns diminished, augmented or out-of-key chords with both neighbours; bass reached and left by step (1–2 semitones) in the same direction 0, else −1',
    kind: 'constraint',
    concerns: (ctx) => !!ctx.prev && !!ctx.next && unstable(ctx),
    judge: (ctx) => {
      if (!ctx.prev || !ctx.next || !unstable(ctx)) return 0;
      const step = (a: number, b: number) => {
        const d = mod12(b - a);
        return d === 1 || d === 2 ? 1 : d === 11 || d === 10 ? -1 : 0;
      };
      const into = step(ctx.prev.bass, ctx.chord.bass);
      return into !== 0 && into === step(ctx.chord.bass, ctx.next.bass) ? 0 : -1;
    },
  },

  // ── the chord itself ──
  {
    id: 'consonance',
    family: 'sonority',
    statement: 'Consonant chords are the default; dissonant ones are special events.',
    source: 'Helmholtz 1863 / Plomp & Levelt 1965 (roughness); Hindemith 1937 (chord groups)',
    formula: 'major or minor triad +1, sus +0.3, seventh chord 0, diminished −0.5, augmented −0.7',
    kind: 'preference',
    judge: (ctx) => {
      const c = ctx.chord;
      if (c.quality === 'aug') return -0.7;
      if (c.quality === 'dim' || c.flat5) return -0.5;
      if (c.seventh !== 'none' || c.tensions.length) return 0;
      if (c.quality === 'sus2' || c.quality === 'sus4') return 0.3;
      return 1;
    },
  },
];

/** Every rule's verdict for one chord in one context. */
export function judgeAll(ctx: RuleContext): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const r of RULES) out[r.id] = r.judge(ctx);
  return out;
}

/** Human-readable summary of the strongest supporting and opposing rules. */
export function explain(ctx: RuleContext, top = 3): string[] {
  const v = RULES.map((r) => ({ r, s: r.judge(ctx) })).filter((x): x is { r: Rule; s: number } => x.s !== null);
  const name = chordName(ctx.chord, ctx.key);
  const pro = v
    .filter((x) => x.s > 0.3)
    .sort((a, b) => b.s - a.s)
    .slice(0, top)
    .map((x) => `✓ ${x.r.statement}`);
  const con = v
    .filter((x) => x.s < -0.3)
    .sort((a, b) => a.s - b.s)
    .slice(0, top)
    .map((x) => `✗ ${x.r.statement}`);
  return [`${name}:`, ...pro, ...con];
}

export const describeNote = (pitch: number, key: Key) => nameInKey(pitch, key);

// ───────────────────────────── piece-level rules (judged on features) ─────────────────────────────

export interface PieceContext {
  chords: PieceChord[];
  phrases: Phrase[];
  features: Feature[];
}
export interface PieceRule {
  id: string;
  statement: string;
  source: string;
  formula: string;
  judge: (p: PieceContext) => number | null;
}
const share = (part: number, whole: number) => (whole ? (2 * part) / whole - 1 : null);
const covered = (p: PieceContext, kinds: string[]) => {
  const on = new Set<number>();
  for (const f of p.features) if (kinds.includes(f.kind)) for (let i = f.from; i <= f.to; i++) on.add(i);
  return on.size;
};

export const PIECE_RULES: PieceRule[] = [
  {
    id: 'phrases-cadence',
    statement: 'Every phrase closes with a cadence (authentic, plagal or half).',
    source: 'Caplin 1998; the cadence as the end of a phrase in common practice',
    formula: '2 × (phrases ending in a cadence ÷ phrases) − 1',
    judge: (p) =>
      share(p.phrases.filter((x) => x.cadence !== 'none' && x.cadence !== 'deceptive').length, p.phrases.length),
  },
  {
    id: 'final-authentic',
    statement: 'The piece ends with an authentic cadence: dominant → tonic.',
    source: 'The final perfect authentic cadence (every harmony textbook)',
    formula: 'last phrase: authentic +1, plagal +0.5, half −0.5, otherwise −1',
    judge: (p) => {
      const last = p.phrases.at(-1);
      if (!last) return null;
      return { authentic: 1, plagal: 0.5, half: -0.5, deceptive: -1, none: -1 }[last.cadence];
    },
  },
  {
    id: 'authentic-dominates',
    statement: 'Most cadences are authentic (dominant → tonic).',
    source: 'Rameau’s cadence parfaite as the norm of closure',
    formula: '2 × (authentic ÷ all cadences) − 1',
    judge: (p) => {
      const c = p.phrases.filter((x) => x.cadence !== 'none');
      return share(c.filter((x) => x.cadence === 'authentic').length, c.length);
    },
  },
  {
    id: 'dominant-motion',
    statement: 'Much of the harmony is dominant motion: V–I, ii–V–I, chains of fifths.',
    source: 'Rameau’s fundamental bass; jazz ii–V practice',
    formula: '2 × (chords inside V–I, ii–V(–I), tritone-sub or circle-of-fifths patterns ÷ chords) − 1',
    judge: (p) => share(covered(p, ['V-I', 'ii-V-I', 'ii-V', 'subV-I', 'cycle']), p.chords.length),
  },
  {
    id: 'loops',
    statement: 'The harmony is built from repeating four-chord loops.',
    source: 'Pop practice (I–V–vi–IV and relatives); Moore 2012, Song Means',
    formula: '2 × (chords inside a known loop ÷ chords) − 1',
    judge: (p) => share(covered(p, ['loop']), p.chords.length),
  },
  {
    id: 'cadential-acceleration',
    statement: 'Chords change faster just before a cadence.',
    source: 'Cadential acceleration of harmonic rhythm (Caplin 1998; Piston, Harmony)',
    formula:
      '2 × (phrases of ≥ 5 chords whose two chords before the last are shorter on average than the chords before them ÷ such phrases) − 1',
    judge: (p) => {
      let n = 0;
      let yes = 0;
      for (const ph of p.phrases) {
        const ids = p.chords.map((_, i) => i).filter((i) => p.chords[i].start >= ph.start - 1e-6 && i <= ph.last);
        if (ids.length < 5) continue;
        const dur = (i: number) => p.chords[i].end - p.chords[i].start;
        const pre = ids.slice(-3, -1).map(dur);
        const body = ids.slice(0, -3).map(dur);
        n++;
        if (pre.reduce((a, b) => a + b, 0) / pre.length < body.reduce((a, b) => a + b, 0) / body.length) yes++;
      }
      return share(yes, n);
    },
  },
  {
    id: 'arrival-longest',
    statement: 'The chord that ends a phrase is its longest: arrival is a place to rest.',
    source: 'Durational accent at cadences (Lerdahl & Jackendoff 1983; Caplin 1998)',
    formula: '2 × (phrases of ≥ 4 chords whose last chord lasts at least as long as any other ÷ such phrases) − 1',
    judge: (p) => {
      let n = 0;
      let yes = 0;
      for (const ph of p.phrases) {
        const ids = p.chords.map((_, i) => i).filter((i) => p.chords[i].start >= ph.start - 1e-6 && i <= ph.last);
        if (ids.length < 4) continue;
        const dur = (i: number) => Math.min(p.chords[i].end, ph.end) - p.chords[i].start;
        n++;
        if (dur(ph.last) >= Math.max(...ids.slice(0, -1).map(dur)) - 1e-6) yes++;
      }
      return share(yes, n);
    },
  },
  {
    id: 'sequences',
    statement: 'Harmony spins out in sequences: a short pattern repeated at another pitch.',
    source: 'Baroque Fortspinnung and the circle-of-fifths sequence (Caplin 1998; Gjerdingen 2007)',
    formula: '2 × (chords inside a detected sequence ÷ chords) − 1',
    judge: (p) => share(covered(p, ['sequence']), p.chords.length),
  },
  {
    id: 'pedal-points',
    statement: 'The bass sometimes holds still while harmonies change above it (pedal point).',
    source: 'Tonic and dominant pedals (Aldwell & Schachter); drones in folk and pop',
    formula: '2 × (chords over a held bass note ÷ chords) − 1',
    judge: (p) => share(covered(p, ['pedal']), p.chords.length),
  },
  {
    id: 'mostly-diatonic',
    statement: 'Most chords stay inside the key.',
    source: 'Tymoczko 2011 (limited macroharmony)',
    formula: '2 × (chords inside their local key ÷ chords) − 1',
    judge: (p) => share(p.chords.filter((c) => isDiatonic(c.chord, c.key)).length, p.chords.length),
  },
];

// ───────────────────────────── rulebooks: coherent theories ─────────────────────────────

export interface Rulebook {
  id: string;
  name: string;
  /** Where the theory comes from in history. */
  era: string;
  idea: string;
  rules: string[];
  pieceRules: string[];
}
export const RULEBOOKS: Rulebook[] = [
  {
    id: 'counterpoint',
    name: 'Counterpoint & voice leading',
    era: 'Renaissance – Baroque (Fux 1725)',
    idea: 'Voices move as little as possible; every dissonance is prepared and resolved by step.',
    rules: [
      'tension-explained',
      'tritone-resolves',
      'seventh-falls',
      'leading-tone-rises',
      'parsimony',
      'common-tones',
      'mel-ornaments-resolve',
      'consonance',
    ],
    pieceRules: ['sequences', 'pedal-points'],
  },
  {
    id: 'functional',
    name: 'Functional harmony',
    era: 'Baroque – Romantic (Rameau 1722, Riemann 1893)',
    idea: 'Harmony cycles T → S → D → T; dominants resolve down a fifth; phrases close with cadences.',
    rules: [
      'function-order',
      'dominant-resolves',
      'applied-chord-target',
      'fifth-relation',
      'dominant-direction',
      'cadence',
      'mel-cadence-tonic',
      'mel-leading-tone-harmonized',
      'in-key',
    ],
    pieceRules: [
      'phrases-cadence',
      'final-authentic',
      'authentic-dominates',
      'dominant-motion',
      'mostly-diatonic',
      'cadential-acceleration',
      'arrival-longest',
    ],
  },
  {
    id: 'melody-fit',
    name: 'Melody and chord agree',
    era: 'all styles',
    idea: 'The chord explains the melody: strong notes are chord tones, the rest are ornaments that move on by step.',
    rules: ['mel-chord-tones', 'mel-stable-tones', 'mel-ornaments-resolve', 'mel-no-minor-ninth'],
    pieceRules: [],
  },
  {
    id: 'colour',
    name: 'Colour & modal mixture',
    era: 'Romantic → jazz → pop',
    idea: 'Out-of-key chords are named colours (borrowed, applied, substituted) that persist and shift brightness gently; the bass walks.',
    rules: ['colour-has-a-name', 'colour-persists', 'brightness-small-steps', 'bass-stepwise'],
    pieceRules: ['loops'],
  },
  {
    id: 'pop',
    name: 'Pop & rock practice',
    era: '1950s → today (de Clercq & Temperley 2011, Biamonte 2010)',
    idea: 'IV and the flat side (♭VII, ♭VI, ♭III) are home ground; loops and modal schemas replace cadences; chords may plane in parallel.',
    rules: ['plagal-motion', 'flat-side-colour', 'schema-member', 'planing', 'modal-fifth', 'consonance', 'in-key'],
    pieceRules: ['loops'],
  },
  {
    id: 'jazz',
    name: 'Jazz harmony',
    era: '1920s → today (Levine 1995, Rohrmeier 2020)',
    idea: 'Seventh chords by default; ii–V pairs and chains of dominants; tritone substitutes.',
    rules: [
      'ii-v-pair',
      'extended-sonority',
      'tritone-substitute',
      'dominant-chain',
      'backdoor-dominant',
      'dominant-resolves',
      'fifth-relation',
    ],
    pieceRules: ['dominant-motion'],
  },
  {
    id: 'chromatic',
    name: 'Chromatic triadic (film, late Romantic)',
    era: '1850s → film scores (Cohn 2012, Lehman 2018)',
    idea: 'Consonant triads joined by smooth, shared-note moves, including chromatic mediants, regardless of key.',
    rules: ['chromatic-mediant', 'parsimony', 'common-tones', 'consonance'],
    pieceRules: [],
  },
];

/** A rulebook's verdict on one chord: the mean of its applicable chord rules (null if none apply). */
export function rulebookVerdict(book: Rulebook, verdicts: Record<string, number | null>): number | null {
  let sum = 0;
  let n = 0;
  for (const id of book.rules) {
    const v = verdicts[id];
    if (v !== null && v !== undefined) {
      sum += v;
      n++;
    }
  }
  return n ? sum / n : null;
}
