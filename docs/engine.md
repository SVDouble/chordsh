# Engine

How chord.sh turns a stream of MIDI notes into chords, keys, bars and advice. All of it is plain TypeScript
(`src/theory`, `src/engine`) with no UI dependencies, unit-tested in `tests/` and measured in the
[benchmark](benchmark.md).

```text
MIDI / keyboard / library piece
        │ noteOn / noteOff / pedal
        ▼
 Session (engine/session.ts) ──────────────────────────────────────────────┐
   ├─ Segmenter (segmenter.ts)        instant layer: the chord you're holding,│
   │                                  melody notes, practice & song following │
   ├─ SegmentBuilder + Harmonizer     analysis layer: chords + keys with      │
   │   (harmonizer.ts)                hindsight, theories, top-k              │
   ├─ BeatTracker (beats.ts)          tempo, beats, bars (relative)           │
   └─ coach.ts / song.ts / chart.ts   advice, routes, play-along, charts      │
        ▼                                                                    │
 history (a view of the harmonizer's best path) · theories · bars ───────────┘
```

## Composition core

`engine/sequence.ts` owns songs independently of the UI. A sequence has a tempo, quarter-note meter,
home key and chord blocks with explicit beat starts/durations, note voicings, velocities and optional
key regions. `SequenceEditor` applies atomic edits with up to 100 undo snapshots. Placement preserves
rests and shifts later blocks only where overlap requires it. Moving, resizing, replacing, duplication,
transposition and chart import use the same document.

`sequencePiece()` compiles the document into the shared playback format. The editor, suggestion +
buttons and reharmonisation ✓ buttons all edit this same object; previews leave it unchanged. The
Svelte bridge persists documents and refreshes a running arrangement at its current beat after an edit.
`sequenceChart()` retains per-block key context for numerals and further suggestions.

`io/midiexport.ts` writes Standard MIDI File format 0 with 480 ticks per quarter, a tempo/meter, note
velocities and sustain. MIDI imports and recordings retain pedal changes; notes held when recording
ends are clipped to the recording length. Playback and previews share synth/MIDI output selection.
See [DAW integration](daw.md) for current routing and the proposed native host boundary.

## Two layers

**Instant layer — `Segmenter` + `identify()`.** Groups onsets (70 ms), separates harmony from melody (held
chords anchor the harmony; notes above them are melody; rolled chords; auto hand split), and names the
notes you are holding with the rule-based recogniser in `theory/chords.ts` (every root scored; extensions,
inversions, rootless voicings). This is what _Now playing_, practice mode and song following use: it reacts
immediately and matches what your hands do.

**Analysis layer — `Harmonizer`.** Explains the whole performance. Changes to its conclusions flow back into
the history (`↻`).

## Harmonizer (HMM over key × chord)

