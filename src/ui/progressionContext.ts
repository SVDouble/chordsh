import type { Sequence } from '../engine/sequence';
import type { Chord } from '../theory/chords';
import { parseChordSymbol } from '../theory/symbols';

export function progressionContext(doc: Sequence, span: { start: number; end: number }) {
  const before = doc.steps
    .filter((step) => step.start + step.beats <= span.start + 1e-8)
    .slice(-3)
    .map((step) => parseChordSymbol(step.symbol))
    .filter((chord): chord is Chord => chord !== null);
  const afterStep = doc.steps.find((step) => Math.abs(step.start - span.end) < 1e-8);
  const melody = doc.melody ?? [];
  const later = melody.find((note) => note.start >= span.end - 1e-8);
  const lastIn = melody
    .filter((note) => note.start < span.end)
    .reduce((end, note) => Math.max(end, note.start + note.beats), 0);
  const phraseEnd = !later || later.start - lastIn >= 1 - 1e-8;
  const after = afterStep ? parseChordSymbol(afterStep.symbol) : null;
  return {
    before,
    after,
    melody,
    phraseEnd,
    songStart: span.start < 1e-8 && !before.length,
    songEnd: !later && !doc.steps.some((step) => step.start >= span.end - 1e-8),
  };
}
