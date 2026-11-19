import { mod12, spellFrom, spellingToString } from '../theory/pitch';
import { Chord, KindName, chordName, chordOf, corePcs, isDominant, isDominantLike, rootSpelling } from '../theory/chords';
import { DIATONIC_TRIADS, Func, analyzeRoman, baseNumeral, degreeNumeral, isDiatonic, numeralOf } from '../theory/roman';
import { ALL_KEYS, Key, Mode, commonTones, keyEq, keyIndex, keyPcSet, keyShort, nameInKey, parallelKey, relativeKey } from '../theory/scales';
import { vlCost, voiceChord } from '../theory/voicing';

/**
 * The coach: everything here is written in scale degrees (semitones above the
 * tonic), so the same advice works in every key.
 */
export type Style = 'jazz' | 'triads';

const DEGREES: Record<Mode, { deg: number; triad: KindName; jazz: KindName }[]> = {
  major: [
    { deg: 0, triad: 'maj', jazz: 'maj7' }, { deg: 2, triad: 'min', jazz: 'm7' }, { deg: 4, triad: 'min', jazz: 'm7' },
    { deg: 5, triad: 'maj', jazz: 'maj7' }, { deg: 7, triad: 'maj', jazz: '7' }, { deg: 9, triad: 'min', jazz: 'm7' },
    { deg: 11, triad: 'dim', jazz: 'm7b5' },
  ],
  minor: [
    { deg: 0, triad: 'min', jazz: 'm7' }, { deg: 2, triad: 'dim', jazz: 'm7b5' }, { deg: 3, triad: 'maj', jazz: 'maj7' },
    { deg: 5, triad: 'min', jazz: 'm7' }, { deg: 7, triad: 'maj', jazz: '7' }, { deg: 8, triad: 'maj', jazz: 'maj7' },
    { deg: 10, triad: 'maj', jazz: '7' }, { deg: 11, triad: 'dim', jazz: 'dim7' },
  ],
};

export function degreeChord(key: Key, deg: number, style: Style): Chord {
  const d = DEGREES[key.mode].find((x) => x.deg === mod12(deg));
  return chordOf(key.tonic + deg, d ? (style === 'jazz' ? d.jazz : d.triad) : 'maj');
}
const dominantOf = (key: Key, style: Style) => chordOf(key.tonic + 7, style === 'jazz' && key.mode === 'minor' ? '7b9' : '7');

// ───────────────────────────── next moves ─────────────────────────────

export interface NextMove {
  chord: Chord;
  name: string;
  roman: string;
  prob: number;
  why: string;
  /** Technique tag shown as a badge, e.g. "passing °7". */
  tag?: string;
  voicing: number[];
}

// Functional grammar: from degree → [to degree, weight].
const NEXT: Record<Mode, Record<number, [number, number][]>> = {
  major: {
    0: [[5, 0.22], [7, 0.2], [9, 0.18], [2, 0.15], [4, 0.05]],
    2: [[7, 0.55], [11, 0.08], [5, 0.1], [0, 0.07]],
    4: [[9, 0.4], [5, 0.3], [2, 0.15]],
    5: [[7, 0.3], [0, 0.25], [2, 0.15], [11, 0.05]],
    7: [[0, 0.6], [9, 0.2], [5, 0.08]],
    9: [[2, 0.35], [5, 0.3], [7, 0.12], [4, 0.08]],
    11: [[0, 0.65], [4, 0.1]],
  },
  minor: {
    0: [[5, 0.22], [7, 0.2], [8, 0.18], [2, 0.12], [10, 0.12], [3, 0.06]],
    2: [[7, 0.6], [0, 0.1]],
    3: [[8, 0.3], [5, 0.3], [10, 0.2]],
    5: [[7, 0.35], [0, 0.2], [2, 0.15], [10, 0.1]],
    7: [[0, 0.65], [8, 0.2]],
    8: [[7, 0.25], [2, 0.2], [5, 0.2], [10, 0.15], [3, 0.1]],
    10: [[3, 0.4], [0, 0.3], [8, 0.1]],
    11: [[0, 0.7]],
  },
};
const FUNC_OF: Record<Mode, Record<number, Func>> = {
  major: { 0: 'T', 2: 'PD', 4: 'T', 5: 'PD', 7: 'D', 9: 'T', 11: 'D' },
  minor: { 0: 'T', 2: 'PD', 3: 'T', 5: 'PD', 7: 'D', 8: 'PD', 10: 'D', 11: 'D' },
};

