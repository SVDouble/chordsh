import { it } from 'vitest';
import { evaluateBars } from './eval/run';
import { bpsIds, loadBps, loadPop, popIds } from './eval/truth';
it('bars', () => {
  const rows = [...bpsIds().map((n) => ['bps-' + n, loadBps(n)] as const), ...popIds().map((id) => ['pop-' + id, loadPop(id)] as const)];
  const res = rows.map(([id, p]) => ({ id, ...evaluateBars(p) }));
  for (const src of ['bps', 'pop']) {
    const r = res.filter((x) => x.id.startsWith(src));
    const avg = (f: (x: (typeof r)[0]) => number, xs = r) => ((xs.reduce((a, x) => a + f(x), 0) / Math.max(1, xs.length)) * 100).toFixed(0) + '%';
    console.log(src, 'beat F', avg((x) => x.beatF), '· bar F', avg((x) => x.f), '· bar F in 4/4 pieces', avg((x) => x.f, r.filter((x) => x.meter === 4)), `(${r.filter((x) => x.meter === 4).length}/${r.length} in 4)`, '· meters', [...new Set(r.map((x) => x.meter))].join(','));
  }
});
