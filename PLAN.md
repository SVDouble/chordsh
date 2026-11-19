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
- **Additional recognition validation** — broader corpora and live performances before treating continuation gains as recognition gains.

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
- [x] Use consistent transport icons; seeking now lives on the timeline ruler (see refinement below).
- [x] Verify editing, capture, region changes, playback/pause/seek, MIDI, responsive layout and persistence.
- [x] Update documentation and record the final regression checks.

## Sketch workflow refinement

- [x] Make the timeline the largest area; the later harmony-block layout below supersedes the initial three-column arrangement.
- [x] Combine next-chord and key-change suggestions into one playable, insertable list.
- [x] Make the circle of fifths an optional target picker for that same list, with no separate workflow.
- [x] Keep the timeline panel fixed; scroll only its bar area and move chord editing out of the panel flow.
- [x] Remove toolbar seeking and make seeking/scrubbing part of the timeline.
- [x] Investigate and stabilize preview/playback sound and audio lifecycle during development updates.
- [x] Verify the sketch workflow, layout, input, playback, MIDI and persistence; update documentation.

## Harmony block and piano notation

- [x] Group chord information, compact ideas and the circle together on the left; give the timeline the remaining space.
- [x] Let circle selection switch the same ideas list to routes into the selected key, without tabs.
- [x] Move playback controls and source selection into the timeline panel.
- [x] Highlight the current insertion beat, including after accepting/undoing an idea.
- [x] Put note names on all piano keys; remove the keyboard message/legend row.
- [x] Show chord-relative roles above and key-relative scale degrees below, with explicit reference names in tooltips.
- [x] Use interval relationships for every sounding note instead of melody/harmony classification colours.
- [x] Verify the revised layout, keyboard semantics, recording, interactive editing and audio consistency.

Validation: `npm run check` (125 tests) and production build; desktop/mobile browser checks for
layout, key-targeted ideas, insertion/undo, chord editing, timeline scrubbing, MIDI, source switching
and persistence. Additional browser checks cover dual piano references, repeated/held/sustained
recorded chords, no recording retrigger and equal-velocity preview/playback timbre.

## Remaining-work pass

- [x] Exclude local datasets/recordings from development watching and avoid exhausted Linux inotify quotas.
- [x] Train a chord-quality-aware next-chord model using recent sequence context and tune-split data only.
- [x] Use learned ranking in Ideas while retaining harmonic explanations and colour alternatives.
- [x] Expose prediction controls in shared Settings and reset sequence context at local key changes.
- [x] Measure next-chord prediction separately from recognition and record test-split results.
- [x] Verify inference regression, browser interactions and documentation.

The accuracy/segmentation research, vocabulary layer and native host delivery above
remain roadmap work; completed interface work is not evidence that those are delivered.

Prediction validation: 134 tests and production build; existing desktop/mobile sketch interactions and
new browser checks for ii–V ideas, region/gap context, settings persistence and no analysis reset.
Model regeneration is byte-for-byte reproducible. The full test split improves Ideas @1 37.1% → 47.5%
and @3 62.3% → 68.5%; all note-recognition metrics are unchanged. See [results](benchmarks/PREDICTION.md).

## Voicing coach

- [x] Offer shell, rootless and drop-2 choices in chord editing without typing MIDI note numbers.
- [x] Preview a choice, apply it as one undoable chord edit and preserve it in MIDI export.
- [x] Verify musical invariants, editing/undo and browser interactions.

Voicing validation: 139 tests and production build; desktop/mobile browser checks verify noncommitting
previews, save/undo/redo, MIDI-export pitches, rootless triads and explained drop-2 constraints.
The final 684-piece recognition regression at `99b5d96` exactly matches the preceding run.

## Piano chord-root map

- [x] Replace the default note-name/caret annotations with Roman labels for chord roots in the local key.
- [x] Show idle as well as sounding roots, with proper quality case and diminished markers.
- [x] Enlarge labels and key spacing; keep black-key accidentals legible in major and minor keys.
- [x] Make note names and focused-chord interval labels optional, off by default, in Panels and shared Settings.
- [x] Retain informative hover references without adding a keyboard message row.
- [x] Verify key changes, label controls/persistence, both themes and narrow screens.

This supersedes the earlier default of printing every note name and numeric key degree on the piano.
Validation: 143 tests, production build and browser checks for idle roots, white/black-key positions,
major/minor context, settings persistence, configurable sizing, hover references and mobile layout.