function grammarWhy(from: number, to: number, mode: Mode): string {
  const a = FUNC_OF[mode][from], b = FUNC_OF[mode][to];
  if (a === 'D' && to === 0) return 'resolve home';
  if (a === 'D' && b === 'T') return 'deceptive resolution — surprise instead of home';
  if (a === 'PD' && b === 'D') return 'build tension towards the dominant';
  if (a === 'T' && b === 'PD') return 'leave home';
  if (a === 'T' && b === 'D') return 'straight to the dominant';
  if (a === 'PD' && b === 'T') return 'plagal motion — a soft return';
  if (mod12(to - from) === 5) return 'root up a 4th — the strongest motion';
  return 'step to a neighbouring function';
}

export function suggestNext(key: Key, last: Chord | null, style: Style, lastVoicing: number[] | null): NextMove[] {
  type Opt = { chord: Chord; p: number; why: string; tag?: string; name?: string; roman?: string };
  const opts: Opt[] = [];
  const add = (chord: Chord, p: number, why: string, tag?: string, name?: string, roman?: string) => opts.push({ chord, p, why, tag, name, roman });
  const deg = last ? mod12(last.root - key.tonic) : 0;
  const r = last ? analyzeRoman(last, key) : null;

  if (!last || !r) {
    add(degreeChord(key, 0, style), 0.4, 'establish the tonic');
    add(degreeChord(key, 5, style), 0.3, 'predominant');
    add(dominantOf(key, style), 0.3, 'dominant');
  } else if (r.targetDeg !== undefined && r.kind !== 'diatonic') {
    add(degreeChord(key, r.targetDeg, style), 0.7, `resolve ${r.numeral} to its target`);
    if (r.kind === 'secondary-dominant') add(chordOf(last.root + 5, '7'), 0.15, 'keep the dominant chain going — V of V of …', 'chain');
  } else if (r.kind === 'diatonic') {
    for (const [d, p] of NEXT[key.mode][deg] ?? []) add(degreeChord(key, d, style), p, grammarWhy(deg, d, key.mode));
  } else {
    add(degreeChord(key, 0, style), 0.35, 'return home');
    add(dominantOf(key, style), 0.3, 'head to the dominant');
    add(degreeChord(key, 5, style), 0.2, 'back to a predominant');
  }

  if (last && r) {
    const top = [...opts].sort((a, b) => b.p - a.p)[0];
    const td = mod12(top.chord.root - key.tonic);
    const tName = nameInKey(top.chord.root, key);
    if (td !== 0 && DIATONIC_TRIADS[key.mode][td] && DIATONIC_TRIADS[key.mode][td] !== 'dim') {
      add(chordOf(top.chord.root + 7, '7'), 0.1, `tonicize ${tName} with its own V7`, 'secondary dominant');
      add(chordOf(top.chord.root - 1, 'dim7'), 0.08,
        `same pull as V7/${degreeNumeral(td, key.mode)} but smoother: every note of the °7 sits a half step from ${tName}`, 'leading-tone °7');
    }
    // Passing °7: chromatic bass between two chords a whole step apart (I–♯i°7–ii, IV–♯iv°7–V, iii–♭iii°7–ii).
    for (const o of [...opts]) {
      const step = mod12(o.chord.root - last.root);
      if (r.kind === 'diatonic' && (step === 2 || step === 10)) {
        // spelled from the chord it leaves: E♭ → E°7 → Fm (♯i°7), E → E♭°7 → Dm (♭iii°7)
        const up = step === 2;
        const via = chordOf(last.root + (up ? 1 : -1), 'dim7');
        const sp = spellFrom(rootSpelling(last, key), 0, via.root);
        add(via, o.p * 0.35, `passing °7 between ${chordName(last, key)} and ${chordName(o.chord, key)} — the bass walks by half steps`,
          'passing °7', spellingToString(sp) + '°7', (up ? '♯' : '♭') + baseNumeral(deg, 'dim') + '°7');
      }
    }
    // Common-tone °7: decorate a held tonic (or dominant) and come straight back.
    if (r.kind === 'diatonic' && (deg === 0 || deg === 7) && last.quality === 'maj')
      add(chordOf(last.root, 'dim7'), 0.07,
        `common-tone °7 — keep ${nameInKey(last.root, key)} and bend the other notes a half step, then return to ${chordName(last, key)}`,
        'common-tone °7', undefined, 'CT°7');
    if (r.kind === 'diatonic' && deg === 2) add(chordOf(key.tonic + 1, '7'), 0.08, 'tritone sub instead of V7 — bass slides down by half steps', 'tritone sub');
    if (key.mode === 'major' && r.kind === 'diatonic' && (deg === 5 || deg === 0))
      add(chordOf(key.tonic + 5, style === 'jazz' ? 'm7' : 'min'), 0.07, 'borrowed iv — a bittersweet minor shadow', 'modal interchange');
    if (key.mode === 'major' && r.kind === 'diatonic' && (deg === 5 || deg === 2))
      add(chordOf(key.tonic + 10, '7'), 0.05, 'backdoor ♭VII7 → I', 'backdoor');
  }

  const merged = new Map<string, Opt>();
  for (const o of opts) {
    const n = o.name ?? chordName(o.chord, key);
    const m = merged.get(n);
    if (m) m.p += o.p;
    else merged.set(n, { ...o });
  }
  // Always show the main functional moves *and* the colour moves (°7s, subs, borrowing) — the latter are the lesson.
  const sorted = [...merged.values()].sort((a, b) => b.p - a.p);
  const list = [...sorted.filter((o) => !o.tag).slice(0, 4), ...sorted.filter((o) => o.tag).slice(0, 5)];
  const total = list.reduce((s, o) => s + o.p, 0) || 1;
  return list.map((o) => ({
    chord: o.chord,
    name: o.name ?? chordName(o.chord, key),
    roman: o.roman ?? analyzeRoman(o.chord, key).numeral,
    prob: o.p / total,
    why: o.why,
    tag: o.tag,
    voicing: voiceChord(o.chord, lastVoicing),
  }));
}

