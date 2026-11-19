import { mod12 } from '../theory/pitch';

/**
 * Splits a live note stream into harmony and melody.
 *
 * Heuristics (in order):
 *  - notes struck within `groupMs` form one onset group;
 *  - with an auto-detected hand split, left-hand notes are always harmony;
 *  - while a chord is held (keys or pedal), notes above it are melody — even
 *    double-stops and fast runs; only a 3+ note voicing replaces the harmony;
 *  - otherwise a group of 2+ notes is a chord strike, and held notes below it are its bass;
 *  - a single right-hand note is melody, unless it completes a rolled chord;
 *  - single left-hand notes (broken chords, Alberti bass) accumulate into the
 *    current harmony while they still make a sensible chord, otherwise start a new one.
 */
export interface SegmenterEvents {
  harmony(notes: number[], t: number, strike: boolean): void;
  melody(note: number, velocity: number, t: number): void;
  retractMelody(notes: number[]): void;
}

export type SplitMode = 'auto' | 'off' | number;

const GROUP_MS = 70;
const ROLL_MS = 220;
const RELEASE_MEMORY_MS = 1200;

export class Segmenter {
  readonly held = new Map<number, { t: number; vel: number }>();
  readonly sustained = new Set<number>();
  /** Current harmonic notes; `released` = time the key went up (null while sounding). */
  readonly harmony = new Map<number, { t: number; released: number | null }>();
  readonly melodyNotes = new Set<number>();
  splitMode: SplitMode = 'auto';
  autoSplit: number | null = null;

  private pedal = false;
  private pending: { note: number; vel: number; t: number }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onsets: number[] = [];
  private lastStrike = { t: -Infinity, high: false };
  private lastEmitted = '';

  constructor(
    private ev: SegmenterEvents,
    /** Chord-quality score for a note set (higher = more sensible), used for broken chords. */
    private score: (notes: number[]) => number | null = () => 0,
  ) {}

  get split(): number | null {
    return this.splitMode === 'auto' ? this.autoSplit : this.splitMode === 'off' ? null : this.splitMode;
  }

  noteOn(note: number, vel: number, t: number) {
    this.held.set(note, { t, vel });
    this.sustained.delete(note);
    this.pending.push({ note, vel, t });
    this.onsets.push(note);
    if (this.onsets.length > 48) this.onsets.shift();
    this.updateSplit();
    this.timer ??= setTimeout(() => this.flush(), GROUP_MS);
  }

  noteOff(note: number, t: number) {
    this.held.delete(note);
    if (this.pedal) this.sustained.add(note);
    else this.release(note, t);
  }

  setPedal(on: boolean, t: number) {
    this.pedal = on;
    if (on) return;
    for (const n of this.sustained) this.release(n, t);
    this.sustained.clear();
  }

  reset() {
    this.held.clear();
    this.sustained.clear();
    this.harmony.clear();
    this.melodyNotes.clear();
    this.lastEmitted = '';
  }

  private release(note: number, t: number) {
    this.melodyNotes.delete(note);
    const h = this.harmony.get(note);
    if (h) h.released = t;
  }

  private sounding = (n: number) => this.held.has(n) || this.sustained.has(n);

  /** Largest pitch gap in recent onsets, if it clearly separates two hands. */
  private updateSplit() {
    const xs = [...this.onsets].sort((a, b) => a - b);
    let gap = 0,
      at = -1;
    for (let i = 1; i < xs.length; i++)
      if (xs[i] - xs[i - 1] > gap) {
        gap = xs[i] - xs[i - 1];
        at = i;
      }
    const ok = xs.length >= 8 && gap >= 5 && at >= 3 && xs.length - at >= 3;
    this.autoSplit = ok ? Math.round((xs[at - 1] + xs[at]) / 2) + 1 : null;
  }

  flush() {
    this.timer = null;
    const group = this.pending.sort((a, b) => a.note - b.note);
    this.pending = [];
    if (!group.length) return;
    const t = group[group.length - 1].t;
    for (const [n, h] of this.harmony)
      if (h.released !== null && t - h.released > RELEASE_MEMORY_MS) this.harmony.delete(n);

    // A held chord anchors the harmony: its top note acts as the hand split.
    const anchor = [...this.harmony.keys()].filter(this.sounding);
    const anchored = anchor.length >= 2 && t - this.lastStrike.t > ROLL_MS;
    const split = this.split ?? (anchored ? Math.max(...anchor) + 1 : null);
    const low = split === null ? [] : group.filter((g) => g.note < split);
    const high = split === null ? group : group.filter((g) => g.note >= split);
    const harmonic = low.map((g) => g.note);
    let block = low.length >= 2;

    if (high.length >= 3 || (high.length === 2 && !anchored)) {
      harmonic.push(...high.map((g) => g.note));
      block = true;
    } else if (high.length === 2) {
      high.forEach((g) => this.emitMelody(g)); // double-stop / fast run over a held chord
    } else if (high.length === 1) {
      const g = high[0];
      const rolled = [...this.held].filter(([, h]) => g.t - h.t <= ROLL_MS).map(([n]) => n);
      const joins =
        g.t - this.lastStrike.t <= ROLL_MS &&
        (split === null || this.lastStrike.high) &&
        [...this.harmony.keys()].some((n) => this.held.has(n));
      if (joins) harmonic.push(g.note);
      else if (rolled.length >= 3) {
        const retract = rolled.filter((n) => this.melodyNotes.delete(n));
        if (retract.length) this.ev.retractMelody(retract);
        harmonic.push(...rolled);
        block = true;
      } else this.emitMelody(g);
    }
    if (!harmonic.length) return;

    if (block) {
      // keys still held below a new chord are its bass, even if they were first heard as melody
      const lowest = Math.min(...harmonic);
      const bass = [...this.held.keys()].filter((n) => n < lowest && !this.harmony.has(n));
      const retract = bass.filter((n) => this.melodyNotes.delete(n));
      if (retract.length) this.ev.retractMelody(retract);
      harmonic.push(...bass);
      for (const n of this.harmony.keys()) if (!this.held.has(n)) this.harmony.delete(n);
      for (const n of harmonic) this.harmony.set(n, { t, released: null });
    } else {
      for (const n of harmonic) this.addSingle(n, t);
    }
    this.lastStrike = { t, high: high.length > 0 && harmonic.some((n) => split === null || n >= split) };
    this.emit(t, block);
  }

  private addSingle(n: number, t: number) {
    const cur = [...this.harmony.keys()];
    if (cur.length && !cur.some((x) => mod12(x) === mod12(n))) {
      let accumulate = n > Math.min(...cur); // a new lowest note = a new bass = a new chord
      if (accumulate && cur.length >= 2) {
        const before = this.score(cur),
          after = this.score([...cur, n]);
        accumulate = after !== null && (before === null || after >= before - 0.6);
      }
      if (!accumulate) for (const x of cur) if (!this.sounding(x)) this.harmony.delete(x);
    }
    this.harmony.set(n, { t, released: null });
  }

  private emit(t: number, strike: boolean) {
    const notes = [...this.harmony.keys()].sort((a, b) => a - b);
    const sig = notes.join(',');
    if (sig === this.lastEmitted) return;
    this.lastEmitted = sig;
    this.ev.harmony(notes, t, strike);
  }

  private emitMelody(g: { note: number; vel: number; t: number }) {
    this.melodyNotes.add(g.note);
    this.ev.melody(g.note, g.vel, g.t);
  }
}
