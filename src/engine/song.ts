import { mod12 } from '../theory/pitch';
import { Chord, chordName, chordPcs, corePcs, isDominant, toneNames } from '../theory/chords';
import { analyzeRoman } from '../theory/roman';
import { Key } from '../theory/scales';
import { Chart } from './chart';

export type Verdict = 'exact' | 'match' | 'substitute' | 'wrong' | 'skipped';
export interface Comparison {
  verdict: Verdict;
  notes: string[];
  /** Roles of written chord tones you left out (for the "what you usually miss" tally). */
  missing: string[];
}

const third = (c: Chord) => (c.quality === 'maj' || c.quality === 'aug' ? 'major' : c.quality === 'min' || c.quality === 'dim' ? 'minor' : 'no');

/** Compare what you played with what the chart says — forgiving about voicing, strict about function. */
export function compareChord(played: Chord, written: Chord, key: Key | null): Comparison {
  const have = new Set(chordPcs(played));
  const wTones = toneNames(written, key);
  const wPcs = chordPcs(written);
  const missingIdx = wPcs.map((p, i) => (have.has(p) ? -1 : i)).filter((i) => i >= 0);
  const missing = missingIdx.map((i) => wTones[i].role);
  const missText = missingIdx.length ? [`missing ${missingIdx.map((i) => `${wTones[i].name} (${wTones[i].role})`).join(', ')}`] : [];
  const wName = chordName(written, key), pName = chordName(played, key);

  if (!missingIdx.length && have.size === new Set(wPcs).size)
    return { verdict: 'exact', notes: played.root !== written.root ? [`same notes — reads as ${pName}, the chart calls it ${wName}`] : played.bass !== written.bass ? ['different bass note — still the same chord'] : [], missing };
  if (played.root === written.root) {
    if (!missingIdx.length) return { verdict: 'exact', notes: played.bass !== written.bass ? ['different bass note — still the same chord'] : [], missing };
    if (third(played) !== third(written))
      return { verdict: 'wrong', notes: [`${third(played)} 3rd instead of ${third(written)} 3rd — that changes the chord's colour`], missing };
    const notes = [...missText];
    if (played.seventh === 'b7' && written.seventh === 'maj7') notes.push('♭7 instead of maj7 turns it into a dominant');
    if (played.seventh === 'maj7' && written.seventh === 'b7') notes.push('maj7 instead of ♭7 takes the pull out of the dominant');
    return { verdict: 'match', notes, missing };
  }

  // Rootless voicing: guide tones present, nothing foreign (a bass player would add the root).
  const guide = corePcs(written).filter((p) => p !== written.root && p !== mod12(written.root + 7));
  const allowed = new Set([...wPcs, ...[2, 9].map((i) => mod12(written.root + i))]);
  if (written.seventh !== 'none' && guide.every((p) => have.has(p)) && [...have].every((p) => allowed.has(p)))
    return { verdict: 'match', notes: [`rootless voicing of ${wName} — the guide tones are there`], missing: [] };

  if (isDominant(written)) {
    if (isDominant(played) && mod12(played.root - written.root) === 6)
      return { verdict: 'substitute', notes: [`tritone sub for ${wName} — same tritone, chromatic bass`], missing: [] };
    if (played.seventh === 'dim7' && [1, 4, 7, 10].includes(mod12(played.root - written.root)))
      return { verdict: 'substitute', notes: [`${pName} = ${wName}(♭9) without its root`], missing: [] };
  }
  const shared = wPcs.filter((p) => have.has(p)).length;
  if (key && shared >= 3) {
    const a = analyzeRoman(played, key), b = analyzeRoman(written, key);
    if (a.func === b.func) return { verdict: 'substitute', notes: [`${pName} shares ${shared} notes and the same function as ${wName}`], missing: [] };
  }
  return { verdict: 'wrong', notes: [`chart has ${wName} (${wTones.map((t) => t.name).join(' ')})`, ...missText], missing };
}

