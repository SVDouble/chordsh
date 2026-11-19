import { INTERVAL_NAME, Spelling, mod12, spellFrom, spellingToString } from './pitch';
import { Key, keyPcSet, spellInKey, tonicSpelling } from './scales';

export type Quality = 'maj' | 'min' | 'dim' | 'aug' | 'sus4' | 'sus2' | 'power';
export type Seventh = 'none' | 'b7' | 'maj7' | 'dim7';

export interface ChordTone {
  /** Semitones above the root. */
  interval: number;
  /** Function of the tone: '1', 'b3', '5', 'b7', '9', '#11', … */
  role: string;
  /** Letter steps above the root (for correct spelling). */
  step: number;
}

export interface Chord {
  root: number;
  bass: number;
  quality: Quality;
  seventh: Seventh;
  sixth: boolean;
  flat5: boolean;
  tensions: string[];
  suffix: string;
  tones: ChordTone[];
  /** The root is implied, not played (jazz rootless voicing). */
  rootless: boolean;
  /** 0 = root position, 1–3 = inversions, -1 = another tone in the bass. */
  inversion: number;
  score: number;
}

export interface Identification {
  kind: 'none' | 'note' | 'interval' | 'chord';
  best: Chord | null;
  alternatives: Chord[];
  notes: number[];
  intervalName?: string;
}

const TENSIONS: Record<number, { role: string; step: number }> = {
  1: { role: 'b9', step: 1 },
  2: { role: '9', step: 1 },
  3: { role: '#9', step: 1 },
  5: { role: '11', step: 3 },
  6: { role: '#11', step: 3 },
  8: { role: 'b13', step: 5 },
  9: { role: '13', step: 5 },
};
const TENSION_ORDER = [1, 2, 3, 5, 6, 8, 9];
const CORE_ROLES = new Set(['1', '3', 'b3', '4', '2', '5', 'b5', '#5', 'b7', '7', 'bb7', '6']);

export const prettyRole = (r: string): string => r.replace('bb', '𝄫').replace('b', '♭').replace('#', '♯');

/**
 * Interpret a pitch-class set (as intervals above a candidate root) as a chord.
 * Returns null when the reading is not viable. The score expresses how natural
 * the reading is; the caller compares readings across all 12 candidate roots.
 */
