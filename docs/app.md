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
- Use the ear icon in the popover to preview, ⧉ to duplicate a chord, or ⌫ to delete it.
- Undo/redo are above the timeline. Ctrl/Cmd Z and Ctrl/Cmd Shift Z work outside text fields.
- Bars wrap into rows based on the space available. Zoom changes how many bars fit on a row. Short chord
  blocks scale their text to fit, with the full symbol/duration available on hover. Long chords
  continue on the next row and retain one identity; dragging can move chords between rows.
- Tempo and time signature belong to the song. **Key changes** appear as vertical delimiters at
  their exact beats. Click the small key handle in the ruler to name a region (Verse, Bridge…) or
  change its key; hover reveals the name and key. Select a beat and use the key icon beside tempo to
  add a modulation. The current local key stays beside tempo. Continuing a region onto another row
  does not repeat a strip above its chords; suggestions and numerals use the same local key.
- The **⋯ song menu** contains transpose, chart paste (`| Dm7 G7 | Cmaj7 |`), duplicate/delete song and piano guide.
  Duplicating makes an independent variation with a distinct title. Deletion offers **Restore**.

**Songs are saved only when you press Save** (or Ctrl+S / ⌘S). Edits change a working copy, and the
status next to Save says "Not saved yet", "Unsaved changes" or "Saved". The song list marks unsaved
songs. Leaving the page with unsaved songs asks first. Saved songs live in this browser. It retains
existing songs and preferences from the old Musify storage when migrating to chord.sh.

The left column has three tabs: **Circle** (next moves and the circle of fifths), **Chord ideas** and
**Sequences**. The chosen tab is remembered in this browser.

## Play into the timeline

Incoming MIDI, computer keys or the on-screen piano show a pending chord directly on the timeline.
**With a chord selected, playing replaces it**, preserving its position, duration and identity.
**Without a selection, playing appends at the actual end**, even if the ruler cursor is elsewhere.
Pending blocks say **Replacing…** or **Adding…**. The inspector, piano and suggestions follow that input.

The chord saves automatically **600 ms after you release the keys and pedal**; there is no acceptance
button. Full voicings and average played velocity are retained. Appended chords occupy a full bar in
the current meter and stay unselected, so the next chord appends again. A replacement stays selected
for further variations. Press **Escape** to clear the selection and append; if a popover is open,
the first Escape closes it. Clicking the ruler or an empty beat also clears chord selection.
Loading a song, typing a new chord or adding a suggestion does not silently select the last chord.

Starting the next released gesture saves the preceding chord immediately. Pedal-held gestures wait
until pedal release: they append in order, or the last variation replaces the selected chord.
Accepting an idea also saves a released pending chord first, so it is not lost to the new edit.
Each idle save is undoable. Changing focus, editing, Stop, Reset or switching songs cancels pending
input. Playback, suggestion previews and recorded takes do not create duplicate automatic edits.
Settings → Editor has **Played chord idle delay** and **Auto-save played chords**; turn the latter off
to analyse live playing without editing the song. Recording remains the way to capture played rhythm.

To build a chord with the mouse, **hold Shift and click several piano keys**, then release Shift to
play them together. Click a selected key again to remove it. The stacked-notes button beside the
piano toggles **Chord entry** for mouse-only selection; use the ear button or **Enter** to play.
Selected keys have an accent outline and stay selected for adjusting or replaying the voicing.
**×** clears the selection; Escape, Stop and Reset also cancel it. Ordinary clicks still play a key
while held, and touch supports multiple fingers. Entered chords use the same recognition, timeline
preview, recording and MIDI output as live playing. Settings → Editor controls the saved entry mode
and chord duration in the current song's notated beats; velocity and note gate also apply.

● records a take directly on the same timeline. Chord blocks and a red playhead grow as you play;
stop/save commits the phrase to the song as **one undoable edit**, retaining its inferred rhythm. The
first played attack is placed at the insertion cursor, so waiting before playing does not create an
accidental overlap. Notes already held when Record is pressed are included.
Later material moves forward if the take overlaps it. A recording without note input adds no chords.
The MIDI/analysis recording is also saved, as before. There is no separate Live view or played-phrase panel.

The chord inspector shows the chord, its function and position. The **piano below** maps the roots of
chords in the current local key, even when nothing is sounding: in C major, C is **I**, D **ii**,
E **iii**, F **IV**, G **V**, A **vi** and B **vii°**. Numeral case describes the triad's quality; the
underline follows its harmonic function. The labels change with the timeline's key region or live key
context. Minor uses the same convention as the inspector (i, ii°, ♭III, iv, V, ♭VI, ♭VII, plus vii° on
the raised leading tone). Accidentals sit above the Roman numeral on narrow black keys.

