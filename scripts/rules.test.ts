/**
 * Harmony rules study: which rules and rulebooks does real music follow, and how does that change over time?
 *   events (melody + chords) → features (phrases, cadences, patterns) → rules / rulebooks.
 * For every chord, each rule judges the composer's chord and a fixed sample of other chords in the same spot;
 * AUC = how often the rule prefers the real one (50% = no preference). Rules are fixed (no fitting), so every
 * piece is used. Results are kept per piece (with its year) so time trends are shown within one tradition only.
 * Run: npm run study:rules   → local/assist/study.json (read by lab/rules.html)
 */
import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  cadenceAt,
  type CadenceKind,
  featuresOf,
  pedalsOf,
  type PhraseNote,
  type PieceChord,
  phrasesOf,
  sequencesOf,
} from '../src/engine/features';
import { readMode, registerSplits } from '../src/engine/modes';
import { judgeAll, PIECE_RULES, RULEBOOKS, RULES, rulebookVerdict } from '../src/engine/rules';
import { type Chord, chordName, chordOf, type KindName } from '../src/theory/chords';
import { mod12 } from '../src/theory/pitch';
import { numeralOf } from '../src/theory/roman';
import { type ProgressionStats, statsKey, tokenOf } from '../src/engine/progressions';
import type { Key } from '../src/theory/scales';

type Tradition = 'art' | 'jazz' | 'popular' | 'reference';
interface Source {
  id: string;
  dir: string;
  title: string;
  tradition: Tradition;
  /** Year for every piece when the files have none (the chorales). */
  year?: number;
  melody: 'real' | 'none';
}
const SOURCES: Source[] = [
  {
    id: 'chorales',
    dir: 'local/assist-data/chorales',
    title: 'Bach chorales',
    tradition: 'art',
    year: 1735,
    melody: 'real',
  },
  { id: 'dlc', dir: 'local/assist-data/dlc', title: 'DCML Distant Listening Corpus', tradition: 'art', melody: 'real' },
  {
    id: 'lieder',
    dir: 'local/assist-data/lieder',
    title: 'OpenScore Lieder (art song; years ≈ composer aged 35)',
    tradition: 'art',
    melody: 'real',
  },
  {
    id: 'rock',
    dir: 'local/assist-data/rock',
    title: 'Rolling Stone 200 (rock)',
    tradition: 'popular',
    melody: 'real',
  },
  {
    id: 'billboard',
    dir: 'local/assist-data/billboard',
    title: 'McGill Billboard (chart pop, chords only)',
    tradition: 'popular',
    melody: 'none',
  },
  {
    id: 'chordonomicon',
    dir: 'local/assist-data/chordonomicon',
    title: 'Chordonomicon (modern, by genre; chords only)',
    tradition: 'popular',
    melody: 'none',
  },
  {
    id: 'wjazzd',
    dir: 'local/assist-data/wjazzd',
    title: 'Weimar Jazz Database (solos over changes)',
    tradition: 'jazz',
    melody: 'real',
  },
  {
    id: 'pop909',
    dir: 'local/assist-data/pop909',
    title: 'POP909 (Chinese pop, undated)',
    tradition: 'reference',
    melody: 'real',
  },
  {
    id: 'jazz',
    dir: 'local/data/jazz',
    title: 'Jazz standards (changes only, undated)',
    tradition: 'reference',
    melody: 'none',
  },
];
const FULL: KindName[] = ['maj', 'min', 'dim', 'aug', '7', 'maj7', 'm7', 'm7b5', 'dim7'];
const TRIADS: KindName[] = ['maj', 'min', 'dim', 'aug'];
const KNOWN_KINDS = new Set<string>([
  'maj',
  'min',
  'dim',
  'aug',
  '7',
  'maj7',
  'm7',
  'm7b5',
  'dim7',
  'sus4',
  'sus2',
  '7sus4',
]);
const FAMILY_KIND: Record<string, KindName> = { maj: 'maj', min: 'min', dim: 'dim', aug: 'aug', sus: 'sus4' };
const POP_KIND: Record<string, KindName> = {
  maj: 'maj',
  min: 'min',
  dim: 'dim',
  aug: 'aug',
  '7': '7',
  maj7: 'maj7',
  min7: 'm7',
  hdim7: 'm7b5',
  dim7: 'dim7',
  maj6: 'maj',
  min6: 'min',
  sus4: 'sus4',
  sus2: 'sus2',
  'sus4(b7)': '7sus4',
};
/** DCML expert cadence labels → our cadence kinds. */
const EXPERT_CADENCE: Record<string, CadenceKind> = {
  PAC: 'authentic',
  IAC: 'authentic',
  HC: 'half',
  DC: 'deceptive',
  PC: 'plagal',
  EC: 'none',
};

const chordCache = new Map<string, Chord>();
const chord = (root: number, kind: KindName) => {
  const id = `${mod12(root)}:${kind}`;
  let c = chordCache.get(id);
  if (!c) {
    c = chordOf(root, kind);
    chordCache.set(id, c);
  }
  return c;
};
const sameChord = (a: Chord, b: Chord) => a.root === b.root && a.suffix === b.suffix;

interface Loaded {
  source: Source;
  group: string;
  id: string;
  title: string;
  composer: string;
  year: number | null;
  chords: PieceChord[];
  bass: (number | null)[];
  melody: PhraseNote[];
  meter: number;
  full: boolean;
  phraseEnds: number[];
  /** False when the source has no real chord durations (Chordonomicon): duration rules are skipped. */
  durations: boolean;
  expertCadences: [number, string][];
}

function files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (e.name.endsWith('.json')) out.push(p);
  }
  return out.sort();
}

