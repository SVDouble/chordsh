import { afterEach, describe, expect, it, vi } from 'vitest';
import { Synth } from '../src/io/synth';

function setup(state: AudioContextState = 'suspended') {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const gainParams: ReturnType<typeof param>[] = [];
  const filters: ReturnType<typeof param>[] = [];
  const node = () => ({ connect: vi.fn().mockReturnThis() });
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const ctx = {
    state,
    currentTime: 0,
    destination: node(),
    onstatechange: () => {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: () => {
      const gain = param();
      gainParams.push(gain);
      return { ...node(), gain };
    },
    createDynamicsCompressor: node,
    createBiquadFilter: () => {
      const frequency = param();
      filters.push(frequency);
      return { ...node(), frequency };
    },
    createOscillator: () => {
      const oscillator = { ...node(), frequency: param(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(oscillator);
      return oscillator;
    },
  };
  vi.stubGlobal(
    'AudioContext',
    // biome-ignore lint/complexity/useArrowFunction: the AudioContext mock must be constructible.
    vi.fn(function () {
      return ctx;
    }),
  );
  const synth = new Synth();
  const resume = () => {
    ctx.state = 'running';
    ctx.onstatechange();
  };
  return { synth, ctx, oscillators, resume, gainParams, filters };
}

afterEach(() => vi.unstubAllGlobals());

describe('browser audio activation', () => {
  it('uses the same velocity curve, brightness and envelope for live/playback notes and previews', () => {
    const { synth, filters, gainParams } = setup('running');
    synth.noteOn(60, 96);
    synth.play([60], 0, 1, 96);
    expect(filters[0].setValueAtTime.mock.calls[0]).toEqual(filters[1].setValueAtTime.mock.calls[0]);
    const attacks = gainParams.filter((p) => p.linearRampToValueAtTime.mock.calls.length);
    expect(attacks).toHaveLength(2);
    expect(attacks[0].linearRampToValueAtTime.mock.calls[0]).toEqual(attacks[1].linearRampToValueAtTime.mock.calls[0]);
  });

  it('silences notes and closes the old audio context once when disposed for a development update', () => {
    const { synth, ctx, oscillators } = setup('running');
    synth.noteOn(60, 90);
    synth.play([64], 30, 1);
    synth.dispose();
    expect(ctx.close).toHaveBeenCalledTimes(1);
    expect(ctx.onstatechange).toBeNull();
    expect(oscillators.every((o) => o.stop.mock.calls.length)).toBe(true);
    synth.dispose();
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it('reports already permitted audio before any notes are played', () => {
    const { synth } = setup('running');
    synth.onState = vi.fn();
    synth.init();
    expect(synth.blocked).toBe(false);
    expect(synth.onState).toHaveBeenCalled();
  });

  it('plays a held first note once audio resumes, without duplicating it', async () => {
    const { synth, ctx, oscillators, resume } = setup();
    synth.noteOn(60, 90);
    expect(ctx.resume).toHaveBeenCalled();
    expect(oscillators).toHaveLength(0);
    resume();
    await Promise.resolve();
    expect(oscillators).toHaveLength(2);
    expect(oscillators.every((o) => o.start.mock.calls.length === 1)).toBe(true);
    synth.noteOff(60);
    expect(oscillators.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
  });

  it('does not replay notes released while audio was blocked', async () => {
    const { synth, oscillators, resume } = setup();
    synth.noteOn(60, 90);
    synth.noteOff(60);
    resume();
    await Promise.resolve();
    expect(oscillators).toHaveLength(0);
  });

  it('silences sustained live voices and future previews, then releases the pedal', () => {
    const { synth, oscillators } = setup('running');
    synth.noteOn(60, 90);
    synth.setPedal(true);
    synth.noteOff(60);
    synth.play([64], 30, 1);
    synth.silence();
    expect(oscillators).toHaveLength(4);
    for (const oscillator of oscillators) expect(oscillator.stop).toHaveBeenLastCalledWith(0.6);
    synth.noteOn(62, 90);
    synth.noteOff(62);
    expect(oscillators[4].stop).toHaveBeenCalled();
  });

  it('discards blocked notes when Stop is pressed before audio is enabled', async () => {
    const { synth, oscillators, resume } = setup();
    synth.noteOn(60, 90);
    synth.silence();
    resume();
    await Promise.resolve();
    expect(oscillators).toHaveLength(0);
  });
});
