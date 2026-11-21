# Using chord.sh

chord.sh is one editable project timeline. Play chords, build a sequence, hear alternatives and use your
DAW's instruments through MIDI. The navbar opens the Library for projects, recordings and collections.
Playback and editing share the same workspace.

```sh
npm install
npm run dev        # Chrome or Edge for Web MIDI
```

## One timeline

The **left harmony block** groups the current chord, compact ideas and optional circle of fifths. The
timeline gets the remaining, larger area beside it. The project name in the centre of the navbar
opens the Library. Playback, recording and project actions share its row. Scroll the navbar sideways
when space is tight. The timeline
tools stay in view while the bar grid scrolls. The current insertion beat is highlighted in both
the ruler and grid.

Click an empty beat and type a chord such as `Cmaj7`. Enter or ✓ keeps it. Click an existing chord to
change it. Its duration, optional voicing and velocity live in a floating chord popover. It leaves the
workspace usable; click another chord to move on, or Escape to dismiss it.

- Drag anywhere on a chord block, including its name, to move it; the top handle still works.
  Click without dragging to edit. Small movements below the drag threshold still count as a click.
  Drag its right edge to resize. The default snap is a quarter beat; snap and drag threshold are in
  Settings → Editor. Empty spaces are rests. Overlapping later chords move forward.
- Open **Voicing** for Full, Shell, Rootless and Drop 2 alternatives. Clicking a choice previews it;
  ✓ saves it as one undoable chord edit. Shell keeps bass and defining tones; Rootless leaves room for
  a separate bass. Drop 2 opens a four-note upper voicing by lowering its second-highest note an octave,
  preserving a specified slash bass. It is unavailable when the chord cannot supply four distinct
  tones, so triads do not silently become seventh chords. MIDI export retains the chosen notes.
  Manual notes and velocity remain editable below the choices.
- Use the ear icon in the popover to hear the chord with the melody over that passage. Use ⧉ to
  duplicate the chord or ⌫ to delete it. Selecting a chord during playback keeps the playhead moving.
- Undo/redo are above the timeline. Ctrl/Cmd Z and Ctrl/Cmd Shift Z work outside text fields.
- Bars wrap into rows based on the space available. Zoom changes how many bars fit on a row. Short chord
  blocks scale their text to fit, with the full symbol/duration available on hover. Long chords
  continue on the next row and retain one identity; dragging can move chords between rows.
- Tempo and time signature belong to the project. **Key changes** appear as vertical delimiters at
  their exact beats. Click a key marker in the ruler to change the key or name the region (Verse,
  Bridge…). Select a beat and use the key icon beside tempo to add a marker there. Suggestions and
  numerals use the local key.
- Use the up and down arrows in the navbar to transpose the project by a semitone. The keyboard icon toggles the piano guide.

The navbar groups loop, stop, play and record in the transport. Undo and redo sit after Save and
Export on the right. Edit **Project name** in the Library to rename the current project. The timeline toolbar
has tempo, meter, key and
playback style, followed by the two editing lanes. Each lane has its own select, load and clear
buttons. The Record button starts or stops a take. The capture icons beside it choose both lanes,
melody only or chords only.

Use the speaker buttons beside **Melody** and **Chords** to mute either lane during project playback.
The chord editor has its own shortcut to the Melody mute for comparing voicings. Opening a different
project resets both mutes.

Chord entry, connection badge views, bar/beat position and zoom sit immediately above the timeline.

The Library also has controls for pasting a chord chart (`| Dm7 G7 | Cmaj7 |`) and clearing the current timeline.
**Close project** shows an empty timeline. Your project stays in **My projects**.

Use the copy or trash icon beside a project in **Library → My projects**. Copy creates and opens an
independent project. Use **Restore** in the deletion notification to bring a deleted project back.

Projects and committed edits autosave in this browser. Reloading reopens the last active project.
If browser storage fails, the Save icon highlights so you can retry (Ctrl+S / ⌘S).

The toggle in the harmony header switches between the **Circle of fifths** and **Suggestions** for
alternatives at the selected position. The browser remembers the view and suggestion length.

## Play into the timeline

In Chords mode, select a chord or a beat and play a chord using MIDI, the computer keyboard, or the piano.
The voicing stays pending after you release the keys. Press **Enter** or **Place chord** to confirm it.
A chord at that beat keeps its position and duration. A chord in a gap fills up to one bar, or until the
next chord. Double-click a beat or chord to type a symbol and set its duration.

