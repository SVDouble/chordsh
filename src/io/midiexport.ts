import { MUSIC_LIMITS } from '../config/settings';
import { binaryDenominator, validateMeter } from '../theory/meter';
import type { Piece } from '../library/pieces';

export const METER_TEXT_PREFIX = 'chord.sh meter ';
const PPQ = 960;

/** Non-binary meters use equivalent MIDI meter/tempo so every notated beat retains its duration. */
export function midiExportInfo(piece: Piece) {
  const originalBpm = piece.bpm ?? 120;
  const { numerator, denominator: originalDenominator } = validateMeter(piece.beatsPerBar ?? 4, piece.denominator ?? 4);
  if (!Number.isFinite(originalBpm) || originalBpm < MUSIC_LIMITS.minBpm || originalBpm > MUSIC_LIMITS.maxBpm)
    throw new Error(`MIDI export needs a tempo from ${MUSIC_LIMITS.minBpm} to ${MUSIC_LIMITS.maxBpm} BPM.`);
  const converted = !binaryDenominator(originalDenominator);
  let denominator = converted ? 2 ** Math.round(Math.log2(originalDenominator)) : originalDenominator;
  // A MIDI tempo occupies three bytes. At very slow tempos, choose the lower binary denominator.
  if (Math.round(60e6 / ((originalBpm * originalDenominator) / denominator)) > 0xffffff)
    denominator = 2 ** Math.floor(Math.log2(originalDenominator));
  const bpm = (originalBpm * originalDenominator) / denominator;
  const tempoUs = Math.round(60e6 / bpm);
  return { numerator, denominator, bpm, tempoUs, converted, originalBpm, originalDenominator };
}

/** Standard MIDI File, format 0, one tempo/meter and one note track. No synth or host dependency. */
export function writeMidi(piece: Piece, channel = 0): Uint8Array<ArrayBuffer> {
  const info = midiExportInfo(piece);
  const { bpm, numerator: meter, denominator, tempoUs: tempo } = info;
  if (!Number.isInteger(channel) || channel < 0 || channel > 15) throw new Error('MIDI channel must be from 0 to 15.');
  const vlq = (n: number) => {
    if (!Number.isSafeInteger(n) || n < 0 || n > 0x0fffffff)
      throw new Error('MIDI event is outside the supported time range.');
    const bytes = [n & 0x7f];
    n = Math.floor(n / 128);
    while (n) {
      bytes.unshift((n & 0x7f) | 0x80);
      n = Math.floor(n / 128);
    }
    return bytes;
  };
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const tick = (ms: number) => Math.round((ms * bpm * PPQ) / 60000);
  const title = [...new TextEncoder().encode(piece.title)];
  const track = [
    0,
    0xff,
    3,
    ...vlq(title.length),
    ...title,
    0,
    0xff,
    0x51,
    3,
    (tempo >>> 16) & 255,
    (tempo >>> 8) & 255,
    tempo & 255,
    0,
    0xff,
    0x58,
    4,
    meter,
    Math.log2(denominator),
    Number.isInteger(96 / denominator) ? 96 / denominator : 24,
    8,
  ];
  if (info.converted) {
    const text = [
      ...new TextEncoder().encode(
        METER_TEXT_PREFIX +
          JSON.stringify({
            version: 1,
            numerator: meter,
            denominator: info.originalDenominator,
            bpm: info.originalBpm,
            midiDenominator: denominator,
            midiTempoUs: tempo,
          }),
      ),
    ];
    track.push(0, 0xff, 1, ...vlq(text.length), ...text);
  }
  const events: { tick: number; status: number; note: number; velocity: number; order: number }[] = [];
  let end = 0;
  for (const [at, duration, note, velocity] of piece.notes) {
    if (
      !Number.isFinite(at) ||
      at < 0 ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Number.isInteger(note) ||
      note < 0 ||
      note > 127 ||
      !Number.isInteger(velocity) ||
      velocity < 1 ||
      velocity > 127
    )
      throw new Error('MIDI export contains an invalid note.');
    const start = tick(at),
      stop = Math.max(start + 1, tick(at + duration));
    events.push(
      { tick: start, status: 0x90, note, velocity, order: 2 },
      { tick: stop, status: 0x80, note, velocity: 0, order: 0 },
    );
    end = Math.max(end, stop);
  }
  for (const [at, on] of piece.pedal ?? []) {
    if (!Number.isFinite(at) || at < 0) throw new Error('Invalid sustain event.');
    const when = tick(at);
    end = Math.max(end, when);
    events.push({ tick: when, status: 0xb0, note: 64, velocity: on ? 127 : 0, order: 1 });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order || a.note - b.note);
  let previous = 0;
  for (const event of events) {
    track.push(...vlq(event.tick - previous), event.status | channel, event.note, event.velocity);
    previous = event.tick;
  }
  const finalTick = Math.max(end, tick(piece.durationMs ?? 0));
  if (piece.pedal?.[piece.pedal.length - 1]?.[1]) {
    track.push(...vlq(finalTick - previous), 0xb0 | channel, 64, 0);
    previous = finalTick;
  }
  track.push(...vlq(finalTick - previous), 0xff, 0x2f, 0);
  return new Uint8Array([
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    (PPQ >>> 8) & 255,
    PPQ & 255,
    0x4d,
    0x54,
    0x72,
    0x6b,
    ...u32(track.length),
    ...track,
  ]);
}
