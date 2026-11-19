# Using Musify

Musify listens to a MIDI keyboard, names what you play, explains it in the key, and suggests where to go next.

## Getting started

```sh
npm install
npm run dev        # open the printed URL in Chrome or Edge (Web MIDI)
```

- Plug in a MIDI keyboard. The chip in the top bar shows it and flashes on every message; if it never
  flashes, see _MIDI troubleshooting_ in the [README](../README.md).
- No keyboard? Computer keys `A W S E D F T G Y H U J K O L P ;` play C4–E5 (`Z`/`X` octave, `Space` pedal),
  or click the on-screen piano.
- Click once anywhere to let the browser play sound (🔊 toggles hearing what you play; ☀/☾ switches theme).

## The screen

| area            | what it shows                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Now playing** | the chord you're holding (name, inversion, tones coloured by role), its numeral and function in the key, a one-line explanation                                      |
| **Where next**  | likely next chords plus colour moves (secondary dominants, tritone sub, borrowed iv, passing / common-tone / leading-tone °7); click to hear from your hand position |
| **Tonal map**   | circle of fifths; colour = how likely you're heading to each key; ring = how close it is; click a key to plan a route                                                |
| **Library**     | play the demo, your recordings, MIDI files or annotated benchmark pieces into the app; open chord charts                                                             |
| **Song**        | a chord chart to play along with: per-chord verdicts, what you tend to miss, the song's big picture, reharmonisation ideas                                           |
| **Change key**  | routes from your current key to the chosen one (pivot chord, ii–V–I, tritone sub, dominant chain, °7 pivot…); play or practise them                                  |
| **Progression** | your chords — in bars when there's a steady pulse, otherwise as a sequence — with functions, cadences, key changes and pivots                                        |
| **Piano**       | what's sounding: harmony blue, melody amber, suggestions violet, practice targets green                                                                              |

### Colours

- Function: **tonic** green, **predominant** amber, **dominant** red, **chromatic** violet.
- Chord tones: root plain, **3rd & 7th** blue (guide tones), 5th dimmed, **tensions** amber, **altered** red.

### Hindsight and theories

The progression is the analyser's _current best explanation_ of everything you played. When later music
explains earlier chords better ("that E♭ was the V of A♭"), they are re-labelled and flash **↻**. The
**theories** chips next to the title are competing explanations (e.g. "C major" vs "A minor (1 key
change)") with probabilities; click one to see the progression the way that theory reads it.

### Bars and tempo

Bars are relative to a pulse. When you play freely, the progression stays a sequence. With a steady pulse
it switches to bars (`♩≈96` while uncertain). For exact bars choose ⚙ → **Bars: Metronome** (with an
optional click); library pieces and MIDI files bring their own tempo.

## Recording a session

**● Rec** records your MIDI and every decision the engine makes; type what you _meant_ to play in the note
field, then **■ Save**. Files go to `local/recordings/` (git-ignored) and appear in the Library.
`npm run replay` (or `REC=local/recordings/x.json npm run replay`) replays one through the engine and prints
a timeline — useful for reporting "it got this wrong".

## Practising

- **Change key → Practise**: the app waits for each chord of a route; any voicing counts; missing chord tones are listed.
- **Song**: chords turn green (exact / close enough), violet (a valid substitute) or red; _From playing_ turns your session into a chart.

## Settings (⚙)

MIDI in/out (Midi Through is ignored), suggestion sound (browser synth or MIDI out), hand split, tempo,
bars source and meter, metronome click.