const ROLE_GROUP: Record<string, string> = { R: 'root', '3': '3rd', '♭3': '3rd', '5': '5th', '♭5': '5th', '♯5': '5th', '♭7': '7th', '7': '7th', '𝄫7': '7th', '6': '6th' };

export interface CellResult extends Comparison { played: string }

/** Follows your playing through a chart, re-syncing when you skip or repeat chords. */
export class SongFollower {
  pos = 0;
  results = new Map<number, CellResult>();
  live: CellResult | null = null;
  passes: number[] = [];
  missingTally = new Map<string, number>();
  wrongQuality = 0;
  private wrongStreak = 0;

  constructor(public chart: Chart) {}

  get expected() { return this.chart.chords[this.pos] ?? null; }

  jump(i: number) {
    this.pos = i;
    this.wrongStreak = 0;
    this.live = null;
  }

  /** Live comparison while you're still holding the chord (no advancing). */
  preview(c: Chord) {
    const e = this.expected;
    this.live = e ? { ...compareChord(c, e.chord, this.chart.key), played: chordName(c, this.chart.key) } : null;
  }

  /** A chord was committed: score it and move along the chart. */
  played(c: Chord) {
    const cells = this.chart.chords;
    const n = cells.length;
    if (!n) return;
    const name = chordName(c, this.chart.key);
    const at = (k: number) => compareChord(c, cells[(this.pos + k) % n].chord, this.chart.key);

    const now = at(0);
    if (now.verdict !== 'wrong') return this.record(this.pos, now, name, 0);
    const prev = cells[(this.pos - 1 + n) % n];
    if (this.pos > 0 && compareChord(c, prev.chord, this.chart.key).verdict !== 'wrong') return; // re-struck the last chord
    for (let k = 1; k < Math.min(4, n); k++) {
      const cmp = at(k);
      if (cmp.verdict !== 'wrong') return this.record((this.pos + k) % n, cmp, name, k);
    }
    this.results.set(this.pos, { ...now, played: name });
    this.tally(now);
    if (++this.wrongStreak >= 2) this.advance(1); // you've probably moved on — so do we
  }

  private record(i: number, cmp: Comparison, played: string, skipped: number) {
    for (let k = 1; k <= skipped; k++) {
      const j = (i - k + this.chart.chords.length) % this.chart.chords.length;
      if (!this.results.has(j)) this.results.set(j, { verdict: 'skipped', notes: [], missing: [], played: '' });
    }
    this.results.set(i, { ...cmp, played });
    this.tally(cmp);
    this.wrongStreak = 0;
    this.pos = i;
    this.advance(1);
  }

  private advance(by: number) {
    this.pos += by;
    this.wrongStreak = 0;
    if (this.pos >= this.chart.chords.length) {
      const good = [...this.results.values()].filter((r) => r.verdict !== 'wrong' && r.verdict !== 'skipped').length;
      this.passes.push(Math.round((100 * good) / this.chart.chords.length));
      this.results.clear();
      this.pos = 0;
    }
  }

  private tally(cmp: Comparison) {
    for (const role of new Set(cmp.missing.map((m) => ROLE_GROUP[m] ?? m))) this.missingTally.set(role, (this.missingTally.get(role) ?? 0) + 1);
    if (cmp.notes.some((x) => x.includes('3rd instead'))) this.wrongQuality++;
  }

  /** Plain-language summary of habits, e.g. "you often leave out the 7th". */
  habits(): string[] {
    const out: string[] = [];
    const sorted = [...this.missingTally].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2);
    for (const [role, n] of sorted.slice(0, 3))
      out.push(`You left out the ${role} ${n}× — ${role === '5th' ? 'fine, the 5th is the most expendable note' : role === 'root' ? 'fine if someone else plays bass' : "it carries the chord's colour, try keeping it"}.`);
    if (this.wrongQuality >= 2) out.push(`Major/minor mix-ups ${this.wrongQuality}× — check the 3rd of each chord.`);
    return out;
  }
}
