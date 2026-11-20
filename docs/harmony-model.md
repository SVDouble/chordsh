# Harmony model: first principles (draft)

The aim is one small model that does four things:

1. Explains why a chord move sounds good.
2. Works without a fixed key (relative).
3. Looks the same at every zoom level, from chord to key to song.
4. Gives a space where a song can be drawn as a path.

Each section builds on the one before it. The prototypes are on the design canvas: the goal tree, the
resolution playground, the song lab, the radar and the gravity wheel.

## 0. Melody first

A chord on its own means very little. What you hear is the **melody**, and the chord works like
lighting: it decides whether each melody note sounds like **rest**, **colour** or **pull** (section 2).
That turns the usual order around:

- **Harmony is an explanation of the melody.** The chords are the simplest sequence that lets most
  melody notes land as rest or colour.
- **A chord change happens when the melody stops fitting the current chord**, or when a pull is set up
  on purpose so that it can resolve.
- **A reduction can be tested.** Keep the melody, simplify the harmony underneath (as the goal tree
  does), and measure how many melody notes stay at rest.

Measured on six pieces, as melody time spent at rest:

| harmony underneath | at rest | the rest of the time            |
| ------------------ | ------- | ------------------------------- |
| real chords        | 62–84%  | mostly colour                   |
| goals only         | 47–65%  | lean/pull rises, up to 34%      |

**Conclusion:** chords carry meaning only relative to the melody. They are the information that turns
melody notes into rest.

## 1. Closeness

Octave equivalence leaves **12 pitch classes on a cycle** (ℤ₁₂). Only differences between notes matter, so
everything below is relative.

ℤ₁₂ has two natural orderings, and each gives its own kind of closeness:

| closeness            | step                         | what it measures                                    | felt as                  |
| -------------------- | ---------------------------- | --------------------------------------------------- | ------------------------ |
| **melodic** (`dM`)   | 1 semitone                   | how far a voice or finger moves                     | smooth or jumpy          |
| **harmonic** (`dH`)  | 1 fifth (7 semitones)        | shared overtones, i.e. acoustic relatedness         | related or foreign       |

The two orderings are dual to each other. Multiplying by 7 maps the chromatic circle onto the circle of
fifths, and back again, because 7·7 ≡ 1 (mod 12). As a result, notes that are close in one ordering
tend to be far apart in the other. The diatonic scale is the sweet spot between them: 7 adjacent fifths
that are also spread almost evenly in semitones ("maximally even").

For **chords**:

