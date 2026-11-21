# Settings

Open **⚙ Settings** for playback, MIDI, appearance, workspace panels, editor defaults and analysis.
Search by name or purpose. Advanced sections start collapsed. **Apply** validates the whole draft;
**Cancel**, × and Escape discard it. **Restore defaults** is staged until Apply. Invalid settings leave
playback and the current configuration intact. Sound, theme and Panels remain convenient shortcuts to
the same saved values.

Analysis changes stop playback and restart live analysis because cached model scores depend on the
configuration. Songs, voicings and undo history are retained. Changing a default does not rewrite
existing songs: song tempo/meter and chord velocities belong to the document. Metronome/preview tempo
is a separate preference; previews of a selected song use that song's tempo.

## One source of truth

[`src/config/settings.ts`](../src/config/settings.ts) defines defaults, types, validation, labels, help,
units, control steps and ranges. It uses [Zod](https://zod.dev/) and its public
[JSON Schema conversion](https://zod.dev/json-schema) to generate form fields. Adding a numeric option
there gives it a settings control without maintaining a second form definition. Nested harmonic priors
are included. Cross-field validation lives in the same schema.

The engine receives validated settings through `new Session(settings)` or `session.configure(settings)`;
it has no Svelte or browser dependency. Standalone trackers and editors use the same defaults. The
harmonizer's existing `DEFAULT_PARAMS` export remains compatible with benchmark and tuning scripts,
and now comes from the shared schema.

| Section                  | Controls                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Playback & input         | output mode, monitor, MIDI devices, theme, chord style, key lock, hand split, metronome tempo/meter numerator/denominator/click          |
| Browser synth            | volume, brightness, velocity brightness, sustained brightness/decay, release, repeated-note crossfade and output limiting                |
| Workspace                | visibility of the chord inspector, ideas, key exploration and piano                                                                      |
| Chord suggestions        | learned/rule ranking blend, two-chord context, rare-context smoothing and main/colour idea counts                                        |
| Editor                   | new-song tempo/meter, timeline snap/length, piano labels/width, chord-entry mode/duration, undo depth, chord velocity and note gate      |
| Beat & bar detection     | timing resolution/window/range, update/grouping/revision intervals, tempo preference/smoothing, meter candidates and bar decoder weights |
| Downbeat evidence        | pitch memory, bass register thresholds and accent weights                                                                                |
| Chord & melody detection | chord grouping, rolled chords, released-note memory, hand-split evidence and analysis release timing                                     |
| Harmonic model           | chord/key change costs, learned transitions, note fit, priors, bass weights, held-note decay and passing-note weighting                  |
| Analysis & history       | refresh/stability delays, history lengths, alternative-key count and modal-colour evidence decay                                         |

## Browser synth

Live MIDI, computer keys, the on-screen piano, ear previews and timeline playback share one instrument.
Velocity changes volume while **Velocity brightness** defaults to zero, keeping the same tone across
soft and hard attacks. Increase it to opt into brighter strong notes. **Synth brightness** starts at
4,000 Hz and mellows to **Sustained brightness** (900 Hz) over **Brightness decay** (1,200 ms); set the
decay to zero for constant brightness while held.

**Note release** is an exponential time constant (80 ms), with silence after 7.5 constants. Repeated
attacks crossfade the old same-pitch voice using **Repeated-note crossfade** (8 ms), preventing old
release tails from building up. **Synth volume** defaults to 0.5 and **Output limiting threshold** to
−3 dB. These controls affect browser audio only. Applying them retains held voices and analysis;
new notes use the changed tone. Automatic chord saving never changes these settings.

## Beat and bar detection

Defaults preserve the previous detector: **10 ms** bins, **8,000 ms** window, **48 to approximately
158 BPM** detection, **100 BPM** preference and **4,000 ms** of revisable beats. The precise upper default
is `60000 / 380`, retaining the original 380 ms shortest period. These are starting values, not a fixed
tempo vocabulary. Set a wider or different BPM range for slow or fast music. Fixed tempo from a song,
MIDI file or metronome bypasses automatic tempo estimation.

- Smaller bins cost more CPU; longer windows stabilise tempo but adapt more slowly.
- The window must contain at least two beats at the slowest configured tempo. At 20 BPM that requires
  at least 6,000 ms. Detection also waits for the configured minimum onset count.
- A window may contain at most 4,000 bins to keep live autocorrelation responsive. The form explains
  incompatible combinations rather than silently clamping them.
- Revisable beat history must fit inside the window. Older beat positions are frozen.
- The preferred BPM is a soft prior. Increase its width to reduce the bias toward that tempo.
- Detected meters accept a comma-separated list of counts from 1 to 12; the default compares 3 and 4.
  These counts are **quarter-note beats**, not compound-meter groupings such as two dotted beats in 6/8.
  Automatic meter uses accent contrast; making a meter selectable does not guarantee reliable detection.

## Limits and persistence

Field ranges are visible alongside help and defaults. They guard runtime cost and valid numerical
operations; changing the schema changes both validation and the displayed ranges. Harmonic vocabulary,
MIDI byte widths and musical interval definitions remain model/protocol data rather than preference
controls. The learned transition table remains the trained artifact; its contribution is adjustable.

`MUSIC_LIMITS` in the same module supplies document/UI/export validation: 4–1,000 quarter-note BPM,
meter numerator 1–255, power-of-two denominators from 1–256, and 1/64–4,096 quarter notes per chord. These are document guardrails, independent of beat detection
and timeline snap. MIDI notes remain 0–127 and sounding velocities 1–127. The former 20–300 BPM and
¼–64 beat editor restrictions have been widened; existing documents retain their durations.

Settings persist inside the browser's `chordsh` record under `settings`, alongside songs. Older flat
preferences and the legacy `musify` record are migrated without deleting the old record. Missing fields
receive defaults. Invalid saved fields are recovered independently; incompatible sections revert to
defaults with an explanation when Settings opens. Unknown fields are ignored by validation. Songs and
other stored content are preserved.

Recordings include the full configuration at the start of recording. `npm run replay` restores it;
older recordings fall back to current defaults and their existing style/split metadata. The benchmark
uses the shared shipped defaults and explicit `P_` overrides, independently of browser preferences.

## Next-chord ranking

**Chord suggestions** controls the Ideas list independently of note recognition. The learned model
considers root and quality of the last two distinct chords in the local key. **Learned suggestion
ranking** blends it with the functional rules (default 0.85); zero restores the rule-based order.
**Use recent sequence** turns two-chord context on/off. **Single-chord smoothing** and **Sequence
smoothing** control backoff for rare contexts (both default 20). Higher values prefer broader evidence.
**Main chord ideas** and **Colour ideas** set visible counts (defaults 4 and 5); zero colour ideas hides
those extra alternatives. These settings apply without restarting analysis or clearing recorded input.

## Piano labels

**Piano note names** and **Piano chord tones** are optional and off by default. Panels has shortcuts
to these settings. Hover identifies the note, its scale degree and its role in the focused chord.
**Piano key width** sets the minimum white-key width. The piano scrolls horizontally when needed.

## Meter and beat units

**Auto-save played chords** is on by default. **Played chord idle delay** defaults to 600 ms (100–5,000),
counted after keys and pedal are released. A selected chord is replaced without changing its duration;
with no selection, new chords append at the song end. Disable auto-saving for live analysis alone.

**Loop playback** in Playback & input is the same saved preference as the repeat icon on the transport.
**Chord drag threshold** in Editor defaults to 6 px (0–24): movements below it still open chord editing,
while larger gestures move the block. Snap remains a separate musical beat setting.

The Editor section also contains the **new-song playback style**, accompaniment bass level/octave,
strum spacing and swing override. These settings control the rhythmic arrangements chosen per song
or bar. New-song style defaults leave existing songs unchanged; the other performance controls refresh
the arrangement. See [playback styles](accompaniment.md).

New song defaults have independent numerator and denominator controls, as does the metronome.
Denominators use a dropdown of standard note values (1, 2, 4, 8, 16, 32, 64, 128 and 256).
These manual signatures are separate from automatic meter
inference's configured candidate counts. Song timing is stored in quarter notes, while the timeline,
chord-duration controls and snap setting count the current signature's notated beats. Changing a meter
does not retime existing notes. For example, 6/8 at quarter-note tempo 120 has 250 ms cells and 1,500 ms
bars; a 0.25-beat snap is a quarter of an eighth note. Recordings retain the song/metronome signature
and quarter-note tempo, including when saved under the song's clock while playback is stopped.