function analyzeRoot(root: number, rel: Set<number>, bassRel: number): Chord | null {
  const has = (i: number) => rel.has(i);
  const used = new Set<number>();
  const tones: ChordTone[] = [];
  const add = (interval: number, role: string, step: number) => {
    used.add(interval);
    tones.push({ interval, role, step });
  };
  const rootPresent = has(0);
  let score = 0;
  if (rootPresent) add(0, '1', 0);
  else score -= 3.5;

  let quality: Quality;
  if (has(4)) { quality = 'maj'; add(4, '3', 2); score += 2; }
  else if (has(3)) { quality = 'min'; add(3, 'b3', 2); score += 2; }
  else if (has(5)) { quality = 'sus4'; add(5, '4', 3); score += 0.7; }
  else if (has(2)) { quality = 'sus2'; add(2, '2', 1); score += 0.4; }
  else { quality = 'power'; score -= 0.5; }

  if (has(7)) { add(7, '5', 4); score += 0.6; }
  else if (quality === 'min' && has(6)) { quality = 'dim'; add(6, 'b5', 4); score += 0.6; }
  else if (quality === 'maj' && has(8)) { quality = 'aug'; add(8, '#5', 4); score += 0.3; }

  // Suspended chords without a perfect 5th are rarely the intended reading.
  if ((quality === 'sus4' || quality === 'sus2') && !has(7)) score -= 1.2;

  let seventh: Seventh = 'none';
  if (has(10)) { seventh = 'b7'; add(10, 'b7', 6); score += 0.8; }
  else if (has(11)) { seventh = 'maj7'; add(11, '7', 6); score += 0.7; }
  else if (quality === 'dim' && has(9)) { seventh = 'dim7'; add(9, 'bb7', 6); score += 0.9; }

  let flat5 = false;
  if (quality === 'maj' && seventh === 'b7' && !has(7) && has(6)) {
    flat5 = true;
    add(6, 'b5', 4);
    score += 0.1;
  }

  let sixth = false;
  if (seventh === 'none' && has(9) && quality !== 'power') {
    sixth = true;
    add(9, '6', 5);
    score += 0.2;
  }

  const domLike = seventh === 'b7' && (quality === 'maj' || quality === 'aug' || quality === 'sus4');
  const tensions: string[] = [];
  for (const i of TENSION_ORDER) {
    if (!has(i) || used.has(i)) continue;
    let pen: number;
    switch (i) {
      case 1: pen = domLike ? 0.7 : 2.5; break; // ♭9 really only lives on dominants
      case 3: pen = domLike ? 0.7 : 2.5; break; // ♯9 likewise
      case 2: pen = 0.15; break;
      case 5: pen = quality === 'maj' || quality === 'aug' ? 1.4 : 0.3; break; // 11 over a major 3rd clashes
      case 6: pen = quality === 'min' ? 1.0 : 0.45; break;
      case 8: pen = domLike ? 0.7 : 2.5; break;
      default: pen = seventh === 'none' ? 0.7 : 0.2; // 13
    }
    score -= pen;
    add(i, TENSIONS[i].role, TENSIONS[i].step);
    tensions.push(TENSIONS[i].role);
  }
  if (has(10) && has(11)) {
    add(11, 'maj7', 6);
    tensions.push('maj7');
    score -= 3;
  }

  const hasThird = quality === 'maj' || quality === 'min' || quality === 'dim' || quality === 'aug';
  if (!rootPresent && (!hasThird || seventh === 'none')) return null;

  let inversion = 0;
  if (rootPresent && bassRel === 0) score += 2.5;
  else {
    const role = tones.find((t) => t.interval === bassRel)?.role ?? '';
    if (role === '3' || role === 'b3') inversion = 1;
    else if (role === '5' || role === 'b5' || role === '#5') inversion = 2;
    else if (role === 'b7' || role === '7' || role === 'bb7') inversion = 3;
    else {
      inversion = -1;
      score -= role === '6' ? 1.0 : 0.4;
    }
  }
  score -= 0.08 * tones.length;

  tones.sort((a, b) => a.step - b.step || a.interval - b.interval);
  return {
    root,
    bass: mod12(root + bassRel),
    quality,
    seventh,
    sixth,
    flat5,
    tensions,
    suffix: buildSuffix(quality, seventh, sixth, flat5, tensions),
    tones,
    rootless: !rootPresent,
    inversion,
    score,
  };
}

