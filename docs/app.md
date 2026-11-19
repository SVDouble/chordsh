# Using chord.sh

chord.sh is one editable song timeline. Play chords, build a sequence, hear alternatives and use your
DAW's instruments through MIDI. Songs and performances live in the source picker beside playback;
playing and editing share the same workspace.

```sh
npm install
npm run dev        # Chrome or Edge for Web MIDI
```

## One timeline

Click an empty beat and type a chord such as `Cmaj7`. Enter or ✓ keeps it. Click an existing chord to
change it. Its duration, optional voicing and velocity live in the chord popover.

- Drag the top handle to move a chord or its right edge to resize. The default snap is a quarter beat;
  change it in Settings → Editor. Empty spaces are rests. Overlapping later chords move forward.
- Use ▶ in the popover to preview, ⧉ to duplicate a chord, or ⌫ to delete it.
- Undo/redo are above the timeline. Ctrl/Cmd Z and Ctrl/Cmd Shift Z work outside text fields.
- Bars wrap into rows based on the space available. Zoom changes how many bars fit on a row. Long chords
  continue on the next row and retain one identity; dragging can move chords between rows.
- Tempo and quarter-note meter belong to the song. **Key regions** run above the bars: click a region
  to name it (Verse, Bridge…) or change its local key. Select a beat and use the key icon to add a
  modulation there. The current region is highlighted; suggestions and numerals use the local key.
- The **⋯ song menu** contains transpose, chart paste (`| Dm7 G7 | Cmaj7 |`), duplicate/delete song and piano guide.
  Duplicating makes an independent variation with a distinct title. Deletion offers **Restore**.

Songs save automatically in this browser. The editor shows whether saving succeeded. It retains
existing songs and preferences from the old Musify storage when migrating to chord.sh.

## Play into the timeline

Incoming MIDI, computer keys or the on-screen piano show an **input preview at the timeline cursor**.
The chord inspector, piano and suggestions follow that chord. ✓ on the preview keeps it as an editable
block. Selecting a timeline chord brings the same tools back to that selection.

● records a take directly on the same timeline. Chord blocks and a red playhead grow as you play;
stop/save commits the phrase to the song as **one undoable edit**, retaining its inferred timings.
Later material moves forward if the take overlaps it. A recording without note input adds no chords.
The MIDI/analysis recording is also saved, as before. There is no separate Live view or played-phrase panel.

The chord inspector shows the chord, its function and position. Note names and roles belong to the
**piano below**: a nearby legend pairs names with Root, 3, ♭3, 5, 7 and extensions, while the actual
voicing's keys carry the same labels and colours. Root is green, guide tones (thirds/sevenths) blue,
fifth grey, extensions amber and alterations red. Text labels keep the roles clear without colour. On narrow screens the piano scrolls horizontally
instead of squeezing the keys; Settings → Piano key width controls their minimum width.

## Transport

The top bar uses one row for transport, source selection and seeking. Consistent SVG icons have
tooltips and accessible names. Narrow screens scroll the toolbar horizontally instead of wrapping seek
onto another line:

- ▶ plays; it becomes Ⅱ while playing. Pause silences output and retains the playhead; ▶ resumes.
- ■ stops playback, previews, metronome and recording, and returns the playhead to the start.
- ● records; pressing it again saves without needing a separate recording area.
- ↺ resets the current timeline and input analysis, stopping sound. Song name, tempo, meter and key
  remain; **Undo restores the cleared chords**. Other songs are retained.
- ⇩ exports the selected song/performance as MIDI. The editor also has its own export icon.

The song selector names the current playback source. Changing it while playing starts the new source;
while stopped it prepares the source. Seeking starts playback at that position. Opening the source picker does not restart or interrupt playback.

Escape stops output and any recording. In Settings, Escape closes the dialog instead. The sound icon
shows 🔓 when browser audio needs a gesture. Click it or interact with the page to unlock; MIDI input
cannot satisfy the browser's gesture requirement. See [Chrome's autoplay policy](https://developer.chrome.com/blog/autoplay/).

## Suggestions

**Where next** retains **Next chord** and **Change key** tabs. It follows the focused chord, whether
played or selected. A line states the destination song and insertion position.

- Click a chord suggestion to hear it; **＋** inserts it at the cursor.
- Select a destination key on the map or in Change key. ▶ previews a route; **＋** inserts the whole
  route in one undoable edit. Its destination key is retained for further suggestions.
- Selecting a chord exposes **Try instead** reharmonisations. ▶ previews; **✓** replaces the chord,
  sharing its duration across the replacement chords.
- **Practise** waits for each chord in a route; voicings and inversions are accepted.

Previews do not commit edits. Add/replace actions show a short confirmation with the song and position.

## Sources, devices and workspace

**The source picker beside playback** searches saved songs, examples, opened performances, recordings
and every reference collection. There is no separate Library tab. Reference results are paged with explicit counts and Show more; search includes pieces
beyond the initially displayed page. The active source is marked current.

Click the current source name to browse. Select a row to open it; the play icon explicitly plays it. Changing sources during playback keeps playback running.
**Import MIDI** opens a performance for listening and analysis. Record it into the timeline to turn its
inferred chords into editable material. Examples are editable starting points.

**Panels** offers All panels and Song focus. Hide the tonal map, suggestions, chord inspector or piano
as needed, or drag the dividers to resize. Settings contains the same visibility choices. Workspace
panels have square corners, and small screens put the song first before stacking the optional panels.

## MIDI and settings

Click the **device name beside the logo** to select MIDI input, MIDI output and browser/DAW sound.
The same choices remain available in Settings. Choose DAW / MIDI output to use a DAW instrument.
MIDI export preserves notes, voicings, gaps, durations, velocities and sustain. See [DAW integration](daw.md).

Recordings go to `local/recordings/` under the development server and appear in the source picker. Elsewhere,
saving falls back to downloading JSON. `npm run replay` replays the latest recording, including its
configuration; `REC=local/recordings/x.json npm run replay` selects a specific file.

Computer keys `A W S E D F T G Y H U J K O L P ;` play C4–E5, Z/X change octave and Space is sustain.
Typing in a form or using Settings does not play notes.

**⚙ Settings** collects playback, MIDI, editor, workspace and advanced analysis controls. Search by
purpose, read help/ranges/defaults, then Apply or Cancel. See [settings](settings.md) for the schema,
tradeoffs and persistence. Browser preferences do not alter reproducible benchmark defaults.
