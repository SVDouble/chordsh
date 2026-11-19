# Using chord.sh

chord.sh is one editable song timeline. Play chords, build a sequence, hear alternatives and use your
DAW's instruments through MIDI. Songs and performances live in the source picker beside playback;
playing and editing share the same workspace.

```sh
npm install
npm run dev        # Chrome or Edge for Web MIDI
```

## One timeline

The **left harmony block** groups the current chord, compact ideas and optional circle of fifths. The
timeline gets the remaining, larger area beside it. Playback and source selection live at the top of
the timeline. Only its bar grid scrolls, so the song controls and position remain visible. The current
insertion beat is highlighted in both the ruler and grid.

Click an empty beat and type a chord such as `Cmaj7`. Enter or ✓ keeps it. Click an existing chord to
change it. Its duration, optional voicing and velocity live in a floating chord popover. It leaves the
workspace usable; click another chord to move on, or Escape to dismiss it.

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
stop/save commits the phrase to the song as **one undoable edit**, retaining its inferred rhythm. The
first played attack is placed at the insertion cursor, so waiting before playing does not create an
accidental overlap. Notes already held when Record is pressed are included.
Later material moves forward if the take overlaps it. A recording without note input adds no chords.
The MIDI/analysis recording is also saved, as before. There is no separate Live view or played-phrase panel.

The chord inspector shows the chord, its function and position. Note names and roles belong to the
**piano below**. Every key carries its note name; sounding notes also show their chord interval above
and their key-relative degree below, marked with a caret (ˆ). The root shows the full chord name
instead of R. For example, G over Em in C shows ♭3 above and ˆ5 below. Hover a key for both reference
names. Key degrees use the current major or natural-minor scale.

Colours describe every sounding note's interval: roots green, guide tones (thirds/sevenths) blue, fifths
grey, extensions amber and alterations/outside notes red. They do not claim to distinguish melody
from accompaniment. On narrow screens the piano scrolls horizontally instead of squeezing the keys;
Settings → Piano key width controls their minimum width.

## Transport

The timeline contains transport and source selection with SVG icons, tooltips and accessible names.
Seeking belongs to the timeline, with no toolbar seek slider:

- ▶ plays; it becomes Ⅱ while playing. Pause silences output and retains the playhead; ▶ resumes.
- ■ stops playback, previews, metronome and recording, and returns the playhead to the start.
- ● records; pressing it again saves without needing a separate recording area.
- ↺ resets the current timeline and input analysis, stopping sound. Song name, tempo, meter and key
  remain; **Undo restores the cleared chords**. Other songs are retained.
- ⇩ exports the selected song/performance as MIDI.

The song selector names the current playback source. Changing it while playing starts the new source;
while stopped it prepares the source. Click the timeline's bar ruler to seek, or drag along it to scrub.
A running song resumes at the scrubbed position when released. The bar/beat readout is beside the
song's tempo controls. Opening the source picker does not restart or interrupt playback.

Escape stops output and any recording. In Settings or a chord popover, Escape dismisses that layer instead. The sound icon
shows 🔓 when browser audio needs a gesture. Click it or interact with the page to unlock; MIDI input
cannot satisfy the browser's gesture requirement. See [Chrome's autoplay policy](https://developer.chrome.com/blog/autoplay/).

## Suggestions

**Ideas** follows the focused chord. By default, its compact rows suggest next chords. Selecting a key
on the circle switches the same list to routes into that key; × returns to next chords. A line states
the insertion position. There are no Next chord / Change key tabs.

- Click any idea to hear it; **＋** inserts the chord or whole route at the cursor.
- Each route names its destination key and shows its chords. **Why this route** reveals the explanation
  and optional practice action, keeping the normal sketching view compact.
- The circle of fifths is a visual destination picker for the **same list**. Clicking a key changes
  the routes in Ideas; a destination chooser provides the same choice when the circle is hidden.
  Choosing the current key or clicking the target again returns to next chords.
- A route inserts in one undoable edit and establishes its destination key as a region. Undo returns
  the insertion cursor to the start of the undone material; redo focuses the restored material.
- The chord-editing popover contains **Try instead** reharmonisations. Preview hears the replacement;
  **✓** replaces the chord while sharing its duration across the new chords.
- **Practise route** waits for each chord; voicings and inversions are accepted.

Previews do not commit edits. Add/replace actions show a short confirmation with the song and position.

## Sources, devices and workspace

**The source picker beside playback** searches saved songs, examples, opened performances, recordings
and every reference collection. There is no separate Library tab. Reference results are paged with explicit counts and Show more; search includes pieces
beyond the initially displayed page. The active source is marked current.

Click the current source name to browse. Select a row to open it; the play icon explicitly plays it. Changing sources during playback keeps playback running.
**Import MIDI** opens a performance for listening and analysis. Record it into the timeline to turn its
inferred chords into editable material. Examples are editable starting points.

**Panels** offers All panels and Song focus. Hide key exploration, ideas, the chord inspector or piano
as needed, or drag the dividers to resize. Settings contains the same visibility choices. Workspace
panels have square corners. Small screens keep the song first, with the same internal timeline scroll
area, before the harmony block.

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

## Consistent preview sound

Chord previews, live notes and timeline playback use the same synth voice and MIDI-velocity curve.
Previews use the focused chord's velocity; manually entered chords use the editor's default unless
changed. Kept input preserves its played velocity, and captured chord blocks average their recorded
attacks. Different velocities intentionally change loudness and brightness. The oscillator/filter
patch is unchanged. Development updates silence and close the previous audio engine before replacing
it, so old voices cannot accumulate across code reloads.