- `dM(A, B)` is the smallest total semitone movement when each voice moves to a note of B
  (Tymoczko's voice-leading distance). A triad may double one of its notes.
- `dH(A, B)` is the distance between the chords on the circle of fifths. It can be measured by their
  roots, or by their centres of gravity (Chew's spiral array), or by how many notes they share.
- `dE(A → B)` is expectation: how common the move is in a style. It is **learned**, not physical, and
  is kept separate from the other two.

All three are invariant under transposition. That invariance is the reason the model can be relative.

## 2. Harmony

- A **chord** is a small set of pitch classes (3–4) that is compact on the circle of fifths.
  - Example: a major triad sits at fifths positions {0, 1, 4} (C, G, E).
  - That compactness is why triads and 7th chords sound consonant.
- A **window** (key or scale) is 7 adjacent fifths. Chords inside it are "in key".
- A **centre** (tonic) is the chord the window is organised around.

Harmony is therefore **a centre, a window, and a chord placed relative to them**. Roman numerals are
exactly that relative coordinate.

**Tension** is how far a state is from rest:

```text
T(chord | centre) = dH(chord, centre) + dissonance(chord)
```

`dissonance` counts things like a tritone (as in dominant 7ths) and ♭9 rubs. Over a chord, every note is
one of three things (see the resolution playground):

- **rest**: a chord tone;
- **colour**: a whole step from a chord tone;
- **pull**: a semitone from a chord tone.

No note is more than a step from rest. That is what "no wrong notes" means in this model.

## 3. How structure is preserved

These operations keep what matters about a chord or a progression:

| operation                                            | what it preserves                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| **T: transpose**                                     | everything. This is why we describe moves, not positions.                         |
| **I: invert/mirror**                                 | interval sizes. It swaps major and minor, and up and down ("negative harmony").   |
| **small voice moves**                                | the chord's identity: common tones stay, the other voices move by a step.         |
| **tonicize**: treat X as a temporary centre          | all relations, now centred on X: V/X, ii/X, and so on. This gives recursion.      |
| **equal divisions** of the octave (6, 4 or 3 parts)  | they create shortcuts (see below).                                                |

The equal-division shortcuts:

- The **tritone** substitute for a dominant comes from dividing the octave in 2.
- The **°7** chord resolving four ways comes from dividing it in 4 (minor thirds).
- **Giant Steps** cycles through three keys a major third apart, dividing it in 3.

Tonicization is what makes harmony **self-similar**. The same few relations appear between chords,
between chords and their local centres, and between keys.

## 4. Sensible transitions

A move from A to B sounds sensible when it does at least one of three things:

1. **Resolve.** Tension drops: leading notes move a semitone into chord tones of B, or the root falls a
   fifth towards the centre.
2. **Glide.** `dM` is small (≤ 2–3 semitones) and common tones are kept. The P/L/R flips and 7th-chord
   slides are of this kind.
3. **Stay (or shift gently).** B is in the same window, or the window moves by one fifth (one
   accidental).

A move that does none of these (large `dM`, large `dH`, no resolution) sounds like a jump without a
reason.

A move is **interesting** when it is good on one axis and surprising on another:

- **Small `dM` with large `dH`**: a smooth move into a far place, e.g. F → Fm → D♭.
- **A resolution into an unexpected centre**: the deceptive cadence.

A scoring sketch, where the dial weights act as an expected ↔ fresh control:

```text
cost(A→B) = α·dM + β·dH + γ·max(0, ΔT) − δ·resolved(A→B) + ε·(−log P_style(A→B))
```

## 5. Steps (the alphabet)

Every step is relative, so it means the same thing in any key.

- **Root moves.** Any root interval can be written as `a` fifths plus `b` major thirds; choose the
  shortest (`|a| + |b|`).
  - Fall a fifth (`a = −1`): resolve.
  - Rise a fifth: open up.
  - A third: a mediant colour.
  - A semitone: a fifth plus a third. This covers the side-slip and the tritone sub.
- **Quality moves** on the same root:
  - P: major ↔ minor.
  - Add or remove a 7th.
  - Make it a dominant, so it points somewhere.
- **Flips** (neo-Riemannian P, L, R). Each keeps two notes and moves one by a step. Between them they
  reach every triad.
- **Level moves.**
  - Tonicize (zoom in): the next chord becomes a temporary centre.
  - Return (zoom out).

Each step carries three numbers: `dM`, `dH` and `ΔT`.

## 6. A representation that contains those steps

**Requirements:**

1. It is relative: the view follows the current centre.
2. Every step is a short move with a consistent direction.
3. Both kinds of closeness are visible.
4. The picture is the same at every scale.

**Proposal: a harmonic landscape.**

- **Floor.** A triangular lattice (the Tonnetz).
  - Horizontal is fifths (harmonic closeness). The diagonals are thirds.
  - Each triad is a triangle, and neighbouring triangles are one flip apart (melodic closeness).
  - So one map shows both kinds of closeness: along an axis is harmonic, across an edge is melodic.
- **Key.** A band of 6 triangles (7 notes). The centre is a point in that band.
- **Height.** Tension, `T`.
  - The centre is a valley.
  - Dominants sit on the slope just above it, on the side the path rolls down from.
  - Tonicizing a chord digs a small dip around it: V/V turns V into a little valley.
  - Modulation means crossing a ridge into another valley.
- **Self-similarity.** Keys relate to each other by the same moves as chords: fifth, relative and
  parallel. Zoom out and the valleys form the same lattice again. It is one picture at two scales.

## 7. What a path looks like

- **A song is a ball rolling across the landscape.**
  - It climbs as tension builds, away from the centre and onto the dominant slope.
  - It rolls down when the tension resolves.
  - Now and then it crosses a ridge: a modulation.
- **It is drawn relative to the centre.** The camera follows the current centre, and earlier centres
  slide away.
- **The goal tree is the structure of the valleys.**
  - It records which valley each chord rolls into, recursively: chord → goal → centre → home.
  - Looking ahead means seeing the valley you are rolling towards, not just the next chord. This fixes
    the "one step ahead" problem.
- **Songs are compared by shape** (their relative walks), not by absolute position.

## Sources

- Tymoczko, _A Geometry of Music_ (2011): voice-leading geometry, and the five components of tonality.
  They map onto conjunct motion (`dM`), consonance, harmonic consistency (`dH`), limited macroharmony
  (the window) and centricity (the centre).
- Lerdahl, _Tonal Pitch Space_ (2001): one model for distances between pitches, chords and regions.
- Chew, the spiral array (2000): notes, chords and keys in one space, placed by centre of gravity.
- Cohn and others, neo-Riemannian theory: P/L/R and the Tonnetz.
- Rohrmeier, a generative syntax of tonal harmony, and the Jazz Harmony Treebank: tonicization as
  recursion, and harmony as trees.
- Jacob Collier, WIRED "5 levels" (2018): "every melody note works with every bass note".
