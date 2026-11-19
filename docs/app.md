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
- Sound starts automatically when the browser permits it. Otherwise, click anywhere or press a computer
  key once (🔊 toggles hearing what you play; ☀/☾ switches theme).

### Why a click can still be needed

The sound icon shows 🔓 while audio is blocked; click it to enable sound. It reflects the actual audio
engine state, including before the first note. When a browser
blocks Web Audio autoplay, MIDI messages cannot count as a page gesture: one click, tap or computer key
press is still needed. The app unlocks audio on any of these interactions, and preserves a held first note
while audio resumes. Chrome may allow autoplay after sufficient use of the site; its
[autoplay policy](https://developer.chrome.com/blog/autoplay/) describes the browser-controlled exceptions.
Installing the app is not a guaranteed way to remove the prompt.

## The screen

| area            | what it shows                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Now playing** | the chord you're holding (name, inversion, tones coloured by role), its numeral and function in the key, a one-line explanation    |
| **Where next**  | Next chord suggests playable moves; Change key shows destinations and routes to hear or practise                                   |
| **Tonal map**   | circle of fifths; colour = how likely you're heading to each key; ring = how close it is; click a key to plan a route              |
| **Library**     | performances and chord charts together: play a demo, recording or MIDI file; open or create a chart and play along with feedback   |
| **Progression** | the default main panel: your chords, functions, cadences, key changes and pivots — bars when there's a pulse, otherwise a sequence |
| **Piano**       | what's sounding: harmony blue, melody amber, suggestions violet, practice targets green                                            |

### Playback and panels

The top bar has **Play**, **Stop** and **Rec**. Play hears the open chart, or plays the selected performance
(the demo initially). Stop and **Escape** cancel performances, previews and the metronome, release held
sound and clear queued MIDI output. Recording has its own **Save recording** action.

Performances have a seek slider and elapsed/total time. Seeking restarts analysis at that position,
including notes already sounding there. Stopping returns the playhead to the beginning. Chart previews
can be stopped but do not use the performance seek slider.

Use **Panels** to show or hide Now playing, Where next, the tonal map and the piano. **Song** focus gives
the main space to the Library's chart view; **Progression** focus gives it to the analysis. Drag the
dividers to resize panels, or focus a divider and use arrow keys. Panel visibility and sizes are saved
in the browser. On narrow screens panels stack vertically.

### Colours

- Function: **tonic** green, **predominant** amber, **dominant** red, **chromatic** violet.
- Chord tones: root plain, **3rd & 7th** blue (guide tones), 5th dimmed, **tensions** amber, **altered** red.

### Hindsight and theories

The progression is the analyser's _current best explanation_ of everything you played. When later music
explains earlier chords better ("that E♭ was the V of A♭"), they are re-labelled and flash **↻**. The
**theories** chips next to the title are competing explanations (e.g. "C major" vs "A minor (1 key
change)") with probabilities; click one to see the progression the way that theory reads it.

**Clear** starts a fresh progression, discarding pending analysis and notes from the previous one.
Your chart, chord style and key-lock settings stay selected.

### Bars and tempo

Bars are relative to a pulse. When you play freely, the progression stays a sequence. With a steady pulse
it switches to bars (`♩≈96` while uncertain). For exact bars choose ⚙ → **Bars: Metronome** (with an
optional click); library pieces and MIDI files bring their own tempo.

## Recording a session

**● Rec** records your MIDI and every decision the engine makes; type what you _meant_ to play in the note
field, then **■ Save recording**. Files go to `local/recordings/` (git-ignored) and appear in the Library.
`npm run replay` (or `REC=local/recordings/x.json npm run replay`) replays one through the engine and prints
a timeline — useful for reporting "it got this wrong".

## Practising

- **Where next → Change key → Practise**: the app waits for each chord of a route; any voicing counts; missing chord tones are listed.
- **Library → Chord charts**: chords turn green (exact / close enough), violet (a valid substitute) or red; _From playing_ turns your session into a chart.

## Settings (⚙)

MIDI in/out (Midi Through is ignored), suggestion sound (browser synth or MIDI out), hand split, tempo,
bars source and meter, metronome click.
