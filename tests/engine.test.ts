import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from '../src/engine/session';
import { suggestNext, suggestPaths } from '../src/engine/coach';
import { chordOf } from '../src/theory/chords';
import { keyShort } from '../src/theory/scales';

let s: Session;
let t = 1000;
beforeEach(() => { vi.useFakeTimers(); s = new Session(); t = 1000; });
afterEach(() => vi.useRealTimers());

/** Play a block chord (LH bass + RH chord) for one beat, with an optional melody note. */
function play(notes: number[], melody?: number) {
  notes.forEach((n) => s.noteOn(n, 80, t));
  vi.advanceTimersByTime(80); t += 80;
  if (melody !== undefined) {
    t += 200; vi.advanceTimersByTime(200);
    s.noteOn(melody, 90, t); vi.advanceTimersByTime(80); t += 80;
    s.noteOff(melody, t);
  }
  t += 400; vi.advanceTimersByTime(400);
  notes.forEach((n) => s.noteOff(n, t));
}

const Dm7 = [38, 53, 57, 60], G7 = [43, 53, 59, 62], Cmaj7 = [36, 52, 55, 59], A7 = [45, 55, 61, 64];
const Gm7 = [43, 58, 62, 65], C7 = [36, 58, 64, 67], Fmaj7 = [41, 57, 60, 64];

describe('session', () => {
  it('names chords, separates melody and finds the key', () => {
    play(Dm7, 76); play(G7, 74); play(Cmaj7, 72); play(A7); play(Dm7); play(G7); play(Cmaj7);
    const names = s.chords.map((c) => c.name);
    expect(names).toEqual(['Dm7', 'G7', 'Cmaj7', 'A7', 'Dm7', 'G7', 'Cmaj7']);
    expect(s.key && keyShort(s.key)).toBe('C');
    expect(s.melody.map((m) => m.note)).toEqual([76, 74, 72]);
    expect(s.chords[3].roman?.numeral).toBe('V7/ii');
    expect(s.patterns.some((p) => p.kind === 'ii-V-I')).toBe(true);
  });

  it('follows a modulation and marks the pivot', () => {
    for (let i = 0; i < 2; i++) { play(Dm7); play(G7); play(Cmaj7); }
    for (let i = 0; i < 3; i++) { play(Gm7); play(C7); play(Fmaj7); }
    expect(s.key && keyShort(s.key)).toBe('F');
    expect(s.history.some((h) => h.type === 'key' && keyShort(h.key) === 'F')).toBe(true);
    expect(s.chords[s.chords.length - 1].roman?.numeral).toBe('Imaj7');
  });

  it('settles in E♭ after a borrowed-iv pivot (demo progression)', () => {
    const Am7 = [45, 55, 60, 64], Fm7 = [41, 56, 60, 63], Bb7 = [46, 56, 62, 65], Ebmaj7 = [39, 55, 58, 62], Abmaj7 = [44, 55, 60, 63];
    play(Cmaj7, 76); play(Am7, 72); play(Dm7, 77); play(G7, 74); play(Cmaj7, 72); play(A7, 73); play(Dm7, 77); play(G7, 74);
    play(Fm7, 75); play(Bb7, 74); play(Ebmaj7, 79); play(Abmaj7, 72); play(Fm7, 75); play(Bb7, 74); play(Ebmaj7, 75);
    expect(s.key && keyShort(s.key)).toBe('E♭');
    expect(s.melody.length).toBe(15);
  });

  it('practice accepts any voicing of the right chord', () => {
    play(Dm7); play(G7); play(Cmaj7);
    s.setTarget({ tonic: 7, mode: 'major' });
    const path = s.paths.find((p) => p.technique === 'Direct dominant')!;
    s.startPractice(path);
    play([50, 54, 57, 60]); // D7, a different voicing
    expect(s.practice?.index).toBe(1);
    play([43, 47, 50]); // G triad for Gmaj7 — fine
    expect(s.practice?.done).toBe(true);
  });
});

describe('coach', () => {
  const C = { tonic: 0, mode: 'major' as const };
  it('routes C → G via a pivot chord', () => {
    const paths = suggestPaths(C, { tonic: 7, mode: 'major' }, chordOf(0, 'maj7'), null, 'jazz');
    expect(paths[0].technique).toBe('Pivot chord');
    expect(paths[0].steps.map((x) => x.name)).toEqual(['Am7', 'D7', 'Gmaj7']);
    expect(paths[0].steps[1].romanFrom).toBe('V7/V');
  });
  it('routes C → E♭ through modal interchange', () => {
    const paths = suggestPaths(C, { tonic: 3, mode: 'major' }, chordOf(0, 'maj7'), null, 'jazz');
    const mi = paths.find((p) => p.technique === 'Modal-interchange pivot')!;
    expect(mi.steps[0].name).toBe('Fm7');
  });
  it('offers diminished colour moves', () => {
    const moves = suggestNext(C, chordOf(0, 'maj7'), 'jazz', null);
    expect(moves.find((m) => m.tag === 'passing °7')).toMatchObject({ name: 'C♯°7', roman: '♯i°7' });
    expect(moves.find((m) => m.tag === 'common-tone °7')).toMatchObject({ name: 'C°7', roman: 'CT°7' });
  });
});