function buildSuffix(q: Quality, seventh: Seventh, sixth: boolean, flat5: boolean, tensions: string[]): string {
  const t = new Set(tensions);
  const shown = new Set<string>();
  /** Highest natural extension (9 / 11 / 13) when a 7th is present. */
  const ext = (absorb11: boolean): string | null => {
    if (t.has('13')) {
      shown.add('13');
      shown.add('9');
      if (absorb11) shown.add('11');
      return '13';
    }
    if (t.has('11')) {
      shown.add('11');
      shown.add('9');
      return '11';
    }
    if (t.has('9')) {
      shown.add('9');
      return '9';
    }
    return null;
  };
  const adds = (): string => {
    const a = ['9', '11', '13'].filter((x) => t.has(x));
    a.forEach((x) => shown.add(x));
    return a.length ? 'add' + a.join(',') : '';
  };
  let s: string;
  switch (q) {
    case 'maj':
      if (seventh === 'b7') s = ext(false) ?? '7';
      else if (seventh === 'maj7') s = 'maj' + (ext(false) ?? '7');
      else if (sixth) { s = t.has('9') ? '6/9' : '6'; shown.add('9'); }
      else s = adds();
      break;
    case 'aug':
      if (seventh === 'b7') s = (ext(false) ?? '7') + '♯5';
      else if (seventh === 'maj7') s = 'maj' + (ext(false) ?? '7') + '♯5';
      else s = '+' + adds();
      break;
    case 'min':
      if (seventh === 'b7') s = 'm' + (ext(true) ?? '7');
      else if (seventh === 'maj7') s = 'm(maj' + (ext(false) ?? '7') + ')';
      else if (sixth) { s = t.has('9') ? 'm6/9' : 'm6'; shown.add('9'); }
      else { const a = adds(); s = a ? `m(${a})` : 'm'; }
      break;
    case 'dim':
      if (seventh === 'b7') { const e = ext(true); s = e ? `m${e}♭5` : 'm7♭5'; }
      else if (seventh === 'dim7') s = '°7';
      else s = '°';
      break;
    case 'sus4':
      if (seventh === 'b7') s = (ext(false) ?? '7') + 'sus4';
      else if (seventh === 'maj7') s = 'maj' + (ext(false) ?? '7') + 'sus4';
      else if (sixth) s = '6sus4';
      else { const a = adds(); s = 'sus4' + (a ? `(${a})` : ''); }
      break;
    case 'sus2':
      s = seventh === 'b7' ? '7sus2' : seventh === 'maj7' ? 'maj7sus2' : sixth ? '6sus2' : 'sus2';
      break;
    default:
      s = seventh === 'b7' ? '7(no3)' : seventh === 'maj7' ? 'maj7(no3)' : '5';
  }
  if (flat5) s += '♭5';
  const rest = tensions.filter((x) => !shown.has(x)).map(prettyRole);
  if (rest.length) s += `(${rest.join(',')})`;
  return s;
}

export const isDominant = (c: Chord): boolean =>
  c.seventh === 'b7' && (c.quality === 'maj' || c.quality === 'aug' || c.quality === 'sus4');
export const isDominantLike = (c: Chord): boolean =>
  isDominant(c) || (c.quality === 'maj' && c.seventh === 'none' && !c.sixth);

/** Root, third, fifth, seventh/sixth — the tones that define function (no tensions). */
export function corePcs(c: Chord): number[] {
  const out = c.tones.filter((t) => CORE_ROLES.has(t.role)).map((t) => mod12(c.root + t.interval));
  if (c.rootless) out.unshift(c.root);
  return out;
}
export function chordPcs(c: Chord): number[] {
  const out = c.tones.map((t) => mod12(c.root + t.interval));
  if (c.rootless) out.unshift(c.root);
  return out;
}

