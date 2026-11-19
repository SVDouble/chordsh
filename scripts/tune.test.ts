/** Coordinate search of harmonizer parameters on the tuning half of the corpora.  EVAL=scripts/tune.test.ts npx vitest run --silent=false */
import { it } from 'vitest';
import { DEFAULT_PARAMS, type HarmonizerParams } from '../src/engine/harmonizer';
import { evaluateHarmonizer } from './eval/run';
import { loadBps, loadPop } from './eval/truth';

const bps = Array.from({ length: 12 }, (_, i) => loadBps(i + 1));
const pop = Array.from({ length: 15 }, (_, i) => loadPop(String(i + 1).padStart(3, '0')));

function objective(p: HarmonizerParams) {
  const a = bps.map((x) => evaluateHarmonizer(x, p)), b = pop.map((x) => evaluateHarmonizer(x, p));
  const m = (rs: typeof a, f: (s: (typeof a)[0]) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  const seg = (rs: typeof a) => Math.abs(Math.log(m(rs, (r) => r.overSeg)));
  const score =
    m(a, (r) => r.chordFinal) + 0.7 * m(a, (r) => r.chordLive) + m(a, (r) => r.keyFinal) + 0.5 * m(a, (r) => r.keyLive) +
    m(b, (r) => r.chordFinal) + 0.7 * m(b, (r) => r.chordLive) + m(b, (r) => r.keyCloseFinal) -
    0.3 * (seg(a) + seg(b));
  return { score, summary: `bps chord ${(m(a, (r) => r.chordFinal) * 100).toFixed(1)}/${(m(a, (r) => r.chordLive) * 100).toFixed(1)} key ${(m(a, (r) => r.keyFinal) * 100).toFixed(1)} seg ${m(a, (r) => r.overSeg).toFixed(2)} | pop chord ${(m(b, (r) => r.chordFinal) * 100).toFixed(1)}/${(m(b, (r) => r.chordLive) * 100).toFixed(1)} key~ ${(m(b, (r) => r.keyCloseFinal) * 100).toFixed(1)} seg ${m(b, (r) => r.overSeg).toFixed(2)}` };
}

type Path = [keyof HarmonizerParams] | ['prior', keyof HarmonizerParams['prior']];
const PATHS: Path[] = [['chordChange'], ['keyChange'], ['extraNote'], ['missingTone'], ['keyFit'], ['saturation'], ['durExp'], ['heldDecayMs'],
  ['bassRoot'], ['bassOutside'], ['prior', 'secondary'], ['prior', 'borrowed'], ['prior', 'other'], ['prior', 'tonic'], ['prior', 'dominant']];
const get = (p: HarmonizerParams, k: Path) => (k.length === 1 ? (p[k[0]] as number) : p.prior[k[1]]);
const set = (p: HarmonizerParams, k: Path, v: number): HarmonizerParams =>
  k.length === 1 ? { ...p, [k[0]]: v } : { ...p, prior: { ...p.prior, [k[1]]: v } };

it('tune', () => {
  let best = structuredClone(DEFAULT_PARAMS), cur = objective(best);
  console.log('start', cur.score.toFixed(4), cur.summary);
  for (let round = 0; round < 2; round++)
    for (const k of PATHS)
      for (const f of [0.5, 0.75, 1.35, 2]) {
        const v0 = get(best, k);
        const cand = set(best, k, v0 === 0 ? (f - 1) * 0.2 : v0 * f);
        const r = objective(cand);
        if (r.score > cur.score + 1e-4) { best = cand; cur = r; console.log(`${k.join('.')} → ${get(best, k).toFixed(3)}  ${r.score.toFixed(4)}  ${r.summary}`); }
      }
  console.log('BEST', JSON.stringify(best));
}, 3_600_000);
