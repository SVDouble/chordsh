# Engine

How Musify turns a stream of MIDI notes into chords, keys, bars and advice. All of it is plain TypeScript
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

## Two layers

**Instant layer — `Segmenter` + `identify()`.** Groups onsets (70 ms), separates harmony from melody (held
chords anchor the harmony; notes above them are melody; rolled chords; auto hand split), and names the
notes you are holding with the rule-based recogniser in `theory/chords.ts` (every root scored; extensions,
inversions, rootless voicings). This is what *Now playing*, practice mode and song following use: it reacts
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
  - *emission* — template fit: weighted chord tones present, missing tones and unexplained notes penalised,
    bass-is-root bonus;
  - *chord-in-key prior* — diatonic > secondary dominant / leading-tone > borrowed > other; tonic and
    dominant bonuses; written in scale degrees, so it holds in every key;
  - *key fit* — share of the segment inside the key's scale;
  - *transitions* — changing chord costs `chordChange`, changing key costs `keyChange` (pivot: key change
    on the same chord is allowed).
- **Decoding.** Viterbi in O(states) per segment (four ways into a state: stay, new chord, pivot, both).
  - *live* = best state of the newest column (`current()`, `liveChords(k)`);
  - *hindsight* = backtracked best path (`path()`), recomputed as music arrives → earlier labels can change;
  - *theories* = best path per final key, softmax over their scores (`theories()`, `keyDistribution()`);
  - *top-k* = max-marginals from a backward pass (`ranked()`), used by the benchmark.
- **Open segment.** The chord you are still playing is evaluated *tentatively* (not committed) so it shows
  up immediately; once released it counts until the sound has died away.
- **Parameters** live in `DEFAULT_PARAMS`, tuned with `npm run tune` on the benchmark's tune split.

## Bars (BeatTracker)

Tempo by autocorrelation of an onset envelope (8 s window, prior around 100 bpm), phase by beat-position
energy, then bars by a Viterbi over beat-in-bar positions where downbeats earn *accents* (new bass note,
fresh harmony) and 3 vs 4 beats per bar is chosen by contrast. Bars are **relative**: they are only shown
when the pulse is confident, or when a metronome / MIDI file / library piece fixes the tempo.

## Theory modules

| module | job |
|---|---|
| `theory/pitch.ts` | pitch classes, letter-correct spelling |
| `theory/scales.ts` | keys, modes, relations (relative, parallel, circle of fifths) |
| `theory/chords.ts` | chord recognition from any note set, naming, tone roles |
| `theory/symbols.ts` | lead-sheet chord-symbol parser (round-trips our names) |
| `theory/roman.ts` | function in a key: diatonic, secondary dominant, tritone sub, backdoor, borrowed, Neapolitan… |
| `theory/patterns.ts` | ii–V–I, cadences, circle of fifths, loops |
| `theory/voicing.ts` | voice-led voicings for suggestions |

## Coaching and charts

`coach.ts` (next moves incl. passing / common-tone / leading-tone °7, key reachability, routes to a target
key), `chart.ts` (chart parsing + analysis), `song.ts` (forgiving play-along comparison + habits),
`reharm.ts` (reharmonisation ideas). These consume chords and keys; they don't care which layer produced them.

## Known limits / next steps

See the error breakdown in [benchmark.md](benchmark.md) and the candidates in [research.md](research.md):
boundary errors (→ segmental model, beat-aware segments), tonicization vs modulation, non-chord-tone
weighting, a vocabulary/grammar layer for patterns and figurations.
