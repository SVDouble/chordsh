/**
 * Chord-assistant check on annotated songs (deterministic, rule-based engine in src/engine/assist.ts).
 * For every annotated chord: given the melody over its span and the real chords before/after it,
 * where does the real chord rank among the suggestions? Run: npm run benchmark:assist
 * Env: SPLIT=tune|test (default test), CORPORA=pop909,mozart (default: all with real melodies).
 */
import { it } from 'vitest';
import { type JudgeName, type MelodyNote, suggestForSlot, tensionContext } from '../src/engine/assist';
import { isDiatonic } from '../src/theory/roman';
import { type Chord, chordOf } from '../src/theory/chords';
import { mod12 } from '../src/theory/pitch';
import { corpora, type Family, loadPiece, type Piece, pieceIds, split } from './eval/truth';

const KIND: Record<Family, Parameters<typeof chordOf>[1]> = {
  maj: 'maj',
  min: 'min',
  dim: 'dim',
  aug: 'aug',
  sus: 'sus4',
};
const familyOf = (c: Chord): Family =>
  c.quality === 'dim' || c.flat5
    ? 'dim'
    : c.quality === 'sus2' || c.quality === 'sus4'
      ? 'sus'
      : c.quality === 'aug'
        ? 'aug'
        : c.quality === 'min'
          ? 'min'
          : 'maj';

/** Milliseconds → beats (fractional), by interpolating the annotated beat grid. */
function beatClock(p: Piece) {
  const b = p.beats;
  return (t: number) => {
    if (b.length < 2) return t / 500;
    let i = 0;
    while (i < b.length - 2 && b[i + 1] <= t) i++;
    return i + (t - b[i]) / (b[i + 1] - b[i]);
  };
}

/** The melody = the highest note of each onset cluster (skyline), above G3. */
function skyline(p: Piece, beat: (t: number) => number): MelodyNote[] {
  const on = new Map<number, { t: number; note: number }[]>();
  const notes: { t: number; d: number; note: number }[] = [];
  for (const e of p.events) {
    if (e.kind === 'on') on.set(e.note, [...(on.get(e.note) ?? []), { t: e.t, note: e.note }]);
    else {
      const s = on.get(e.note)?.shift();
      if (s) notes.push({ t: s.t, d: e.t - s.t, note: e.note });
    }
  }
  notes.sort((a, b) => a.t - b.t);
  const out: MelodyNote[] = [];
  for (let i = 0; i < notes.length; ) {
    let j = i;
    let top = notes[i];
    while (j < notes.length && notes[j].t - notes[i].t < 35) {
      if (notes[j].note > top.note) top = notes[j];
      j++;
    }
    if (top.note >= 55)
      out.push({ pitch: top.note, start: beat(top.t), beats: Math.max(0.1, beat(top.t + top.d) - beat(top.t)) });
    i = j;
  }
  return out;
}

