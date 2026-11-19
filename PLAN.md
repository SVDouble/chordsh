# chord.sh — plan

A composition assistant for developing music: play with chords, build editable timelines, listen to
alternatives and add suggestions, then use your DAW's instruments and export MIDI. The browser editor
provides the current workflow; an OS-independent core with native MIDI plug-in wrappers is the delivery
direction. Live MIDI analysis remains forgiving, key-relative and focused on the musical big picture.

Details: [docs/](docs/README.md) — [app](docs/app.md), [engine](docs/engine.md),
[benchmark](docs/benchmark.md), [research](docs/research.md).

## Principles

- **Interval-only theory.** Rules are written in scale degrees / intervals, so they hold in every key.
- **Flexible interpretation.** Several explanations are kept alive; earlier readings are revised with
  hindsight; competing theories are shown, not hidden.
- **Measured, not guessed.** Every engine change is checked on the [benchmark](docs/benchmark.md)
  (pinned corpora, tune/test split, top-k and error breakdown).
- **Pure engine, thin UI.** Music logic is plain TypeScript; the Svelte UI only renders it.
- **Conventional Commits** on `main`; local data under `local/` (git-ignored).

## Done

1. **Live companion** — chord recognition (extensions, inversions, rootless), function in the key, next
   moves incl. the everyday °7s, tonal map, routes to another key with practice mode.
2. **Songs** — chord charts, forgiving play-along with habits, reharmonisation ideas, charts from your playing.
3. **Analysis engine v2** — HMM over key × chord with hindsight (↻), competing theories, live vs hindsight
   layers, top-k.
4. **Bars** — beat tracking, Viterbi bar decoding, 3 vs 4; bars shown only with a confident pulse,
   metronome, or a piece's own tempo.
5. **Library** — the demo, recordings, MIDI files and benchmark pieces all play through the same pipeline.
6. **Tooling** — session recording + replay, reproducible benchmark over 5 corpora (classical, romantic,
   pop, jazz), parameter tuning on a tune split, Biome formatting/linting and Markdown structure checks.
7. **Workspace** — progression in the default main panel; next chords and key-change routes together
   under Where next; browser audio state detected before the first note; clearing discards open segments
   and queued notes so previous music cannot reappear.
8. **Five-corpus tuning** — defaults selected on the tune split and checked on all 684 test pieces:
   better key accuracy and combined score, with a chord-accuracy tradeoff documented in
   [the benchmark comparison](docs/benchmark.md#2026-11-19--five-corpus-tuning-test-split).

9. **Learned prediction transitions** — corpus-balanced scale-degree transitions trained on 687 tune
   pieces. Test objective 1.7318 → 1.7407; classical hindsight chords improve, with a small pop-chord
   regression. Full comparison and limitations in [the benchmark](docs/benchmark.md#2026-11-19--learned-harmonic-transitions).
10. **Flexible music workspace** — charts and performances together in Library; top-bar Play/Stop/Rec
    and performance seek; sound unlock on the sound icon; PaneForge resizing, saved layouts and panel
    visibility, including song/progression focus. Where next keeps its tabs.

11. **Composition workspace** — live beat timeline with click-to-add/edit, drag/resize, rests, voicings,
    undo/redo, transpose and chart input; icon suggestion insertion and reharmonisation replacement.
    Current-song switching, MIDI export and DAW MIDI routing share the same sequence document.
12. **chord.sh** — renamed interface/package/docs, retaining legacy songs and settings. Editor, Live
    and Library were initially separate views; the unified timeline below supersedes that layout.

13. **Shared settings** — one Zod schema for defaults, validation, control metadata and persisted
    preferences; searchable Settings with advanced beat/bar, segmentation and harmonic-model controls.
    BPM bounds replace hardcoded periods; editor defaults and timing are configurable. Invalid drafts
    preserve playback; old preferences migrate; recordings/replay retain configuration.

14. **One musical timeline** — one song workspace with a source picker; input previews and recorded chord takes appear
    directly in the editable song, with one-step undo for a take. Inspector, piano and suggestions share
    chord focus. Roles move onto/next to the piano. Pause/resume, top-bar undoable reset, duplicate song,
    recoverable deletion and searchable/paged sources remove common workflow dead ends. Panels use
    square corners; browsing sources retains playback. Key regions show modulations, bars wrap into rows,
    device selection opens beside the logo, and transport/seek share one row with consistent SVG icons.

## Next

- **Native host delivery** — cross-platform core with VST3/AU MIDI wrappers, host transport/state
  synchronization and a tested host matrix; [architecture](docs/daw.md).

- **Accuracy** (guided by the benchmark error breakdown):
  - boundary errors (37–66 % of chord misses): beat-aware segmentation, or a segmental / semi-Markov model;
  - tonicization vs modulation (classical key misses "a fifth away");
  - non-chord-tone weighting (passing / neighbour notes) from interval, duration and metric features;
  - more corpora: DCML Beethoven sonatas and ABC quartets, Weimar Jazz Database (real solos over changes),
    ChoCo chord charts across genres.
- **Vocabulary layer** — a grammar of harmonic patterns (ii–V, tritone sub, backdoor, passing °7, pedal
  points…) and figurations (arpeggios, Alberti bass, broken chords), so songs are analysed _in terms of the
  vocabulary_ and you can browse which patterns a song uses — building on the Jazz Harmony Treebank's
  preparation/prolongation trees.
- **Live assistance without a fixed tempo** — phrase segmentation (by cadence and gaps) as the unit
  instead of bars when there's no pulse.
- Charts: per-section key regions, transpose; voicing coach (shell / rootless / drop-2).

## Hardware notes

Recital Pro: USB-MIDI in works; whether it plays notes it _receives_ depends on firmware (⚙ → MIDI output, then
play a sequence through it). MPK mini: no speakers — sound comes from the browser synth (🔊).

## Current interface task list

- [x] Keep a single timeline for entered, played and recorded chords; remove the separate Live view.
- [x] Move note names and root/third/fifth roles onto/next to the piano, with colours and text labels.
- [x] Add undoable reset at the top; retain other saved songs.
- [x] Add pause/resume while preserving the playhead.
- [x] Remove rounded corners from workspace panels.
- [x] Replace the Library tab with a searchable source picker beside playback, retaining import and examples.
- [x] Open device input/output selection by clicking the device name beside the logo.
- [x] Replace the song-wide key dropdown with editable key regions and timeline indicators for modulations.
- [x] Wrap the timeline into rows according to the available bar width and use vertical space.
- [x] Consolidate Song tools into contextual controls/menus.
- [x] Keep seek and transport on one toolbar row; use a consistent icon set.
- [x] Verify editing, capture, region changes, playback/pause/seek, MIDI, responsive layout and persistence.
- [x] Update documentation and record the final regression checks.
