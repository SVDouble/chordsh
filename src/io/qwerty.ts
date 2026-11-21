import type { MidiHandlers } from './midi';

// Two rows like a piano: A W S E D F T G Y H U J K O L P ; → C4…E5.  Z/X = octave, Space = pedal.
const KEYS = 'awsedftgyhujkolp;';

/** Don't play notes while the user is typing in a form field. */
const typing = (e: KeyboardEvent) =>
  e.target instanceof HTMLInputElement ||
  e.target instanceof HTMLTextAreaElement ||
  e.target instanceof HTMLSelectElement;

export function attachQwerty(h: MidiHandlers): () => void {
  let octave = 0;
  let spacePedal = false;
  const down = new Map<string, number>();

  const onDown = (e: KeyboardEvent) => {
    if (e.repeat || typing(e) || e.metaKey || e.ctrlKey || document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    if (k === 'z') octave = Math.max(-3, octave - 1);
    else if (k === 'x') octave = Math.min(3, octave + 1);
    else if (k === ' ') {
      if (e.target instanceof Element && e.target.matches('button:focus-visible, summary:focus-visible')) return;
      e.preventDefault();
      spacePedal = true;
      h.pedal(true, performance.now());
    } else {
      const i = KEYS.indexOf(k);
      if (i < 0) return;
      const note = 60 + 12 * octave + i;
      down.set(k, note);
      h.noteOn(note, 90, performance.now());
    }
  };
  const onUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === ' ') {
      if (spacePedal) h.pedal(false, performance.now());
      spacePedal = false;
      return;
    }
    const note = down.get(k);
    if (note === undefined) return;
    down.delete(k);
    h.noteOff(note, performance.now());
  };
  addEventListener('keydown', onDown);
  addEventListener('keyup', onUp);
  return () => {
    removeEventListener('keydown', onDown);
    removeEventListener('keyup', onUp);
  };
}
