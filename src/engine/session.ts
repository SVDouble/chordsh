import { DEGREE_LABEL, mod12 } from '../theory/pitch';
import { type Chord, type Identification, chordName, chordPcs, corePcs, identify, noteRole, toneNames } from '../theory/chords';
import { type Roman, analyzeRoman, isDiatonic } from '../theory/roman';
import { type PatternKind, patternsAtEnd } from '../theory/patterns';
import { type Key, type ScaleName, keyEq, keyIndex, keyShort, nameInKey } from '../theory/scales';
import { voiceChord } from '../theory/voicing';
import { KeyDetector } from './keyDetector';
import { Segmenter } from './segmenter';
import { DEFAULT_PARAMS, Harmonizer, type PathItem, SegmentBuilder } from './harmonizer';
import { AccentDetector, BeatTracker } from './beats';
import { type KeyReach, type NextMove, type Path, type Style, computeReach, suggestNext, suggestPaths } from './coach';
import { type Chart, toChartText } from './chart';
import { SongFollower } from './song';

export interface ChordEntry {
  type: 'chord';
  /** Stable id (start time), so a re-interpreted chord keeps its place in the UI. */
  id: number;
  chord: Chord;
  name: string;
  roman: Roman | null;
  key: Key | null;
  t0: number;
  t1: number;
  notes: number[];
  pivot?: { from: string; to: string };
  /** Set when hindsight changed this chord's reading (time of the revision). */
  revisedAt?: number;
  /** Still being played — may change. */
  tentative?: boolean;
}
export interface KeyEntry { type: 'key'; id: number; key: Key; from: Key | null; t0: number }
export type HistoryItem = ChordEntry | KeyEntry;
export interface PatternMark { kind: PatternKind; label: string; startId: number; endId: number }
export interface MelodyEntry { id: number; note: number; name: string; t: number; degree: string | null; role: ReturnType<typeof noteRole> | null; over: string | null }
export interface TheorySummary { key: Key; prob: number; label: string; since: number | null }
export interface Practice {
  path: Path;
  index: number;
  done: boolean;
  /** Chord tones of the current step you're holding / still missing (forgiving feedback). */
  hit: string[];
  missing: string[];
}

/** Engine decisions, for session recordings and replay analysis. */
export type TraceEvent = { t: number; kind: string } & Record<string, unknown>;

const EMPTY: Identification = { kind: 'none', best: null, alternatives: [], notes: [] };

/**
 * Orchestrates the engine. Plain TypeScript: UI subscribes via `onChange` and reads the
 * public fields.
 *
 * Two layers: a fast segmenter gives the instant chord you're holding (and melody notes);
 * the probabilistic harmonizer explains the whole performance — chords, keys and competing
 * theories — and is free to revise earlier readings as more music arrives. The history is
 * a view of the harmonizer's current best path.
 */
export class Session {
  readonly seg: Segmenter;
  readonly harmonizer = new Harmonizer(DEFAULT_PARAMS);
  readonly beats = new BeatTracker();
  /** Modal colour only (the key itself comes from the harmonizer). */
  readonly detector = new KeyDetector();
  onChange: () => void = () => {};
  /** Set to receive every engine decision (session recording). */
  trace: ((e: TraceEvent) => void) | null = null;
  private log(e: TraceEvent) { this.trace?.(e); }

  now: Identification = EMPTY;
  nowRoman: Roman | null = null;
  melody: MelodyEntry[] = [];
  keyLock: Key | null = null;
  keyProbs: Float64Array = new Float64Array(24);
  flavour: ScaleName | null = null;
  theories: TheorySummary[] = [];
  /** Show the history as explained by another theory (key index), or null for the best one. */
  viewTheory: number | null = null;
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
  /** Max history items kept (the UI only shows the latest). */
  historyLimit = 300;

