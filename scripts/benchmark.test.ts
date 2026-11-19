/**
 * The benchmark. Reproducible: corpora are pinned in scripts/datasets.json.
 *
 *   npm run fetch-data                          (once; writes local/data)
 *   npm run benchmark                           all corpora, both splits
 *   SPLIT=test CORPUS=pop909,jazz npm run benchmark
 *   PIECE=mozart/K279-1 BARS=24 npm run benchmark   one piece, bar-by-bar timeline
 *   WRITE=1 npm run benchmark                   also record results in benchmarks/
 */
import { it } from 'vitest';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { type Counts, add, evaluate, evaluateBars, zero } from './eval/run';
import { corpora, loadPiece, pieceIds, split } from './eval/truth';
import { DEFAULT_PARAMS } from '../src/engine/harmonizer';

const env = process.env;
const pct = (x: number) => `${(100 * x).toFixed(1)}`.padStart(5);

interface Row { corpus: string; pieces: number; synthetic: boolean; c: Counts; barF: number; beatF: number }

export function metrics(r: Row) {
  const c = r.c, n = Math.max(1, c.n), miss = Math.max(1, c.n - c.chord1), kmiss = Math.max(1, c.n - c.key1);
  return {
    corpus: r.corpus, pieces: r.pieces, synthetic: r.synthetic, samples: c.n,
    chordLive1: c.chordLive1 / n, chordLive3: c.chordLive3 / n,
    chord1: c.chord1 / n, chord3: c.chord3 / n, chord5: c.chord5 / n, root1: c.root1 / n,
    keyLive1: c.keyLive1 / n, key1: c.key1 / n, key3: c.key3 / n, keyClose: c.keyClose / n,
    overSeg: c.chordChanges / Math.max(1, c.truthChanges), keyChanges: c.keyChanges, truthKeyChanges: c.truthKeyChanges,
    chordErr: { boundary: c.errBoundary / miss, quality: c.errQuality / miss, fifth: c.errFifth / miss, other: c.errOther / miss },
    keyErr: { relative: c.keyRelative / kmiss, parallel: c.keyParallel / kmiss, fifth: c.keyFifth / kmiss, other: c.keyOther / kmiss },
    barF: r.barF, beatF: r.beatF,
  };
}

function table(rows: ReturnType<typeof metrics>[]): string {
  const h1 = '| corpus | pieces | chord live @1 / @3 | chord hindsight @1 / @3 / @5 | root @1 | key live | key @1 / @3 / close | changes ×truth | key changes | beat F | bar F |';
  const sep = '|' + '---|'.repeat(11);
  const lines = rows.map((m) => `| ${m.corpus}${m.synthetic ? ' *' : ''} | ${m.pieces} | ${pct(m.chordLive1)} / ${pct(m.chordLive3)} | ${pct(m.chord1)} / ${pct(m.chord3)} / ${pct(m.chord5)} | ${pct(m.root1)} | ${pct(m.keyLive1)} | ${pct(m.key1)} / ${pct(m.key3)} / ${pct(m.keyClose)} | ${m.overSeg.toFixed(2)} | ${m.keyChanges} / ${m.truthKeyChanges} | ${pct(m.beatF)} | ${pct(m.barF)} |`);
  const h2 = '| corpus | chord misses: boundary / same root, wrong quality / a fifth away / other | key misses: relative / parallel / a fifth away / other |\n|---|---|---|';
  const err = rows.map((m) => `| ${m.corpus} | ${pct(m.chordErr.boundary)} / ${pct(m.chordErr.quality)} / ${pct(m.chordErr.fifth)} / ${pct(m.chordErr.other)} | ${pct(m.keyErr.relative)} / ${pct(m.keyErr.parallel)} / ${pct(m.keyErr.fifth)} / ${pct(m.keyErr.other)} |`);
  return [h1, sep, ...lines, '', h2, ...err].join('\n');
}

it('benchmark', () => {
  if (env.PIECE) {
    const [corpus, id] = env.PIECE.split('/');
    const p = loadPiece(corpus, id);
    const r = evaluate(p, DEFAULT_PARAMS, { timelineBars: Number(env.BARS ?? 32) });
    const b = evaluateBars(p);
    console.log(`\n${p.title} (${p.genre})\nbar      | truth${''.padEnd(25)} | engine (hindsight)${''.padEnd(24)} | key\n${r.timeline.join('\n')}\n`);
    console.log(table([metrics({ corpus: `${corpus}/${id}`, pieces: 1, synthetic: p.synthetic, c: r.counts, barF: b.barF, beatF: b.beatF })]));
    return;
  }
  const want = env.CORPUS ? env.CORPUS.split(',') : corpora();
  const sp = env.SPLIT ?? 'all';
  const limit = Number(env.LIMIT ?? Infinity);
  const rows: ReturnType<typeof metrics>[] = [];
  for (const corpus of want) {
    const ids = pieceIds(corpus).filter((id) => sp === 'all' || split(corpus, id) === sp).slice(0, limit);
    let c = zero(), barF = 0, beatF = 0, synthetic = false;
    for (const id of ids) {
      const p = loadPiece(corpus, id);
      synthetic ||= p.synthetic;
      c = add(c, evaluate(p).counts);
      const b = evaluateBars(p);
      barF += b.barF; beatF += b.beatF;
    }
    rows.push(metrics({ corpus, pieces: ids.length, synthetic, c, barF: barF / Math.max(1, ids.length), beatF: beatF / Math.max(1, ids.length) }));
  }
  const report = table(rows);
  console.log(`\nsplit: ${sp}   (* = synthetic performance rendered from chord changes)\n\n${report}\n`);
  if (env.WRITE) {
    const git = execSync('git rev-parse --short HEAD').toString().trim();
    const date = new Date().toISOString().slice(0, 10);
    fs.mkdirSync('benchmarks', { recursive: true });
    fs.appendFileSync('benchmarks/history.jsonl', JSON.stringify({ date, git, split: sp, params: DEFAULT_PARAMS, rows }) + '\n');
    fs.writeFileSync('benchmarks/LATEST.md', `# Latest benchmark\n\n${date} · commit ${git} · split \`${sp}\` · reproduce with \`npm run fetch-data && npm run benchmark\`\n\nAll numbers are % of 250 ms samples (chords, keys) or F-measure (beats, bars). \`*\` = synthetic performance rendered from chord changes. See [docs/benchmark.md](../docs/benchmark.md) for what each column means.\n\n${report}\n`);
    console.log('wrote benchmarks/history.jsonl and benchmarks/LATEST.md');
  }
}, 3_600_000);