To build a chord with the mouse, **hold Shift and click several piano keys**, then release Shift to
play them together. Click a selected key again to remove it. The stacked-notes button beside the
piano toggles **Chord entry** for mouse-only selection; use the ear button or **Enter** to play.
Selected keys have an accent outline and stay selected for adjusting or replaying the voicing.
**×** clears the selection; Escape, Stop and Reset also cancel it. Ordinary clicks still play a key
while held, and touch supports multiple fingers. Entered chords use the same recognition, timeline
preview, recording and MIDI output as live playing. Settings → Editor controls the saved entry mode
and chord duration in the current song's notated beats; velocity and note gate also apply.

Select a beat in either lane, then press **Record** in the transport. The take captures chords and melody
by default. The capture icons beside Record can restrict it to one part. Recorded notes and chords appear
as you play. Stop to commit the take as one undoable edit. Its first attack starts at the cursor and later
material keeps its position.

**Note names are hidden by default**, but remain available on hover. Panels → Piano note names toggles
them. Settings → Editor has the same choice plus key width. The piano starts near middle C, scrolls
horizontally and stays where you put it while playing or editing. Optional **Piano chord tones** adds
the focused chord's intervals, with its full chord name on root notes.

Sounding-note colours continue to describe intervals within the focused chord: roots green, guide
tones (thirds/sevenths) blue, fifths grey, extensions amber and alterations/outside notes red. They do
not classify melody versus accompaniment. No separate keyboard legend or placeholder row is needed.

## Transport

The navbar contains transport controls with icons, tooltips and accessible names.
Seeking belongs to the timeline, with no toolbar seek slider:

- ▶ plays; it becomes Ⅱ while playing. Pause silences output and retains the playhead; ▶ resumes.
- ■ stops playback, previews, metronome and recording, and returns the playhead to the start.
- The **metronome icon** toggles an audible click at the project's tempo and time signature.
  It can run on its own or alongside playback and recording.
- The **repeat icon beside Stop** toggles looping of the whole project or performance. Enable it, then Play.
  It remains highlighted while enabled. Switching it off during playback finishes the current pass.
- ● records; pressing it again saves without needing a separate recording area.
- **Clear chords and melody** in the project menu clears both lanes and stops playback. Use **Undo**
  to bring the chords and melody back.
- ⇩ exports the active project as MIDI.

The project selector names the current project. Click the timeline's bar ruler to seek, or drag
along it to scrub. Playback resumes at the scrubbed position when released. The bar/beat readout
is beside the project's tempo controls.

Looping returns to the start at the written end, with no new playback lead-in. Pause retains the
current position; Stop cancels further passes while keeping the repeat preference. Recording can
span multiple passes. The transport button and Settings → Playback & input → Loop playback share
one saved preference. MIDI export contains one pass of the arrangement.

