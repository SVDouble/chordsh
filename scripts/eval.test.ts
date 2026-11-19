/**
 * Benchmark the engine against annotated real music.
 *   npm run fetch-data                       (once)
 *   npm run eval                             → summary over both corpora
 *   PIECE=bps-5 BARS=40 npm run eval          → one piece with a bar-by-bar timeline
 *   CORPUS=pop LIMIT=10 npm run eval
 */
import { it } from 'vitest';
import { type Score, evaluate, evaluateHarmonizer } from './eval/run';
import { bpsIds, loadBps, loadPop, popIds } from './eval/truth';

const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5);

function table(title: string, rows: Score[]) {
  const avg = (f: (s: Score) => number) => rows.reduce((a, s) => a + f(s) * s.samples, 0) / Math.max(1, rows.reduce((a, s) => a + s.samples, 0));
  const mean = (f: (s: Score) => number) => rows.reduce((a, s) => a + f(s), 0) / Math.max(1, rows.length);
  const line = (s: Pick<Score, 'rootLive' | 'chordLive' | 'chordFinal' | 'keyLive' | 'keyFinal' | 'keyCloseFinal' | 'overSeg'>, id: string, extra = '') =>
    `${id.padEnd(10)} ${pct(s.rootLive)} ${pct(s.chordLive)} ${pct(s.chordFinal)}   ${pct(s.keyLive)} ${pct(s.keyFinal)} ${pct(s.keyCloseFinal)}   ${s.overSeg.toFixed(2).padStart(5)} ${extra}`;
  console.log(`\n${title}\n${'piece'.padEnd(10)}  root chord chord    key   key close   over-  key changes\n${''.padEnd(10)}  live  live final   live final final   seg    engine/truth`);
  for (const s of rows) console.log(line(s, s.id, `${s.keyChanges}/${s.truthKeyChanges}`));
  console.log(line({ rootLive: avg((s) => s.rootLive), chordLive: avg((s) => s.chordLive), chordFinal: avg((s) => s.chordFinal), keyLive: avg((s) => s.keyLive), keyFinal: avg((s) => s.keyFinal), keyCloseFinal: avg((s) => s.keyCloseFinal), overSeg: mean((s) => s.overSeg) }, 'ALL', `${rows.reduce((a, s) => a + s.keyChanges, 0)}/${rows.reduce((a, s) => a + s.truthKeyChanges, 0)}`));
}

it('eval', () => {
  const only = process.env.PIECE;
  const limit = Number(process.env.LIMIT ?? 1e9);
  const bars = Number(process.env.BARS ?? 0);
  const corpus = process.env.CORPUS;
  const from = Number(process.env.FROM ?? 0);
  const run = process.env.ENGINE === 'session' ? (p: Parameters<typeof evaluate>[0], o?: { timelineBars?: number }) => evaluate(p, o) : (p: Parameters<typeof evaluate>[0], o?: { timelineBars?: number }) => evaluateHarmonizer(p, undefined, o);
  if (only) {
    const piece = only.startsWith('bps-') ? loadBps(Number(only.slice(4))) : loadPop(only.slice(4));
    const s = run(piece, { timelineBars: bars || 32 });
    console.log(`\n${piece.title}\n${'bar'.padEnd(9)} | ${'truth (key:roman)'.padEnd(28)} | ${'engine (hindsight)'.padEnd(40)} | key\n${s.timeline.join('\n')}`);
    table(piece.title, [s]);
    return;
  }
  if (corpus !== 'pop') table('BPS-FH — Beethoven sonatas (expert functional analysis)', bpsIds().slice(from, limit).map((n) => run(loadBps(n))));
  if (corpus !== 'bps') table('POP909 — pop piano arrangements (chord labels)', popIds().slice(from, limit).map((id) => run(loadPop(id))));
});
