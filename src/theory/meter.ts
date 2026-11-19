import { METER_DENOMINATORS, MUSIC_LIMITS } from '../config/settings';

export const isMeterDenominator = (value: unknown) => METER_DENOMINATORS.some((n) => n === value);

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export function validateMeter(numerator: number, denominator: number): TimeSignature {
  if (!Number.isInteger(numerator) || numerator < MUSIC_LIMITS.minMeter || numerator > MUSIC_LIMITS.maxMeter)
    throw new Error(`Meter numerator must be an integer from ${MUSIC_LIMITS.minMeter} to ${MUSIC_LIMITS.maxMeter}.`);
  if (!isMeterDenominator(denominator))
    throw new Error(`Choose a meter denominator from ${METER_DENOMINATORS.join(', ')}.`);
  return { numerator, denominator };
}

/** Timeline/document positions remain quarter notes; a notated beat is 1/denominator of a whole note. */
export const notatedQuarters = (beats: number, denominator = 4) => (beats * 4) / denominator;
export const beatQuarters = (denominator = 4) => notatedQuarters(1, denominator);
export const barQuarters = (numerator: number, denominator = 4) => notatedQuarters(numerator, denominator);
export const meterLabel = (numerator: number, denominator = 4) => `${numerator}/${denominator}`;

export function meterPosition(quarters: number, numerator: number, denominator = 4) {
  const beats = quarters / beatQuarters(denominator);
  const bar = Math.floor((beats + 1e-8) / numerator);
  return { bar: bar + 1, beat: Number((beats - bar * numerator + 1).toFixed(6)) };
}