function load(source: Source, file: string): Loaded | null {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  const beats: number[] = p.beats ?? [];
  const beat = (t: number) => {
    if (beats.length < 2) return t / 500;
    let lo = 0;
    let hi = beats.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (beats[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo + (t - beats[lo]) / (beats[lo + 1] - beats[lo] || 1);
  };
  let full = false;
  const chords: PieceChord[] = [];
  for (const row of p.chords as unknown[][]) {
    const [t0, t1, root, family, label, tonic, mode, kind] = row as [
      number,
      number,
      number,
      string,
      string,
      number | null,
      string | null,
      string?,
    ];
    if (tonic === null || tonic === undefined) continue;
    let k: KindName = FAMILY_KIND[family] ?? 'maj';
    if (kind && KNOWN_KINDS.has(kind)) [k, full] = [kind as KindName, true];
    else if (source.id === 'pop909') {
      const q = String(label).split(':')[1]?.split('/')[0] ?? '';
      if (POP_KIND[q]) [k, full] = [POP_KIND[q], true];
    }
    const c = chord(root, k);
    const key: Key = { tonic, mode: mode === 'minor' ? 'minor' : 'major' };
    const last = chords.at(-1);
    if (last && sameChord(last.chord, c) && last.key.tonic === key.tonic) last.end = beat(t1);
    else chords.push({ chord: c, start: beat(t0), end: beat(t1), key });
  }
  if (chords.length < 4) return null;
  const melody: PhraseNote[] =
    source.melody === 'real' && p.melody
      ? (p.melody as number[][]).map(([t, d, m, f]) => ({
          pitch: m,
          start: beat(t),
          beats: Math.max(0.05, beat(t + d) - beat(t)),
          fermata: f === 1,
        }))
      : [];
  // bass under each chord: the lowest note sounding at its start
  const notes = ((p.notes ?? []) as number[][]).map(([t, d, m]) => [beat(t), beat(t + d), m]);
  notes.sort((a, b) => a[0] - b[0]);
  const bass = chords.map((c) => {
    let low: number | null = null;
    for (const [s, e, m] of notes) {
      if (s > c.start + 0.26) break;
      if (e > c.start + 0.05 && (low === null || m < low)) low = m;
    }
    return low === null ? null : mod12(low);
  });
  // annotated phrase ends (DCML) mark the arrival chord's onset → the phrase ends when that chord ends
  const phraseEnds = ((p.phrase_ends ?? []) as number[]).map((t) => {
    const b = beat(t);
    const c = chords.find((x) => x.start <= b + 1e-6 && b < x.end - 1e-6);
    return c ? c.end : b;
  });
  const dir = path.relative(source.dir, path.dirname(file));
  return {
    source,
    group: p.collection ?? (dir && dir !== '.' ? dir : source.id),
    id: String(p.id),
    title: String(p.title),
    composer: String(p.composer ?? ''),
    year: typeof p.year === 'number' ? p.year : (source.year ?? null),
    chords,
    bass,
    melody,
    meter: p.beats_per_bar || 4,
    full,
    phraseEnds,
    expertCadences: ((p.cadences ?? []) as [number, string][]).map(([t, k]) => [beat(t), k]),
    durations: p.durations !== false,
  };
}

interface Tally {
  applies: number;
  slots: number;
  wins: number;
  pairs: number;
  sumReal: number;
}
const tally = (): Tally => ({ applies: 0, slots: 0, wins: 0, pairs: 0, sumReal: 0 });
const addTally = (t: Tally, rv: number | null, av: (number | null)[]) => {
  t.slots++;
  if (rv === null) return;
  t.applies++;
  t.sumReal += rv;
  for (const a of av) {
    if (a === null) continue;
    t.pairs++;
    t.wins += rv > a + 1e-9 ? 1 : Math.abs(rv - a) <= 1e-9 ? 0.5 : 0;
  }
};
const auc = (t: Tally) => (t.pairs ? t.wins / t.pairs : null);
const DURATION_RULES = new Set(['cadential-acceleration', 'arrival-longest']);
/** Harmony rules only, so pieces with and without melodies are comparable in the PCA. */
const PROFILE_RULES = RULES.filter((r) => r.family !== 'melody');

/** Eigen-decomposition of a symmetric matrix (cyclic Jacobi rotations); returns eigenvalues and column eigenvectors. */
function jacobi(a: number[][]): { values: number[]; vectors: number[][] } {
  const n = a.length;
  const m = a.map((r) => [...r]);
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i][j] ** 2;
    if (off < 1e-12) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(m[p][q]) < 1e-15) continue;
        const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k][p];
          const mkq = m[k][q];
          m[k][p] = c * mkp - s * mkq;
          m[k][q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p][k];
          const mqk = m[q][k];
          m[p][k] = c * mpk - s * mqk;
          m[q][k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
  }
  return { values: m.map((r, i) => r[i]), vectors: v };
}

