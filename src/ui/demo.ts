import { session, synth } from './store.svelte';

// [left hand + right hand chord, melody notes] per bar.
// C major ii–V–I, a secondary dominant, then Fm7 (borrowed iv) pivots into E♭ major.
const BARS: [number[], number[]][] = [
  [[36, 52, 55, 59], [76, 74]],         // Cmaj7
  [[45, 55, 60, 64], [72, 76]],         // Am7
  [[38, 53, 57, 60], [77, 76]],         // Dm7
  [[43, 53, 59, 62], [74, 71]],         // G7
  [[36, 52, 55, 59], [72]],             // Cmaj7
  [[45, 55, 61, 64], [73, 76]],         // A7 = V7/ii
  [[38, 53, 57, 60], [77]],             // Dm7
  [[43, 53, 59, 62], [74]],             // G7
  [[41, 56, 60, 63], [75, 72]],         // Fm7 = iv borrowed = ii in E♭
  [[46, 56, 62, 65], [74, 70]],         // B♭7
  [[39, 55, 58, 62], [79, 75]],         // E♭maj7
  [[44, 55, 60, 63], [72]],             // A♭maj7
  [[41, 56, 60, 63], [75]],             // Fm7
  [[46, 56, 62, 65], [74]],             // B♭7
  [[39, 55, 58, 62], [75]],             // E♭maj7
];

let timers: ReturnType<typeof setTimeout>[] = [];

export function stopDemo() {
  timers.forEach(clearTimeout);
  timers = [];
}

/** Feed the progression through the engine (as if played) and the synth. */
export function runDemo(bpm = 96, onEnd: () => void = () => {}) {
  stopDemo();
  const bar = (60 / bpm) * 2 * 1000;
  const at = (ms: number, f: () => void) => timers.push(setTimeout(f, ms));
  BARS.forEach(([chord, mel], i) => {
    const t = i * bar;
    at(t, () => { chord.forEach((n) => session.noteOn(n, 70)); synth.play(chord, 0, bar / 1000, 0.5); });
    at(t + bar - 40, () => chord.forEach((n) => session.noteOff(n)));
    mel.forEach((m, j) => {
      const mt = t + 250 + (j * bar) / mel.length;
      at(mt, () => { session.noteOn(m, 95); synth.play([m], 0, bar / mel.length / 1000, 0.9); });
      at(mt + bar / mel.length - 60, () => session.noteOff(m));
    });
  });
  at(BARS.length * bar, onEnd);
}