**Note names are hidden by default**, but remain available on hover. Panels → Piano note names toggles
them; Settings → Editor has the same choice plus label size. Keys widen to keep Roman labels readable,
and you can scroll the piano horizontally. It starts near middle C and stays where you put it while
playing, previewing or editing chords. Optional **Piano chord tones** adds the focused chord's
intervals above the root map, with its full chord name on root notes. It is off by default. These are
separate references: G is the root of V in C major, while it is the third of a focused Em chord.

Sounding-note colours continue to describe intervals within the focused chord: roots green, guide
tones (thirds/sevenths) blue, fifths grey, extensions amber and alterations/outside notes red. They do
not classify melody versus accompaniment. No separate keyboard legend or placeholder row is needed.

## Transport

The timeline contains transport and source selection with SVG icons, tooltips and accessible names.
Seeking belongs to the timeline, with no toolbar seek slider:

- ▶ plays; it becomes Ⅱ while playing. Pause silences output and retains the playhead; ▶ resumes.
- ■ stops playback, previews, metronome and recording, and returns the playhead to the start.
- The **repeat icon beside Stop** toggles looping of the whole song/performance. Enable it, then Play.
  It remains highlighted while enabled. Switching it off during playback finishes the current pass.
- ● records; pressing it again saves without needing a separate recording area.
- ↺ clears **this song's** chords and melody (and the input analysis), stopping sound. The song itself,
  its name, tempo, meter and key remain; **Undo brings the chords and melody back**. Nothing is saved
  until you press Save.
- ⇩ exports the selected song/performance as MIDI.

The song selector names the current playback source. Changing it while playing starts the new source;
while stopped it prepares the source. Click the timeline's bar ruler to seek, or drag along it to scrub.
A running song resumes at the scrubbed position when released. The bar/beat readout is beside the
song's tempo controls. Opening the source picker does not restart or interrupt playback.

Looping returns to the start at the written end, with no new playback lead-in. Pause retains the
current position; Stop cancels further passes while keeping the repeat preference. Recording can
span multiple passes. The transport button and Settings → Playback & input → Loop playback share
one saved preference. MIDI export contains one pass of the arrangement.

Escape stops output and any recording. In Settings or a chord popover, Escape dismisses that layer instead. The sound icon
shows 🔓 when browser audio needs a gesture. Click it or interact with the page to unlock; MIDI input
cannot satisfy the browser's gesture requirement. See [Chrome's autoplay policy](https://developer.chrome.com/blog/autoplay/).

## Suggestions

**Ideas** follows the focused chord. By default, its compact rows suggest next chords. Selecting a key
on the circle switches the same list to routes into that key; × returns to next chords. A line states
the insertion position. There are no Next chord / Change key tabs.

- Ideas consider the recent sequence and chord quality as well as harmonic function. Settings → Chord
  suggestions controls learned ranking, sequence context and visible idea counts.
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
   - With *chords and melody*, notes the analysis hears above your chords become melody.
   - With *melody only*, the top note of every attack becomes melody and no chords are added.
3. **Fill chords under the melody.** Every bar (or half bar, with **per bar = 2**) that has melody but
   no chord gets a basic chord: I, IV or V (i, iv, V in minor), staying on the tonic when the melody
   allows. Each chord is chosen with its neighbours in mind, and existing chords are never moved.
   Twinkle Twinkle gives the textbook C C F C F C G C.
   A song with no chords yet takes its **key from the melody** (when you record it, or when you fill),
   so an A-minor tune in a new song is harmonised Am Dm E Am, not in the default C major. The change
   is announced and undoes with the take or the fill.
4. **Customize.**
   - Select a chord, or put the cursor on an empty bar, to see **ranked ideas** for that spot.
   - Each idea shows a score; what the melody, the context (tension prepared or resolved), the motion
     rules and the chosen **style** say about it; and short reasons. Hover the reasons for the style
     rules it satisfies or breaks.
   - Click an idea to **hear it in context**: the chord before, the idea with the melody of its bars, and
     the chord after, in the song's playback style. Shift-click plays it alone.
   - **Drag an idea into the timeline** by its handle (⠿). Dropped on a chord, it replaces it; dropped
     in a gap, it fills up to the next chord or one bar. A dashed box shows where it will land. Click or
     Enter on the handle places the idea at the selected chord or the cursor. Develop ideas and
     sequences drag the same way.
   - **Style** picks a rulebook: Pop & rock, Jazz, Functional, Counterpoint, Colour or Chromatic.
     **Expected ↔ Fresh** lets colour chords compete with in-key ones.
   - **Develop the chords** lists, for the whole song, one way to enrich each chord: add the 7th, a
     tonic substitute, a secondary dominant or ii–V before it, a tritone sub, a passing or common-tone
     °7, a borrowed iv. Only ideas that leave no melody note clashing are kept. The first chord keeps
     its root at the start and the last at the end, and the list varies the kind of idea. **How much**:
     *light* keeps one chord per slot (7ths, substitutes), *rich* also adds chords (secondary
     dominants, ii–V, passing °7). 👂 hears the
     replacement, ✓ uses it, and **Use all** applies the whole list. **Hear as it is** and **Hear
     developed** compare the whole song before and after (A/B) without changing it. **Keep as a new version**
     copies the song as “… (developed)” and develops the copy, so both versions stay in the song list. Each is one undo step, as is
     filling.

**Sequences** (under the chord ideas) suggest whole runs of chords for 1, 2 or 4 bars from the
selected chord's bar (or the cursor's), with 1 or 2 chords per bar:

