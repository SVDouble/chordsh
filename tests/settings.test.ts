import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_FIELDS, restoreSettings, setSetting, settingsSchema } from '../src/config/settings';
import { BeatTracker } from '../src/engine/beats';
import { Session } from '../src/engine/session';
import { emptySequence, SequenceEditor, sequencePiece } from '../src/engine/sequence';
import { writeMidi } from '../src/io/midiexport';
import { midiFileMeta } from '../src/io/midifile';

const candidate = () => structuredClone(DEFAULT_SETTINGS);
afterEach(() => vi.useRealTimers());

describe('settings validation and recovery', () => {
  it('rejects unsafe and incompatible settings before they reach the engine', () => {
    for (const [path, value] of [
      ['beats.binMs', 0],
      ['beats.binMs', NaN],
      ['beats.windowMs', Infinity],
      ['beats.minBpm', 200],
      ['beats.windowMs', 1000],
      ['beats.revisionMs', 9000],
      ['beats.meterCandidates', []],
      ['beats.meterCandidates', [0, 13]],
      ['segmentation.rollMs', 10],
      ['segmentation.splitHistory', 8],
      ['segmentation.releaseTailMs', 2000],
      ['harmony.durationWeight', 2],
    ] as [string, unknown][]) {
      const next = candidate();
      setSetting(next, path, value);
      if (path === 'segmentation.splitHistory') next.segmentation.splitSideNotes = 5;
      expect(settingsSchema.safeParse(next).success, path).toBe(false);
    }
    const next = candidate();
    next.beats.windowMs = 60000;
    next.beats.binMs = 2;
    expect(settingsSchema.safeParse(next).success).toBe(false);
  });

  it('fills missing values, isolates invalid saved fields, and preserves unrelated settings', () => {
    const { settings, warnings } = restoreSettings({
      preferences: { theme: 'light', style: 'triads' },
      beats: { binMs: 0, windowMs: 12000 },
      harmony: { transitionWeight: 0.4, prior: { tonic: 0.8 } },
      editor: { snapBeats: 0.5 },
    });
    expect(settings.preferences.theme).toBe('light');
    expect(settings.preferences.style).toBe('triads');
    expect(settings.beats.binMs).toBe(DEFAULT_SETTINGS.beats.binMs);
    expect(settings.beats.windowMs).toBe(12000);
    expect(settings.harmony.transitionWeight).toBe(0.4);
    expect(settings.harmony.prior.tonic).toBe(0.8);
    expect(settings.editor.snapBeats).toBe(0.5);
    expect(warnings).toHaveLength(1);
    expect(settingsSchema.safeParse(settings).success).toBe(true);
  });

  it('recovers an inconsistent section without discarding other valid sections', () => {
    const { settings, warnings } = restoreSettings({ beats: { minBpm: 200, maxBpm: 60 }, editor: { gate: 0.7 } });
    expect(settings.beats).toEqual(DEFAULT_SETTINGS.beats);
    expect(settings.editor.gate).toBe(0.7);
    expect(warnings.length).toBeGreaterThan(0);
    expect(restoreSettings(null).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('supplies help and real limits for generated controls, including nested model priors', () => {
    expect(SETTINGS_FIELDS.every((f) => f.title && f.description)).toBe(true);
    expect(SETTINGS_FIELDS.find((f) => f.path === 'beats.binMs')).toMatchObject({
      minimum: 2,
      maximum: 100,
      unit: 'ms',
      default: 10,
    });
    expect(SETTINGS_FIELDS.find((f) => f.path === 'harmony.prior.tonic')).toBeDefined();
    expect(() => setSetting(candidate(), '__proto__.invalid', 1)).toThrow();
  });
});

describe('configured analysis', () => {
  function pulse(bpm: number, settings: typeof DEFAULT_SETTINGS.beats) {
    const tracker = new BeatTracker(settings);
    const period = 60000 / bpm;
    for (let i = 0; i < 50; i++) tracker.onset(i * period, 1, i % 4 === 0 ? 2 : 0);
    tracker.update(49 * period);
    return tracker;
  }

  it('detects fast and slow playing outside the former hardcoded tempo range', () => {
    const fast = pulse(220, { ...DEFAULT_SETTINGS.beats, minBpm: 200, maxBpm: 240, preferredBpm: 220 });
    expect(fast.bpm).toBeGreaterThan(200);
    expect(fast.bpm).toBeLessThanOrEqual(240);
    const slow = pulse(32, { ...DEFAULT_SETTINGS.beats, minBpm: 30, maxBpm: 40, preferredBpm: 32, windowMs: 12000 });
    expect(slow.bpm).toBeGreaterThanOrEqual(30);
    expect(slow.bpm).toBeLessThan(40);
  });

  it('uses configured meters, invalidates cached bars on meter changes, and clears old beat evidence', () => {
    const tracker = new BeatTracker({ ...DEFAULT_SETTINGS.beats, meterCandidates: [5] });
    tracker.fixed = { period: 500, phase: 0 };
    tracker.update(8000);
    tracker.bars();
    expect(tracker.beatsPerBar).toBe(5);
    tracker.autoMeter = false;
    tracker.beatsPerBar = 7;
    const bars = tracker.bars();
    expect(bars[1] - bars[0]).toBe(3500);
    tracker.reset();
    expect(tracker.bars()).toEqual([]);
    expect(tracker.period).toBeNull();
  });

  it('rejects a settings change atomically and rebuilds configured models after a valid change', () => {
    vi.useFakeTimers();
    const session = new Session();
    [48, 52, 55].forEach((n) => session.noteOn(n, 80, performance.now()));
    vi.advanceTimersByTime(80);
    expect(session.now.best).not.toBeNull();
    const original = session.harmonizer;
    const bad = candidate();
    bad.beats.binMs = 0;
    expect(() => session.configure(bad)).toThrow();
    expect(session.harmonizer).toBe(original);
    expect(session.now.best).not.toBeNull();
    const next = candidate();
    next.harmony.transitionWeight = 0;
    next.segmentation.groupMs = 150;
    next.beats.minBpm = 30;
    session.configure(next);
    expect(session.harmonizer).not.toBe(original);
    expect(session.harmonizer.params.transitionWeight).toBe(0);
    expect(session.history).toEqual([]);
    [48, 52, 55].forEach((n) => session.noteOn(n, 80, performance.now()));
    vi.advanceTimersByTime(80);
    expect(session.now.best).toBeNull();
    vi.advanceTimersByTime(80);
    expect(session.now.best).not.toBeNull();
    session.clear();
  });
});

describe('configured composition', () => {
  it('uses configurable velocity, undo depth, gate and new-song defaults', () => {
    const settings = { ...DEFAULT_SETTINGS.editor, velocity: 110, undoLimit: 2, gate: 0.5, newTempo: 200, newMeter: 5 };
    const doc = emptySequence('Configured', 'configured', settings);
    const editor = new SequenceEditor(doc, settings);
    for (const symbol of ['C', 'Dm', 'G7']) editor.insert([{ symbol, beats: 1 }]);
    const piece = sequencePiece(editor.document, settings);
    expect(piece.notes[0]).toEqual([0, 150, expect.any(Number), 110]);
    expect(piece.beatsPerBar).toBe(5);
    editor.undo();
    editor.undo();
    editor.undo();
    expect(editor.document.steps).toHaveLength(1);
  });

  it('reduces existing undo history when its setting changes without mutating shared defaults', () => {
    const editor = new SequenceEditor(emptySequence());
    for (const symbol of ['C', 'Dm', 'G7', 'C']) editor.insert([{ symbol }]);
    editor.settings = { ...DEFAULT_SETTINGS.editor, undoLimit: 1, velocity: 100 };
    editor.undo();
    editor.undo();
    expect(editor.document.steps).toHaveLength(3);
    expect(DEFAULT_SETTINGS.editor.velocity).toBe(80);
  });

  it('supports tempos and lengths beyond the old arbitrary editor limits and exports the result', () => {
    const editor = new SequenceEditor(emptySequence());
    editor.update({ bpm: 360 });
    editor.insert([
      { symbol: 'C', beats: 128 },
      { symbol: 'G7', beats: 0.125 },
    ]);
    const data = writeMidi(sequencePiece(editor.document));
    expect(midiFileMeta(data.buffer).bpm).toBeCloseTo(360, 2);
    expect(editor.document.steps.map((s) => s.beats)).toEqual([128, 0.125]);
  });
});
