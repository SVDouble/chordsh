# Musify — plan

A browser app that listens to a MIDI keyboard, names what you play, explains it in
key-relative terms (I–ii–V, secondary dominants, borrowed chords…), and coaches you
on where you can go next — including into other keys.

Built for a player who "vibes" rather than reads: matching is forgiving (any voicing,
any inversion, extra or missing tones), and the coaching is about *the big picture* —
functions, pivots, how a °7 or a modulation actually works — not exact notes.

## Principles

- **Interval-only theory.** Every rule is written in semitones relative to a root or
  tonic, so it applies in any key automatically. No per-key tables.
- **Pure engine, thin UI.** All music logic is plain TypeScript with no DOM, unit
  tested. The UI (Svelte 5) only renders engine state and forwards input.
- **Little code, mostly logic.** No boilerplate layers; each module has one job.

## Modules

```
src/theory/          pure music theory (no state)
  pitch.ts           pitch classes, enharmonic spelling
  scales.ts          keys, modes, key relations (relative, parallel, circle of fifths)
  chords.ts          chord recognition from any note set (jazz extensions, inversions,
                     rootless voicings), naming, tone roles
  roman.ts           function analysis in a key: diatonic, secondary dominant,
                     tritone sub, backdoor, borrowed (modal interchange), Neapolitan…
  patterns.ts        progression patterns: ii–V–I, cadences, circle of fifths, loops
  voicing.ts         voice-led voicings for generated chords

src/engine/          stateful listening + reasoning
  segmenter.ts       splits the live note stream into harmony vs melody
                     (onset grouping, rolled chords, auto hand split, pedal)
  keyDetector.ts     key probabilities over 24 keys from notes + chord evidence + cadences
  coach.ts           "where next": next-chord moves, key reachability, routes to a
                     target key (pivot, ii–V–I, tritone sub, dim7 pivot, dominant chain…)
  session.ts         orchestrator: history, melody log, key tracking (with pivot
                     relabelling on modulation), practice mode; exposes reactive state

src/io/              outside world
  midi.ts            Web MIDI in/out (works with the Recital Pro over USB)
  synth.ts           small WebAudio synth for auditioning suggestions
  qwerty.ts          computer-keyboard fallback for testing without a piano

src/ui/              Svelte components (render only)
  App, NowPlaying, KeyWheel, History, NextMoves, Route, Piano
```

## Features — phase 1 (now)

1. **Now playing**: chord name (C13(♭9)/E, Dm7♭5, rootless voicings), inversion,
   roman numeral and function (T / PD / D) in the current key, a one-line explanation,
   alternative readings.
2. **History**: chord chips with numerals, pattern brackets (ii–V–I in F, deceptive
   cadence, Andalusian…), key-change markers placed after the pivot chord, and a melody strip
   showing each note's role over the chord (3rd, 9th, outside).
3. **Tonal map**: circle of fifths where every key glows by how likely you are to head
   there *given the last chords and melody notes*, with the reason (e.g. "D7 is V of G",
   "melody F♯ fits G").
4. **Where next**: probable next chords from functional grammar, plus "colour" moves:
   secondary dominants, tritone sub, borrowed iv, backdoor ♭VII7, passing °7 and
   common-tone °7 — each with *why*.
5. **Routes**: click a key → several ways to get there from where you are now
   (pivot chord, modal-interchange pivot, ii–V–I, direct dominant, tritone sub, dominant
   chain, °7 pivot, chromatic mediant), each explained, playable (synth or MIDI out),
   and practisable.
6. **Practice**: follow a route; the app waits for each chord, accepts any voicing,
   and shows hit vs missing chord tones.

## Phase 2 (next)

- **Song charts**: type or paste chord symbols ("Dm7 G7 Cmaj7 …"), play along, see per
  chord what you play vs. what's written (missing 7th, wrong quality, substitutions
  that still work).
- Reharmonisation hints for a song ("this V7 could be a tritone sub").
- Session save/export; MIDI file import to analyse recordings.

## Notes on hardware

The Alesis Recital Pro shows up as a USB-MIDI device. Input definitely works; whether
it plays notes it *receives* is model/firmware dependent, so the app has a "test
output" button and always falls back to the built-in synth.