/** Judge panels to compare: each judge alone, then combinations. */
const PANELS: Record<string, Partial<Record<JudgeName, number>>> = {
  melody: { melody: 1, context: 0, rules: 0, habit: 0 },
  context: { melody: 0, context: 1, rules: 0, habit: 0 },
  rules: { melody: 0, context: 0, rules: 1, habit: 0 },
  habit: { melody: 0, context: 0, rules: 0, habit: 1 },
  'melody+context': { melody: 0.5, context: 0.5, rules: 0, habit: 0 },
  'melody+rules': { melody: 0.5, context: 0, rules: 0.5, habit: 0 },
  'melody+context+rules': { melody: 0.5, context: 0.25, rules: 0.25, habit: 0 },
  'melody+habit': { melody: 0.5, context: 0, rules: 0, habit: 0.5 },
  'all four': { melody: 0.4, context: 0.2, rules: 0.2, habit: 0.2 },
};
type Mode = string;
const MODES = Object.keys(PANELS);
it('evaluate the chord assistant on annotated songs', () => {
  const sp = process.env.SPLIT ?? 'test';
  const wanted = process.env.CORPORA?.split(',');
  const rows: string[] = [];
  const duels: string[] = [];
  const colours: string[] = [];
  for (const corpus of corpora().filter((c) => (wanted ? wanted.includes(c) : true))) {
    const ids = pieceIds(corpus).filter((id) => split(corpus, id) === sp);
    const stats: Record<Mode, { n: number; top1: number; top3: number; top5: number; mrr: number }> =
      Object.fromEntries(MODES.map((m) => [m, { n: 0, top1: 0, top3: 0, top5: 0, mrr: 0 }]));
    /** Your hypothesis: are real colour chords explained by their neighbours, more than the same chord moved elsewhere? */
    const colour = { n: 0, real: 0, realOk: 0, moved: 0, movedOk: 0 };
    /** When the melody judge and the rules judge disagree on the top chord, who was right? */
    const duel = { agree: 0, agreeRight: 0, disagree: 0, melodyRight: 0, rulesRight: 0, habitRight: 0 };
    let synthetic = false;
    for (const id of ids) {
      const p = loadPiece(corpus, id);
      synthetic ||= p.synthetic;
      const beat = beatClock(p);
      const melody = skyline(p, beat);
      // merge repeats: a change is what we suggest
      const seq: {
        chord: Chord;
        family: Family;
        start: number;
        end: number;
        key: NonNullable<Piece['chords'][0]['key']>;
      }[] = [];
      for (const c of p.chords) {
        if (!c.key) continue;
        const last = seq.at(-1);
        if (last && mod12(last.chord.root) === mod12(c.root) && last.family === c.family) last.end = beat(c.t1);
        else
          seq.push({
            chord: chordOf(c.root, KIND[c.family]),
            family: c.family,
            start: beat(c.t0),
            end: beat(c.t1),
            key: c.key,
          });
      }
      seq.forEach((s, i) => {
        const near = melody.filter((n) => n.start < s.end + 2 && n.start + n.beats > s.start - 1);
        if (!isDiatonic(s.chord, s.key) && seq[i - 1] && seq[i + 1]) {
          const real = tensionContext(s.chord, s.key, seq[i - 1].chord, seq[i + 1].chord).score;
          // the same chord placed 4 slots later, between other neighbours (deterministic "out of context")
          const j = (i + 4) % seq.length;
          const moved =
            seq[j - 1] && seq[j + 1] ? tensionContext(s.chord, s.key, seq[j - 1].chord, seq[j + 1].chord).score : null;
          if (moved !== null) {
            colour.n++;
            colour.real += real;
            colour.moved += moved;
            if (real >= 0.8) colour.realOk++;
            if (moved >= 0.8) colour.movedOk++;
          }
        }
        const isTrue = (c: Chord) => mod12(c.root) === mod12(s.chord.root) && familyOf(c) === s.family;
        const tops: Record<string, Chord> = {};
        for (const mode of MODES) {
          const ranked = suggestForSlot({
            key: s.key,
            prev: seq[i - 1]?.chord ?? null,
            next: seq[i + 1]?.chord ?? null,
            melody: near,
            span: { start: s.start, end: s.end },
            meter: p.beatsPerBar || 4,
            judges: PANELS[mode],
            limit: 60,
          });
          tops[mode] = ranked[0].chord;
          const rank = ranked.findIndex((r) => isTrue(r.chord));
          const st = stats[mode];
          st.n++;
          if (rank === 0) st.top1++;
          if (rank >= 0 && rank < 3) st.top3++;
          if (rank >= 0 && rank < 5) st.top5++;
          if (rank >= 0) st.mrr += 1 / (rank + 1);
        }
        const same = (a: Chord, b: Chord) => mod12(a.root) === mod12(b.root) && familyOf(a) === familyOf(b);
        if (same(tops.melody, tops.rules)) {
          duel.agree++;
          if (isTrue(tops.melody)) duel.agreeRight++;
        } else {
          duel.disagree++;
          if (isTrue(tops.melody)) duel.melodyRight++;
          if (isTrue(tops.rules)) duel.rulesRight++;
          if (isTrue(tops.habit)) duel.habitRight++;
        }
      });
    }
    const pct = (x: number, n: number) => `${((100 * x) / Math.max(1, n)).toFixed(1)}%`;
    colours.push(
      `| ${corpus} | ${colour.n} | ${(colour.real / Math.max(1, colour.n)).toFixed(2)} | ${pct(colour.realOk, colour.n)} | ${(colour.moved / Math.max(1, colour.n)).toFixed(2)} | ${pct(colour.movedOk, colour.n)} |`,
    );
    duels.push(
      `| ${corpus} | ${pct(duel.agree, duel.agree + duel.disagree)} | ${pct(duel.agreeRight, duel.agree)} | ${pct(duel.melodyRight, duel.disagree)} | ${pct(duel.rulesRight, duel.disagree)} | ${pct(duel.habitRight, duel.disagree)} |`,
    );
    for (const mode of MODES) {
      const s = stats[mode];
      rows.push(
        `| ${corpus}${synthetic ? ' (synthetic melody)' : ''} | ${mode} | ${ids.length} | ${s.n} | ${pct(s.top1, s.n)} | ${pct(s.top3, s.n)} | ${pct(s.top5, s.n)} | ${(s.mrr / Math.max(1, s.n)).toFixed(3)} |`,
      );
    }
  }
  console.log(`\nChord assistant, ${sp} split — rank of the real chord among suggestions\n`);
  console.log('| corpus | constraints | pieces | chords | top-1 | top-3 | top-5 | MRR |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of rows) console.log(r);
  console.log('\nWhen the melody judge and the rules judge pick the same top chord, and when they do not\n');
  console.log('| corpus | agree | right when agreeing | melody right when disagreeing | rules right | habit right |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const d of duels) console.log(d);
  console.log(
    '\nColour (out-of-key) chords: is their tension explained by the real neighbours, vs the same chord moved elsewhere?\n',
  );
  console.log(
    '| corpus | colour chords | context score in place | explained (≥ 0.8) | score when moved | explained when moved |',
  );
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const c of colours) console.log(c);
}, 3_600_000);
