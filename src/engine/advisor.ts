/**
 * The chord advisor behind the app's “ideas” panel and templates: slot suggestions from the judges in
 * assist.ts plus a style rulebook from rules.ts, chord templates (loop schemas) and “fill chords under the
 * melody”. Deterministic: the same song and settings always give the same advice. See docs/harmonize.md.
 */
import { type Chord, chordName, chordOf } from '../theory/chords';
import { mod12 } from '../theory/pitch';
import type { Key } from '../theory/scales';
import { parseChordSymbol } from '../theory/symbols';
import { type MelodyNote as AssistNote, type SlotSuggestion, suggestForSlot } from './assist';
import { judgeAll, RULEBOOKS, RULES, rulebookVerdict, SCHEMAS } from './rules';
import type { MelodyNote, Sequence } from './sequence';
import { sequenceKeyAt } from './sequence';

export const STYLES = RULEBOOKS.map((b) => ({ id: b.id, name: b.name, idea: b.idea }));
export type StyleId = string;

export interface Advice extends SlotSuggestion {
  /** The style rulebook's verdict, 0 (against) … 1 (in favour); null when it has nothing to say. */
  style: number | null;
  /** Final ranking score: judges and style combined. */
  total: number;
  /** Style rules this chord satisfies / breaks here, in plain words. */
  pro: string[];
  con: string[];
}

export interface AdviceContext {
  key: Key;
  prev: Chord | null;
  next: Chord | null;
  melody: AssistNote[];
  span: { start: number; end: number };
  meter: number;
  style: StyleId;
  /** How much the style counts against the judges (0 … 1). */
  styleWeight?: number;
  /** 0 = in-key chords first, 1 = colour chords compete equally. */
  adventurous?: number;
  /** The slot closes a phrase (cadence rules apply). */
  phraseEnd?: boolean;
  limit?: number;
}

export function advise(ctx: AdviceContext): Advice[] {
  const book = RULEBOOKS.find((b) => b.id === ctx.style) ?? RULEBOOKS[0];
  const w = ctx.styleWeight ?? 0.35;
  const statement = (id: string) => RULES.find((r) => r.id === id)?.statement ?? id;
  const ranked = suggestForSlot({
    key: ctx.key,
    prev: ctx.prev,
    next: ctx.next,
    melody: ctx.melody,
    span: ctx.span,
    meter: ctx.meter,
    adventurous: ctx.adventurous,
    style: 'triads',
    limit: 40,
  });
  const out = ranked.map((s): Advice => {
    const verdicts = judgeAll({
      key: ctx.key,
      chord: s.chord,
      prev: ctx.prev,
      next: ctx.next,
      melody: ctx.melody,
      span: ctx.span,
      meter: ctx.meter,
      phraseEnd: ctx.phraseEnd ?? false,
    });
    const v = rulebookVerdict(book, verdicts);
    const style = v === null ? null : (v + 1) / 2;
    const pro = book.rules.filter((id) => (verdicts[id] ?? 0) > 0.3).map(statement);
    const con = book.rules.filter((id) => (verdicts[id] ?? 0) < -0.3).map(statement);
    return { ...s, style, total: style === null ? s.score : (1 - w) * s.score + w * style, pro, con };
  });
  return out.sort((a, b) => b.total - a.total).slice(0, ctx.limit ?? 8);
}

// ───────────────────────────── templates ─────────────────────────────

export interface Template {
  name: string;
  symbols: string[];
}

/** The loop schemas from rules.ts, spelled in a key (one chord per entry). */
export function templates(key: Key): Template[] {
  return SCHEMAS.filter((s) => s.degrees.length >= 3).map(({ name, degrees }) => ({
    name,
    symbols: degrees.map((d) => {
      const minor = d.endsWith('m');
      const dim = d.endsWith('o');
      const root = key.tonic + Number.parseInt(d, 10);
      return chordName(chordOf(root, dim ? 'dim' : minor ? 'min' : 'maj'), key);
    }),
  }));
}

// ───────────────────────────── key and gaps ─────────────────────────────

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Krumhansl–Kessler key estimate from melody durations (and chord tones at half weight). */
export function estimateKey(melody: MelodyNote[], chords: Chord[] = []): Key {
  const hist = Array<number>(12).fill(0);
  for (const n of melody) hist[mod12(n.pitch)] += n.beats;
  for (const c of chords) for (const t of c.tones) hist[mod12(c.root + t.interval)] += 0.5;
  let best = { score: -Infinity, key: { tonic: 0, mode: 'major' } as Key };
  for (let t = 0; t < 12; t++)
    for (const [mode, profile] of [
      ['major', KK_MAJOR],
      ['minor', KK_MINOR],
    ] as const) {
      const score = profile.reduce((s, p, i) => s + p * hist[mod12(t + i)], 0);
      if (score > best.score) best = { score, key: { tonic: t, mode } };
    }
  return best.key;
}

/** The song's key at a beat: an explicit key region, else an estimate from the melody and chords. */
export function keyAt(song: Sequence, beat: number): Key {
  return (
    sequenceKeyAt(song, beat) ??
    estimateKey(
      song.melody ?? [],
      song.steps.map((s) => parseChordSymbol(s.symbol)).filter((c): c is Chord => !!c),
    )
  );
}

export interface FilledChord {
  start: number;
  beats: number;
  symbol: string;
}

/**
 * Pipeline step 3: one basic chord per bar wherever the melody sounds but no chord does, chosen left to right
 * with the previous (and any existing next) chord as context.
 */
export function fillGaps(song: Sequence, style: StyleId, barQuarters: number): FilledChord[] {
  const melody = song.melody ?? [];
  if (!melody.length) return [];
  const end = melody.reduce((e, n) => Math.max(e, n.start + n.beats), 0);
  const chordAt = (beat: number) => song.steps.find((s) => s.start <= beat + 1e-8 && beat < s.start + s.beats - 1e-8);
  const filled: FilledChord[] = [];
  const parsed = (symbol: string) => parseChordSymbol(symbol);
  for (let bar = 0; bar * barQuarters < end; bar++) {
    const span = { start: bar * barQuarters, end: (bar + 1) * barQuarters };
    const inBar = melody.filter((n) => n.start < span.end && n.start + n.beats > span.start);
    if (!inBar.length || chordAt(span.start) || chordAt((span.start + span.end) / 2)) continue;
    const before = [...song.steps, ...filled].filter((s) => s.start < span.start).sort((a, b) => b.start - a.start)[0];
    const after = song.steps.filter((s) => s.start >= span.end - 1e-8).sort((a, b) => a.start - b.start)[0];
    const key = keyAt(song, span.start);
    // a phrase ends where the melody stops or rests for at least a beat after this bar's last note
    const lastEnd = Math.max(...inBar.map((n) => n.start + n.beats));
    const nextOnset = melody.find((n) => n.start >= lastEnd - 1e-8)?.start;
    const phraseEnd = nextOnset === undefined || nextOnset - lastEnd >= 1 - 1e-8 || lastEnd >= end - 1e-8;
    const best = advise({
      key,
      prev: before ? parsed(before.symbol) : null,
      next: after && after.start < span.end + 1e-8 ? parsed(after.symbol) : null,
      melody: melody
        .filter((n) => n.start < span.end + 2 && n.start + n.beats > span.start - 1)
        .map((n) => ({ pitch: n.pitch, start: n.start, beats: n.beats })),
      span,
      meter: barQuarters,
      style,
      adventurous: 0,
      phraseEnd,
      limit: 1,
    })[0];
    if (best) filled.push({ start: span.start, beats: barQuarters, symbol: best.name });
  }
  return filled;
}
