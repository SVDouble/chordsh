# Musify

A harmony companion for the piano: plug in a MIDI keyboard and see what you play,
what it means in the key, and where you could take it next. See [PLAN.md](PLAN.md)
for the design and roadmap.

```sh
npm install
npm run dev      # open http://localhost:5173 in Chrome or Edge (Web MIDI)
npm test         # theory + engine tests
npm run build
```

No piano at hand? Use the computer keyboard (`A W S E D F T G Y H U J K O L P ;` = C4…E5,
`Z`/`X` octave, `Space` pedal), click the on-screen keys, or press **Demo**.

## Using it

- **Now playing** names the chord (extensions, inversions, rootless voicings) and gives its
  roman numeral and function in the detected key, with a one-line explanation.
- **Progression** keeps the chord history with numerals, brackets for patterns (ii–V–I,
  cadences, loops) and key-change markers. When you modulate, the pivot chord is tagged
  with both readings (e.g. `iv7 = ii7`). Below it, each melody note shows its role over the chord.
- **Tonal map**: keys glow by how likely you are heading there given your last chords and
  melody. Hover to see why; click one to plan a route.
- **Where next**: likely next chords plus colour moves (secondary dominants, tritone sub,
  borrowed iv, and the three everyday °7s: passing, common-tone, leading-tone). Click to hear.
- **Route** (after picking a key): several ways there, explained. *Play* auditions them,
  *Practise* waits for you to play each chord — any voicing counts — and shows what's missing.

Lock the key in the top bar if auto-detection fights you. Set *Split* if your hands
overlap a lot. *Out* + *Sound: MIDI out* plays suggestions on your piano, if it
accepts MIDI input (use *Test out*).
