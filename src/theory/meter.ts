import { MUSIC_LIMITS } from '../config/settings';

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export function validateMeter(numerator: number, denominator: number): TimeSignature {
  if (!Number.isInteger(numerator) || numerator < MUSIC_LIMITS.minMeter || numerator > MUSIC_LIMITS.maxMeter)
    throw new Error(`Meter numerator must be an integer from ${MUSIC_LIMITS.minMeter} to ${MUSIC_LIMITS.maxMeter}.`);
  if (!Number.isInteger(denominator) || denominator < 1 || denominator > MUSIC_LIMITS.maxDenominator)
    throw new Error(`Meter denominator must be an integer from 1 to ${MUSIC_LIMITS.maxDenominator}.`);
  return { numerator, denominator };
}

/** Timeline/document positions remain quarter notes; a notated beat is 1/denominator of a whole note. */
export const notatedQuarters = (beats: number, denominator = 4) => (beats * 4) / denominator;
export const beatQuarters = (denominator = 4) => notatedQuarters(1, denominator);
export const barQuarters = (numerator: number, denominator = 4) => notatedQuarters(numerator, denominator);
export const meterLabel = (numerator: number, denominator = 4) => `${numerator}/${denominator}`;
export const binaryDenominator = (denominator: number) => Number.isInteger(Math.log2(denominator));

export function meterPosition(quarters: number, numerator: number, denominator = 4) {
  const beats = quarters / beatQuarters(denominator);
  const bar = Math.floor((beats + 1e-8) / numerator);
  return { bar: bar + 1, beat: Number((beats - bar * numerator + 1).toFixed(6)) };
}
