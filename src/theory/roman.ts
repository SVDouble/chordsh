import { mod12 } from './pitch';
import { type Chord, type Quality, corePcs, isDominant } from './chords';
import { type Key, type Mode, SCALE_LABEL, type ScaleName, keyPcSet, nameInKey, scalePcSet, tonicName } from './scales';

export type Func = 'T' | 'PD' | 'D' | '?';
export type RomanKind =
  | 'diatonic'
  | 'secondary-dominant'
  | 'secondary-leading-tone'
  | 'tritone-sub'
  | 'backdoor'
  | 'borrowed'
  | 'neapolitan'
  | 'chromatic-mediant'
  | 'chromatic'
  | 'blues';

export interface Roman {
  numeral: string;
  kind: RomanKind;
  func: Func;
  /** Degree (semitones above tonic) the chord points to, for applied chords. */
  targetDeg?: number;
  explain: string;
}

// Jazz convention: numerals are relative to the major scale in both modes (♭III, ♭VI, ♭VII in minor).
const DEGREE = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];

export const DIATONIC_TRIADS: Record<Mode, Partial<Record<number, 'maj' | 'min' | 'dim'>>> = {
  major: { 0: 'maj', 2: 'min', 4: 'min', 5: 'maj', 7: 'maj', 9: 'min', 11: 'dim' },
  minor: { 0: 'min', 2: 'dim', 3: 'maj', 5: 'min', 7: 'maj', 8: 'maj', 10: 'maj', 11: 'dim' },
};
const DIATONIC_FUNC: Record<Mode, Partial<Record<number, Func>>> = {
  major: { 0: 'T', 2: 'PD', 4: 'T', 5: 'PD', 7: 'D', 9: 'T', 11: 'D' },
  minor: { 0: 'T', 2: 'PD', 3: 'T', 5: 'PD', 7: 'D', 8: 'PD', 10: 'D', 11: 'D' },
};
const CHROMATIC_FUNC: Func[] = ['T', 'PD', 'PD', 'T', 'T', 'PD', 'PD', 'D', 'PD', 'T', 'D', 'D'];

export const FUNC_TEXT: Record<Func, string> = {
  T: 'Tonic — stable, a place to rest.',
  PD: 'Predominant — leaves home and usually leads to the dominant.',
  D: 'Dominant — tension that wants to resolve to the tonic.',
  '?': 'Ambiguous function.',
};

const isUpper = (q: Quality) => q !== 'min' && q !== 'dim';

export function baseNumeral(deg: number, q: Quality): string {
  const d = mod12(deg);
  const n = d === 6 && isUpper(q) ? '♭V' : DEGREE[d];
  return isUpper(q) ? n : n.toLowerCase();
}

export function romanSuffix(c: Chord): string {
  switch (c.quality) {
    case 'dim':
      return c.seventh === 'b7' ? 'ø7' : c.seventh === 'dim7' ? '°7' : '°';
    case 'aug':
      return '+' + (c.seventh === 'b7' ? '7' : c.seventh === 'maj7' ? 'maj7' : '');
    case 'sus4':
      return (c.seventh === 'b7' ? '7' : '') + 'sus4';
    case 'sus2':
      return 'sus2';
    default:
      if (c.seventh === 'b7') return '7';
      if (c.seventh === 'maj7') return c.quality === 'min' ? '(maj7)' : 'maj7';
      return c.sixth ? '6' : '';
  }
}

export const numeralOf = (c: Chord, key: Key): string => baseNumeral(c.root - key.tonic, c.quality) + romanSuffix(c);

/** Numeral of the diatonic triad on a degree, used for "V/x" targets. */
export function degreeNumeral(deg: number, mode: Mode): string {
  const q = DIATONIC_TRIADS[mode][mod12(deg)];
  return q ? baseNumeral(deg, q) + (q === 'dim' ? '°' : '') : DEGREE[mod12(deg)];
}

export const isDiatonic = (c: Chord, key: Key): boolean => {
  const s = keyPcSet(key);
  return corePcs(c).every((p) => s.has(p));
};

const BORROW_ORDER: Record<Mode, ScaleName[]> = {
  major: ['aeolian', 'mixolydian', 'dorian', 'harmonicMinor', 'phrygian', 'lydian', 'melodicMinor'],
  minor: ['ionian', 'dorian', 'melodicMinor', 'phrygian', 'mixolydian', 'lydian'],
};

export function borrowedSource(c: Chord, key: Key): ScaleName | null {
  const core = corePcs(c);
  for (const m of BORROW_ORDER[key.mode]) {
    const s = scalePcSet(key.tonic, m);
    if (core.every((p) => s.has(p))) return m;
  }
  return null;
}

/**
 * Roman-numeral analysis of a chord in a key. `next`, when known, confirms
 * applied chords by their resolution (A7 → Dm is V7/ii).
 */