/** PCA over pieces: standardized features (missing → feature mean), correlation matrix, top components. */
function pca(rows: (number | null)[][], names: string[], k = 4) {
  const mean = names.map((_, j) => {
    const vs = rows.map((r) => r[j]).filter((x): x is number => x !== null);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
  });
  const filled = rows.map((r) => r.map((x, j) => x ?? mean[j]));
  const sd = names.map(
    (_, j) => Math.sqrt(filled.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / Math.max(1, filled.length - 1)) || 1,
  );
  const z = filled.map((r) => r.map((x, j) => (x - mean[j]) / sd[j]));
  const corr = names.map((_, i) =>
    names.map((_, j) => z.reduce((s, r) => s + r[i] * r[j], 0) / Math.max(1, z.length - 1)),
  );
  const { values, vectors } = jacobi(corr);
  const order = values
    .map((v, i) => [v, i] as const)
    .sort((a, b) => b[0] - a[0])
    .slice(0, k);
  const total = values.reduce((a, b) => a + b, 0);
  const components = order.map(([value, i]) => {
    let loadings = names.map((_, j) => vectors[j][i]);
    // sign convention: the largest loading is positive
    const big = loadings.reduce((b, x) => (Math.abs(x) > Math.abs(b) ? x : b), 0);
    if (big < 0) loadings = loadings.map((x) => -x);
    return { share: value / total, loadings: Object.fromEntries(names.map((n, j) => [n, r3(loadings[j])])) };
  });
  const scores = z.map((r) => components.map((c) => r3(names.reduce((s, n, j) => s + r[j] * (c.loadings[n] ?? 0), 0))));
  return { components, scores, correlation: corr.map((r) => r.map((x) => r3(x))) };
}

const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

interface Compliance {
  real: number;
  realOk: number;
  alt: number;
  altOk: number;
}
interface Group {
  source: Source;
  years: number[];
  pieces: number;
  chords: number;
  rule: Record<string, Tally>;
  book: Record<string, Tally>;
  piece: Record<string, { n: number; sum: number }>;
  cadences: Record<string, number>;
  compliance: Record<string, Compliance>;
  examples: unknown[];
}

