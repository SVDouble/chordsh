# Latest benchmark

2026-11-19 · commit 618b846 · split `test` · reproduce with `npm run fetch-data && SPLIT=test npm run benchmark`

All numbers are % of 250 ms samples (chords, keys) or F-measure (beats, bars). `*` = synthetic performance rendered from chord changes. See [docs/benchmark.md](../docs/benchmark.md) for what each column means.

Parameters (including any `P_` overrides):

```json
{
  "chordChange": 0.61,
  "transitionWeight": 0.125,
  "keyChange": 3.6,
  "extraNote": 0.6,
  "missingTone": 0.2,
  "prior": {
    "diatonic": 0,
    "secondary": -0.065,
    "borrowed": -0.25,
    "other": -0.74,
    "tonic": 0.43,
    "dominant": 0.44
  },
  "keyFit": 0.47,
  "bassRoot": 0.3,
  "bassInChord": 0.02,
  "bassOutside": -0.04,
  "heldDecayMs": 2460,
  "durExp": 0.8,
  "saturation": 1.5,
  "durationWeight": 0
}
```

| corpus | pieces | chord live @1 / @3 | chord hindsight @1 / @3 / @5 | root @1 | key live | key @1 / @3 / close  | changes ×truth | key changes | beat F | bar F |
| ------ | ------ | ------------------ | ---------------------------- | ------- | -------- | -------------------- | -------------- | ----------- | ------ | ----- |
| bps-fh | 17     | 61.5 /  75.7       | 71.7 /  85.6 /  90.1         | 73.6    | 67.8     | 80.0 /  94.6 /  85.1 | 1.29           | 263 / 487   | 70.3   | 51.1  |
| chopin | 28     | 60.3 /  74.7       | 71.0 /  87.2 /  92.2         | 73.4    | 64.3     | 76.4 /  89.2 /  85.3 | 1.01           | 83 / 66     | 98.9   | 51.5  |
| jazz * | 585    | 80.2 /  90.6       | 91.9 /  99.2 /  99.6         | 94.7    | 42.7     | 48.3 /  74.3 /  68.3 | 0.97           | 647 / 0     | 65.9   | 53.1  |
| mozart | 24     | 54.6 /  70.5       | 66.8 /  85.9 /  91.1         | 69.2    | 74.9     | 86.0 /  97.1 /  89.9 | 1.08           | 95 / 137    | 82.2   | 52.5  |
| pop909 | 30     | 73.1 /  86.5       | 80.5 /  93.5 /  96.0         | 85.1    | 69.9     | 75.3 /  88.5 /  88.8 | 1.06           | 22 / 0      | 66.4   | 47.3  |

| corpus | chord misses: boundary / same root, wrong quality / a fifth away / other | key misses: relative / parallel / a fifth away / other |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| bps-fh | 32.8 /   4.1 /  25.9 /  37.3                                             | 13.4 /  12.2 /  42.4 /  32.0                           |
| chopin | 61.0 /   3.3 /  12.5 /  23.2                                             | 18.5 /  19.3 /  31.7 /  30.4                           |
| jazz   | 52.9 /  14.3 /   0.6 /  32.2                                             | 31.7 /   7.0 /  15.5 /  45.8                           |
| mozart | 59.0 /   3.2 /  18.3 /  19.5                                             | 15.1 /  12.8 /  54.7 /  17.5                           |
| pop909 | 41.3 /  15.3 /   7.0 /  36.4                                             | 54.4 /   0.4 /   0.0 /  45.3                           |
