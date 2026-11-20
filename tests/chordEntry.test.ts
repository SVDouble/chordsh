import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChordEntry, type PlayedInput } from '../src/engine/chordEntry';
import { chordName, identify } from '../src/theory/chords';

afterEach(() => vi.useRealTimers());
function setup() {
  vi.useFakeTimers();
  let focus = 'selected';
  let delay = 600;
  const commits: PlayedInput<string>[] = [];
  let preview: PlayedInput<string> | null = null;
  const entry = new ChordEntry({
    delay: () => delay,
    target: () => focus,
    identify: (notes, velocity) => {
      const result = identify(notes);
      return result.best ? { symbol: chordName(result.best), notes, velocity } : null;
    },
    preview: (value) => {
      preview = value;
    },
    commit: (value) => {
      commits.push(value);
    },
  });
  const down = (notes: number[], velocity = 90) => notes.forEach((n) => entry.noteOn(n, velocity));
  const up = (notes: number[]) => notes.forEach((n) => entry.noteOff(n));
  return {
    entry,
    commits,
    down,
    up,
    preview: () => preview,
    focus: (value: string) => {
      focus = value;
    },
    delay: (value: number) => {
      delay = value;
    },
  };
}

describe('played-chord idle capture', () => {
  it('finishes a released chord before accepting an idea, without saving held notes or duplicating it later', () => {
    const f = setup();
    f.down([60, 64, 67]);
    f.entry.finishReleased();
    expect(f.commits).toEqual([]);
    f.up([60, 64, 67]);
    f.entry.finishReleased();
    expect(f.commits).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(f.commits).toHaveLength(1);
  });
  it('waits for release and an idle gap, retaining every note through staggered releases', () => {
    const f = setup();
    f.entry.noteOn(60, 70);
    vi.advanceTimersByTime(70);
    f.entry.noteOn(64, 80);
    vi.advanceTimersByTime(70);
    f.entry.noteOn(67, 90);
    vi.advanceTimersByTime(2000);
    expect(f.commits).toEqual([]);
    expect(f.preview()?.chords[0]).toEqual({ symbol: 'C', notes: [60, 64, 67], velocity: 80 });
    f.up([60, 64]);
    vi.advanceTimersByTime(800);
    expect(f.commits).toEqual([]);
    f.up([67]);
    vi.advanceTimersByTime(599);
    expect(f.commits).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(f.commits).toEqual([{ target: 'selected', chords: [{ symbol: 'C', notes: [60, 64, 67], velocity: 80 }] }]);
    expect(f.preview()).toBeNull();
    vi.advanceTimersByTime(2000);
    expect(f.commits).toHaveLength(1);
  });

  it('finishes a released chord before the next gesture and captures a fresh destination', () => {
    const f = setup();
    f.down([60, 64, 67]);
    f.up([60, 64, 67]);
    vi.advanceTimersByTime(100);
    f.focus('end');
    f.down([62, 65, 69]);
    expect(f.commits).toHaveLength(1);
    expect(f.commits[0].target).toBe('selected');
    expect(f.preview()?.target).toBe('end');
    f.up([62, 65, 69]);
    vi.advanceTimersByTime(600);
    expect(f.commits.map((c) => c.chords[0].symbol)).toEqual(['C', 'Dm']);
    expect(f.commits[1].target).toBe('end');
  });

  it('queues distinct pedal-held gestures and saves them together after pedal release', () => {
    const f = setup();
    f.entry.setPedal(true);
    f.down([60, 64, 67]);
    f.up([60, 64, 67]);
    vi.advanceTimersByTime(1000);
    expect(f.commits).toEqual([]);
    f.down([62, 65, 69]);
    f.up([62, 65, 69]);
    vi.advanceTimersByTime(1000);
    expect(f.commits).toEqual([]);
    expect(f.preview()?.chords.map((c) => c.symbol)).toEqual(['C', 'Dm']);
    f.entry.setPedal(false);
    vi.advanceTimersByTime(600);
    expect(f.commits).toHaveLength(1);
    expect(f.commits[0].chords.map((c) => c.symbol)).toEqual(['C', 'Dm']);
  });

  it('ignores single-note/octave playing while allowing recognised two-note voicings', () => {
    const f = setup();
    f.down([60, 72]);
    f.up([60, 72]);
    vi.advanceTimersByTime(1000);
    expect(f.commits).toEqual([]);
    f.down([60, 67]);
    f.up([60, 67]);
    vi.advanceTimersByTime(600);
    expect(f.commits[0].chords[0]).toMatchObject({ symbol: 'C5', notes: [60, 67] });
  });

  it('cancels stale input and ignores late note-offs without contaminating the next chord', () => {
    const f = setup();
    f.down([60, 64, 67]);
    f.entry.cancel();
    f.up([60, 64, 67]);
    vi.advanceTimersByTime(1000);
    expect(f.commits).toEqual([]);
    f.focus('another chord');
    f.down([65, 69, 72]);
    f.up([65, 69, 72]);
    vi.advanceTimersByTime(200);
    f.entry.cancel();
    vi.advanceTimersByTime(1000);
    expect(f.commits).toEqual([]);
    f.down([62, 65, 69]);
    f.up([62, 65, 69]);
    vi.advanceTimersByTime(600);
    expect(f.commits[0]).toMatchObject({ target: 'another chord', chords: [{ symbol: 'Dm', notes: [62, 65, 69] }] });
  });

  it('uses the configured delay and preserves a held pedal through focus cancellation', () => {
    const f = setup();
    f.delay(1200);
    f.entry.setPedal(true);
    f.entry.cancel();
    f.down([60, 64, 67]);
    f.up([60, 64, 67]);
    vi.advanceTimersByTime(2000);
    expect(f.commits).toEqual([]);
    f.entry.setPedal(false);
    vi.advanceTimersByTime(1199);
    expect(f.commits).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(f.commits).toHaveLength(1);
  });

  it('retains the first gesture destination until focus is explicitly cancelled', () => {
    const f = setup();
    f.down([60]);
    f.focus('different');
    f.down([64, 67]);
    f.up([60, 64, 67]);
    vi.advanceTimersByTime(600);
    expect(f.commits[0].target).toBe('selected');
  });
});
