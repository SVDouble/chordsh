import { mod12 } from './pitch';
import { Chord } from './chords';

// Voicing priority: guide tones (3rd, 7th) first, then colour, then 5th and root.
const PRIORITY: Record<string, number> = {
  '3': 0,
  b3: 0,
  '4': 0,
  '2': 1,
  b7: 1,
  '7': 1,
  bb7: 1,
  '6': 2,
  b5: 2,
  '#5': 2,
  '9': 3,
  b9: 3,
  '#9': 3,
  '#11': 3,
  '13': 3,
  b13: 3,
  '11': 4,
  '5': 5,
  '1': 6,
};

/** Distance between two voicings: every note travels to its nearest partner. */
export function vlCost(a: number[], b: number[]): number {
  let s = 0;
  for (const x of b) s += Math.min(...a.map((y) => Math.abs(x - y)));
  for (const y of a) s += Math.min(...b.map((x) => Math.abs(x - y)));
  return s;
}

function nearest(pc: number, ref: number, lo: number, hi: number): number {
  let best = lo,
    bd = Infinity;
  for (let n = lo; n <= hi; n++)
    if (mod12(n) === pc && Math.abs(n - ref) < bd) {
      bd = Math.abs(n - ref);
      best = n;
    }
  return best;
}

/**
 * Voice a chord as bass + close upper structure, choosing the inversion that moves
 * least from the previous voicing (so suggestions continue from your hand position).
 */
export function voiceChord(c: Chord, prev: number[] | null): number[] {
  const bassPc = c.rootless ? c.root : c.bass;
  const bass = nearest(bassPc, prev?.[0] ?? 43, 36, 52);
  const tones =
    c.tones.length <= 3
      ? c.tones
      : [...c.tones].sort((a, b) => (PRIORITY[a.role] ?? 4) - (PRIORITY[b.role] ?? 4)).slice(0, 4);
  const ups = [...new Set(tones.map((t) => mod12(c.root + t.interval)))].sort((a, b) => a - b);
  const prevUp = prev && prev.length > 1 ? prev.slice(1) : null;
  let best: number[] = [],
    bestCost = Infinity;
  for (let r = 0; r < ups.length; r++) {
    const rot = [...ups.slice(r), ...ups.slice(0, r)];
    for (let lo = 52; lo < 64; lo++) {
      if (mod12(lo) !== rot[0] || lo <= bass + 4) continue;
      const notes = [lo];
      for (let i = 1; i < rot.length; i++) {
        let n = notes[i - 1] + 1;
        while (mod12(n) !== rot[i]) n++;
        notes.push(n);
      }
      if (notes[notes.length - 1] > 79) continue;
      const centre = notes.reduce((s, x) => s + x, 0) / notes.length;
      const cost = (prevUp ? vlCost(prevUp, notes) : 0) + 0.3 * Math.abs(centre - 64);
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
    }
  }
  return [bass, ...best];
}
