import { afterEach, describe, expect, it, vi } from 'vitest';
import { Synth } from '../src/io/synth';
import { DEFAULT_SETTINGS } from '../src/config/settings';

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
  const nodes: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
  const node = () => {
    const n = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() };
    nodes.push(n);
    return n;
  };
  const oscillators: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const ctx = {
    state,
    currentTime: 0,
    destination: node(),
    onstatechange: () => {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    createGain: () => {
      const gain = param();
      gain.value = 1; // WebAudio's real default; an uninitialised cancelled envelope must fail tests.
      gainParams.push(gain);
      return { ...node(), gain };
    },
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param() }),
    createBiquadFilter: () => {
      const frequency = param();
      filters.push(frequency);
      return { ...node(), frequency };
    },
    createOscillator: () => {
      const oscillator = {
        ...node(),
        frequency: param(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
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
  return { synth, ctx, oscillators, resume, gainParams, filters, nodes };
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
    const { synth, oscillators, ctx } = setup('running');
    synth.noteOn(60, 90);
    synth.setPedal(true);
    synth.noteOff(60);
    synth.play([64], 30, 1);
    ctx.currentTime = 0.1;
    synth.silence();
    expect(oscillators).toHaveLength(4);
    for (const oscillator of oscillators.slice(0, 2)) expect(oscillator.stop.mock.lastCall![0]).toBeCloseTo(0.16);
    for (const oscillator of oscillators.slice(2)) expect(oscillator.stop).toHaveBeenLastCalledWith(0.1);
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

describe('stable synth voices', () => {
  it('makes cancelled future notes silent immediately, without a default-gain attack', () => {
    const { synth, ctx, oscillators, gainParams } = setup('running');
    synth.play([60], 0.06, 1, 90);
    ctx.currentTime = 0.01;
    synth.stop();
    const envelope = gainParams.find((p) => p.linearRampToValueAtTime.mock.calls.length)!;
    expect(envelope.value).toBe(0);
    expect(envelope.setValueAtTime).toHaveBeenLastCalledWith(0, 0.01);
    for (const oscillator of oscillators) {
      expect(oscillator.stop).toHaveBeenLastCalledWith(0.01);
      expect(oscillator.disconnect).toHaveBeenCalledOnce();
    }
  });

  it('keeps timbre fixed at different velocities while preserving loudness dynamics', () => {
    const { synth, filters, gainParams } = setup('running');
    synth.noteOn(60, 30);
    synth.noteOn(64, 120);
    expect(filters[0].setValueAtTime.mock.calls[0][0]).toBe(4000);
    expect(filters[1].setValueAtTime.mock.calls[0][0]).toBe(4000);
    const envelopes = gainParams.filter((p) => p.linearRampToValueAtTime.mock.calls.length);
    expect(envelopes[0].linearRampToValueAtTime.mock.calls[0][0]).toBeLessThan(
      envelopes[1].linearRampToValueAtTime.mock.calls[0][0],
    );
  });

  it('crossfades released tails on repeated pitches and never extends an old stop time', () => {
    const { synth, ctx, oscillators } = setup('running');
    synth.noteOn(60, 90);
    ctx.currentTime = 0.1;
    synth.noteOff(60);
    expect(oscillators[0].stop.mock.lastCall![0]).toBeCloseTo(0.7);
    ctx.currentTime = 0.15;
    synth.noteOn(60, 90);
    expect(oscillators[0].stop.mock.lastCall![0]).toBeCloseTo(0.21);
    ctx.currentTime = 0.18;
    synth.silence();
    expect(oscillators[0].stop.mock.lastCall![0]).toBeCloseTo(0.21);
    expect(oscillators[2].stop.mock.lastCall![0]).toBeCloseTo(0.24);
  });

  it('anchors the current attack level when a short note ends before the attack ramp', () => {
    const { synth, ctx, gainParams } = setup('running');
    synth.noteOn(60, 90);
    ctx.currentTime = 0.002;
    synth.noteOff(60);
    const envelope = gainParams.find((p) => p.linearRampToValueAtTime.mock.calls.length)!;
    expect(envelope.setValueAtTime.mock.lastCall![0]).toBeGreaterThan(0);
    expect(envelope.setValueAtTime.mock.lastCall![1]).toBe(0.002);
  });

  it('cleans ended nodes without deleting a newer held attack of the same pitch', () => {
    const { synth, ctx, oscillators } = setup('running');
    synth.noteOn(60, 90);
    synth.setPedal(true);
    ctx.currentTime = 0.05;
    synth.noteOff(60);
    ctx.currentTime = 0.1;
    synth.noteOn(60, 90);
    for (const oscillator of oscillators.slice(0, 2)) oscillator.onended!();
    for (const oscillator of oscillators.slice(0, 2)) expect(oscillator.disconnect).toHaveBeenCalledOnce();
    ctx.currentTime = 0.2;
    synth.setPedal(false);
    synth.noteOff(60);
    for (const oscillator of oscillators.slice(2)) expect(oscillator.stop).toHaveBeenCalled();
  });

  it('leaves live notes alone when stopping a preview and removes completed voices', () => {
    const { synth, ctx, oscillators } = setup('running');
    synth.noteOn(60, 90);
    synth.play([64], 0.06, 1);
    ctx.currentTime = 0.02;
    synth.stop();
    for (const oscillator of oscillators.slice(0, 2)) expect(oscillator.stop).not.toHaveBeenCalled();
    for (const oscillator of oscillators.slice(2)) expect(oscillator.disconnect).toHaveBeenCalledOnce();
    ctx.currentTime = 0.3;
    synth.noteOff(60);
    for (const oscillator of oscillators.slice(0, 2)) oscillator.onended!();
    const stops = oscillators.map((o) => o.stop.mock.calls.length);
    synth.silence();
    expect(oscillators.map((o) => o.stop.mock.calls.length)).toEqual(stops);
  });

  it('reclaims expired voices by audio time when a background tab delays ended callbacks', () => {
    const { synth, ctx, oscillators } = setup('running');
    synth.noteOn(60, 90);
    ctx.currentTime = 0.1;
    synth.noteOff(60);
    ctx.currentTime = 2;
    // No onended delivery: the audio thread has already stopped these oscillators.
    synth.noteOn(62, 90);
    for (const oscillator of oscillators.slice(0, 2)) expect(oscillator.disconnect).toHaveBeenCalledOnce();
    for (const oscillator of oscillators.slice(2)) expect(oscillator.disconnect).not.toHaveBeenCalled();
    for (const oscillator of oscillators.slice(0, 2)) oscillator.onended!();
    ctx.currentTime = 2.1;
    synth.noteOff(62);
    for (const oscillator of oscillators.slice(2)) expect(oscillator.stop).toHaveBeenCalled();
  });

  it('changes the patch only through explicit sound settings and preserves mute state', () => {
    const { synth, ctx, filters, gainParams } = setup('running');
    synth.configure({ ...DEFAULT_SETTINGS.audio, volume: 0.3, brightnessHz: 6000, velocityTone: 1 });
    synth.noteOn(60, 80);
    expect(gainParams[0].value).toBe(0.3);
    expect(filters[0].setValueAtTime.mock.calls[0][0]).toBe(6000);
    synth.setMuted(true);
    synth.configure({ ...DEFAULT_SETTINGS.audio, volume: 0.7 });
    expect(gainParams[0].setTargetAtTime.mock.lastCall![0]).toBe(0);
    synth.setMuted(false);
    expect(gainParams[0].setTargetAtTime.mock.lastCall![0]).toBe(0.7);
    expect(ctx.close).not.toHaveBeenCalled();
    synth.noteOn(64, 80);
    expect(filters[1].setValueAtTime.mock.calls[0][0]).toBe(4000);
  });
});