  private segments: SegmentBuilder;
  private accents = new AccentDetector();
  private group: { t: number; notes: number[] } | null = null;
  private _history: HistoryItem[] = [];
  private _patterns: PatternMark[] = [];
  private _key: Key | null = null;
  private dirty = false;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private labels = new Map<number, string>();
  private pending: { ident: Identification; notes: number[]; t: number } | null = null;
  private strikeTimer: ReturnType<typeof setTimeout> | null = null;
  private id = 1;

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
    this.segments = new SegmentBuilder(DEFAULT_PARAMS, (s) => {
      this.harmonizer.push(s);
      this.log({ t: s.t0, kind: 'segment', bass: s.bass, ms: Math.round(s.t1 - s.t0) });
      this.invalidate();
    });
  }

  // ── derived views (rebuilt lazily from the harmonizer) ──
  get history(): HistoryItem[] { this.sync(); return this._history; }
  get patterns(): PatternMark[] { this.sync(); return this._patterns; }
  get key(): Key | null { this.sync(); return this._key; }
  get activeKey(): Key | null { return this.keyLock ?? this.key; }
  get chords(): ChordEntry[] { return this.history.filter((h): h is ChordEntry => h.type === 'chord'); }
  /** Bar start times from the beat tracker (empty until a tempo is found). */
  get bars(): number[] { return this.beats.period ? this.beats.bars() : []; }
  get tempo() { return { bpm: this.beats.bpm, confidence: this.beats.confidence, beatsPerBar: this.beats.beatsPerBar, fixed: !!this.beats.fixed }; }

  // ── input ──
  noteOn(note: number, vel: number, t = performance.now()) {
    this.seg.noteOn(note, vel, t);
    this.segments.noteOn(note, vel, t);
    this.detector.addMelody(note, t, 0.3);
    if (this.group && t - this.group.t > 30) this.flushGroup();
    this.group ??= { t, notes: [] };
    this.group.notes.push(note);
    this.invalidate();
    this.onChange();
  }
  noteOff(note: number, t = performance.now()) {
    this.seg.noteOff(note, t);
    this.segments.noteOff(note, t);
    this.invalidate();
    this.onChange();
  }
  pedal(on: boolean, t = performance.now()) {
    this.seg.setPedal(on, t);
    this.segments.setPedal(on);
    this.onChange();
  }

  private flushGroup() {
    const g = this.group;
    this.group = null;
    if (g) this.beats.onset(g.t, Math.sqrt(g.notes.length), this.accents.accent(g.t, g.notes));
  }

  // ── settings / actions ──
  setStyle(s: Style) { this.style = s; this.refresh(); }
  setKeyLock(k: Key | null) { this.keyLock = k; this.invalidate(true); }
  setTarget(k: Key | null) { this.target = k; this.practice = null; this.refresh(); }
  setViewTheory(k: number | null) { this.viewTheory = k; this.invalidate(true); }
  /** Fix the tempo (metronome / MIDI file) so bars are exact; null = estimate from playing. */
  setTempo(bpm: number | null, beatsPerBar = 4, phase = performance.now()) {
    this.beats.fixed = bpm ? { period: 60000 / bpm, phase } : null;
    this.beats.autoMeter = !bpm;
    this.beats.beatsPerBar = beatsPerBar;
    this.beats.update(performance.now());
    this.onChange();
  }
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
    Object.assign(this, { now: EMPTY, nowRoman: null, melody: [], practice: null, lastVoicing: null, theories: [], viewTheory: null });
    this.harmonizer.reset();
    this.detector.reset();
    this.seg.reset();
    this.labels.clear();
    this.invalidate(true);
  }

  // ── instant layer: the chord you're holding ──
  private onHarmony(notes: number[], t: number, strike: boolean) {
    const ident = identify(notes, this.activeKey);
    this.log({ t, kind: 'harmony', notes, strike, chord: ident.best ? chordName(ident.best, this.activeKey) : null, alts: ident.alternatives.map((a) => chordName(a, this.activeKey)) });
    if (!ident.best && ident.kind !== 'interval') return;
    this.now = ident;
    const key = this.activeKey;
    this.nowRoman = ident.best && key ? analyzeRoman(ident.best, key) : null;
    this.checkPractice(ident);
    if (ident.best) this.song?.preview(ident.best);
    if (strike && this.pending && t - this.pending.t > 60) this.strike();
    this.pending = { ident, notes, t };
    if (this.strikeTimer) clearTimeout(this.strikeTimer);
    this.strikeTimer = setTimeout(() => this.strike(), strike ? 150 : 350);
    this.onChange();
  }

  /** A chord was clearly played (stable for a moment): song following and voice leading. */
  private strike() {
    const p = this.pending;
    this.pending = null;
    if (!p?.ident.best) return;
    this.lastVoicing = p.notes;
    this.song?.played(p.ident.best);
    this.refresh();
  }

  // ── analysis layer: rebuild the history from the harmonizer's best path ──
  private invalidate(now = false) {
    this.dirty = true;
    if (now) { this.sync(); this.refresh(); return; }
    this.rebuildTimer ??= setTimeout(() => {
      this.rebuildTimer = null;
      this.sync();
      this.refresh();
      // keep re-reading while the last chord is still sounding or dying away (it gains evidence with time)
      if (this.segments.active(performance.now())) this.invalidate();
    }, 120);
  }

  private sync() {
    if (!this.dirty) return;
    this.dirty = false;
    const t = performance.now();
    if (this.group && t - this.group.t > 30) this.flushGroup();
    const open = this.segments.peek(t);
    const h = this.harmonizer;
    let path = this.viewTheory !== null ? h.path(this.viewTheory, open) : h.path(undefined, open);
    if (this.keyLock) path = path.map((x) => ({ ...x, key: this.keyLock! }));
    this.keyProbs = h.keyDistribution(open);
    this.theories = this.describeTheories(h.theories(3, open));
    const items = this.buildHistory(path, open ? open.t0 : null, t);
    this._history = items.length > this.historyLimit ? items.slice(-this.historyLimit) : items;
    const last = path[path.length - 1];
    this._key = last?.key ?? null;
    this.flavour = this._key ? this.detector.flavour(this._key) : null;
    this._patterns = this.findPatterns();
    if (this.now.best && this.activeKey) this.nowRoman = analyzeRoman(this.now.best, this.activeKey);
  }

  private buildHistory(path: PathItem[], openT0: number | null, now: number): HistoryItem[] {
    // merge consecutive items with the same chord (a key change alone doesn't split a chord)
    const items: HistoryItem[] = [];
    let prevKey: Key | null = null;
    const revised: string[] = [];
    path.forEach((p, i) => {
      if (!keyEq(p.key, prevKey)) {
        items.push({ type: 'key', id: -Math.round(p.t0) - 1, key: p.key, from: prevKey, t0: p.t0 });
      }
      const next = path[i + 1]?.chord ?? null;
      const id = Math.round(p.t0);
      const name = chordName(p.chord, p.key);
      const label = `${name}|${keyIndex(p.key)}`;
      const before = this.labels.get(id);
      const e: ChordEntry = {
        type: 'chord', id, chord: p.chord, name, roman: analyzeRoman(p.chord, p.key, next), key: p.key,
        t0: p.t0, t1: p.t1, notes: voiceChord(p.chord, null),
        tentative: openT0 !== null && p.t1 >= openT0,
      };
      if (before && before !== label) { e.revisedAt = now; revised.push(`${before.split('|')[0]} → ${name}`); }
      else if (this.revisedAt.has(id) && now - this.revisedAt.get(id)! < 2500) e.revisedAt = this.revisedAt.get(id);
      if (e.revisedAt) this.revisedAt.set(id, e.revisedAt);
      this.labels.set(id, label);
      // pivot: the chord where the key changed, if it belongs to both keys
      if (prevKey && !keyEq(p.key, prevKey)) {
        const prev = items.slice(0, -1).reverse().find((x): x is ChordEntry => x.type === 'chord');
        if (isDiatonic(p.chord, prevKey)) e.pivot = { from: analyzeRoman(p.chord, prevKey).numeral, to: e.roman!.numeral };
        else if (prev && isDiatonic(prev.chord, p.key)) prev.pivot = { from: prev.roman!.numeral, to: analyzeRoman(prev.chord, p.key, p.chord).numeral };
      }
      prevKey = p.key;
      items.push(e);
    });
    if (revised.length) this.log({ t: now, kind: 'reinterpret', changes: revised });
    return items;
  }
  private revisedAt = new Map<number, number>();

  private describeTheories(ts: ReturnType<Harmonizer['theories']>): TheorySummary[] {
    return ts.map((th) => {
      // where this theory's final key starts
      let since: number | null = null;
      for (let i = th.path.length - 1; i >= 0 && keyEq(th.path[i].key, th.key); i--) since = th.path[i].t0;
      const changes = th.path.filter((x, i) => i > 0 && !keyEq(x.key, th.path[i - 1].key)).length;
      return { key: th.key, prob: th.prob, since, label: `${keyShort(th.key)}${changes ? ` (${changes} key change${changes > 1 ? 's' : ''})` : ''}` };
    });
  }

  private findPatterns(): PatternMark[] {
    const chords = this.chords.slice(-60);
    const out: PatternMark[] = [];
    for (let i = 1; i < chords.length; i++) {
      const key = chords[i].key;
      const found = patternsAtEnd(chords.slice(Math.max(0, i - 7), i + 1).map((e) => e.chord), key);
      const mark = (m: (typeof found)[number]) => {
        const startId = chords[i - m.length + 1].id;
        for (let j = out.length - 1; j >= 0; j--) if (out[j].startId === startId && (out[j].kind === 'ii-V' || out[j].kind === m.kind)) out.splice(j, 1);
        if (m.kind === 'cycle') for (let j = out.length - 1; j >= 0; j--) if (out[j].kind === 'cycle' && out[j].endId === chords[i - 1].id) out.splice(j, 1);
        out.push({ kind: m.kind, label: m.label, startId, endId: chords[i].id });
      };
      const cadence = found.find((m) => m.kind !== 'cycle' && m.kind !== 'loop');
      if (cadence) mark(cadence);
      found.filter((m) => m.kind === 'cycle' || m.kind === 'loop').forEach(mark);
    }
    return out;
  }

  // ── melody ──
  private onMelody(note: number, t: number) {
    this.log({ t, kind: 'melody', note });
    const key = this.activeKey;
    const over = this.now.best ?? this.chords[this.chords.length - 1]?.chord ?? null;
    this.melody.push({
      id: this.id++, note, t, name: this.spell(note),
      degree: key ? DEGREE_LABEL[mod12(note - key.tonic)] : null,
      role: over ? noteRole(over, note) : null,
      over: over ? chordName(over, key) : null,
    });
    if (this.melody.length > 64) this.melody.shift();
    this.onChange();
  }

  // ── coaching ──
  private refresh() {
    const key = this.activeKey;
    const last = this.chords[this.chords.length - 1]?.chord ?? null;
    this.next = key ? suggestNext(key, last, this.style, this.lastVoicing) : [];
    const recent = this.chords.slice(-3).map((e) => e.chord);
    const t = performance.now();
    this.reach = computeReach(key, this.keyProbs, recent, this.melody.filter((m) => t - m.t < 6000).map((m) => m.note), this.style);
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