- **Segments.** A new segment starts at each onset group. A segment's salience vector weights every note
  that sounded in it: fresh onsets 1.0, held notes fade with a floor (you're still holding the harmony),
  bass ×1.5, high register ×0.8, velocity √. Notes are snapshotted when they sound, so releasing them before
  the next onset doesn't erase them.
- **States.** 24 keys × (12 roots × 11 chord types: maj, min, dim, aug, sus4, sus2, 7, maj7, m7, m7♭5, °7) = 3,168.
- **Scores** (log-domain, per second of music):
  - _emission_ — template fit: weighted chord tones present, missing tones and unexplained notes penalised,
    bass-is-root bonus;
  - _chord-in-key prior_ — diatonic > secondary dominant / leading-tone > borrowed > other; tonic and
    dominant bonuses; written in scale degrees, so it holds in every key;
  - _key fit_ — share of the segment inside the key's scale;
  - _transitions_ — chord changes use a learned, transposition-invariant root-transition model;
    changing key costs `keyChange` (pivot: key change on the same chord is allowed).
- **Decoding.** Viterbi in O(states + 24 × 12²) per segment. Maxima grouped by root keep learned
  transitions inexpensive; the four ways into a state remain stay, new chord, pivot, or both.
  - _live_ = best state of the newest column (`current()`, `liveChords(k)`);
  - _hindsight_ = backtracked best path (`path()`), recomputed as music arrives → earlier labels can change;
  - _theories_ = best path per final key, softmax over their scores (`theories()`, `keyDistribution()`);
  - _top-k_ = max-marginals from a backward pass (`ranked()`), used by the benchmark.
- **Open segment.** The chord you are still playing is evaluated _tentatively_ (not committed) so it shows
  up immediately; once released it counts until the sound has died away.
- **Parameters** live in `DEFAULT_PARAMS`, tuned with `npm run tune` on the benchmark's tune split.

### Learned harmonic transitions

`npm run train` reads only the tune split's expert chord/key labels and regenerates
`src/engine/transitions.ts`. It learns root-to-root probabilities relative to the current tonic,
separately for major and minor. Corpus totals have equal weight; additive smoothing gives unseen moves
nonzero probability. The artifact records training counts and a hash of the pinned dataset manifest.
Changing chord from degree `a` to `b` costs:

```text
chordChange × exp(-transitionWeight × log(12 × P(b | a, mode)))
```

The selected weight is 0.125. Setting `P_transitionWeight=0` in the benchmark reproduces the fixed-cost
model. The same costs are used for live Viterbi, hindsight backtracking and backward top-k rankings.
The model is trained offline and runs in the browser without a network request or training dependency.

**Session clearing.** `Session.clear()` resets the open segment and held/sustained analysis notes as
well as the committed harmonizer path. It also cancels queued onset groups, delayed chord strikes and
analysis refreshes, so cleared music cannot reappear or advance a song later. Chord style, manual hand
split, key lock and loaded chart remain available for the next notes. Beat/onset/accent evidence is
also reset, so a new performance cannot inherit the previous performance's pulse.

## Bars (BeatTracker)

Tempo by autocorrelation of an onset envelope (8 s window, prior around 100 bpm), phase by beat-position
energy, then bars by a Viterbi over beat-in-bar positions where downbeats earn _accents_ (new bass note,
fresh harmony) and the configured meter candidates (3 vs 4 by default) are chosen by contrast. Bars are **relative**: they are only shown
when the pulse is confident, or when a metronome / MIDI file / library piece fixes the tempo.

## Theory modules

| module               | job                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------- |
| `theory/pitch.ts`    | pitch classes, letter-correct spelling                                                        |
| `theory/scales.ts`   | keys, modes, relations (relative, parallel, circle of fifths)                                 |
| `theory/chords.ts`   | chord recognition from any note set, naming, tone roles                                       |
| `theory/symbols.ts`  | lead-sheet chord-symbol parser (round-trips our names)                                        |
| `theory/roman.ts`    | function in a key: diatonic, secondary dominant, tritone sub, backdoor, borrowed, Neapolitan… |
| `theory/patterns.ts` | ii–V–I, cadences, circle of fifths, loops                                                     |
| `theory/voicing.ts`  | voice-led voicings for suggestions                                                            |

## Coaching and charts

`coach.ts` (next moves incl. passing / common-tone / leading-tone °7, key reachability, routes to a target
key), `chart.ts` (chart parsing + analysis), `song.ts` (forgiving play-along comparison + habits),
`reharm.ts` (reharmonisation ideas). These consume chords and keys; they don't care which layer produced them.

## Known limits / next steps

See the error breakdown in [benchmark.md](benchmark.md) and the candidates in [research.md](research.md):
boundary errors (→ segmental model, beat-aware segments), tonicization vs modulation, non-chord-tone
weighting, a vocabulary/grammar layer for patterns and figurations.

## Configuration

[`config/settings.ts`](../src/config/settings.ts) owns defaults and validated tuning controls for the
engine, editor and application. The UI generates fields from the same Zod schema. `Session` accepts a
configuration; `configure()` validates before clearing live state and rebuilding cached HMM costs.
Beat periods are derived from user-facing BPM bounds, and beat/bar timing and accent parameters are
injected into their trackers. `Segmenter`, `SegmentBuilder` and the modal-colour detector also receive
configured timing/evidence parameters. See [settings](settings.md) for limits and tradeoffs.

## Timeline input bridge

The Svelte composition bridge renders the current recognised chord as a provisional timeline block.
Recording renders the inferred take in place and commits it to `SequenceEditor` in one insertion when
recording stops. Previewing, selecting and recording share the same chord focus for the inspector and
piano. `SequenceEditor.clear()` is a single undoable edit that preserves song metadata; reset uses it
after stopping playback and clearing input analysis. This does not change harmonic inference.

## Local key regions

Sequences retain a sorted region list: start beat, key (or automatic), optional section name and stable
id. Legacy home keys and per-chord key overrides migrate to regions. `sequenceKeyAt()` supplies the
local key to numerals, the inspector and suggestions. Inserted route destinations create boundaries in
the same undo action as their chords. Inserting/resizing chords moves boundaries anchored to affected
chords; the opening region stays at beat zero. Transposition moves all region keys together. Editing a
region is undoable and browser persistence retains names and boundaries.

## Sketch UI and audio bridge

Chord moves and destination-key paths are rendered as one idea list. The optional circle and the
destination chooser drive the same target, rather than changing tabs. Selecting a target replaces
next-chord rows with routes to that key. Routes carry their destination explicitly when inserted, so
the final region gets the correct key.

`ui/noteContext.ts` keeps piano annotations separate: intervals refer to the focused chord root, while
scale degrees refer to the current major/natural-minor tonic. Every sounding note is annotated,
including notes outside the chord voicing, without using the segmenter's melody/harmony split to
colour them. Enharmonic note names retain their spelled octave. This is a display change, not a change
to melody classification or chord detection.

Audio previews and note playback now share one MIDI-velocity curve and the same oscillator/filter
voice. The UI passes focused/input velocities instead of mixing a normalized preview gain with MIDI
velocities. Recorded sketches anchor their first attack at the insertion cursor, retain attack
velocities and include already sounding notes when armed. Hot-module disposal cancels playback and
closes the old AudioContext. These changes do not alter harmonic inference.