/** Identify the chord formed by a set of MIDI notes (lowest = bass). */
export function identify(notes: number[], key?: Key | null): Identification {
  const sorted = [...new Set(notes)].sort((a, b) => a - b);
  const base: Identification = { kind: 'none', best: null, alternatives: [], notes: sorted };
  if (!sorted.length) return base;
  const pcs = [...new Set(sorted.map(mod12))];
  const bass = mod12(sorted[0]);
  if (pcs.length === 1) return { ...base, kind: 'note' };

  const keySet = key ? keyPcSet(key) : null;
  const cands: Chord[] = [];
  for (let root = 0; root < 12; root++) {
    if (pcs.length === 2 && root !== bass) continue;
    if (!pcs.includes(root) && pcs.length < 4) continue;
    const rel = new Set(pcs.map((p) => mod12(p - root)));
    const c = analyzeRoot(root, rel, mod12(bass - root));
    if (!c) continue;
    if (keySet && corePcs(c).every((p) => keySet.has(p))) c.score += 0.5;
    cands.push(c);
  }
  cands.sort((a, b) => b.score - a.score);

  if (pcs.length === 2) {
    const other = pcs.find((p) => p !== bass)!;
    const c = cands[0];
    const meaningful =
      !!c && (c.quality === 'maj' || c.quality === 'min' || c.tones.some((t) => ['5', 'b7', '7'].includes(t.role)));
    return { ...base, kind: 'interval', intervalName: INTERVAL_NAME[mod12(other - bass)], best: meaningful ? c : null };
  }
  const seen = new Set<string>();
  const unique = cands.filter((c) => {
    const id = `${c.root}${c.suffix}${c.bass}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { ...base, kind: 'chord', best: unique[0] ?? null, alternatives: unique.slice(1, 4) };
}

export function rootSpelling(c: Chord, key?: Key | null): Spelling {
  if (key) return spellInKey(c.root, key);
  return tonicSpelling({ tonic: c.root, mode: c.quality === 'min' || c.quality === 'dim' ? 'minor' : 'major' });
}

export function chordName(c: Chord, key?: Key | null): string {
  const r = rootSpelling(c, key);
  let s = spellingToString(r) + c.suffix;
  if (!c.rootless && c.bass !== c.root) {
    const tone = c.tones.find((t) => mod12(c.root + t.interval) === c.bass);
    s += '/' + spellingToString(spellFrom(r, tone?.step ?? 0, c.bass));
  }
  return s;
}

export function toneNames(c: Chord, key?: Key | null): { name: string; role: string; implied?: boolean }[] {
  const r = rootSpelling(c, key);
  const out: { name: string; role: string; implied?: boolean }[] = c.tones.map((t) => ({
    name: spellingToString(spellFrom(r, t.step, mod12(c.root + t.interval))),
    role: t.role === '1' ? 'R' : prettyRole(t.role),
  }));
  if (c.rootless) out.unshift({ name: spellingToString(r), role: 'R', implied: true });
  return out;
}

export function inversionLabel(c: Chord): string {
  if (c.rootless) return 'rootless voicing';
  if (c.inversion >= 0) return ['root position', '1st inversion', '2nd inversion', '3rd inversion'][c.inversion];
  const t = c.tones.find((x) => mod12(c.root + x.interval) === c.bass);
  return `${t ? prettyRole(t.role) : 'other tone'} in the bass`;
}

const ROLE_BY_INTERVAL = ['R', '♭9', '9', '♯9', '3', '11', '♯11', '5', '♭13', '13', '♭7', '7'];

/** How a (melody) note relates to a chord: chord tone, usable tension, or outside. */
export function noteRole(c: Chord, pc: number): { label: string; kind: 'chord' | 'tension' | 'outside' } {
  const i = mod12(pc - c.root);
  if (i === 0) return { label: 'R', kind: 'chord' };
  const t = c.tones.find((x) => x.interval === i);
  if (t) return { label: prettyRole(t.role), kind: CORE_ROLES.has(t.role) ? 'chord' : 'tension' };
  const avail: Record<number, string> = { 2: '9', 9: c.seventh === 'none' ? '6' : '13', 6: '♯11' };
  if (c.quality === 'min' || c.quality === 'dim' || c.quality === 'sus4') avail[5] = '11';
  if (isDominant(c)) Object.assign(avail, { 1: '♭9', 3: '♯9', 8: '♭13' });
  if (avail[i]) return { label: avail[i], kind: 'tension' };
  return { label: ROLE_BY_INTERVAL[i], kind: 'outside' };
}

/** Chord vocabulary used when the app generates chords itself. */
export const KINDS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  maj7: [0, 4, 7, 11],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  mMaj7: [0, 3, 7, 11],
  '7sus4': [0, 5, 7, 10],
  '7b9': [0, 4, 7, 10, 1],
  '9': [0, 4, 7, 10, 2],
  m9: [0, 3, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  '13': [0, 4, 7, 10, 2, 9],
} as const satisfies Record<string, readonly number[]>;
export type KindName = keyof typeof KINDS;

/** Build a chord from intervals above a root (root is always included). */
export function chordFromIntervals(root: number, intervals: Iterable<number>, bass?: number): Chord {
  const r = mod12(root);
  const rel = new Set([0, ...[...intervals].map(mod12)]);
  return analyzeRoot(r, rel, mod12((bass ?? r) - r))!;
}

export const chordOf = (root: number, kind: KindName, bass?: number): Chord => chordFromIntervals(root, KINDS[kind], bass);
