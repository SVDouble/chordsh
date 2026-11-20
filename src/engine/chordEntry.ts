export interface PlayedChord {
  symbol: string;
  notes: number[];
  velocity: number;
}

export interface PlayedInput<T> {
  target: T;
  chords: PlayedChord[];
}

/** Group real input gestures, preserving full voicings through release and pedal-held phrases. */
export class ChordEntry<T> {
  private held = new Map<number, number>();
  private target: T | null = null;
  private current: PlayedChord | null = null;
  private completed: PlayedChord[] = [];
  private pedal = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private options: {
      delay: () => number;
      target: () => T;
      identify: (notes: number[], velocity: number, target: T) => PlayedChord | null;
      preview: (input: PlayedInput<T> | null) => void;
      commit: (input: PlayedInput<T>) => void;
    },
  ) {}

  noteOn(note: number, velocity: number) {
    if (!this.held.size) {
      if (!this.pedal) this.flush();
      else if (this.current) this.completed.push(this.current);
      this.current = null;
      this.target ??= this.options.target();
    }
    clearTimeout(this.timer);
    this.held.set(note, velocity);
    const notes = [...this.held.keys()].sort((a, b) => a - b);
    const average = Math.round([...this.held.values()].reduce((sum, v) => sum + v, 0) / this.held.size);
    this.current = this.options.identify(notes, average, this.target!) ?? this.current;
    this.options.preview(this.snapshot());
  }

  noteOff(note: number) {
    if (!this.held.delete(note)) return;
    this.schedule();
  }

  setPedal(on: boolean) {
    this.pedal = on;
    this.schedule();
  }

  private snapshot(): PlayedInput<T> | null {
    const chords = [...this.completed, ...(this.current ? [this.current] : [])];
    return this.target !== null && chords.length ? { target: this.target, chords } : null;
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!this.held.size && !this.pedal && this.snapshot())
      this.timer = setTimeout(() => this.flush(), this.options.delay());
  }

  private flush() {
    if (this.held.size || this.pedal) return;
    const input = this.snapshot();
    this.cancel();
    if (input) this.options.commit(input);
  }

  finishReleased() {
    this.flush();
  }

  cancel() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.held.clear();
    this.target = null;
    this.current = null;
    this.completed = [];
    this.options.preview(null);
  }
}
