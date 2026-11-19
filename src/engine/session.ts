import { DEGREE_LABEL, mod12 } from '../theory/pitch';
import { Chord, Identification, chordName, chordPcs, corePcs, identify, noteRole, toneNames } from '../theory/chords';
import { Roman, analyzeRoman, isDiatonic } from '../theory/roman';
import { PatternKind, patternsAtEnd } from '../theory/patterns';
import { Key, ScaleName, keyEq, keyFromIndex, keyIndex, keyShort as keyShortOf, nameInKey } from '../theory/scales';
import { KeyDetector } from './keyDetector';
import { Segmenter } from './segmenter';
import { KeyReach, NextMove, Path, Style, computeReach, suggestNext, suggestPaths } from './coach';
import { Chart, toChartText } from './chart';
import { SongFollower } from './song';
import { voiceChord } from '../theory/voicing';

export interface ChordEntry {
  type: 'chord';
  id: number;
  chord: Chord;
  name: string;
  roman: Roman | null;
  key: Key | null;
  t0: number;
  count: number;
  notes: number[];
  pivot?: { from: string; to: string };
}
export interface KeyEntry { type: 'key'; id: number; key: Key; from: Key | null }
export type HistoryItem = ChordEntry | KeyEntry;
export interface PatternMark { kind: PatternKind; label: string; startId: number; endId: number }
export interface MelodyEntry { id: number; note: number; name: string; t: number; degree: string | null; role: ReturnType<typeof noteRole> | null; over: string | null }
export interface Practice {
  path: Path;
  index: number;
  done: boolean;
  /** Chord tones of the current step you're holding / still missing (forgiving feedback). */
  hit: string[];
  missing: string[];
}

const EMPTY: Identification = { kind: 'none', best: null, alternatives: [], notes: [] };

/**
 * Orchestrates the engine. Plain TypeScript: UI subscribes via `onChange`
 * and reads the public fields.
 */
export class Session {
  readonly detector = new KeyDetector();
  readonly seg: Segmenter;
  onChange: () => void = () => {};

  now: Identification = EMPTY;
  nowRoman: Roman | null = null;
  history: HistoryItem[] = [];
  patterns: PatternMark[] = [];
  melody: MelodyEntry[] = [];
  key: Key | null = null;
  keyLock: Key | null = null;
  keyProbs: Float64Array = new Float64Array(24);
  flavour: ScaleName | null = null;
  reach: KeyReach[] = [];
  next: NextMove[] = [];
  target: Key | null = null;
  paths: Path[] = [];
  practice: Practice | null = null;
  style: Style = 'jazz';
  lastVoicing: number[] | null = null;
  song: SongFollower | null = null;
  /** Show the song's next chord on the piano. */
  songGuide = false;

  private id = 1;
  private pending: { ident: Identification; notes: number[]; t: number } | null = null;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private challenger: { key: Key; count: number } | null = null;
  private chordCount = 0;
  private melodyCount = 0;

  constructor() {
    this.seg = new Segmenter(
      {
        harmony: (n, t, strike) => this.onHarmony(n, t, strike),
        melody: (n, _v, t) => this.onMelody(n, t),
        retractMelody: (notes) => {
          for (const n of notes) {
            const i = this.melody.findLastIndex((m) => m.note === n);
            if (i >= 0) this.melody.splice(i, 1);
          }
        },
      },
      (notes) => identify(notes).best?.score ?? null,
    );
  }

  get activeKey(): Key | null { return this.keyLock ?? this.key; }
  get chords(): ChordEntry[] { return this.history.filter((h): h is ChordEntry => h.type === 'chord'); }

  // ── input ──
  noteOn(note: number, vel: number, t = performance.now()) { this.seg.noteOn(note, vel, t); this.onChange(); }
  noteOff(note: number, t = performance.now()) { this.seg.noteOff(note, t); this.onChange(); }
  pedal(on: boolean, t = performance.now()) { this.seg.setPedal(on, t); this.onChange(); }

