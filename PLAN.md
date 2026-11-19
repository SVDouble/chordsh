# Musify — plan

A browser app that listens to a MIDI keyboard, names what you play, explains it in key-relative terms
(I–ii–V, secondary dominants, borrowed chords…), and coaches you on where to go next — including into other
keys. Built for a player who "vibes" rather than reads: matching is forgiving, coaching is about the big
picture.

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
   pop, jazz), parameter tuning on a tune split.

## Next

- **Accuracy** (guided by the benchmark error breakdown):
  - boundary errors (37–66 % of chord misses): beat-aware segmentation, or a segmental / semi-Markov model;
  - tonicization vs modulation (classical key misses "a fifth away");
  - non-chord-tone weighting (passing / neighbour notes) from interval, duration and metric features;
  - more corpora: DCML Beethoven sonatas and ABC quartets, Weimar Jazz Database (real solos over changes),
    ChoCo chord charts across genres.
- **Vocabulary layer** — a grammar of harmonic patterns (ii–V, tritone sub, backdoor, passing °7, pedal
  points…) and figurations (arpeggios, Alberti bass, broken chords), so songs are analysed *in terms of the
  vocabulary* and you can browse which patterns a song uses — building on the Jazz Harmony Treebank's
  preparation/prolongation trees.
- **Live assistance without a fixed tempo** — phrase segmentation (by cadence and gaps) as the unit
  instead of bars when there's no pulse.
- Charts: per-section key regions, transpose; voicing coach (shell / rootless / drop-2).

## Hardware notes

Recital Pro: USB-MIDI in works; whether it plays notes it *receives* depends on firmware (⚙ → MIDI out →
Test). MPK mini: no speakers — sound comes from the browser synth (🔊).
