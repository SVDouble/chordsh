# Benchmark

The engine is measured against expert-annotated music. Everything is pinned and scripted, so anyone can
reproduce the numbers.

```sh
npm run fetch-data       # downloads + converts the corpora into local/data (once; cached)
npm run benchmark        # all corpora, both splits (~1 min)
WRITE=1 npm run benchmark   # also appends to benchmarks/history.jsonl and rewrites benchmarks/LATEST.md
```

Options (environment variables):

| variable                      | meaning                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `CORPUS=pop909,jazz`          | only these corpora                                      |
| `SPLIT=tune` / `test` / `all` | the deterministic split (hash of corpus/id)             |
| `LIMIT=10`                    | first N pieces per corpus                               |
| `PIECE=mozart/K279-1 BARS=24` | one piece, with a bar-by-bar timeline: truth vs. engine |

`npm run tune` searches the harmonizer parameters on the **tune** split only; report the **test** split
when claiming an improvement.

## Corpora

Defined in [`scripts/datasets.json`](../scripts/datasets.json) (repo, pinned commit, license, genre, tempo).
The converter [`scripts/fetch_datasets.py`](../scripts/fetch_datasets.py) (Python standard library only)
writes one format for all of them:

```text
local/data/<corpus>/<id>.json = {
  corpus, id, title, genre, synthetic,
  notes:  [[onset_ms, dur_ms, midi, vel]],
  chords: [[t0_ms, t1_ms, root_pc, family, label, key_tonic_pc|null, key_mode|null]],
  beats: [ms], bars: [ms], beats_per_bar
}
```

| corpus   | pieces | notes from                                                                               | chord / key labels                                                                        |
| -------- | ------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| bps-fh   | 32     | the score, played at 100 bpm                                                             | expert functional analysis (local keys)                                                   |
| mozart   | 54     | the score, 100 bpm                                                                       | DCML expert analysis (local keys)                                                         |
| chopin   | 55     | the score, 110 bpm                                                                       | DCML expert analysis (local keys)                                                         |
| pop909   | 60     | performed MIDI piano arrangements                                                        | semi-automatic chord labels; one key per song (from audio — can't separate relative keys) |
| jazz `*` | 1170   | **synthetic** rendering of the changes (bass, shell voicings, chord-tone melody; seeded) | iRealPro changes; one global key per tune                                                 |

Data is **not committed** (licenses vary; see the manifest).

## Metrics

Each piece is played into the analyser as if live. Every 250 ms the true chord and key are compared with:

- **live** — what the screen shows at that moment (a 200 ms lag is allowed),
- **hindsight** — the final best path after the whole piece (with retrospective revisions).

| column         | meaning                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| chord @k       | root and family (maj / min / dim / aug / sus) of the truth is among the engine's top-k chords — close to mir_eval _thirds_ |
| root @1        | only the root matches                                                                                                      |
| key @k / close | key in top-k; _close_ = same key, relative or parallel                                                                     |
| changes ×truth | engine chord changes per true chord change (1.00 = no over- or under-thinking)                                             |
| key changes    | engine vs truth (jazz/pop truth has a single key, so engine changes there are not necessarily wrong)                       |
| beat F / bar F | F-measure of tracked beats / bar lines vs truth (±100 ms)                                                                  |

The **error breakdown** classifies every hindsight top-1 miss, so we know what to work on:

- chord: _boundary_ (a true change within ±300 ms — timing), _same root, wrong quality_, _a fifth away_, _other_;
- key: _relative_, _parallel_, _a fifth away_ (tonicization vs modulation), _other_.

## Results history

Latest: [benchmarks/LATEST.md](../benchmarks/LATEST.md) · all runs: `benchmarks/history.jsonl`.

### 2026-11-19 — baseline of the HMM harmonizer (all pieces)

| corpus | chord live @1 | chord @1 / @3 / @5 | key @1 / close | changes ×truth | bar F |
| ------ | ------------- | ------------------ | -------------- | -------------- | ----- |
| bps-fh | 62.2          | 71.2 / 86.6 / 91.2 | 73.7 / 79.6    | 1.00           | 52.4  |
| chopin | 62.5          | 73.5 / 88.5 / 93.0 | 66.0 / 76.3    | 0.88           | 58.2  |
| jazz * | 80.2          | 91.6 / 99.1 / 99.5 | 46.2 / 62.8    | 0.95           | 53.1  |
| mozart | 56.9          | 65.8 / 86.7 / 92.1 | 77.3 / 80.8    | 0.80           | 53.6  |
| pop909 | 75.2          | 83.3 / 94.7 / 96.8 | 68.5 / 89.3    | 1.00           | 49.1  |

What it says:

1. **Top-3 ≫ top-1** in classical (≈ +15–20 points): the right chord is usually a close runner-up → ranking/tuning, not vocabulary.
2. **37–66 % of chord misses are boundary errors** → timing of changes (segmentation) is the biggest lever.
3. **Classical key misses are mostly "a fifth away"** (Mozart 62 %, Beethoven 51 %) → tonicization vs modulation judgement; **pop key misses are mostly relative** (label limitation).
4. The live reading trails hindsight by ~9–11 points → hindsight revisions matter, as intended.