// ───────────────────────────── key reachability ─────────────────────────────

export interface Pivot {
  chord: Chord;
  name: string;
  fromNumeral: string;
  toNumeral: string;
  toDeg: number;
  kind: 'diatonic' | 'borrowed';
  rank: number;
}

const PIVOT_RANK: Record<Mode, Partial<Record<number, number>>> = {
  major: { 2: 3, 5: 3, 9: 2, 0: 1.2, 4: 1, 7: 0.6 },
  minor: { 5: 3, 2: 2.5, 8: 2, 3: 1.2, 0: 1.2, 10: 0.8, 7: 0.6 },
};
const pivotCache = new Map<string, Pivot[]>();

/** Chords of the target key that already make sense in the current key. */
export function findPivots(from: Key, to: Key, style: Style): Pivot[] {
  const id = `${keyIndex(from)}>${keyIndex(to)}:${style}`;
  const cached = pivotCache.get(id);
  if (cached) return cached;
  const out: Pivot[] = [];
  for (const d of DEGREES[to.mode]) {
    if (d.triad === 'dim') continue;
    const triad = chordOf(to.tonic + d.deg, d.triad);
    const r = analyzeRoman(triad, from);
    if (r.kind !== 'diatonic' && r.kind !== 'borrowed') continue;
    let chord = style === 'jazz' ? chordOf(to.tonic + d.deg, d.jazz) : triad;
    if (analyzeRoman(chord, from).kind !== r.kind) chord = triad;
    out.push({
      chord, name: chordName(chord, to), fromNumeral: numeralOf(chord, from), toNumeral: numeralOf(chord, to),
      toDeg: d.deg, kind: r.kind, rank: (PIVOT_RANK[to.mode][d.deg] ?? 0.5) - (r.kind === 'borrowed' ? 0.6 : 0),
    });
  }
  out.sort((a, b) => b.rank - a.rank);
  pivotCache.set(id, out);
  return out;
}

export interface KeyReach {
  key: Key;
  /** Probability that this is the current key. */
  prob: number;
  /** 0..1 — how likely you are heading there next. */
  likelihood: number;
  relation: string;
  smooth: 'home' | 'close' | 'pivot' | 'remote';
  commonTones: number;
  reasons: string[];
}

function relation(from: Key, to: Key): { prior: number; label: string } {
  const d = mod12(to.tonic - from.tonic);
  if (keyEq(relativeKey(from), to)) return { prior: 0.8, label: 'relative key' };
  if (to.mode === from.mode && d === 7) return { prior: 0.75, label: 'dominant key' };
  if (to.mode === from.mode && d === 5) return { prior: 0.7, label: 'subdominant key' };
  if (keyEq(parallelKey(from), to)) return { prior: 0.5, label: 'parallel key' };
  const ct = commonTones(from, to);
  if (ct >= 6) return { prior: 0.55, label: 'closely related' };
  if (to.mode === from.mode && [3, 4, 8, 9].includes(d)) return { prior: 0.3, label: 'chromatic mediant' };
  return { prior: 0.05 + (0.4 * (ct - 1)) / 6, label: `${ct} common tones` };
}