  // ── settings / actions ──
  setStyle(s: Style) { this.style = s; this.refresh(); }
  setKeyLock(k: Key | null) {
    if (!k && this.keyLock) this.key = this.keyLock;
    this.keyLock = k;
    if (k) this.relabel(0, k);
    this.refresh();
  }
  setTarget(k: Key | null) { this.target = k; this.practice = null; this.refresh(); }
  startPractice(path: Path) { this.practice = { path, index: 0, done: false, hit: [], missing: [] }; this.updatePracticeFeedback(); this.onChange(); }
  stopPractice() { this.practice = null; this.onChange(); }
  loadSong(chart: Chart | null) { this.song = chart ? new SongFollower(chart) : null; this.onChange(); }
  /** What you've played so far, as chart text (to save, edit or reharmonise). */
  historyAsChart(): string { return toChartText(this.chords.map((c) => c.name)); }
  /** Notes to highlight as a target on the piano. */
  get guideNotes(): number[] {
    const p = this.practice;
    if (p && !p.done) return p.path.steps[p.index].voicing;
    const e = this.songGuide ? this.song?.expected : null;
    return e ? voiceChord(e.chord, this.lastVoicing) : [];
  }
  clear() {
    Object.assign(this, { now: EMPTY, nowRoman: null, history: [], patterns: [], melody: [], key: null, practice: null, lastVoicing: null, chordCount: 0, melodyCount: 0 });
    this.detector.reset();
    this.seg.reset();
    this.refresh();
  }

