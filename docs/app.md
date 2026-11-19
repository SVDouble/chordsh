# Using chord.sh

chord.sh is a chord and sequence workspace. Build a timeline, hear alternatives, add suggestions, and
send the result to your DAW as MIDI. It also listens to your playing and explains the harmony.

```sh
npm install
npm run dev        # Chrome or Edge for Web MIDI
```

## Build a song

The **Editor** is a beat timeline. Click an empty spot, type a chord such as `Cmaj7`, and press Enter or
✓. Click an existing chord to change it. Duration choices and optional voicing/velocity controls appear
in that chord's popover rather than occupying the main workspace.

- Drag a chord by its top handle to move it; drag its right edge to change its length. Edges snap to
  quarter-beat increments. Empty spaces are rests. Overlapping later material moves forward.
- Use the popover's ▶ to hear the current edit, ⧉ to duplicate it, or ⌫ to remove it.
- Undo/redo are in the heading; Ctrl/Cmd Z and Ctrl/Cmd Shift Z work outside text fields. Edits made
  while a song plays refresh playback at the current musical position.
- Tempo, meter and key are above the timeline. Zoom changes how many beats fit on screen.
- **Song tools** contains transposition, chord-chart paste (`| Dm7 G7 | Cmaj7 |`), capture **From playing**,
  deletion and the piano guide. Capturing makes an editable song from the analysed progression.

Songs save automatically. Existing songs/settings from the old Musify storage are read and migrated
when saved under chord.sh. The name is styled **chord.sh**.

## Playback and switching songs

The top bar uses ▶, ■ and ● with tooltips and accessible labels. The song selector shows the current
song or performance and lets you switch it. Switching while playing starts the new selection; selecting
while stopped prepares it. The seek slider and moving timeline playhead show the current position.

■ and Escape stop playback, previews, the metronome and any active recording. Clicking the active ●
again saves a recording without stopping playback. Stop cancels queued MIDI and releases held/sustained
notes. Seeking restarts analysis at that position, including held notes and the current pedal state.

The sound icon shows 🔓 when browser audio needs a gesture. Click it, or interact with the page, to
unlock. MIDI input cannot satisfy the browser's gesture requirement; see
[Chrome's autoplay policy](https://developer.chrome.com/blog/autoplay/).

## Suggestions

**Where next** keeps its **Next chord** and **Change key** views. Suggestions follow the selected chord
or insertion point in the editor, and follow live analysis when a performance is selected.

- Click a chord suggestion to preview it; **＋** adds it at the timeline cursor.
- Choose a key on the map or a destination in Change key. ▶ previews a route; **＋** inserts all its
  chords as one undoable edit. The destination key is retained for subsequent suggestions.
- Selecting a chord also exposes compact **Try instead** ideas. ▶ previews; **✓** replaces the selected
  chord with that alternative, sharing its duration across the new chords.
- **Practise** still waits for you to play each chord of a route; inversions and voicings are accepted.

Previewing never commits a suggestion. Adding, replacing, moving and resizing are undoable.

## Library, live analysis and panels

**Library** remains a visible tab: saved songs, examples, the demo, recordings, MIDI-file import and
annotated benchmark performances. **Editor** works on the current song. **Live** shows the analysed
progression, key theories and hindsight revisions (↻). **Edit sequence** brings that progression into
the editor. Clear resets pending notes and analysis without deleting the song.

Use **Panels** to hide optional panels or choose Song/Progression focus. Drag panel dividers to resize;
arrow keys also resize a focused divider. Layouts are remembered, and narrow screens stack vertically.

Function colours: tonic green, predominant amber, dominant red, chromatic violet. The piano shows
harmony blue, melody amber, previews violet and practice targets green.

Bars in Live depend on a confident pulse; free playing stays a sequence. For exact bars choose
Settings → Bars → Metronome. Library files with tempo bring their own grid.

## MIDI and recording

**⇩** exports the selected song/performance as a `.mid` file; the editor also has its own export icon.
Notes, voicings, gaps, durations, velocities and sustain can then play through a DAW instrument. For
live routing, choose **Settings → MIDI out** and **Playback output → DAW / MIDI out**. See
[DAW integration](daw.md) for the current connection and native plug-in direction.

● records MIDI plus analysis. An optional note describes what you meant to play. Saved sessions go to
`local/recordings/` and appear in Library. `npm run replay` replays the newest recording, or use
`REC=local/recordings/x.json npm run replay` for a specific file.

Computer keys `A W S E D F T G Y H U J K O L P ;` play C4–E5, Z/X change octave and Space is sustain.
Typing in an input does not play notes. Settings also contains MIDI input, monitoring, hand split,
metronome, meter and analysis key/style controls.
