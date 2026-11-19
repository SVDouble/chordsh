# Musify

A harmony companion for the piano: plug in a MIDI keyboard and see what you play, what it means in the
key, and where you could take it next. The analysis keeps competing explanations alive and revises earlier
readings with hindsight, and it is measured against expert-annotated music.

```sh
npm install
npm run dev          # open the printed URL in Chrome or Edge (Web MIDI)
npm test             # unit tests (theory, engine, songs, MIDI)
npm run build
```

No piano at hand? Computer keys `A W S E D F T G Y H U J K O L P ;` play C4–E5 (`Z`/`X` octave, `Space`
pedal), click the on-screen keys, or open the **Library** tab and play the demo, a MIDI file or an
annotated piece.

## Documentation

- [Using the app](docs/app.md) — screen, colours, hindsight & theories, bars, recording, practising
- [Engine](docs/engine.md) — how the analysis works
- [Benchmark](docs/benchmark.md) — corpora, metrics, results; [latest numbers](benchmarks/LATEST.md)
- [Research notes](docs/research.md) — related work, sources, experiment log
- [Plan](PLAN.md) — roadmap

## Developer commands

| command              | does                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run fetch-data` | download + convert the benchmark corpora into `local/data` (pinned in `scripts/datasets.json`) |
| `npm run benchmark`  | score the engine on all corpora (`WRITE=1` records results in `benchmarks/`)                   |
| `npm run tune`       | search engine parameters on the tune split                                                     |
| `npm run replay`     | replay the newest session recording (`local/recordings/`) through the engine                   |

Everything local and uncommitted (datasets, recordings, caches) lives under `local/`.
Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## MIDI troubleshooting

The chip in the top bar shows the connected device and flashes on every message it receives, with the raw
bytes (e.g. `90 3c 64` = note on, middle C).

- **Device listed, light never flashes**: another program may own the port (a DAW, `a2jmidid`/JACK bridges).
  Close it, unplug/replug the device, reload the page. A red chip says why a port couldn't be opened.
- **Device not listed**: plug it in, then reload; check `aconnect -l` (Linux) shows it.
- Use Chrome or Edge. Firefox needs its Web MIDI site-permission add-on.
- ⚙ → _MIDI in_ picks one port instead of all devices (Midi Through loopback ports are always ignored, so
  suggestions sent to MIDI out don't echo back).
- No sound from a controller like the MPK mini? It has no speakers: click the page once, and keep 🔊 on.
