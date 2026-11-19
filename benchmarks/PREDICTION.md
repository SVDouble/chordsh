# Next-chord prediction

2026-11-19 · commit 77ac9ad · split test

Reproduce: `npm run fetch-data && npm run train:prediction && SPLIT=test WRITE=1 npm run benchmark:prediction`.

Root and family of the next harmonic change, given annotated preceding chords and local key.
This measures continuation ranking, not recognition from notes or extension/inversion prediction.
Repeated labels, rests and key changes do not create cross-boundary examples. Jazz (*) uses chart labels.
Each corpus contributes equally to macro averages; within a corpus each change counts once.
Ideas metrics use the visible list (four main and five colour alternatives by default), with the
rule-only baseline and learned model evaluated on identical examples. Scores are not calibrated creative probabilities.

Settings: `{"primaryCount":4,"colourCount":5,"learnedWeight":0.85,"useSequence":true,"priorStrength":20,"contextStrength":20}`

| model               | corpus | pieces | changes | next @1 / @3 / @5  | NLL ↓ | Ideas @1 / @3 / coverage |
| ------------------- | ------ | ------ | ------- | ------------------ | ----- | ------------------------ |
| root-only baseline  | bps-fh | 17     | 5102    | 62.0 / 79.0 / 83.1 | 1.637 | —                        |
| root-only baseline  | chopin | 28     | 2723    | 45.9 / 62.8 / 71.9 | 2.248 | —                        |
| root-only baseline  | jazz * | 585    | 25134   | 34.9 / 55.3 / 67.6 | 2.568 | —                        |
| root-only baseline  | mozart | 24     | 4972    | 56.0 / 78.1 / 83.1 | 1.705 | —                        |
| root-only baseline  | pop909 | 30     | 3467    | 26.4 / 54.5 / 73.5 | 2.574 | —                        |
| quality, one chord  | bps-fh | 17     | 5102    | 62.3 / 79.3 / 86.1 | 1.551 | —                        |
| quality, one chord  | chopin | 28     | 2723    | 45.8 / 63.6 / 72.4 | 2.186 | —                        |
| quality, one chord  | jazz * | 585    | 25134   | 35.2 / 57.1 / 69.1 | 2.487 | —                        |
| quality, one chord  | mozart | 24     | 4972    | 57.1 / 79.0 / 87.1 | 1.606 | —                        |
| quality, one chord  | pop909 | 30     | 3467    | 30.0 / 58.3 / 74.8 | 2.466 | —                        |
| quality, two chords | bps-fh | 17     | 5102    | 62.6 / 80.3 / 87.0 | 1.485 | 62.9 / 80.0 / 88.0       |
| quality, two chords | chopin | 28     | 2723    | 46.9 / 66.2 / 73.4 | 2.144 | 46.2 / 64.3 / 73.2       |
| quality, two chords | jazz * | 585    | 25134   | 39.1 / 61.0 / 70.7 | 2.402 | 37.1 / 58.0 / 70.3       |
| quality, two chords | mozart | 24     | 4972    | 57.8 / 79.5 / 87.6 | 1.546 | 57.8 / 79.3 / 87.5       |
| quality, two chords | pop909 | 30     | 3467    | 34.7 / 62.1 / 76.6 | 2.369 | 33.4 / 60.8 / 72.9       |
| rule-based Ideas    | bps-fh | 17     | 5102    | —                  | —     | 44.3 / 74.9 / 83.0       |
| rule-based Ideas    | chopin | 28     | 2723    | —                  | —     | 34.0 / 61.0 / 64.9       |
| rule-based Ideas    | jazz * | 585    | 25134   | —                  | —     | 34.9 / 47.0 / 53.6       |
| rule-based Ideas    | mozart | 24     | 4972    | —                  | —     | 49.2 / 75.4 / 85.6       |
| rule-based Ideas    | pop909 | 30     | 3467    | —                  | —     | 23.2 / 53.4 / 62.0       |
