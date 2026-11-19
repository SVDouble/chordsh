# Latest benchmark

2026-11-19 · commit af74534 · split `test` · reproduce with `npm run fetch-data && SPLIT=test npm run benchmark`

All numbers are % of 250 ms samples (chords, keys) or F-measure (beats, bars). `*` = synthetic performance rendered from chord changes. See [docs/benchmark.md](../docs/benchmark.md) for what each column means.

Parameters (including any `P_` overrides):

```json
{
  "chordChange": 0.61,
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
| bps-fh | 17     | 60.7 /  74.9       | 70.6 /  85.3 /  89.4         | 72.7    | 67.5     | 79.0 /  94.5 /  84.3 | 1.24           | 255 / 487   | 70.3   | 51.1  |
| chopin | 28     | 60.4 /  74.5       | 69.9 /  86.5 /  91.3         | 72.5    | 64.2     | 76.9 /  88.9 /  86.5 | 0.97           | 79 / 66     | 98.9   | 51.5  |
| jazz * | 585    | 80.3 /  90.8       | 91.6 /  99.2 /  99.5         | 94.4    | 41.5     | 46.2 /  73.0 /  68.8 | 0.96           | 579 / 0     | 65.9   | 53.1  |
| mozart | 24     | 54.1 /  69.9       | 65.5 /  84.8 /  90.1         | 67.8    | 73.3     | 83.7 /  96.9 /  88.3 | 0.99           | 90 / 137    | 82.2   | 52.5  |
| pop909 | 30     | 73.7 /  86.8       | 81.0 /  93.7 /  96.2         | 85.9    | 67.9     | 72.3 /  88.2 /  88.8 | 1.04           | 23 / 0      | 66.4   | 47.3  |

| corpus | chord misses: boundary / same root, wrong quality / a fifth away / other | key misses: relative / parallel / a fifth away / other |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| bps-fh | 33.6 /   4.6 /  22.2 /  39.6                                             | 13.9 /  11.6 /  42.9 /  31.6                           |
| chopin | 62.2 /   3.4 /  10.8 /  23.6                                             | 22.2 /  19.6 /  29.6 /  28.6                           |
| jazz   | 52.7 /  13.4 /   0.7 /  33.2                                             | 35.1 /   6.9 /  13.5 /  44.6                           |
| mozart | 59.8 /   3.0 /  17.0 /  20.2                                             | 16.4 /  11.7 /  57.2 /  14.7                           |
| pop909 | 41.6 /  16.8 /   6.4 /  35.1                                             | 59.4 /   0.0 /   0.0 /  40.6                           |
