/**
 * Coordinate search of harmonizer parameters on the *tune* split only (the test split stays unseen).
 *   npm run tune            (PER_CORPUS=10 by default; prints the best parameter set)
 */
import { it } from 'vitest';
import { DEFAULT_PARAMS, type HarmonizerParams } from '../src/engine/harmonizer';
import { add, evaluate, zero } from './eval/run';
import { corpora, loadPiece, pieceIds, split } from './eval/truth';

const PER = Number(process.env.PER_CORPUS ?? 10);
const sets = corpora().map((corpus) => ({
  corpus,
  pieces: pieceIds(corpus)
    .filter((id) => split(corpus, id) === 'tune')
    .slice(0, PER)
    .map((id) => loadPiece(corpus, id)),
}));

function objective(p: HarmonizerParams) {
  let score = 0;
  const parts: string[] = [];
  for (const s of sets) {
    const c = s.pieces.reduce((acc, x) => add(acc, evaluate(x, p).counts), zero());
    const n = Math.max(1, c.n);
    const seg = Math.abs(Math.log(Math.max(0.05, c.chordChanges / Math.max(1, c.truthChanges))));
    // pop key labels can't tell relative keys apart, so "close" counts there
    const key = s.corpus === 'pop909' ? c.keyClose / n : c.key1 / n;
    score += c.chord1 / n + 0.6 * (c.chordLive1 / n) + 0.8 * key - 0.3 * seg;
    parts.push(
      `${s.corpus} ${((100 * c.chord1) / n).toFixed(1)}/${((100 * c.chordLive1) / n).toFixed(1)} k${(100 * key).toFixed(0)}`,
    );
  }
  return { score: score / sets.length, summary: parts.join(' | ') };
}

type Path = [keyof HarmonizerParams] | ['prior', keyof HarmonizerParams['prior']];
const PATHS: Path[] = [
  ['chordChange'],
  ['transitionWeight'],
  ['keyChange'],
  ['extraNote'],
  ['missingTone'],
  ['keyFit'],
  ['saturation'],
  ['durExp'],
  ['heldDecayMs'],
  ['bassRoot'],
  ['bassInChord'],
  ['durationWeight'],
  ['bassOutside'],
  ['prior', 'secondary'],
  ['prior', 'borrowed'],
  ['prior', 'other'],
  ['prior', 'tonic'],
  ['prior', 'dominant'],
];
const get = (p: HarmonizerParams, k: Path) => (k.length === 1 ? (p[k[0]] as number) : p.prior[k[1]]);
const set = (p: HarmonizerParams, k: Path, v: number): HarmonizerParams =>
  k.length === 1 ? { ...p, [k[0]]: v } : { ...p, prior: { ...p.prior, [k[1]]: v } };

it('tune', () => {
  let best = structuredClone(DEFAULT_PARAMS),
    cur = objective(best);
  console.log('start', cur.score.toFixed(4), cur.summary);
  for (let round = 0; round < Number(process.env.ROUNDS ?? 2); round++)
    for (const k of PATHS)
      for (const f of [0.5, 0.75, 1.35, 2]) {
        const v0 = get(best, k);
        const cand = set(best, k, v0 === 0 ? (f - 1) * 0.2 : v0 * f);
        const r = objective(cand);
        if (r.score > cur.score + 1e-4) {
          best = cand;
          cur = r;
          console.log(`${k.join('.')} → ${get(best, k).toFixed(3)}  ${r.score.toFixed(4)}  ${r.summary}`);
        }
      }
  console.log('BEST', JSON.stringify(best));
}, 7_200_000);