export function computeReach(from: Key | null, probs: ArrayLike<number>, recent: Chord[], melodyPcs: number[], style: Style): KeyReach[] {
  const last = recent[recent.length - 1] ?? null;
  const prev = recent[recent.length - 2] ?? null;
  return ALL_KEYS.map((k): KeyReach => {
    const prob = probs[keyIndex(k)] ?? 0;
    if (!from) return { key: k, prob, likelihood: prob, relation: '', smooth: 'close', commonTones: 7, reasons: [] };
    if (keyEq(k, from)) return { key: k, prob, likelihood: 1, relation: 'home', smooth: 'home', commonTones: 7, reasons: ['current key'] };
    const rel = relation(from, k);
    const reasons = [rel.label];
    let ev = 0;
    const ks = keyShort(k);
    if (last) {
      const deg = mod12(last.root - k.tonic);
      const ln = chordName(last, from);
      if (deg === 7 && isDominantLike(last)) { ev += isDominant(last) ? 1.1 : 0.7; reasons.push(`${ln} is the V of ${ks}`); }
      else if (deg === 11 && last.quality === 'dim') { ev += 0.8; reasons.push(`${ln} is the leading-tone chord of ${ks}`); }
      else if (deg === 1 && isDominant(last)) { ev += 0.5; reasons.push(`${ln} is the tritone sub of V in ${ks}`); }
      const inK = isDiatonic(last, k), inFrom = isDiatonic(last, from);
      if (inK && !inFrom) { ev += 0.45; reasons.push(`${ln} fits ${ks} but not ${keyShort(from)}`); }
      const tonicChord = k.mode === 'major' ? last.quality === 'maj' : last.quality === 'min';
      if (deg === 0 && inK && tonicChord) { ev += inFrom ? 0.15 : 0.6; reasons.push(`${ln} is its tonic chord`); }
      if (prev && (prev.quality === 'min' || prev.quality === 'dim') && isDominantLike(last) && mod12(last.root - prev.root) === 5 && deg === 7) {
        ev += 0.9;
        reasons.push('a ii–V is pointing here');
      }
    }
    const fromSet = keyPcSet(from), kSet = keyPcSet(k);
    const outside = [...new Set(melodyPcs.map(mod12))].filter((p) => !fromSet.has(p));
    const fits = outside.filter((p) => kSet.has(p));
    if (fits.length) {
      ev += Math.min(0.75, 0.3 * fits.length);
      reasons.push(`melody ${fits.map((p) => nameInKey(p, k)).join(' ')} fits ${ks}`);
    }
    ev -= 0.15 * (outside.length - fits.length);
    ev += 1.2 * prob;
    const raw = Math.max(0, rel.prior * 0.9 + ev);
    const ct = commonTones(from, k);
    const smooth = ct >= 6 ? 'close' : findPivots(from, k, style).length ? 'pivot' : 'remote';
    return { key: k, prob, likelihood: raw / (raw + 1.2), relation: rel.label, smooth, commonTones: ct, reasons };
  });
}

// ───────────────────────────── routes to a target key ─────────────────────────────

export interface PathStep {
  chord: Chord;
  name: string;
  romanTo: string;
  romanFrom: string;
  voicing: number[];
}
export interface Path {
  id: string;
  technique: string;
  explain: string;
  steps: PathStep[];
  score: number;
}

