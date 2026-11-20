# Playback styles

The style palette follows the 57 preset names in
[OneMotion Chord Player](https://www.onemotion.com/chord-player/), inspected on 20 November 2026.
Its General, Chord and Bass controls show that these are accompaniment patterns: rhythms, arpeggios,
walking/alternating bass, swing and strumming. They are separate from chord suggestions and key changes.
chord.sh implements its own deterministic musical generators for these choices. This is a comparable
palette, not a bit-for-bit port of OneMotion's custom sequences, synthesizer or samples.

| Family              | Choices                                                                            |
| ------------------- | ---------------------------------------------------------------------------------- |
| Basic               | Once; Basic 1–4                                                                    |
| Pop & dance         | Pop 1–4; Dance 1–2                                                                 |
| Rock                | Rock 1–4                                                                           |
| Swing & waltz       | Swing 1–2; Waltz; Jazz Waltz                                                       |
| World               | Reggae                                                                             |
| Latin               | Salsa 1–2; Bossa Nova 1–2; Samba; Merengue; Cumbia; Reggaeton; Tango; Flamenco 1–3 |
| Roots               | Ragtime; Country 1–2; Boogie                                                       |
| Picking & strumming | Polyrhythm; Straddle run; Strumming 1–2                                            |
| Funk                | Funk 1–5                                                                           |
| Melodic             | Melodic 1–8                                                                        |
| Modulation          | Mod 1–4                                                                            |

## Applying styles

Styles work like key regions: a **style marker** says "from this bar onward, play in this style", until
the next marker.

- The **playback lane** at the bottom of each timeline row shows the styles as runs of bars, with each
  marker labelled.
- Click any bar in the lane, or the style button beside the tempo/key controls (it shows the style at
  the cursor's bar), to change the style from that bar on.
- In a marked bar, **Remove this change** lets the earlier style continue. Bar 1's style is the
  song's opening style.

Older songs saved one-bar overrides. They are converted to markers on load with the same sound: an
override on bar 5 becomes a marker at bar 5 plus one at bar 6 back to the style that played before.
The ear previews the current choice without changing the song; ✓ applies it as one undoable edit.
Previewing pauses existing sound while retaining the song and transport position. An empty bar can
have a style assigned, but needs a chord before it can be previewed.

Style changes do not edit chord names, voicings, key regions, durations, tempo or meter. A waltz-style
figure fits the existing bar; choose 3/4 explicitly for a three-quarter-note bar. Each style's rhythm
cycle scales to the current bar length. Chord changes select the new chord's tones at the next hit;
short chords between hits still receive an attack. Notes stop at chord/style boundaries and gaps stay
silent. Mod styles provide repeating rhythmic cross-patterns; they do not change the song's key.

Markers belong to bar numbers. Moving or rippling chords moves the notes through those bars; changing
meter regroups notes and keeps the markers on the same numbered bars. Duplicating a song preserves its
styles. Reset clears markers and chords while keeping the opening style; Undo restores both.

## Sound and export

The arrangement generator feeds browser playback, style preview, MIDI output and MIDI export.
Generated bass, accents, note lengths, strum offsets and arpeggios therefore reach the DAW too.
The written voicings remain editable and **Once** retains their original held-chord playback.
These are pitched chord/bass arrangements, with no sampled drum backing or new instrument patch.
Live piano/MIDI entry and chord/voicing previews keep their existing behaviour.

Settings → Editor contains **New song playback style**, **Accompaniment bass level/octave**,
**Accompaniment strum spacing**, and **Accompaniment swing**. Written chord velocity and the shared
gate also apply. A bass level of zero mutes added bass. Swing uses the preset by default, with straight,
light, shuffle and hard overrides. New-song defaults do not change existing songs; legacy songs use
Once and have no bar overrides. Styles save with songs in this browser.
