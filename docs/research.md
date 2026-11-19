# Research notes

What already exists for each problem Musify tackles, what we borrowed, and what is worth borrowing next.
Keep this file updated when we try something new — including what _didn't_ work.

## 1. Harmonic analysis of symbolic music (chords + keys)

**Where Musify stands.** The analyser (`src/engine/harmonizer.ts`) is a hidden Markov model over joint
(key, chord) states solved with Viterbi on onset segments — the classical approach in the literature:

- Key-specific HMMs with Viterbi decoding of chord sequences, trained from symbolic harmonic analysis
  ([ISMIR 2007](https://archives.ismir.net/ismir2007/paper/000245.pdf)).
- HMMs whose hidden states are _chord functions_, which agree well with functional harmony theory, and an
  extension with modulation detection ([JAIST](https://dspace.jaist.ac.jp/dspace/bitstream/10119/15924/5/paper.pdf),
  [Uehara et al. 2019](https://eita-nakamura.github.io/articles/Uehara_etal_ChordFunctionIdentificationWithModulationDetectionBasedOnHMM_2019.pdf)).
- An end-to-end machine-learning system for harmonic analysis ([arXiv 1107.4969](https://arxiv.org/pdf/1107.4969)).

**What we borrowed:** joint key × chord states, Viterbi with hindsight (backtracking), a chord-in-key prior
written in scale degrees, and explicit change penalties. Max-marginals (forward + backward Viterbi) give the
top-k rankings used in the benchmark.

**Next candidates:**

- **Semi-Markov / segmental models.** A semi-CRF jointly segments the score into chord spans and labels them,
  instead of labelling onset segments ([Masada & Bunescu 2019](https://arxiv.org/pdf/1810.10002)). Our benchmark
  says 37–66 % of chord misses are _boundary_ errors — exactly what a segmental model targets.
- **Neural Roman-numeral analysis.** AugmentedNet (CRNN, multitask: key, chord, inversion, Roman numeral, with
  synthetic training examples) is state of the art on ABC, BPS, HaydnSun, TAVERN, When-in-Rome and WTC
  ([paper](https://zenodo.org/records/5624533/files/000050.pdf), [project](https://napulen.github.io/publication/augmentednet)).
  RNBERT adds self-supervised pretraining ([ref](https://link.springer.com/content/pdf/10.1007/978-3-031-56992-0_10.pdf)).
  Could run in the browser via ONNX later, or be used offline to label recordings. Requires training data and
  a build step — a later phase, and worth it only once the benchmark shows the HMM's ceiling.

## 2. Evaluation conventions

- **mir_eval** defines the standard chord metrics: _root_, _majmin_, _thirds_ (root + quality of the third),
  _sevenths_, and inversion variants; results are usually reported as weighted chord symbol recall
  ([docs](https://mir-eval.readthedocs.io/stable/api/chord.html)). Our "chord" metric (root + family:
  maj/min/dim/aug/sus) is close to _thirds_.
- No standard top-k metric exists for chords; we compute top-1/3/5 from max-marginals, which separates
  "the right answer is a close runner-up" (ranking/tuning problem) from "the right answer is absent"
  (vocabulary/model problem).

## 3. Datasets (symbolic, with harmony labels)

| corpus                                                                                                      | genre                   | contents                                        | license                | in benchmark       |
| ----------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------- | ---------------------- | ------------------ |
| [BPS-FH](https://github.com/Tsung-Ping/functional-harmony)                                                  | Beethoven sonatas       | notes + functional harmony                      | GPL-3                  | ✓                  |
| [DCML Mozart sonatas](https://github.com/DCMLab/mozart_piano_sonatas)                                       | Mozart                  | notes + harmony TSV                             | CC BY-NC-SA            | ✓                  |
| [DCML Chopin mazurkas](https://github.com/DCMLab/chopin_mazurkas)                                           | romantic                | notes + harmony TSV                             | CC BY-NC-SA            | ✓                  |
| [DCML Beethoven sonatas / ABC quartets](https://github.com/DCMLab/ABC)                                      | classical               | notes + harmony TSV                             | CC BY-NC-SA            | candidate          |
| [POP909](https://arxiv.org/pdf/2008.07142)                                                                  | pop                     | piano arrangements + chords, beats, key         | MIT (songs ©)          | ✓                  |
| [Jazz Harmony Treebank](https://zenodo.org/records/4245406)                                                 | jazz                    | changes + hierarchical analyses of standards    | CC BY                  | ✓ (rendered)       |
| [Weimar Jazz Database](https://github.com/dharasim/MCR/wiki)                                                | jazz                    | solo transcriptions + changes                   | ODbL                   | candidate          |
| [ChoCo](https://github.com/smashub/choco) ([paper](https://www.nature.com/articles/s41597-023-02410-w.pdf)) | 18 sources, many genres | 20 K+ chord annotations (JAMS), mostly no notes | CC BY / BY-NC-SA       | candidate (charts) |
| [Nottingham](https://github.com/dharasim/MCR/wiki)                                                          | folk                    | ~1,200 tunes, melody + chords (ABC)             | —                      | candidate          |
| [Hooktheory / TheoryTab](https://www.hooktheory.com/blog/free-hooktheory-resources/)                        | pop                     | melody + Roman numerals                         | ToS restricts bulk use | no                 |

Lists of symbolic datasets: [wayne391/symbolic-music-datasets](https://awesome.ecosyste.ms/projects/github.com%2Fwayne391%2Fsymbolic-music-datasets).

Chord-only corpora (ChoCo, iRealPro-derived) are rendered into a deterministic synthetic performance
(bass + shell voicings + chord-tone melody). That tests vocabulary and key reasoning but is easier than real
playing, so those rows are marked `*` in the results.

## 4. Beat, bar and meter tracking from MIDI

- Dixon: beat is a low-level property that can be found from onsets without high-level knowledge
  ([paper](https://courses.cs.washington.edu/courses/cse590m/08wi/Dixon%20-%20Automatic%20Extraction%20of%20Tempo%20and%20Beat%20from%20Expressive%20Performances.pdf)) — our tracker (onset autocorrelation + phase) follows this.
- A global meter estimate can fix local grid errors ([ISMIR 2014](https://archives.ismir.net/ismir2014/paper/000121.pdf)) — our bar decoding is a Viterbi over beat positions with a meter choice.
- State of the art: transformer beat/downbeat tracking in performance MIDI ([Murgul & Heizmann 2025](https://arxiv.org/abs/2507.00466v1)); neural PM2S ([ISMIR 2022](https://zenodo.org/record/7316682/files/000047.pdf)).
- Even POP909's own MIDI-derived downbeats agree with audio only ~80 % of the time ([POP909](https://arxiv.org/pdf/2008.07142)).

**Design consequence:** free playing often has no steady tempo, so bars are treated as _relative_ and only
shown when the pulse is confident (or fixed by a metronome / MIDI file).

## 5. Non-chord tones, arpeggios, "musical vocabulary"

- Non-chord-tone detection as chord-tone vs. NCT classification with interval, metric-position and duration
  features, 73.5 % accuracy across corpora ([Hu & Arthur 2021](https://arxiv.org/pdf/2105.05385)); NCTs are a
  known obstacle for chord recognition. **Next:** down-weight likely passing/neighbour notes in segment
  salience using these features.
- Generative syntax of harmony: chords form nested _preparation_ and _prolongation_ dependencies; the
  [Jazz Harmony Treebank](https://infoscience.epfl.ch/record/290872) provides ground-truth trees
  ([Rohrmeier](https://music.arts.uci.edu/abauer/4.3/readings/Rohrmeier_Syntax_Jazz_Harmony.pdf),
  [Harasim et al. 2019](https://zenodo.org/records/3527812/files/ismir2019_paper_000039.pdf)). This is the
  natural backbone for the planned _vocabulary_ layer: patterns (ii–V, tritone sub, backdoor, passing °7)
  become rules of a grammar, and a song is analysed as a tree of them.
- Arpeggio / figuration detection (Alberti bass, broken chords) found no dedicated prior work in our search —
  to be designed on top of segment salience + onset patterns.

## Experiment log

| date       | change                                                                     | effect (see benchmarks/history.jsonl)                                                                                                                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-19 | event rules → HMM harmonizer                                               | held-out chords in hindsight 49→70 % (Beethoven), 76→85 % (pop); over-segmentation 1.9×→1.0×                                                                                                                                                                                                                           |
| 2026-11-19 | segment notes snapshotted (bug: releases erased notes)                     | pop chords 80→85 %                                                                                                                                                                                                                                                                                                     |
| 2026-11-19 | bars: incremental numbering → Viterbi over beat positions + kept accents   | bar F 21–36 % → 50–53 %                                                                                                                                                                                                                                                                                                |
| 2026-11-19 | benchmark: 5 corpora, top-k, error breakdown, pinned + reproducible        | baseline recorded                                                                                                                                                                                                                                                                                                      |
| 2026-11-19 | duration-weighted salience inside a segment (`durationWeight` 0 / 0.6 / 1) | **no effect** (±0.5 pt): passing notes usually start their own segment, and short segments are already down-weighted by `durExp`. NCT handling needs cross-segment context (step in/out, metric position) — kept off                                                                                                   |
| 2026-11-19 | coordinate tuning across five corpora                                      | Test objective 1.7098 → 1.7318; better key accuracy across all five corpora, but lower chord accuracy on several. Restoring the old chord-change penalty in the tuned set reduced hindsight chord accuracy further on four corpora. See [the full comparison](benchmark.md#2026-11-19--five-corpus-tuning-test-split). |
