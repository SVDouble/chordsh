import { Chord, chordName, isDominant } from '../theory/chords';
import { mod12 } from '../theory/pitch';
import { Roman, analyzeRoman, baseNumeral } from '../theory/roman';
import { patternsAtEnd } from '../theory/patterns';
import { Key, keyFromIndex } from '../theory/scales';
import { parseChordSymbol } from '../theory/symbols';
import { KeyDetector } from './keyDetector';

export interface ChartChord {
  i: number;
  symbol: string;
  chord: Chord;
  bar: number;
  section?: string;
  roman?: Roman;
}
export interface Insight { from: number; to: number; text: string; where: string }
export interface Chart {
  title: string;
  text: string;
  chords: ChartChord[];
  errors: string[];
  key: Key | null;
  insights: Insight[];
}

/**
 * Chart text: chords separated by spaces, `|` bar lines (optional — otherwise one chord per bar),
 * `[Section]` labels, `%` repeats the previous chord, `//` comments, N.C. is ignored.
 */
export function parseChart(text: string, title = 'Untitled'): Chart {
  const chords: ChartChord[] = [];
  const errors: string[] = [];
  const usesBars = text.includes('|');
  let bar = 1, section: string | undefined, barHasChord = false;
  for (const raw of text.split('\n')) {
    let line = raw.replace(/\/\/.*$/, '').trim();
    const sec = /^\[(.+?)\]/.exec(line);
    if (sec) { section = sec[1]; line = line.slice(sec[0].length); }
    for (const tok of line.replace(/\|/g, ' | ').split(/\s+/)) {
      if (!tok || /^N\.?C\.?$/i.test(tok)) continue;
      if (/^[|:]+$/.test(tok)) { if (barHasChord) bar++; barHasChord = false; continue; }
      const prev = chords[chords.length - 1];
      const chord = tok === '%' ? prev?.chord : parseChordSymbol(tok);
      if (!chord) { errors.push(tok); continue; }
      const b = usesBars ? bar : chords.length + 1;
      chords.push({ i: chords.length, symbol: tok === '%' ? prev!.symbol : tok, chord, bar: b, section });
      section = undefined;
      barHasChord = true;
    }
  }
  return analyzeChart({ title, text, chords, errors, key: null, insights: [] });
}

/** Key, numerals and the "big picture" (cadences, tonicizations, borrowed chords). */
export function analyzeChart(chart: Chart, key?: Key): Chart {
  const cs = chart.chords.map((c) => c.chord);
  let k = key ?? null;
  if (!k && cs.length) {
    const det = new KeyDetector(Infinity, 1);
    cs.forEach((c, i) => {
      det.addChord(c, 1 + i * 1000);
      for (const m of patternsAtEnd(cs.slice(0, i + 1), null))
        if (m.target) det.addCadence(m.target, m.kind === 'ii-V-I' ? 1.5 : m.kind === 'ii-V' ? 0.3 : 0.6, 1 + i * 1000);
    });
    const p = det.probabilities();
    let best = 0;
    for (let i = 1; i < 24; i++) if (p[i] > p[best]) best = i;
    k = keyFromIndex(best);
  }
  // Blues: when the tonic itself is usually a dominant 7th, I7 and IV7 are the home sound, not applied chords.
  const tonics = k ? cs.filter((c) => c.root === k!.tonic) : [];
  const blues = !!k && k.mode === 'major' && tonics.length > 0 && tonics.filter(isDominant).length >= tonics.length / 2;
  const raw: Omit<Insight, 'where'>[] = [];
  chart.chords.forEach((c, i) => {
    if (!k) return;
    const deg = mod12(c.chord.root - k.tonic);
    c.roman = blues && isDominant(c.chord) && (deg === 0 || deg === 5)
      ? { numeral: baseNumeral(deg, 'maj') + '7', kind: 'blues', func: deg ? 'PD' : 'T', explain: 'Blues dominant — in the blues, dominant 7ths on I and IV are the home sound, not tensions to resolve.' }
      : analyzeRoman(c.chord, k, cs[i + 1]);
    if (c.roman.kind !== 'diatonic')
      raw.push({ from: i, to: i, text: `${chordName(c.chord, k)} — ${c.roman.numeral}: ${c.roman.explain}` });
    const found = patternsAtEnd(cs.slice(Math.max(0, i - 7), i + 1), k);
    const m = found.find((x) => x.kind !== 'ii-V' && x.kind !== 'cycle') ?? found.find((x) => x.kind === 'cycle');
    if (m) {
      const from = i - m.length + 1;
      const last = raw[raw.length - 1];
      if (last && last.from === from && last.text.startsWith('Circle')) raw.pop();
      raw.push({ from, to: i, text: m.label });
    }
  });
  // Group repeated observations: "bars 1, 3, 5: …"
  const bar = (i: number) => chart.chords[i].bar;
  const span = (x: Omit<Insight, 'where'>) => (bar(x.from) === bar(x.to) ? `${bar(x.from)}` : `${bar(x.from)}–${bar(x.to)}`);
  const grouped = new Map<string, Insight>();
  for (const x of raw) {
    const g = grouped.get(x.text);
    if (g) g.where += `, ${span(x)}`;
    else grouped.set(x.text, { ...x, where: span(x) });
  }
  const insights = [...grouped.values()].map((x) => ({ ...x, where: (x.where.includes(',') || x.where.includes('–') ? 'bars ' : 'bar ') + x.where }));
  if (blues) insights.unshift({ from: 0, to: 0, where: 'form', text: 'Blues — dominant 7ths on I and IV are the home colour; the real cadences are the ii–Vs.' });
  return { ...chart, key: k, insights };
}

/** Turn a list of chord names (e.g. what you just played) into chart text, four bars per line. */
export function toChartText(names: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < names.length; i += 4) lines.push('| ' + names.slice(i, i + 4).join(' | ') + ' |');
  return lines.join('\n');
}

/** Built-in practice charts (generic forms, no copyrighted songs). */
export const EXAMPLES: { title: string; text: string }[] = [
  {
    title: 'Jazz blues in F',
    text: '[Head]\n| F7 | B♭7 | F7 | Cm7 F7 |\n| B♭7 | B°7 | F7 | D7 |\n| Gm7 | C7 | F7 D7 | Gm7 C7 |',
  },
  {
    title: 'Pop loop → relative minor',
    text: '[Verse]\n| C | G/B | Am | F |\n| C | G | F | F |\n[Chorus]\n| Am | F | C | G |\n| Am | F | E7 | E7 |',
  },
  {
    title: 'ii–V–I around the cycle',
    text: '| Dm7 | G7 | Cmaj7 | Cmaj7 |\n| Cm7 | F7 | B♭maj7 | B♭maj7 |\n| B♭m7 | E♭7 | A♭maj7 | A♭maj7 |\n| A♭m7 | D♭7 | G♭maj7 | Gm7 C7 |',
  },
  {
    title: 'Minor ballad with borrowed colour',
    text: '| Am | Dm7 | G7 | Cmaj7 |\n| Fmaj7 | Bm7♭5 | E7 | Am |\n| Am | F | Fm | C/G |\n| D7/F♯ | Fm6 | E7sus4 E7 | Am |',
  },
];
