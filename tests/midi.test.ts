import { describe, expect, it, vi } from 'vitest';
import { Midi } from '../src/io/midi';

function fakePort(id: string, name: string, failOpen = false) {
  return {
    id,
    name,
    connection: 'closed',
    onmidimessage: null as ((e: unknown) => void) | null,
    open: vi.fn(() =>
      failOpen ? Promise.reject(Object.assign(new Error('busy'), { name: 'InvalidAccessError' })) : Promise.resolve(),
    ),
  };
}

async function setup(ports: ReturnType<typeof fakePort>[]) {
  const inputs = new Map(ports.map((p) => [p.id, p]));
  vi.stubGlobal('navigator', {
    requestMIDIAccess: () => Promise.resolve({ inputs, outputs: new Map(), onstatechange: null }),
  });
  const h = { noteOn: vi.fn(), noteOff: vi.fn(), pedal: vi.fn() };
  const midi = new Midi(h);
  await midi.init();
  await Promise.resolve();
  return { midi, h };
}

describe('Web MIDI input', () => {
  it('cancels queued output and silences sustained audition notes', async () => {
    const output = { id: 'out', name: 'Test output', clear: vi.fn(), send: vi.fn() };
    vi.stubGlobal('navigator', {
      requestMIDIAccess: () => Promise.resolve({ inputs: new Map(), outputs: new Map([['out', output]]) }),
    });
    const midi = new Midi({ noteOn: vi.fn(), noteOff: vi.fn(), pedal: vi.fn() });
    await midi.init();
    midi.outputId = 'out';
    midi.send([60], 1000, 500);
    midi.panic();
    expect(output.clear).toHaveBeenCalledOnce();
    expect(output.send.mock.calls.slice(-3)).toEqual([[[0xb0, 64, 0]], [[0xb0, 123, 0]], [[0xb0, 120, 0]]]);
  });

  it('recognises an MPK mini Plus II, ignores Midi Through, takes notes on any channel', async () => {
    const mpk = fakePort('a', 'MPK mini Plus II:MPK mini Plus II MIDI Port 36:0');
    const daw = fakePort('b', 'MPK mini Plus II:MPK mini Plus II DAW Port 36:1');
    const through = fakePort('c', 'Midi Through:Midi Through Port-0 14:0');
    const { midi, h } = await setup([through, mpk, daw]);
    expect(midi.devices).toEqual(['MPK mini Plus II']);
    expect(through.onmidimessage).toBeNull();
    expect(mpk.open).toHaveBeenCalled();
    mpk.onmidimessage!({ data: new Uint8Array([0x99, 36, 100]) }); // pad on channel 10
    mpk.onmidimessage!({ data: new Uint8Array([0x90, 60, 80]) });
    mpk.onmidimessage!({ data: new Uint8Array([0x90, 60, 0]) }); // note-on with velocity 0 = off
    expect(h.noteOn).toHaveBeenCalledTimes(2);
    expect(h.noteOff).toHaveBeenCalledWith(60, expect.any(Number));
    expect(midi.last).toMatchObject({ port: 'MPK mini Plus II', text: '90 3c 00' });
  });

  it('explains a port that cannot be opened', async () => {
    const busy = fakePort('a', 'MPK mini Plus II:MPK mini Plus II MIDI Port 36:0', true);
    const { midi } = await setup([busy]);
    await new Promise((r) => setTimeout(r, 0));
    expect(midi.inputs[0].error).toContain('another app');
  });
});
