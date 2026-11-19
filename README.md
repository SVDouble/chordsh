# chord.sh

A MIDI composition workspace: build chord timelines, explore suggestions, edit voicings, and export
music to your DAW. Click empty beats to add chords, drag and resize blocks, preview alternatives, and
add them with one icon. A MIDI keyboard can also feed live harmonic analysis with competing key
explanations and hindsight revisions.

```sh
npm install
npm run dev          # open the printed URL in Chrome or Edge (Web MIDI)
npm test             # unit tests (theory, engine, songs, MIDI)
npm run check        # typecheck, lint, formatting and tests
npm run build
```

No piano at hand? Computer keys `A W S E D F T G Y H U J K O L P ;` play C4–E5 (`Z`/`X` octave, `Space`
pedal), click the on-screen keys, or open the **song picker beside playback** and play the demo, a MIDI file or an
annotated piece.

## Documentation

- [Using the app](docs/app.md) — screen, colours, hindsight & theories, bars, recording, practising
- [Engine](docs/engine.md) — composition model and harmonic analysis
- [Settings](docs/settings.md) — shared schema, controls, limits and persistence
- [DAW integration](docs/daw.md) — MIDI output/export and native plug-in architecture
- [Benchmark](docs/benchmark.md) — corpora, metrics, results; [latest numbers](benchmarks/LATEST.md)
- [Research notes](docs/research.md) — related work, sources, experiment log
- [Plan](PLAN.md) — roadmap

## Developer commands

| command                        | does                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `npm run fetch-data`           | download + convert the benchmark corpora into `local/data` (pinned in `scripts/datasets.json`) |
| `npm run benchmark`            | score the engine on all corpora (`WRITE=1` records results in `benchmarks/`)                   |
| `npm run tune`                 | search engine parameters on the tune split                                                     |
| `npm run train`                | reproduce learned harmonic transitions from the pinned tune-split annotations                  |
| `npm run train:prediction`     | train the chord-quality and recent-sequence continuation model on tune annotations             |
| `npm run benchmark:prediction` | evaluate next-chord ranking separately from note recognition                                   |
| `npm run replay`               | replay the newest session recording (`local/recordings/`) through the engine                   |
| `npm run lint`                 | Biome linting plus Markdown structure checks with markdownlint                                 |
| `npm run format`               | format TypeScript, Svelte, CSS, JSON and Markdown with Biome                                   |
| `npm run format:check`         | check formatting without changing files                                                        |

Biome's full Svelte support is experimental and enabled in `biome.json`; the production build validates
the formatted components. Dependencies, generated builds, local data and benchmark history are excluded.

The workspace uses [PaneForge](https://paneforge.com/docs/getting-started) for resizing, keyboard-accessible
dividers and saved layouts. Use **Panels** for song/progression focus or to hide individual panels.

Everything local and uncommitted (datasets, recordings, caches) lives under `local/`.
Vite excludes that directory from watching; library and recording endpoints still read it on demand.
On Linux, source watching uses polling to avoid shared inotify quota errors (`ENOSPC`). Set
`CHOKIDAR_USEPOLLING=false npm run dev` to opt into native watching when quota is available.
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