- Each idea shows its chords, their numerals, a score, and what the three judges say: **melody**
  (does it explain the notes), **rules** (the style rulebook, with real neighbours on both sides,
  including the chord after the bars) and **habit** (how common the moves are in the chosen
  tradition).
- Reasons name known patterns (the four-chord loop, the double plagal…), the resolution into the next
  chord, and colour chords.
- **↺ idiom** lines name rule breaks that are forgiven because the tradition makes them often in that
  very context.
- Click an idea to hear it **with the melody of those bars**; ✓ places it, replacing the chords that
  start in those bars (one undo step).
- **Habits of** follows the style (Pop → popular music, Jazz → jazz, others → art music) or can be
  chosen. Habits ship with the app (`public/data/progressions.json`); if that file is missing,
  the panel says "rules only".

**Reading the timeline.** Each row has lanes, top to bottom:

- **ruler**: bars and beats; key changes are flagged;
- **chords**: the top edge is coloured by function (tonic, subdominant, dominant). The bar along the
  bottom of each chord shows how well it **covers the melody** above it (green, amber or red). Hover it
  for the count of chord tones, colour notes, leaning and pulling notes, and unresolved clashes;
- **connections**: a badge at each chord change shows **how the chords connect**: ↘ resolves, ≈ glides
  on shared notes, ∼ slides a semitone, → steps, ↗ opens, ⤴ leaps, = stays. ☀ means brighter and ☾
  darker on the circle of fifths. The badge colour shows how natural the move is (motion judge:
  green, blue or red), and hovering gives the details. **Between chords show** switches the badges to
  **habit** (how common the move is in the style's tradition, 0–100, from the study's counts; repeats
  have none) or to the **style's verdict** on the chord with its neighbours. The tooltip always shows all
  three;
- **melody**: a small piano roll with note names, each note coloured by how it sits on its chord;
- **playback**: the style runs and their markers.

**How to read the timeline** under the rows repeats this legend.

On the timeline, a **melody lane** under the chords colours every note by how it sits on the chord:

- green: rests (a chord tone);
- blue: colours (a step away);
- amber: leans into a chord tone from a semitone below;
- red: pulls (a semitone above a chord tone).

The advice is deterministic and comes from explicit rules: [harmonize.md](harmonize.md) and
[rules.md](rules.md).

## Sources, devices and workspace

**The source picker beside playback** searches saved songs, examples, opened performances, recordings
and every reference collection. There is no separate Library tab. Reference results are paged with explicit counts and Show more; search includes pieces
beyond the initially displayed page. The active source is marked current.

Click the current source name to browse. **Selecting any row opens it in the timeline as a song** with
chords and melody, unsaved until you press Save:

- **Open-source pieces** (the annotated corpora in `local/data`) bring their annotated chords and key;
- **recordings** bring the chords the app recognised during the take;
- **built-in performances and MIDI files** get chords read from their notes.

The melody is the top line of the notes, an approximation for piano pieces. The play icon plays the
original performance. Changing sources during playback keeps playback running.
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

For rhythmic playback, set **style markers**: "from this bar on, play in this style", like key regions.
Click a bar in the **playback lane** at the bottom of a timeline row, or the style button beside the
tempo/key controls (it shows the style at the cursor), to change the style from there on. The picker
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
are supported. The numerator accepts 1–255; denominator choices are 1, 2, 4, 8, 16, 32, 64, 128 and 256.
Old songs retain their original /4.
Each timeline cell and duration beat is the denominator's note value: in 6/8, one beat is an eighth
note and a full bar is six beats. Snap/resize/seek use those units too. Tempo stays **quarter notes per
minute** (♩); changing a signature regroups existing notes without moving or stretching them.
New chords and pasted chart bars use the current full-bar length. Meter changes are undoable and save
with the song; new-song defaults and metronome signatures are in Settings.

MIDI exports the chosen signature and quarter-note tempo directly. Songs saved with experimental /3,
/6 or other unsupported denominators reopen with /4 grouping; notes, durations, key changes and
playback timing are preserved. The app reports this once when migrating those songs.
