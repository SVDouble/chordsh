# Latest benchmark

2026-11-19 · commit 6bb03c5 · split `all` · reproduce with `npm run fetch-data && npm run benchmark`

All numbers are % of 250 ms samples (chords, keys) or F-measure (beats, bars). `*` = synthetic performance rendered from chord changes. See [docs/benchmark.md](../docs/benchmark.md) for what each column means.

| corpus | pieces | chord live @1 / @3 | chord hindsight @1 / @3 / @5 | root @1 | key live | key @1 / @3 / close | changes ×truth | key changes | beat F | bar F |
| ------ | ------ | ------------------ | ---------------------------- | ------- | -------- | ------------------- | -------------- | ----------- | ------ | ----- |
| bps-fh | 32     | 62.2 / 77.3        | 71.2 / 86.6 / 91.2           | 73.3    | 63.8     | 73.7 / 93.6 / 79.6  | 1.00           | 686 / 801   | 71.6   | 52.4  |
| chopin | 55     | 62.5 / 77.2        | 73.5 / 88.5 / 93.0           | 75.9    | 56.1     | 66.0 / 87.7 / 76.3  | 0.88           | 268 / 141   | 99.2   | 58.2  |
| jazz * | 1170   | 80.2 / 91.9        | 91.6 / 99.1 / 99.5           | 94.3    | 39.6     | 46.2 / 70.8 / 62.8  | 0.95           | 2894 / 0    | 66.0   | 53.1  |
| mozart | 54     | 56.9 / 74.4        | 65.8 / 86.7 / 92.1           | 67.7    | 69.7     | 77.3 / 95.9 / 80.8  | 0.80           | 350 / 299   | 84.1   | 53.6  |
| pop909 | 60     | 75.2 / 88.0        | 83.3 / 94.7 / 96.8           | 88.5    | 63.9     | 68.5 / 88.2 / 89.3  | 1.00           | 116 / 0     | 68.5   | 49.1  |

| corpus | chord misses: boundary / same root, wrong quality / a fifth away / other | key misses: relative / parallel / a fifth away / other |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| bps-fh | 37.3 / 4.5 / 21.5 / 36.6                                                 | 11.8 / 10.6 / 51.1 / 26.6                              |
| chopin | 66.0 / 2.7 / 11.2 / 20.1                                                 | 18.5 / 11.7 / 33.5 / 36.3                              |
| jazz   | 53.6 / 12.6 / 1.3 / 32.5                                                 | 26.3 / 4.6 / 18.4 / 50.7                               |
| mozart | 60.1 / 2.6 / 14.7 / 22.6                                                 | 6.5 / 8.9 / 62.2 / 22.4                                |
| pop909 | 45.7 / 19.4 / 7.4 / 27.6                                                 | 64.4 / 1.6 / 4.5 / 29.4                                |
