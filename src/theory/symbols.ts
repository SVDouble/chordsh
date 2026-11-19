import { mod12 } from './pitch';
import { type Chord, chordFromIntervals } from './chords';

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEGREE: Record<string, number> = { '2': 2, '4': 5, '5': 7, '9': 2, '11': 5, '13': 9 };
const TENSION = /(add)?([b#])?(13|11|9|5|4|2)/g;

export function parseNote(s: string): { pc: number; len: number } | null {
  const m = /^([A-G])([#b♯♭]*)/.exec(s);
  if (!m) return null;
  let pc = LETTER_PC[m[1]];
  for (const ch of m[2]) pc += ch === '#' || ch === '♯' ? 1 : -1;
  return { pc: mod12(pc), len: m[0].length };
}

/**
 * Parse a lead-sheet chord symbol: Dm7, D-7, CΔ7, Bø, B°7, G7alt, G7(♭9,♯11),
 * C6/9, Fmaj7♯11, Asus4, C7sus4, Cm(maj7), E♭+, F/A, C7(no3). Returns null if unreadable.
 */
export function parseChordSymbol(symbol: string): Chord | null {
  const s = symbol.trim();
  const root = parseNote(s);
  if (!root) return null;
  let rest = s.slice(root.len);
  let bass: number | undefined;
  const slash = rest.lastIndexOf('/');
  if (slash >= 0) {
    const b = parseNote(rest.slice(slash + 1));
    if (b && b.len === rest.length - slash - 1) {
      bass = b.pc;
      rest = rest.slice(0, slash);
    }
  }
  let q = rest
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/𝄫/g, 'bb')
    .replace(/[()\s,]/g, '')
    .replace(/Δ/g, 'maj')
    .replace(/^M(?=$|7|9|11|13)/, 'maj')
    .replace(/^(-|min|mi)/, 'm')
    .replace(/^ø7?/, 'm7b5')
    .replace(/^(°|o)/, 'dim')
    .replace(/^\+/, 'aug')
    .replace(/\+/, '#5');

  let third = 4,
    fifth = 7,
    seventh = -1;
  const ext: number[] = [];
  const take = (re: RegExp) => {
    const m = re.exec(q);
    if (m) q = q.replace(re, '');
    return !!m;
  };
  const dim = take(/^dim/);
  if (dim) {
    third = 3;
    fifth = 6;
  } else if (take(/^aug/)) fifth = 8;
  else if (take(/^m(?!aj)/)) third = 3;
  if (take(/sus2/)) third = 2;
  else if (take(/sus4?/)) third = 5;
  if (take(/no3/)) third = -1;
  if (take(/no5/)) fifth = -1;
  if (take(/^5$/)) third = -1;
  if (take(/alt/)) {
    seventh = 10;
    fifth = -1;
    ext.push(1, 3, 8);
  }
  const maj = take(/maj/);
  const num = /^(6\/9|69|13|11|9|7|6)/.exec(q);
  if (num) {
    q = q.slice(num[0].length);
    const n = num[1];
    if (n === '6') ext.push(9);
    else if (n === '6/9' || n === '69') ext.push(9, 2);
    else {
      seventh = maj ? 11 : dim && n === '7' ? 9 : 10;
      if (n !== '7') ext.push(2);
      if (n === '11' || (n === '13' && third === 3)) ext.push(5);
      if (n === '13') ext.push(9);
    }
  }
  for (const [, , acc, d] of q.matchAll(TENSION)) {
    const v = mod12(DEGREE[d] + (acc === 'b' ? -1 : acc === '#' ? 1 : 0));
    if (d === '5') fifth = v;
    else ext.push(v);
  }
  if (q.replace(TENSION, '') !== '') return null; // leftover text we don't understand
  const iv = [third, fifth, seventh, ...ext].filter((x) => x >= 0);
  return chordFromIntervals(root.pc, iv, bass);
}