export function analyzeRoman(c: Chord, key: Key, next?: Chord | null): Roman {
  const deg = mod12(c.root - key.tonic);
  const numeral = numeralOf(c, key);
  const isTarget = (d: number) => ['maj', 'min'].includes(DIATONIC_TRIADS[key.mode][mod12(d)] ?? '');
  const name = (pc: number) => nameInKey(pc, key);
  const chromFunc = CHROMATIC_FUNC[deg];

  if (isDiatonic(c, key)) {
    const func = DIATONIC_FUNC[key.mode][deg] ?? '?';
    return { numeral, kind: 'diatonic', func, explain: FUNC_TEXT[func] };
  }

  const dom7 = isDominant(c);
  const domTriad = c.quality === 'maj' && c.seventh === 'none' && !c.sixth;
  const leading = c.quality === 'dim';
  const sfx = romanSuffix(c);

  if (next) {
    const motion = mod12(next.root - c.root);
    const tDeg = mod12(next.root - key.tonic);
    const tNum = baseNumeral(tDeg, next.quality);
    if ((dom7 || domTriad) && motion === 5)
      return {
        numeral: tDeg === 0 ? `V${sfx}` : `V${sfx}/${tNum}`,
        kind: 'secondary-dominant',
        func: 'D',
        targetDeg: tDeg,
        explain: `Secondary dominant — the V${sfx} of ${name(next.root)} (${tNum}), and it resolved there.`,
      };
    if (dom7 && motion === 11)
      return {
        numeral: tDeg === 0 ? '♭II7' : `subV7/${tNum}`,
        kind: 'tritone-sub',
        func: 'D',
        targetDeg: tDeg,
        explain: `Tritone substitution — stands in for the V7 of ${name(next.root)}; the bass slid down a half step.`,
      };
    if (leading && motion === 1)
      return {
        numeral: `vii${sfx}/${tNum}`,
        kind: 'secondary-leading-tone',
        func: 'D',
        targetDeg: tDeg,
        explain: `Leading-tone chord of ${name(next.root)} — every note sat a half step from its target.`,
      };
  }

  if (dom7) {
    if (deg === 10)
      return {
        numeral,
        kind: 'backdoor',
        func: 'D',
        explain: 'Backdoor dominant (♭VII7) — borrowed from minor, resolves up a whole step to I.',
      };
    const t = mod12(deg + 5);
    if (isTarget(t))
      return {
        numeral: `V${sfx}/${degreeNumeral(t, key.mode)}`,
        kind: 'secondary-dominant',
        func: 'D',
        targetDeg: t,
        explain: `Secondary dominant — the V${sfx} of ${name(key.tonic + t)}; expect it to resolve to ${degreeNumeral(t, key.mode)}.`,
      };
    if (deg === 1)
      return {
        numeral: '♭II7',
        kind: 'tritone-sub',
        func: 'D',
        targetDeg: 0,
        explain: 'Tritone substitute of V7 — resolves down a half step to I.',
      };
  }
  if (leading) {
    const t = mod12(deg + 1);
    if (isTarget(t) && t !== 0)
      return {
        numeral: `vii${sfx}/${degreeNumeral(t, key.mode)}`,
        kind: 'secondary-leading-tone',
        func: 'D',
        targetDeg: t,
        explain: `Leading-tone chord of ${name(key.tonic + t)} — wants to step up a half step into it.`,
      };
  }
  if (deg === 1 && c.quality === 'maj' && c.seventh === 'none')
    return {
      numeral: c.inversion === 1 ? 'N6' : '♭II',
      kind: 'neapolitan',
      func: 'PD',
      explain: 'Neapolitan (♭II) — a dark predominant, classically in 1st inversion, heading to V.',
    };
  const borrowed = borrowedSource(c, key);
  if (borrowed)
    return {
      numeral,
      kind: 'borrowed',
      func: chromFunc,
      explain: `Modal interchange — borrowed from ${tonicName(key)} ${SCALE_LABEL[borrowed]}.`,
    };
  if (domTriad) {
    const t = mod12(deg + 5);
    if (isTarget(t))
      return {
        numeral: `V/${degreeNumeral(t, key.mode)}`,
        kind: 'secondary-dominant',
        func: 'D',
        targetDeg: t,
        explain: `Secondary dominant — the V of ${name(key.tonic + t)}.`,
      };
  }
  if ((c.quality === 'maj' || c.quality === 'min') && [3, 4, 8, 9].includes(deg))
    return {
      numeral,
      kind: 'chromatic-mediant',
      func: chromFunc,
      explain: 'Chromatic mediant — root a third from the tonic; a bold colour shift with few common tones.',
    };
  return {
    numeral,
    kind: 'chromatic',
    func: chromFunc,
    explain: 'Chromatic — outside the key; it may be signalling a modulation.',
  };
}