  // ── harmony ──
  private onHarmony(notes: number[], t: number, strike: boolean) {
    const ident = identify(notes, this.activeKey);
    if (!ident.best && ident.kind !== 'interval') return;
    this.now = ident;
    const key = this.activeKey;
    this.nowRoman = ident.best && key ? analyzeRoman(ident.best, key) : null;
    this.checkPractice(ident);
    if (ident.best) this.song?.preview(ident.best);
    if (strike && this.pending && t - this.pending.t > 60) this.commit();
    this.pending = { ident, notes, t };
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.commit(), strike ? 150 : 350);
    this.onChange();
  }

  private commit() {
    const p = this.pending;
    this.pending = null;
    const c = p?.ident.best;
    if (!p || !c) return;
    const key = this.activeKey;
    const name = chordName(c, key);
    const chords = this.chords;
    const last = chords[chords.length - 1];
    if (last && last.name === name) { last.count++; this.onChange(); return; }
    // Same chord with an added colour tone (Cmaj7 → Cmaj9): not a new chord in the progression.
    const l = last?.chord;
    if (l && l.root === c.root && l.quality === c.quality && l.seventh === c.seventh && l.bass === c.bass) return;

    const entry: ChordEntry = { type: 'chord', id: this.id++, chord: c, name, roman: key ? analyzeRoman(c, key) : null, key, t0: p.t, count: 1, notes: p.notes };
    if (last?.key) last.roman = analyzeRoman(last.chord, last.key, c); // the resolution confirms applied chords
    this.history.push(entry);
    if (this.history.length > 300) this.history.splice(0, this.history.length - 300);
    this.chordCount++;
    this.lastVoicing = p.notes;
    this.song?.played(c);
    this.detector.addChord(c, p.t);
    this.updatePatterns(p.t);
    this.updateKey();
    this.refresh();
  }

  private updatePatterns(t: number) {
    const entries = this.chords.slice(-8);
    const found = patternsAtEnd(entries.map((e) => e.chord), this.activeKey);
    const endId = entries[entries.length - 1].id;
    const mark = (m: (typeof found)[number]) => {
      const startId = entries[entries.length - m.length].id;
      // a ii–V–I supersedes the ii–V it grew from; a growing cycle replaces itself
      this.patterns = this.patterns.filter((x) => !(x.startId === startId && (x.kind === 'ii-V' || x.kind === m.kind)));
      this.patterns.push({ kind: m.kind, label: m.label, startId, endId });
    };
    const cadence = found.find((m) => m.kind !== 'cycle' && m.kind !== 'loop');
    if (cadence) mark(cadence);
    found.filter((m) => m.kind === 'cycle' || m.kind === 'loop').forEach(mark);
    for (const m of found) {
      if (!m.target) continue;
      // a full ii–V–I is strong modulation evidence; V–I to a non-tonic chord is usually just a tonicization
      const strength = m.kind === 'ii-V-I' ? 1.5 : m.kind === 'ii-V' ? 0.3 : 0.6;
      this.detector.addCadence(m.target, strength, t);
    }
    if (this.patterns.length > 100) this.patterns.splice(0, this.patterns.length - 100);
  }

  // ── key tracking with hysteresis ──
  private updateKey() {
    this.keyProbs = this.detector.probabilities();
    let best = 0;
    for (let i = 1; i < 24; i++) if (this.keyProbs[i] > this.keyProbs[best]) best = i;
    const cand = keyFromIndex(best);
    if (!this.keyLock) {
      if (!this.key) {
        if (this.keyProbs[best] > 0.6 || (this.chordCount >= 4 && this.keyProbs[best] > 0.3) || this.melodyCount >= 12) this.changeKey(cand);
      } else if (!keyEq(cand, this.key)) {
        const margin = this.keyProbs[best] - this.keyProbs[keyIndex(this.key)];
        this.challenger = keyEq(this.challenger?.key, cand) ? { key: cand, count: this.challenger!.count + 1 } : { key: cand, count: 1 };
        // Modulating needs evidence: a chord outside the current key, or a cadence into the new one.
        const recent = this.chords.slice(-3);
        const evidence =
          recent.some((e) => !isDiatonic(e.chord, this.key!)) ||
          this.patterns.slice(-2).some((p) => p.endId === recent[recent.length - 1]?.id && p.label.includes(keyShortOf(cand)));
        if (margin > 0.35 || (evidence && (margin > 0.15 || (this.challenger.count >= 2 && margin > 0.05)))) this.changeKey(cand);
      } else this.challenger = null;
    }
    const k = this.activeKey;
    this.flavour = k ? this.detector.flavour(k) : null;
  }

  /** Switch key; place the key-change marker right after the pivot chord and relabel from there. */
  private changeKey(newKey: Key) {
    const old = this.key;
    this.key = newKey;
    this.challenger = null;
    if (!old) {
      this.history.unshift({ type: 'key', id: this.id++, key: newKey, from: null });
      this.relabel(0, newKey);
      return;
    }
    const run: number[] = [];
    for (let i = this.history.length - 1; i >= 0 && run.length < 5; i--) {
      const h = this.history[i];
      if (h.type === 'key' || !isDiatonic(h.chord, newKey)) break;
      run.unshift(i);
    }
    if (!run.length) run.push(this.history.length - 1);
    const firstNewOnly = run.find((i) => { const h = this.history[i]; return h.type === 'chord' && !isDiatonic(h.chord, old); }) ?? run[run.length - 1];
    // The pivot is the last chord both keys share — or the first new chord if the old key could borrow it (iv = ii).
    const first = this.history[firstNewOnly] as ChordEntry;
    const pivotIdx = run.indexOf(firstNewOnly) > 0 ? firstNewOnly - 1 : analyzeRoman(first.chord, old).kind === 'borrowed' ? firstNewOnly : -1;
    if (pivotIdx >= 0) {
      const p = this.history[pivotIdx] as ChordEntry;
      p.pivot = { from: analyzeRoman(p.chord, old).numeral, to: analyzeRoman(p.chord, newKey).numeral };
    }
    this.history.splice(firstNewOnly, 0, { type: 'key', id: this.id++, key: newKey, from: old });
    this.relabel(firstNewOnly + 1, newKey);
  }

  private relabel(from: number, key: Key) {
    const items = this.history;
    for (let i = from; i < items.length; i++) {
      const h = items[i];
      if (h.type !== 'chord') continue;
      const next = items.slice(i + 1).find((x): x is ChordEntry => x.type === 'chord');
      h.key = key;
      h.name = chordName(h.chord, key);
      h.roman = analyzeRoman(h.chord, key, next?.chord);
    }
    if (this.now.best) this.nowRoman = analyzeRoman(this.now.best, key);
  }

  // ── melody ──
  private onMelody(note: number, t: number) {
    const key = this.activeKey;
    const over = this.now.best ?? this.chords[this.chords.length - 1]?.chord ?? null;
    this.melody.push({
      id: this.id++, note, t, name: this.spell(note),
      degree: key ? DEGREE_LABEL[mod12(note - key.tonic)] : null,
      role: over ? noteRole(over, note) : null,
      over: over ? chordName(over, key) : null,
    });
    if (this.melody.length > 64) this.melody.shift();
    this.melodyCount++;
    this.detector.addMelody(note, t);
    if (!this.key) this.updateKey();
    this.refreshReach();
    this.onChange();
  }

  // ── coaching ──
  private refreshReach() {
    const key = this.activeKey;
    const recent = this.chords.slice(-3).map((e) => e.chord);
    const t = performance.now();
    const pcs = this.melody.filter((m) => t - m.t < 6000).map((m) => m.note);
    this.reach = computeReach(key, this.keyProbs, recent, pcs, this.style);
  }

  private refresh() {
    const key = this.activeKey;
    const last = this.chords[this.chords.length - 1]?.chord ?? null;
    this.next = key ? suggestNext(key, last, this.style, this.lastVoicing) : [];
    this.refreshReach();
    if (!this.practice) this.paths = key && this.target && !keyEq(key, this.target) ? suggestPaths(key, this.target, last, this.lastVoicing, this.style) : [];
    this.onChange();
  }

  // ── practice: forgiving match (right root + quality family, any voicing) ──
  private checkPractice(ident: Identification) {
    const p = this.practice;
    if (!p || p.done) return;
    this.updatePracticeFeedback(ident.notes);
    const want = p.path.steps[p.index].chord;
    const got = ident.best;
    if (got && matches(got, want)) {
      p.index++;
      p.done = p.index >= p.path.steps.length;
      this.updatePracticeFeedback();
    }
  }

  private updatePracticeFeedback(notes: number[] = []) {
    const p = this.practice;
    if (!p || p.done) return;
    const want = p.path.steps[p.index].chord;
    const played = new Set(notes.map(mod12));
    const key = this.target ?? this.activeKey;
    const names = toneNames(want, key);
    const pcs = chordPcs(want);
    p.hit = names.filter((_, i) => played.has(pcs[i])).map((n) => `${n.name} (${n.role})`);
    p.missing = notes.length ? names.filter((_, i) => !played.has(pcs[i]) && corePcs(want).includes(pcs[i])).map((n) => `${n.name} (${n.role})`) : [];
  }

  /** Name of the pitch class in the current key (for UI). */
  spell(pc: number): string { return this.activeKey ? nameInKey(pc, this.activeKey) : ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][mod12(pc)]; }
}

const family = (c: Chord) => (c.quality === 'sus4' || c.quality === 'sus2' || c.quality === 'power' ? 'maj' : c.quality);
function matches(got: Chord, want: Chord): boolean {
  if (got.root !== want.root) return false;
  if (want.quality === 'dim') return got.quality === 'dim';
  if (family(got) !== family(want)) return false;
  // a dominant must have its ♭7; otherwise extra or missing 7ths are fine ("vibing")
  return want.seventh !== 'b7' || got.seventh === 'b7';
}