Escape stops output and any recording. In Settings or a chord popover, Escape dismisses that layer instead. The sound icon
shows 🔓 when browser audio needs a gesture. Click it or interact with the page to unlock; MIDI input
cannot satisfy the browser's gesture requirement. See [Chrome's autoplay policy](https://developer.chrome.com/blog/autoplay/).

## Suggestions

The **Circle of fifths** view suggests next chords from the focused chord. Selecting a key switches the list to
routes into that key. × returns to next chords.

- Ideas consider the recent sequence and chord quality as well as harmonic function. Settings → Chord
  suggestions controls learned ranking, sequence context and visible idea counts.
- Click an idea to hear it once. **Shift-click** or **Alt+Enter** hears it with neighbouring chords and melody.
  Drag the row to place it, or press **Shift+Enter** when it has focus.
- Routes show the full progression with Roman numerals and the destination key. Hover a row for its reason.
- The circle of fifths is a visual destination picker for the **same list**. Clicking a key changes
  the routes in Ideas; a destination chooser provides the same choice when the circle is hidden.
  Choosing the current key or clicking the target again returns to next chords.
- A route inserts in one undoable edit and establishes its destination key as a region. Undo returns
  the insertion cursor to the start of the undone material; redo focuses the restored material.
- The chord-editing popover contains **Try instead** reharmonisations. Preview hears the replacement;
  **✓** replaces the chord while sharing its duration across the new chords.
  When the song has a melody, each idea shows its melody fit (♪ 85%). Ideas that leave a strong-beat
  note unresolved are marked ✗, dashed, and listed last.
- **Practise route** waits for each chord; voicings and inversions are accepted.

Previews do not commit edits. Add/replace actions show a short confirmation with the song and position.

## Melody and chords for the melody

A song can hold a **melody** next to its chords. The **Chords for the melody** panel in the harmony pane
helps you harmonize it in four steps. Use them in any order:

1. **Start from a template** (optional). It inserts a basic progression at the cursor, one chord per
   bar, spelled in the song's key: I–V–vi–IV, doo-wop, Mixolydian ♭VII–IV–I, Aeolian, Andalusian,
   double plagal, blues and more.
   **Or load them separately** (buttons in the ideas panel):
   - **Load melody…** reads a MIDI file. You pick the part that is the melody; the likely one is
     preselected (by name, a single line, high register), and 👂 previews each part. Where the part
     plays several notes at once, the top note is kept. The song's chords are not touched.
   - **Load chords…** reads a MIDI file's accompaniment, or a chord chart in a `.txt` file. In MIDI,
     each bar is read as one chord and split into halves or beats only where every part is a full chord
     and the harmony changes, so arpeggios still read as one chord. The melody is not touched.
   - Or **drag and drop** a `.mid` or `.txt` file anywhere on the page. A MIDI file opens the same dialog,
     with a switch for using it as the melody or the chords. It defaults to the chords when the song
     has a melody but no chords yet.
   - An empty song takes the file's tempo and meter. A song without chords takes its key from what
     was loaded. Each load is one undo step.
2. **Play the melody.** Press record and play.
   - **Recording captures** chooses what the take keeps: chords and melody, melody only, or chords only.
   - With _chords and melody_, notes the analysis hears above your chords become melody.
   - With _melody only_, the top note of every attack becomes melody and no chords are added.
3. **Fill chords under the melody.** Every bar (or half bar, with **per bar = 2**) that has melody but
   no chord gets a basic chord: I, IV or V (i, iv, V in minor), staying on the tonic when the melody
   allows. Each chord is chosen with its neighbours in mind, and existing chords are never moved.
   Twinkle Twinkle gives the textbook C C F C F C G C.
   A song with no chords yet takes its **key from the melody** (when you record it, or when you fill),
   so an A-minor tune in a new song is harmonised Am Dm E Am, not in the default C major. The change
   is announced and undoes with the take or the fill.
4. **Customize.**
   - Select a chord, or put the cursor on an empty bar, to see **ranked ideas** for that spot.
   - Ideas show chord names, Roman numerals and tags for moves such as a dominant resolution or plagal return.
     **Focus** chooses how to judge the chords. **Variety** adjusts how adventurous the ideas are.
     Hover a row for more detail.
   - Click an idea to hear it with the melody over that passage. The sounding chord is highlighted in the row. **Shift-click** plays the
     whole passage with its neighbouring chords and melody. **Escape** dismisses the preview.
   - Drag the row into the timeline. A drop on an existing chord replaces it. In a gap the idea fills up to
     the next chord or one bar. Sequences keep their displayed length.
   - **Develop the chords** lists, for the whole song, one way to enrich each chord: add the 7th, a
     tonic substitute, a secondary dominant or ii–V before it, a tritone sub, a passing or common-tone
     °7, a borrowed iv. Only ideas that leave no melody note clashing are kept. The first chord keeps
     its root at the start and the last at the end, and the list varies the kind of idea. **How much**:
     _light_ keeps one chord per slot (7ths, substitutes), _rich_ also adds chords (secondary
     dominants, ii–V, passing °7). Click a replacement to hear it or drag it to place it. **Use all** applies the whole list. **Hear as it is** and **Hear
     developed** compare the whole song before and after (A/B) without changing it. **Keep as a new version**
     copies the song as “… (developed)” and develops the copy, so both versions stay in the song list. Each is one undo step, as is
     filling.

In **Suggestions**, choose **1 chord** to replace the selected chord or fill one slot. Choose
**1 bar**, **2 bars** or **4 bars** to suggest a run starting at the selected chord's bar or the
cursor's bar. The chord lane highlights the target range. **Chords per bar** sets the density for runs.
Open **Templates** to browse named progressions in the local key. Click a row to hear it, drag it to place it on the timeline, or use
**Shift+Enter** on the row to insert it at the cursor.

- Roman numerals lead in suggestion chips, with chord names alongside. Use **Roman numerals first**
  in Settings to change which label leads. Single-chord rows show the chord tones and point out
  possible resolutions or shared notes. A tag names each borrowing source once, and purple dots
  mark the borrowed chords. Hover a dot or source tag for details.
- Each suggestion has a thin score line. A segment's width is its category's points divided by the
  highest sum of category points in the list. One legend below the list identifies the colors.
- Click to hear the suggested sequence once in up to three seconds. Shift-click includes the
  surrounding chords and lasts up to four seconds. Drag into the timeline to replace the target chords.
- **Patterns** chooses the music used for progression counts. **Auto** shows the source selected by
  **Focus**. Pop uses pop and rock, Jazz uses jazz, and the other focuses use art music.

**Reading the timeline.** Each row has lanes, top to bottom:

- **ruler**: bars and beats, with flags for key and playback-style changes;
- **chords**: the top edge is coloured by function (tonic, subdominant, dominant). The bar along the
  bottom of each chord shows how well it **covers the melody** above it (green, amber or red). Hover it
  for the count of chord tones, colour notes, leaning and pulling notes, and unresolved clashes;
- **connections**: a badge at each chord change shows **how the chords connect**: ↘ resolves, ≈ glides
  on shared notes, ∼ slides a semitone, → steps, ↗ opens, ⤴ leaps, = stays. ☀ means brighter and ☾
  darker on the circle of fifths. The badge colour shows how natural the move is (motion judge:
  green, blue or red), and hovering gives the details. The icon buttons above the timeline switch
  the badges to **progression frequency** (how common the move is in the style's tradition on a
  0–100 scale from the study's counts) or to the **style's verdict** on the chord with its neighbours.
  The tooltip shows scores when available;
- **melody**: a small piano roll with note names, each note coloured by how it sits on its chord.

The question mark in the navbar opens the timeline guide.

On the timeline, a **melody lane** under the chords colours every note by how it sits on the chord:

- green: rests (a chord tone);
- blue: colours (a step away);
- amber: leans into a chord tone from a semitone below;
- red: pulls (a semitone above a chord tone).

The advice is deterministic and comes from explicit rules: [harmonize.md](harmonize.md) and
[rules.md](rules.md).

## Sources, devices and workspace

**The project picker in the navbar** opens the Library. Browse My projects, Recordings or Collections.
Each collection opens as its own folder. Use the breadcrumb or Back to move
up. Search from the library root to find a piece anywhere, or search within the current folder.
Selecting a reference opens its chords and melody in the timeline and keeps a copy in **My projects**.

- **Open-source pieces** (the annotated corpora in `local/data`) bring their annotated chords and key;
- **recordings** bring the chords the app recognised during the take;
- **MIDI files** get chords read from their notes.

The melody is the top line of the notes, an approximation for piano pieces. The play icon opens the
project in the timeline and plays the original performance. Selecting a reference row stops
playback and displays the project from the beginning.
**Import MIDI** opens editable chords and melody inferred from the performance and keeps the result in **My projects**.

**Panels** offers All panels and Project focus. Hide key exploration, ideas, the chord inspector or piano
as needed, or drag the dividers to resize. Settings contains the same visibility choices. Workspace
panels have square corners. Small screens keep the project first, with the same internal timeline scroll
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

For rhythmic playback, set **style markers**: "from this bar on, play in this style", like key regions.
Click a style marker in the ruler to edit it. To add a change, select the bar and use the style
button beside the tempo/key controls. The picker
has 57 choices, including pop, swing, bossa nova, strumming, funk and melodic arpeggios. The ear
previews the choice; ✓ applies it. **Remove this change** in a marked bar lets the earlier style
continue. Changes support Undo/Redo and save with the song.
The same chord/bass arrangement plays through the browser or MIDI output and is included in MIDI
export. **Once** keeps the existing held-chord playback. See [the style catalogue](accompaniment.md).

Chord previews, live notes and timeline playback use the same synth voice and MIDI-velocity curve.
Previews use the focused chord's velocity; manually entered chords use the editor's default unless
changed. Kept input preserves its played velocity, and captured chord blocks average their recorded
attacks. Velocity changes loudness; filter brightness stays consistent by default. **Settings → Browser
synth** controls volume, brightness, optional velocity brightness, tone decay, release, repeated-note
crossfade and output limiting. Only explicit sound settings change the patch; automatic chord saving
does not create audio or reset the instrument.

Repeated pitches fade the previous attack quickly, including released and pedal-held tails. Cancelled
future previews never sound, and real input ends an active ear preview before playing. Audio envelopes
and note cleanup use the audio clock, independently of UI frames and background-tab timer throttling.
Development updates silence and close the previous audio engine before replacing it.

## Time signatures

Edit the beat count beside the quarter-note tempo and choose its note value: 6/8, 7/8, 5/4 and 13/16
are supported. The numerator accepts 1–255. The menu offers denominators 1, 2, 4, 8, 16 and 32.
Denominators 64, 128 and 256 appear when the current project uses them.
Each timeline cell and duration beat is the denominator's note value: in 6/8, one beat is an eighth
note and a full bar is six beats. Snap/resize/seek use those units too. Tempo stays **quarter notes per
minute** (♩); changing a signature regroups existing notes without moving or stretching them.
New chords and pasted chart bars use the current full-bar length. Meter changes are undoable and save
with the project. New project defaults and metronome signatures are in Settings.

MIDI exports the chosen signature and quarter-note tempo directly. Songs saved with experimental /3,
/6 or other unsupported denominators reopen with /4 grouping; notes, durations, key changes and
playback timing are preserved. The app reports this once when migrating those songs.