export function suggestPaths(from: Key, to: Key, last: Chord | null, lastVoicing: number[] | null, style: Style): Path[] {
  const I = degreeChord(to, 0, style);
  const V = dominantOf(to, style);
  const ii = degreeChord(to, 2, style);
  const nm = (c: Chord) => chordName(c, to);
  const toS = keyShort(to), fromS = keyShort(from);
  const remote = commonTones(from, to) <= 4;
  const raw: { technique: string; explain: string; chords: Chord[]; bias: number }[] = [];

  const pivots = findPivots(from, to, style);
  const pivotRoute = (p: Pivot, technique: string, bias: number) => {
    const predominant = p.toDeg === 2 || p.toDeg === 5;
    const chords = predominant ? [p.chord, V, I] : p.toDeg === 7 ? [p.chord, I] : [p.chord, ii, V, I];
    raw.push({
      technique, bias, chords,
      explain: `${p.name} is ${p.fromNumeral} in ${fromS}${p.kind === 'borrowed' ? ' (borrowed)' : ''} and ${p.toNumeral} in ${toS}. ` +
        'Play it as if nothing changed — then treat it as part of the new key.',
    });
  };
  const dia = pivots.find((p) => p.kind === 'diatonic');
  const bor = pivots.find((p) => p.kind === 'borrowed');
  if (dia) pivotRoute(dia, 'Pivot chord', 1.3);
  if (bor) pivotRoute(bor, 'Modal-interchange pivot', dia ? 0.9 : 1.2);

  raw.push({ technique: 'ii–V–I', bias: 1, chords: [ii, V, I], explain: `The universal cadence in ${toS}: predominant → dominant → tonic. Works from anywhere.` });
  raw.push({
    technique: 'Direct dominant', bias: 0.85, chords: [V, I],
    explain: `Just play the V7 of ${toS}: its leading tone ${nameInKey(to.tonic + 11, to)} pulls straight into ${nameInKey(to.tonic, to)}.`,
  });
  const subV = chordOf(to.tonic + 1, '7');
  raw.push({
    technique: 'Tritone substitution', bias: remote ? 0.8 : 0.55, chords: [ii, subV, I],
    explain: `${nm(subV)} replaces ${nm(V)} — they share the same tritone — and the bass walks down by half steps into the tonic.`,
  });
  if (last) {
    let n = 2, best = 99;
    for (const k of [2, 3, 4]) {
      const r0 = mod12(to.tonic + 7 * k);
      const d = Math.min(mod12(r0 - last.root), mod12(last.root - r0));
      if (d < best) { best = d; n = k; }
    }
    const chain = Array.from({ length: n }, (_, i) => chordOf(to.tonic + 7 * (n - i), '7'));
    raw.push({
      technique: 'Dominant chain', bias: remote ? 0.75 : 0.5, chords: [...chain, I],
      explain: `Dominant 7ths falling by fifths (${chain.map(nm).join(' → ')}); each one resolves into the next until you land in ${toS}.`,
    });
  }
  const dim = chordOf(to.tonic + 11, 'dim7');
  const others = [3, 6, 9].map((s) => keyShort({ tonic: mod12(to.tonic + s), mode: to.mode }));
  raw.push({
    technique: 'Diminished pivot', bias: remote ? 0.8 : 0.4, chords: [dim, I],
    explain: `${nm(dim)} is vii°7 of ${toS}. A °7 is symmetric — the same four notes are also vii°7 of ${others.join(', ')} — so it's a door into four keys. Move any one note down a half step and you get a V7 of one of them.`,
  });
  const td = mod12(to.tonic - from.tonic);
  if (to.mode === from.mode && [3, 4, 8, 9].includes(td)) {
    const a = corePcs(degreeChord(from, 0, 'triads')), b = corePcs(degreeChord(to, 0, 'triads'));
    const common = b.filter((p) => a.includes(p)).map((p) => nameInKey(p, to));
    raw.push({
      technique: 'Chromatic mediant', bias: 0.75, chords: [I],
      explain: `Jump straight there${common.length ? `, holding ${common.join(' & ')} as a common tone` : ''}. Tonics a third apart — bold, cinematic.`,
    });
  }
  if (keyEq(parallelKey(from), to)) {
    const iv = degreeChord(to, 5, style);
    raw.push({ technique: 'Mode switch', bias: 1.1, chords: [iv, V, I], explain: `Same tonic, new mode: ${nm(iv)} (${numeralOf(iv, to)}) announces ${toS} right away.` });
  }

  const seen = new Set<string>();
  const out: Path[] = [];
  for (const r of raw) {
    const sig = r.chords.map(nm).join(' ');
    if (seen.has(sig)) continue;
    seen.add(sig);
    let prev = lastVoicing, cost = 0;
    const steps = r.chords.map((c, i): PathStep => {
      const v = voiceChord(c, prev);
      if (prev) cost += vlCost(prev, v);
      prev = v;
      return { chord: c, name: nm(c), romanTo: numeralOf(c, to), romanFrom: analyzeRoman(c, from, r.chords[i + 1]).numeral, voicing: v };
    });
    out.push({ id: `${r.technique}:${sig}`, technique: r.technique, explain: r.explain, steps, score: r.bias - (0.012 * cost) / steps.length - 0.06 * steps.length });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}