it('harmony rules study', () => {
  const limit = Number(process.env.LIMIT ?? 0);
  const groups = new Map<string, Group>();
  const pieces: unknown[] = [];
  const validation = { expert: 0, matched: 0, confusion: {} as Record<string, number> };
  const constraints = RULES.filter((r) => r.kind === 'constraint' && r.concerns);

  // keys & modes, per source
  const modeStats = new Map<
    string,
    {
      pieces: number;
      minor: number;
      tonics: number[];
      modes: Record<string, number>;
      sizes: Record<number, number>;
      unusual: unknown[];
      splits: unknown[];
    }
  >();
  // tricks: frequent key-relative chord moves, per tradition
  const moves = new Map<
    string,
    {
      tradition: string;
      label: string;
      count: number;
      functional: number;
      rules: Record<string, number>;
      examples: unknown[];
    }
  >();
  // exceptions: where real chords break a constraint, by context (previous → chord → next, in the local key)
  const breaks = new Map<
    string,
    { tradition: string; rule: string; context: string; count: number; examples: unknown[] }
  >();
  const concerned: Record<string, number> = {};
  // progression patterns (1–4 chords, scale-degree tokens) per key mode and tradition, for the sequence engine
  const grams = new Map<string, Map<string, number>>();
  const gramMoves: Record<string, number> = {};
  const transitions: Record<string, number> = {};
  const functionalBook = RULEBOOKS.find((b) => b.id === 'functional');
  // one job per file; with SHARD=i/N this process takes the i-th contiguous slice (scripts/study.mjs runs them in
  // parallel and a final MERGE=N run combines the shards, so the output does not depend on the number of cores)
  const jobs = SOURCES.flatMap((source) => {
    const list = files(source.dir);
    return (limit ? list.slice(0, limit) : list).map((file) => ({ source, file }));
  });
  const shard = process.env.SHARD?.split('/').map(Number) ?? null;
  const mine = shard
    ? jobs.slice(Math.floor((jobs.length * shard[0]) / shard[1]), Math.floor((jobs.length * (shard[0] + 1)) / shard[1]))
    : process.env.MERGE
      ? []
      : jobs;
  for (const { source, file } of mine) {
    const piece = load(source, file);
    if (!piece) continue;
    let g = groups.get(piece.group);
    if (!g) {
      g = {
        source,
        years: [],
        pieces: 0,
        chords: 0,
        rule: Object.fromEntries(RULES.map((r) => [r.id, tally()])),
        book: Object.fromEntries(RULEBOOKS.map((b) => [b.id, tally()])),
        piece: Object.fromEntries(PIECE_RULES.map((r) => [r.id, { n: 0, sum: 0 }])),
        cadences: { authentic: 0, plagal: 0, half: 0, deceptive: 0, none: 0 },
        compliance: Object.fromEntries(constraints.map((r) => [r.id, { real: 0, realOk: 0, alt: 0, altOk: 0 }])),
        examples: [],
      };
      groups.set(piece.group, g);
    }
    g.pieces++;
    if (piece.year !== null) g.years.push(piece.year);
    const { chords, melody, meter } = piece;
    const phrases = phrasesOf(chords, melody, meter, piece.phraseEnds);
    const features = [...featuresOf(chords), ...sequencesOf(chords), ...pedalsOf(chords, piece.bass)];
    // keys & modes: degrees relative to the main key (longest), melody by duration + chord tones at half weight
    const keyTime = new Map<string, number>();
    for (const c of chords)
      keyTime.set(`${c.key.tonic}:${c.key.mode}`, (keyTime.get(`${c.key.tonic}:${c.key.mode}`) ?? 0) + c.end - c.start);
    const [mainTonic, mainMode] = [...keyTime.entries()].sort((a, b) => b[1] - a[1])[0][0].split(':');
    const tonicPc = Number(mainTonic);
    const hist = Array<number>(12).fill(0);
    // relative to each chord's local key, so modulations don't read as chromaticism
    const keyAt = (t: number) =>
      (chords.find((c) => c.start <= t + 1e-6 && t < c.end - 1e-6) ?? chords[chords.length - 1]).key.tonic;
    for (const n of melody) hist[mod12(n.pitch - keyAt(n.start))] += n.beats;
    for (const c of chords)
      for (const t of c.chord.tones) hist[mod12(c.chord.root + t.interval - c.key.tonic)] += 0.5 * (c.end - c.start);
    const reading = readMode(hist);
    const splits = registerSplits(
      melody.map((n) => ({ pitch: n.pitch, weight: n.beats })),
      tonicPc,
    );
    let ms = modeStats.get(source.id);
    if (!ms) {
      ms = { pieces: 0, minor: 0, tonics: Array(12).fill(0), modes: {}, sizes: {}, unusual: [], splits: [] };
      modeStats.set(source.id, ms);
    }
    ms.pieces++;
    if (mainMode === 'minor') ms.minor++;
    ms.tonics[tonicPc]++;
    ms.modes[reading.best.id] = (ms.modes[reading.best.id] ?? 0) + 1;
    ms.sizes[reading.used.length] = (ms.sizes[reading.used.length] ?? 0) + 1;
    const odd =
      !['ionian', 'aeolian', 'harmonic-minor', 'melodic-minor'].includes(reading.best.id) || reading.used.length !== 7;
    if (odd && ms.unusual.length < 400)
      ms.unusual.push({
        title: piece.title,
        year: piece.year,
        group: piece.group,
        mode: reading.best.id,
        used: reading.used,
        coverage: r3(reading.coverage),
        outside: reading.outside,
        tonic: tonicPc,
      });
    if (splits.length && ms.splits.length < 100)
      ms.splits.push({ title: piece.title, year: piece.year, group: piece.group, tonic: tonicPc, splits });
    for (const ph of phrases) g.cadences[ph.cadence]++;
    // our cadence finder against the experts (DCML cadence labels)
    for (const [t, label] of piece.expertCadences) {
      const want = EXPERT_CADENCE[label];
      if (!want || want === 'none') continue;
      const i = chords.findIndex((c) => c.start <= t + 1e-6 && t < c.end - 1e-6);
      if (i < 0) continue;
      const got = cadenceAt(chords, i);
      validation.expert++;
      if (got === want) validation.matched++;
      validation.confusion[`${want}→${got}`] = (validation.confusion[`${want}→${got}`] ?? 0) + 1;
    }
    const pieceValues: Record<string, number | null> = {};
    for (const r of PIECE_RULES) {
      const v = !piece.durations && DURATION_RULES.has(r.id) ? null : r.judge({ chords, phrases, features });
      pieceValues[r.id] = r3(v === null ? null : (v + 1) / 2);
      if (v !== null) {
        g.piece[r.id].n++;
        g.piece[r.id].sum += v;
      }
    }
    {
      const toks: { t: string; k: string }[] = [];
      for (const pc of chords) {
        const t = tokenOf(pc.chord, pc.key);
        const k = statsKey(pc.key, source.tradition);
        if (toks.at(-1)?.t !== t || toks.at(-1)?.k !== k) toks.push({ t, k });
      }
      toks.forEach((x, i) => {
        const m = grams.get(x.k) ?? new Map<string, number>();
        grams.set(x.k, m);
        gramMoves[x.k] = (gramMoves[x.k] ?? 0) + 1;
        for (let n = 1; n <= 4 && i - n + 1 >= 0; n++) {
          const run = toks.slice(i - n + 1, i + 1);
          if (run.some((r) => r.k !== x.k)) break;
          const gram = run.map((r) => r.t).join(' ');
          m.set(gram, (m.get(gram) ?? 0) + 1);
        }
      });
    }
    const phraseEnds = new Set(phrases.map((p) => p.last));
    const vocab = piece.full ? FULL : TRIADS;
    const perChord: Record<string, number | null>[] = [];
    const pieceBooks: Record<string, Tally> = Object.fromEntries(RULEBOOKS.map((b) => [b.id, tally()]));
    chords.forEach((pc, i) => {
      const prev = chords[i - 1]?.chord ?? null;
      const next = chords[i + 1]?.chord ?? null;
      const near = melody.filter((n) => n.start < pc.end + 2 && n.start + n.beats > pc.start - 1);
      const ctx = {
        key: pc.key,
        prev,
        next,
        melody: near,
        span: { start: pc.start, end: pc.end },
        meter,
        phraseEnd: phraseEnds.has(i),
      };
      const real = judgeAll({ ...ctx, chord: pc.chord });
      perChord.push(real);
      if (prev && functionalBook) {
        const lab = `${numeralOf(prev, pc.key)} → ${numeralOf(pc.chord, pc.key)}`;
        const id = `${source.tradition}|${lab}`;
        transitions[source.tradition] = (transitions[source.tradition] ?? 0) + 1;
        let mv = moves.get(id);
        if (!mv) {
          mv = { tradition: source.tradition, label: lab, count: 0, functional: 0, rules: {}, examples: [] };
          moves.set(id, mv);
        }
        mv.count++;
        mv.functional += rulebookVerdict(functionalBook, real) ?? 0;
        for (const r of RULES) mv.rules[r.id] = (mv.rules[r.id] ?? 0) + (real[r.id] ?? 0);
        if (mv.examples.length < 4 && (mv.count === 1 || mv.count % 37 === 0)) {
          const ctxChords = chords.slice(Math.max(0, i - 2), Math.min(chords.length, i + 2));
          mv.examples.push({
            title: piece.title,
            year: piece.year,
            key: `${chordName(chord(pc.key.tonic, pc.key.mode === 'minor' ? 'min' : 'maj'), pc.key)}${pc.key.mode === 'minor' ? '' : ' major'}`,
            chords: ctxChords.map((c) => ({
              name: chordName(c.chord, c.key),
              roman: numeralOf(c.chord, c.key),
              pcs: c.chord.tones.map((t) => mod12(c.chord.root + t.interval)),
              root: c.chord.root,
              focus: c === pc || c.chord === prev,
            })),
          });
        }
      }
      g.chords++;
      const altCtx: Parameters<typeof judgeAll>[0][] = [];
      for (let r = 0; r < 12; r++)
        vocab.forEach((k, ki) => {
          if ((i * 31 + r * 7 + ki * 13) % 3 !== 0) return; // fixed, deterministic third of the vocabulary
          const c = chord(r, k);
          if (sameChord(c, pc.chord) || (prev && sameChord(c, prev)) || (next && sameChord(c, next))) return;
          altCtx.push({ ...ctx, chord: c });
        });
      const alts = altCtx.map(judgeAll);
      for (const rule of RULES)
        addTally(
          g.rule[rule.id],
          real[rule.id],
          alts.map((a) => a[rule.id]),
        );
      for (const b of RULEBOOKS) {
        const rv = rulebookVerdict(b, real);
        const av = alts.map((a) => rulebookVerdict(b, a));
        addTally(g.book[b.id], rv, av);
        addTally(pieceBooks[b.id], rv, av);
      }
      // constraint compliance: of the chords a constraint concerns, how many satisfy it (real vs. alternatives)?
      for (const r of constraints) {
        const cm = g.compliance[r.id];
        if (r.concerns?.({ ...ctx, chord: pc.chord })) {
          cm.real++;
          const tr = `${source.tradition}|${r.id}`;
          concerned[tr] = (concerned[tr] ?? 0) + 1;
          if ((real[r.id] ?? 0) >= -1e-9) cm.realOk++;
          else {
            const num = (c: typeof pc.chord | null) => (c ? numeralOf(c, pc.key) : '·');
            const context = `${num(prev)} → [${num(pc.chord)}] → ${num(next)}`;
            const id = `${tr}|${context}`;
            let b = breaks.get(id);
            if (!b) {
              b = { tradition: source.tradition, rule: r.id, context, count: 0, examples: [] };
              breaks.set(id, b);
            }
            b.count++;
            if (b.examples.length < 2 && (b.count === 1 || b.count % 53 === 0)) {
              b.examples.push({
                title: piece.title,
                year: piece.year,
                key: `${chordName(chord(pc.key.tonic, pc.key.mode === 'minor' ? 'min' : 'maj'), pc.key)}${pc.key.mode === 'minor' ? '' : ' major'}`,
                chords: chords.slice(Math.max(0, i - 2), Math.min(chords.length, i + 3)).map((c) => ({
                  name: chordName(c.chord, c.key),
                  roman: numeralOf(c.chord, c.key),
                  pcs: c.chord.tones.map((t) => mod12(c.chord.root + t.interval)),
                  root: c.chord.root,
                  focus: c === pc,
                })),
              });
            }
          }
        }
        altCtx.forEach((a, k) => {
          if (r.concerns?.(a)) {
            cm.alt++;
            if ((alts[k][r.id] ?? 0) >= -1e-9) cm.altOk++;
          }
        });
      }
    });
    // the piece's harmonic profile: mean verdict of each harmony rule over the composer's chords (for the PCA)
    const profile: Record<string, number | null> = {};
    for (const r of PROFILE_RULES) {
      const vs = perChord.map((v) => v[r.id]).filter((v): v is number => v !== null);
      profile[r.id] = vs.length ? r3(vs.reduce((a, b) => a + b, 0) / vs.length) : null;
    }
    pieces.push({
      profile,
      id: piece.id,
      group: piece.group,
      source: source.id,
      tradition: source.tradition,
      year: piece.year,
      title: piece.title,
      composer: piece.composer,
      chords: chords.length,
      books: Object.fromEntries(RULEBOOKS.map((b) => [b.id, r3(auc(pieceBooks[b.id]))])),
      pieceRules: pieceValues,
    });
    if (g.examples.length < 2 && chords.length >= 12 && (source.melody === 'none' || melody.length >= 8)) {
      const cut = Math.min(chords.length, 40);
      const end = chords[cut - 1].end;
      g.examples.push({
        id: piece.id,
        title: piece.title,
        year: piece.year,
        meter,
        melody: melody
          .filter((n) => n.start < end)
          .map((n) => [+n.start.toFixed(3), +n.beats.toFixed(3), n.pitch, n.fermata ? 1 : 0]),
        chords: chords.slice(0, cut).map((c, i) => ({
          name: chordName(c.chord, c.key),
          roman: numeralOf(c.chord, c.key),
          root: c.chord.root,
          pcs: c.chord.tones.map((t) => mod12(c.chord.root + t.interval)),
          start: +c.start.toFixed(3),
          end: +c.end.toFixed(3),
          rules: Object.fromEntries(
            Object.entries(perChord[i]).map(([k, v]) => [k, v === null ? null : +v.toFixed(2)]),
          ),
        })),
        phrases: phrases
          .filter((p) => p.last < cut)
          .map((p) => ({ start: +p.start.toFixed(3), end: +p.end.toFixed(3), cadence: p.cadence, by: p.by })),
        features: features.filter((f) => f.to < cut),
      });
    }
  }

  // ── parallel runs: a shard writes its raw counts and stops; the merge run reads them all ──
  const SHARDS = 'local/assist/shards';
  if (shard) {
    fs.mkdirSync(SHARDS, { recursive: true });
    fs.writeFileSync(
      `${SHARDS}/${shard[0]}.json`,
      JSON.stringify({
        groups: [...groups].map(([k, g]) => [k, { ...g, source: g.source.id }]),
        pieces,
        validation,
        modeStats: [...modeStats],
        moves: [...moves],
        breaks: [...breaks],
        concerned,
        grams: [...grams].map(([k, m]) => [k, [...m]]),
        gramMoves,
        transitions,
      }),
    );
    return;
  }
  if (process.env.MERGE) {
    // biome-ignore lint/suspicious/noExplicitAny: plain JSON counts, added field by field
    const add = (a: any, b: any) => {
      for (const [k, v] of Object.entries(b)) {
        if (typeof v === 'number') a[k] = (a[k] ?? 0) + v;
        else if (v && typeof v === 'object' && !Array.isArray(v)) {
          a[k] ??= {};
          add(a[k], v);
        }
      }
    };
    for (let i = 0; i < Number(process.env.MERGE); i++) {
      const d = JSON.parse(fs.readFileSync(`${SHARDS}/${i}.json`, 'utf8'));
      for (const [k, g] of d.groups) {
        const source = SOURCES.find((x) => x.id === g.source) as Source;
        const e = groups.get(k);
        if (!e) {
          groups.set(k, { ...g, source });
          continue;
        }
        e.years.push(...g.years);
        e.pieces += g.pieces;
        e.chords += g.chords;
        for (const f of ['rule', 'book', 'piece', 'cadences', 'compliance'] as const) add(e[f], g[f]);
        e.examples = [...e.examples, ...g.examples].slice(0, 2);
      }
      pieces.push(...d.pieces);
      validation.expert += d.validation.expert;
      validation.matched += d.validation.matched;
      add(validation.confusion, d.validation.confusion);
      for (const [k, m] of d.modeStats) {
        const e = modeStats.get(k);
        if (!e) {
          modeStats.set(k, m);
          continue;
        }
        e.pieces += m.pieces;
        e.minor += m.minor;
        e.tonics = e.tonics.map((x, t) => x + m.tonics[t]);
        add(e.modes, m.modes);
        add(e.sizes, m.sizes);
        e.unusual = [...e.unusual, ...m.unusual].slice(0, 400);
        e.splits = [...e.splits, ...m.splits].slice(0, 100);
      }
      for (const [k, m] of d.moves) {
        const e = moves.get(k);
        if (!e) {
          moves.set(k, m);
          continue;
        }
        e.count += m.count;
        e.functional += m.functional;
        add(e.rules, m.rules);
        e.examples = [...e.examples, ...m.examples].slice(0, 4);
      }
      for (const [k, b] of d.breaks) {
        const e = breaks.get(k);
        if (!e) {
          breaks.set(k, b);
          continue;
        }
        e.count += b.count;
        e.examples = [...e.examples, ...b.examples].slice(0, 2);
      }
      add(concerned, d.concerned);
      add(gramMoves, d.gramMoves);
      add(transitions, d.transitions);
      for (const [k, list] of d.grams as [string, [string, number][]][]) {
        const m = grams.get(k) ?? new Map<string, number>();
        grams.set(k, m);
        for (const [g, c] of list) m.set(g, (m.get(g) ?? 0) + c);
      }
    }
  }

  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  const summaries = [...groups.entries()].map(([id, g]) => ({
    id,
    source: g.source.id,
    tradition: g.source.tradition,
    title: id === g.source.id ? g.source.title : id.replace(/_/g, ' '),
    year: median(g.years),
    yearFrom: g.years.length ? Math.min(...g.years) : null,
    yearTo: g.years.length ? Math.max(...g.years) : null,
    pieces: g.pieces,
    chords: g.chords,
    rules: Object.fromEntries(
      RULES.map((r) => [
        r.id,
        { applies: r3(g.rule[r.id].applies / Math.max(1, g.chords)), auc: r3(auc(g.rule[r.id])) },
      ]),
    ),
    rulebooks: Object.fromEntries(RULEBOOKS.map((b) => [b.id, { auc: r3(auc(g.book[b.id])) }])),
    pieceRules: Object.fromEntries(
      PIECE_RULES.map((r) => [r.id, g.piece[r.id].n ? r3((g.piece[r.id].sum / g.piece[r.id].n + 1) / 2) : null]),
    ),
    cadences: g.cadences,
    compliance: Object.fromEntries(
      Object.entries(g.compliance).map(([k, c]) => [
        k,
        { real: c.real, realRate: r3(c.real ? c.realOk / c.real : null), altRate: r3(c.alt ? c.altOk / c.alt : null) },
      ]),
    ),
    examples: g.examples,
  }));
  const order: Record<Tradition, number> = { art: 0, jazz: 1, popular: 2, reference: 3 };
  summaries.sort((a, b) => order[a.tradition] - order[b.tradition] || (a.year ?? 9999) - (b.year ?? 9999));
  // tricks: frequent moves that functional harmony dislikes, with the rules that do support them
  const NAMED: Record<string, string> = {
    '♭VII → I': 'Mixolydian cadence (♭VII → I); as ♭VII7, the backdoor dominant',
    '♭VII7 → I': 'backdoor dominant (♭VII7 → I)',
    'iv → I': 'minor plagal: borrowed iv → I',
    '♭VI → ♭VII': 'Aeolian approach (♭VI → ♭VII, often → I)',
    '♭VI → I': 'chromatic mediant / Aeolian cadence (♭VI → I)',
    '♭III → IV': 'pentatonic/rock: ♭III → IV',
    'I → ♭VII': 'Mixolydian shuttle (I → ♭VII)',
    'V → IV': 'blues/rock retrogression (V → IV)',
    '♭II → I': 'tritone sub / Neapolitan (♭II → I)',
    '♭II7 → I': 'tritone substitute (♭II7 → I)',
    'I → ♭III': 'chromatic mediant (I → ♭III)',
    'I → ♭VI': 'chromatic mediant (I → ♭VI)',
    'I → III': 'chromatic mediant (I → III)',
    'I → VI': 'chromatic mediant (I → VI)',
    'IV → iv': 'major → minor subdominant (IV → iv)',
    'I → i': 'parallel mode switch (P: I → i)',
    'i → I': 'Picardy / parallel switch (i → I)',
    'ii → I': 'jazz: ii → I skipping V',
    'vi → V': 'deceptive in reverse (vi → V)',
    // from the review of unnamed moves (docs/rules.md)
    'v → IV': 'modal fifth: minor v → IV (Mixolydian or Dorian)',
    'V → iv': 'minor plagal after the dominant (V → iv → I)',
    '♭III → ii': 'tritone substitute of V/ii (♭III → ii)',
    '♭V → IV': 'chromatic slide into IV (blues ♭5)',
    '♭III → IV7': 'melodic-minor IV: the raised 6th rises to the leading tone (♭III → IV7 → V)',
    'V7 → iv': 'iv decorating the dominant: a V–iv–V shuttle (♭6 neighbour to 5) or a passing iv6 after V7',
    '♭VI → v': 'minor v in a descending bass (♭VII → ♭VI → v → iv), passing, not a dominant',
  };
  /** Names for families of moves the table above doesn't list. */
  const nameMove = (label: string): string | null => {
    const [from, to] = label.split(' → ');
    const ROOTS = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
    const root = (x: string) => ROOTS.indexOf((x.match(/^[♭♯]?[IViv]+/)?.[0] ?? '').toUpperCase());
    const quality = (x: string) =>
      (/^[♭♯]?[iv]/.test(x) ? 'minor' : 'major') + (x.match(/(maj7|ø7|°7|°|7)$/)?.[0] ?? '');
    const a = root(from);
    const b = root(to);
    const step = (b - a + 12) % 12;
    const major = (x: string) => /^[♭♯]?[IV]+/.test(x) && !/^[♭♯]?[iv]/.test(x);
    if (/^♭II7$/.test(to)) return 'tritone substitute (♭II7 = subV7, resolving down a semitone)';
    if (/°7$/.test(to)) return 'diminished seventh (leading-tone or common-tone °7)';
    if (/^♭VII7$/.test(to)) return 'backdoor dominant (♭VII7, resolving up a whole step to I)';
    if (/^♭III7$/.test(to)) return 'tritone substitute of VI7 (♭III7 → ii)';
    if (/°$|ø7$/.test(to)) return 'passing or leading-tone diminished chord (bass by step)';
    if (/^(♭VI7|♭V7|♯IV7)$/.test(to)) return 'augmented-sixth sound (spelled as a dominant 7th on ♭VI or ♭V)';
    if (/^(I|IV|V)7$/.test(to) && /^(I|IV|V)7?$/.test(from)) return 'blues: dominant sevenths on I, IV and V (12-bar)';
    if (a >= 0 && b >= 0 && quality(from) === quality(to) && [1, 2, 10, 11].includes(step))
      return 'parallel planing (the same chord type sliding by step)';
    if (/^♭II(?!I)/.test(to)) return 'Neapolitan / ♭II (or tritone substitute when a 7th)';
    if (/^II7?$/.test(to)) return 'major II: V/V or Lydian colour';
    if (/^III7?$/.test(to)) return 'major III: V/vi (secondary dominant)';
    if (/^VI7?$/.test(to)) return 'major VI: V/ii (secondary dominant)';
    if (/^VII7?$/.test(to)) return 'major VII: V/iii, or a misread key or mode (review)';
    if (a >= 0 && b >= 0 && major(from) && major(to) && [3, 4, 8, 9].includes(step))
      return 'chromatic mediant (major triads a third apart)';
    return null;
  };
  const tricks = [...moves.values()]
    .filter((m) => m.count >= Math.max(15, 0.0004 * (transitions[m.tradition] ?? 0)))
    .map((m) => {
      const f = m.functional / m.count;
      const support = RULES.map((r) => ({ id: r.id, statement: r.statement, v: m.rules[r.id] / m.count }))
        .filter((x) => x.v > 0.3)
        .sort((a, b) => b.v - a.v);
      const against = RULES.map((r) => ({ id: r.id, statement: r.statement, v: m.rules[r.id] / m.count }))
        .filter((x) => x.v < -0.2)
        .sort((a, b) => a.v - b.v);
      return {
        tradition: m.tradition,
        label: m.label,
        count: m.count,
        share: r3(m.count / (transitions[m.tradition] ?? 1)),
        functional: r3(f),
        name: NAMED[m.label] ?? nameMove(m.label),
        why: support.slice(0, 4).map((x) => ({ id: x.id, statement: x.statement, v: r3(x.v) })),
        against: against.slice(0, 3).map((x) => ({ id: x.id, statement: x.statement, v: r3(x.v) })),
        examples: m.examples,
      };
    })
    .filter((t) => (t.functional ?? 0) < 0.12)
    .sort((a, b) => (a.functional ?? 0) * Math.log(b.count) - (b.functional ?? 0) * Math.log(a.count));
  const tricksByTradition: Record<string, typeof tricks> = {};
  for (const t of tricks) {
    tricksByTradition[t.tradition] ??= [];
    if (tricksByTradition[t.tradition].length < 30) tricksByTradition[t.tradition].push(t);
  }
  const modes = Object.fromEntries(modeStats.entries());

  // dimensions of style: PCA over per-piece harmony profiles (harmony rules + duration-free piece rules)
  const featureNames = [
    ...PROFILE_RULES.map((r) => r.id),
    ...PIECE_RULES.filter((r) => !DURATION_RULES.has(r.id)).map((r) => `piece:${r.id}`),
  ];
  const typed = pieces as {
    profile: Record<string, number | null>;
    pieceRules: Record<string, number | null>;
    pc?: (number | null)[];
  }[];
  const matrix = typed.map((p) =>
    featureNames.map((n) => (n.startsWith('piece:') ? (p.pieceRules[n.slice(6)] ?? null) : (p.profile[n] ?? null))),
  );
  const styles = pca(matrix, featureNames);
  typed.forEach((p, i) => {
    p.pc = styles.scores[i];
  });
  // the most frequent ways each constraint is broken, per tradition: share of that rule's concerned chords
  const exceptionsList = [...breaks.values()]
    .map((b) => {
      const n = concerned[`${b.tradition}|${b.rule}`] ?? 1;
      return { ...b, share: r3(b.count / n), concerned: n };
    })
    .filter((b) => b.count >= 20)
    .sort((a, b) => b.count - a.count);
  const exceptionTotals: Record<string, { broken: number; concerned: number }> = {};
  for (const b of breaks.values()) {
    const k = `${b.tradition}|${b.rule}`;
    exceptionTotals[k] ??= { broken: 0, concerned: concerned[k] ?? 0 };
    exceptionTotals[k].broken += b.count;
  }
  fs.mkdirSync('local/assist', { recursive: true });
  // aggregate counts only (patterns seen at least 5 times), no songs: the input of the sequence engine
  const progressionStats: ProgressionStats = {
    generated: new Date().toISOString(),
    traditions: Object.fromEntries(
      [...grams].map(([k, m]) => [
        k,
        {
          moves: gramMoves[k] ?? 0,
          grams: Object.fromEntries([...m].filter(([, c]) => c >= 5).sort((a, b) => b[1] - a[1])),
        },
      ]),
    ),
    idioms: exceptionsList
      .filter((b) => (b.share ?? 0) >= 0.01)
      .map(({ tradition, rule, context, count, share }) => ({ tradition, rule, context, count, share: share ?? 0 })),
  };
  fs.writeFileSync('local/assist/progressions.json', JSON.stringify(progressionStats));
  fs.writeFileSync(
    'local/assist/study.json',
    JSON.stringify({
      generated: new Date().toISOString(),
      rules: RULES.map(({ judge: _j, concerns: _c, ...r }) => r),
      pieceRules: PIECE_RULES.map(({ judge: _j, ...r }) => r),
      rulebooks: RULEBOOKS,
      groups: summaries,
      pieces,
      validation,
      pca: { features: featureNames, components: styles.components, correlation: styles.correlation },
      tricks: tricksByTradition,
      modes,
      exceptions: exceptionsList,
    }),
  );
  const pct = (x: number | null | undefined) => (typeof x === 'number' ? `${Math.round(100 * x)}%` : '–');
  console.log('\nEXCEPTIONS: constraint | tradition | broken / concerned');
  for (const [k, t] of Object.entries(exceptionTotals).sort((a, b) => b[1].broken - a[1].broken))
    console.log(`EXC ${k} | ${t.broken} / ${t.concerned} = ${pct(t.broken / Math.max(1, t.concerned))}`);
  for (const b of exceptionsList.slice(0, 120))
    console.log(`EXCTOP ${b.tradition} | ${b.rule} | ${b.context} | ${b.count} | ${pct(b.share)}`);
  console.log(
    `\n${pieces.length} pieces, ${summaries.reduce((s, g) => s + g.chords, 0)} chords, ${summaries.length} groups`,
  );
  console.log(
    `cadence finder vs. expert labels: ${validation.matched}/${validation.expert} = ${pct(validation.matched / Math.max(1, validation.expert))}`,
  );
  console.log(
    Object.entries(validation.confusion)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · '),
  );
  console.log(
    `\n| group | tradition | year | pieces | chords | ${RULEBOOKS.map((b) => b.name).join(' | ')} | phrases→cadence | ends V→I |`,
  );
  console.log(`|${' --- |'.repeat(7 + RULEBOOKS.length)}`);
  for (const s of summaries)
    console.log(
      `| ${s.title} | ${s.tradition} | ${s.year ?? '–'} | ${s.pieces} | ${s.chords} | ${RULEBOOKS.map((b) => pct(s.rulebooks[b.id].auc)).join(' | ')} | ${pct(s.pieceRules['phrases-cadence'])} | ${pct(s.pieceRules['final-authentic'])} |`,
    );
  console.log('\nStyle dimensions (PCA over per-piece harmony profiles)');
  styles.components.forEach((c, i) => {
    const top = Object.entries(c.loadings)
      .sort((a, b) => Math.abs(b[1] ?? 0) - Math.abs(a[1] ?? 0))
      .slice(0, 6)
      .map(([n, l]) => `${n} ${(l ?? 0) > 0 ? '+' : ''}${(l ?? 0).toFixed(2)}`)
      .join(', ');
    console.log(`PC${i + 1} ${Math.round(100 * c.share)}%: ${top}`);
  });
  console.log(
    '\nConstraint compliance (all groups pooled): real chords that satisfy it vs. alternatives it concerns\n',
  );
  for (const r of constraints) {
    let real = 0;
    let ok = 0;
    let alt = 0;
    let altOk = 0;
    for (const g of groups.values()) {
      real += g.compliance[r.id].real;
      ok += g.compliance[r.id].realOk;
      alt += g.compliance[r.id].alt;
      altOk += g.compliance[r.id].altOk;
    }
    console.log(
      `| ${r.id} | concerns ${real} real chords | real ${pct(ok / Math.max(1, real))} | alternatives ${pct(altOk / Math.max(1, alt))} |`,
    );
  }
}, 3_600_000);
