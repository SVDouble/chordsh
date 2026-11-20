# Rules of harmony (study)

**The question:** which rules of harmony does real music follow, and how has that changed over time?

The rules are explicit and derivable:

- Each states one idea from music theory, names its source, and computes its verdict from a formula.
- Nothing is learned from data; the data only **tests** the rules.
- Trends over time are measured **within one tradition**, one point per piece at its own year.

```text
melody + chords  →  features (phrases, cadences, named progressions, sequences, pedals)  →  rules and rulebooks
```

| part | what it does |
| --- | --- |
| [src/engine/rules.ts](../src/engine/rules.ts) | Rule catalogue (33 chord rules, 10 piece rules) and 7 rulebooks. |
| [src/engine/features.ts](../src/engine/features.ts) | Phrases, cadences, named progressions, sequences, pedal points. Phrases come from expert annotations, else fermatas, else melodic pauses. |
| [scripts/fetch_assist_data.py](../scripts/fetch_assist_data.py) | Corpora with real melodies and years, pinned to commits or checksums. |
| [scripts/rules.test.ts](../scripts/rules.test.ts) | The study. It writes `local/assist/study.json`. |
| [lab/rules.html](../lab/rules.html) | Local page: trends by year, collections, constraints, every rule, playable pieces. |
| [tests/rules.test.ts](../tests/rules.test.ts) | Hand-worked examples, e.g. G7 → C resolves its tritone and 7th, and I–IV–V–I is not a sequence. |

**Reproduce:**

```sh
npm run fetch-assist-data   # chorales, DCML, Lieder, RS200, Billboard, Chordonomicon, WJazzD, POP909 — one-off, ~1 hour
npm run study:rules         # ~12 minutes; writes local/assist/study.json
npm run lab                 # local lab → "Rules of harmony"
```

## Data

| tradition | corpus | pieces | years | melody | phrases | licence |
| --- | --- | --- | --- | --- | --- | --- |
| art music | Bach chorales: [When in Rome](https://github.com/MarkGotham/When-in-Rome) analyses + Sapp's Humdrum scores | 370 | 1730s | soprano | fermatas | CC BY-SA 4.0 (analyses) |
| art music | [DCML Distant Listening Corpus](https://github.com/DCMLab/distant_listening_corpus): 40 collections from Sweelinck to Schulhoff | 1,283 | 1590–1931 | sung part, else the highest staff | expert phrase ends | CC BY-NC-SA 4.0 |
| art music | [OpenScore Lieder](https://github.com/OpenScore/Lieder) with When in Rome analyses: 19th-century art song | 116 | ≈1800–1900 (approximate) | the voice | melodic pauses | CC0 (scores), CC BY-SA 4.0 (analyses) |
| popular | [Rolling Stone 200](http://rockcorpus.midside.com) (de Clercq & Temperley) | 191 | 1949–2002 | transcribed | melodic pauses | CC BY 4.0 |
| popular | [McGill Billboard](https://ddmal.music.mcgill.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset)/) | 879 | 1958–1991 (chart date) | none | annotated lines | CC0 |
| undated | POP909 | 909 | – | MELODY track | melodic pauses | MIT; songs copyrighted |
| undated | Jazz Harmony Treebank | 1,166 | – | none | 4-bar groups | CC BY 4.0 |
| jazz | [Weimar Jazz Database](https://jazzomat.hfm-weimar.de/) (transcribed solos over changes) | 430 | 1925–2009 (recording) | the solo | annotated phrases | ODbL |
| popular | [Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon) (Ultimate Guitar charts + Spotify dates), sample of 12 per year × genre | 8,881 | 1950–2025 | none; no durations | song sections | CC BY-NC 4.0 |

In total: **14,224 pieces and 1,166,932 chords**.

Nothing is redistributed. Everything is fetched into `local/` for analysis only, and pinned to a commit
or a file checksum.

**Chordonomicon** has 680,000 songs, mostly from the 2010s. A fixed, hash-ordered sample of up to 12
songs per release year and main genre keeps each decade and genre represented evenly, with 13 genres.
The key is estimated with the Krumhansl–Kessler profiles. There are no durations, so the two
duration rules (cadential acceleration, longest arrival chord) are switched off for it.

For art music, the dates are composition years; for popular music, release or chart years. The
chorales get one shared year (1735). **Lieder years are approximate**: the corpus has no composition
dates, so each song gets its composer's birth year + 35, capped at the year of death, and is flagged
`year_approx` in the lab. DCML pieces bring **expert cadence labels**, which test the
cadence finder (below).

## Rules, rulebooks and how they are measured

There are two kinds of chord rule:

- **Preferences** score every chord from −1 to +1, e.g. "neighbouring roots are related by a fifth".
- **Constraints** can only object. A chord that satisfies the constraint, or that the constraint
  doesn't concern, gets 0. Example: "a dominant resolves down a fifth".

Statements, sources and formulas sit next to the code and show in the lab when you click a rule.
**Piece rules** judge the larger features: cadences per phrase, the final cadence, cadential
acceleration, the arrival chord being longest, sequences, pedal points, loops, diatonic share and
dominant motion.

| rulebook | theory | its chord rules |
| --- | --- | --- |
| Counterpoint & voice leading | Fux 1725 | tension prepared or resolved; tritone and 7th resolve; leading tone; parsimony; common tones; ornaments; consonance |
| Functional harmony | Rameau 1722, Riemann 1893 | T → S → D order; dominants and applied chords resolve; fifth relation; dominant direction; cadences; in key |
| Melody and chord agree | all styles | strong-beat chord tones; stable tones; ornaments resolve; no ♭9 clash |
| Colour & modal mixture | Romantic → jazz → pop | colour has a name and persists; brightness moves in small steps; stepwise bass |
| Pop & rock practice | 1950s → today | plagal motion; flat-side colour (♭VII, ♭VI, ♭III); schema membership (I–V–vi–IV, doo-wop, Mixolydian, Aeolian, Andalusian, double plagal…); planing; consonance; in key |
| Jazz harmony | 1920s → today | ii–V pairs; seventh chords by default; tritone substitutes; chains of dominants; dominants resolve; fifth relation |
| Chromatic triadic | late Romantic, film | chromatic mediants; parsimony; common tones; consonant triads |

**Sources for the modern rulebooks:**

- de Clercq & Temperley, ["A corpus analysis of rock harmony"](https://rockcorpus.midside.com/2011_paper/declercq_temperley_2011.pdf), *Popular Music* 30/1 (2011). IV is the most common chord after I, especially before the tonic.
- Temperley, ["The melodic-harmonic 'divorce' in rock"](https://core-prod.cambridgecore.org/core/journals/popular-music/article/melodicharmonic-divorce-in-rock/33D93CFAE1EDBC800B86318078D35F7C), *Popular Music* 26/2 (2007). Melody and harmony act semi-independently, mostly in pentatonic verses. This is why the melody rules are kept out of the PCA and treated with care for rock.
- Biamonte, "Triadic modal and pentatonic patterns in rock music", *Music Theory Spectrum* (2010), and [Open Music Theory, "Modal schemas"](https://viva.pressbooks.pub/openmusictheory/chapter/modal-schemas/) / ["Pentatonic harmony"](https://viva.pressbooks.pub/openmusictheory/chapter/pentatonic-harmony/). Flat-side triads with functions of their own; double plagal and Aeolian schemas.
- Everett, ["Making sense of rock's tonal systems"](https://mtosmt.org/issues/mto.04.10.4/mto.04.10.4.w_everett.php), *Music Theory Online* 10/4 (2004).
- Lehman, *Hollywood Harmony* (Oxford, 2018); Cohn, *Audacious Euphony* (2012). Triadic chromaticism and chromatic mediants.
- Levine, *The Jazz Theory Book* (1995); Rohrmeier, "The syntax of jazz harmony" (2020). ii–V, tritone substitution, extended dominants, preparation.

**AUC:** for every chord, each rule judges the composer's chord and a fixed third of the other chords
in the same spot. The vocabulary is 12 roots × 9 qualities, or × 4 triad types where the data has
only triads; the neighbouring chords are excluded. AUC is the share of comparisons in which the rule
prefers the real chord; 50% means no preference.

**Compliance**, for constraints: of the chords a constraint concerns, the share that satisfy it,
for real chords versus alternatives.

**Cadence finder vs experts:** our cadence finder agrees with **89%** of 8,975 DCML expert cadence
labels:

| expert label → our finder | count |
| --- | --- |
| authentic → authentic | 5,483 |
| half → half | 2,353 |
| authentic → none | 442 |
| half → none | 218 |
| authentic → half | 177 |
| deceptive → deceptive | 128 |

## Results (2026-11-20)

Rulebook AUCs are pooled by period and weighted by chords. Piece rules are the mean over pieces:

| period | pieces | chords | Counterpoint | Functional | Melody fit | Colour | phrases end in a cadence | ends V → I |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Renaissance & early Baroque (–1680) | 128 | 19,528 | 84% | 85% | 89% | 85% | 50% | 81% |
| Baroque (1680–1750) | 850 | 65,925 | 84% | **90%** | 87% | 85% | **92%** | **94%** |
| Classical (1750–1815) | 347 | 84,797 | 83% | 88% | 86% | 85% | 86% | 90% |
| Romantic (1815–1890) | 185 | 32,228 | 79% | 82% | 85% | 81% | 77% | 82% |
| Late Romantic & modern (1890–) | 142 | 16,083 | 78% | 76% | 82% | 77% | 64% | 63% |
| Rock (RS200) | 191 | 17,998 | 84% | 85% | 82% | **91%** | 49% | 45% |
| Chart pop (Billboard) | 879 | 80,568 | 80% | 82% | – | 90% | 46% | 34% |
| Chinese pop (POP909, undated) | 909 | 107,335 | 87% | 86% | 83% | 90% | 33% | 24% |
| Jazz (changes, undated) | 1,166 | 51,550 | 78% | 82% | – | 78% | 40% | 38% |

**Constraint compliance**, real chords versus random alternatives in brackets:

| constraint | –1680 | Baroque | Classical | Romantic | 1890– | Rock | Billboard | POP909 | Jazz |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a dominant resolves | 64% (10%) | 65% (10%) | 64% (10%) | 57% (9%) | 45% (10%) | 54% (11%) | 52% (11%) | 50% (10%) | 71% (12%) |
| the 7th falls by step | 71% (51%) | **91%** (54%) | 86% (55%) | 78% (57%) | 74% (58%) | 58% (51%) | 65% (54%) | 54% (52%) | – |
| the tritone resolves | 44% (18%) | 44% (22%) | 57% (24%) | 43% (26%) | 38% (23%) | 37% (17%) | 50% (17%) | 27% (15%) | – |
| out-of-key chords have a name | 90% (34%) | 76% (34%) | 63% (33%) | 66% (33%) | 70% (33%) | **98%** (32%) | 92% (32%) | 82% (34%) | 80% (31%) |

The jazz data has no sevenths, so the 7th and tritone constraints mean little for it.

**Readings:**

- **Art music has a clear arc.**
  - Functional harmony, cadences and V → I endings peak in the **Baroque**: 90% AUC; 92% of phrases
    close with a cadence; 94% of pieces end V → I.
  - They hold through the Classical era and weaken steadily afterwards: 76%, 64% and 63% after 1890.
  - The late collections show it most: Ravel, Bartók and Schulhoff fall to 43–67% functional AUC.
  - Before 1680 (Monteverdi, Frescobaldi, Schütz), half the phrases close with a cadence, though
    pieces still end on V → I.
- **Voice-leading constraints are strongest in the Baroque:** 91% of sevenths fall by step.
- **Melody–chord agreement is the most stable rulebook,** at 82–89% everywhere.
- **Popular music follows functional harmony at chord level** (rock 85%, Billboard 82%) **but not
  at phrase level.**
  - About half of its phrases close with a cadence, and only a third to a half of songs end V → I.
  - The popular-music panel in the lab shows this share falling from the 1950s to the 1990s.
  - Its strongest rulebook is **colour**: rock 91%. Its out-of-key chords are almost always named
    colours (borrowed ♭VII, ♭VI, iv; applied dominants): 98% in rock.
- **Jazz keeps the dominant** (71% of dominants resolve, the most of any group) **but not the
  cadence.**

**Caveats:**

- **Phrase sources differ**: expert ends (DCML), fermatas (chorales), annotated lines (Billboard),
  melodic pauses (RS200, POP909). Cadence shares are most comparable *within* a corpus. Popular
  trends mix RS200 and Billboard.
- **Melody sources differ**: for instrumental DCML pieces the melody is the highest staff.
- **Year coverage is uneven:** few pieces before 1680 and after 1900, few popular songs after 1995.
  The lab draws no trend where a window has fewer than 6 pieces.
- **Three DCML collections are also in the recognition benchmark** (Mozart, Beethoven, Chopin). The
  study fits nothing, so this overlap doesn't bias it.

## Results with modern data (2026-11-20, all rulebooks)

Rulebook AUC is pooled by chords, and piece rules are averaged over pieces:

| period | pieces | Counterpoint & voice leading | Functional harmony | Melody and chord agree | Colour & modal mixture | Pop & rock practice | Jazz harmony | Chromatic triadic (film, late Romantic) | phrases end in a cadence | ends V → I |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Renaissance & early Baroque (–1680) | 128 | 84% | 85% | 89% | 85% | 91% | 50% | 79% | 50% | 81% |
| Baroque (1680–1750) | 850 | 84% | 90% | 87% | 85% | 89% | 55% | 75% | 92% | 94% |
| Classical (1750–1815) | 347 | 83% | 88% | 86% | 85% | 87% | 56% | 72% | 86% | 90% |
| Romantic (1815–1890) | 185 | 79% | 82% | 85% | 81% | 82% | 57% | 72% | 77% | 82% |
| Late Romantic & modern (1890–) | 142 | 78% | 76% | 82% | 77% | 80% | 57% | 71% | 64% | 63% |
| Jazz solos (WJazzD) | 430 | 70% | 78% | 74% | 76% | 73% | 81% | 62% | 36% | 49% |
| Rock (RS200) | 191 | 84% | 85% | 82% | 91% | 96% | 51% | 76% | 49% | 45% |
| Chart pop (Billboard) | 879 | 80% | 82% | – | 90% | 93% | 55% | 75% | 46% | 34% |
| Modern popular (Chordonomicon) | 8,881 | 82% | 82% | – | 89% | 94% | 50% | 77% | 49% | 38% |
| Chinese pop (POP909) | 909 | 87% | 86% | 83% | 90% | 94% | 47% | 79% | 33% | 24% |
| Jazz standards (changes) | 1,166 | 78% | 82% | – | 78% | 83% | 74% | 75% | 40% | 38% |

**Readings for the new rulebooks:**

- **Pop & rock practice** scores highest wherever IV, ♭VII and loops dominate (93–96% in popular
  music). It is also high for Baroque and Classical music: in-key, consonant triads and plagal motion
  are common there too. It describes how chords are chosen, not what makes a style distinct.
- **Jazz harmony** separates jazz from everything else: the solo corpus and the jazz standards lead
  it.
- **Chromatic triadic** sits around 70–80% almost everywhere. Smooth, shared-note motion is a common
  property, not a film-only trick.
- **Art song (OpenScore Lieder, added later, 116 songs, 6,920 chords):** counterpoint 81%, functional
  85%, melody fit 85%, 76% of phrases close with a cadence, 77% end V → I. That sits right on the
  Romantic row above (which was computed before the Lieder were added). The sung melody gives the
  same picture as the instrumental top line. Years are approximate, so the songs only count as
  "Romantic", not as evidence for a finer trend.
- **Style dimensions (PCA over per-piece harmony profiles):**
  1. PC1 (20%): key discipline (diatonic, colour explained, consonant).
  2. PC2 (16%): fifth-based, common-tone motion versus parallel planing and walking bass.
  3. PC3 (9%): plagal versus dominant direction, the axis that separates rock from common practice.
  4. PC4 (8%): dominants resolve and voices move little, versus loops and phrase-end cadences.

## Keys and modes

The pitch collection inside each piece is measured from scale degrees relative to the **local** key,
so modulations don't count as chromaticism. Melody notes are weighted by duration and chord tones at
half weight. Each piece is matched to the smallest named collection that holds 95% of the weight
(see [src/engine/modes.ts](../src/engine/modes.ts)).

| source | minor keys | most common collections | notes used: 5 / 6 / 7 / 8 / 9+ |
| --- | --- | --- | --- |
| Bach chorales | 41% | major 66%, melodic minor 23%, harmonic minor 10% | 0 / 1 / 45 / 44 / 10% |
| DCML art music | 47% | major 53%, harmonic minor 25%, natural minor 8%, melodic minor 7%, Dorian 4%, octatonic 1% | 0 / 1 / 30 / 31 / 38% |
| RS200 rock | 18% | major 59%, **Mixolydian 18%**, natural minor 9%, Dorian 4%, major blues 3% | 4 / 12 / 58 / 16 / 8% |
| Billboard | 16% | major 59%, **Mixolydian 16%**, natural minor 9%, Dorian 4%, Lydian 3% | 5 / 8 / 52 / 18 / 17% |
| Chordonomicon | 38% | major 50%, natural minor 21%, Mixolydian 9%, Dorian 7%, Phrygian 4% | 3 / 7 / 50 / 20 / 19% |
| Chinese pop | 45% | major 53%, natural minor 39% | 0 / 6 / 71 / 11 / 12% |
| Jazz solos | 16% | major 46%, Mixolydian 20%, natural minor 9%, Phrygian 4%, octatonic 4% | 0 / 1 / 7 / 19 / 73% |
| Jazz standards | 16% | major 59%, Lydian 9%, Mixolydian 7%, harmonic minor 6%, octatonic 3% | 1 / 2 / 14 / 23 / 60% |

**Readings:**

- **Rock and chart pop are often Mixolydian** (16–18%); the ♭7 is part of the key.
- **Modern popular music is darker:** 38% minor in Chordonomicon versus 16–18% in rock and Billboard.
  It has more Aeolian, Dorian and Phrygian, the last mostly in metal.
- **Pentatonic and hexatonic tunes** (5–6 notes) appear mainly in rock and pop, at 12–16%.
- **Jazz is chromatic:** most solos use 9 or more degrees of their key.
- **Symmetric scales are rare but real:** octatonic in 1% of the DCML pieces and 3–4% of jazz.
- **"Scales that change between octaves":** 90 DCML pieces, 41 POP909 songs, 12 jazz solos and 11
  rock songs use one form of a degree low and the other high, e.g. ♭3 below and 3 above. They're
  listed in the lab for review; some will be blue notes, others data quirks.

## Tricks to review

For every tradition, the study collects **frequent key-relative chord moves that functional harmony
dislikes**: occurring in at least 15 transitions and 0.04% of all moves, with a functional verdict
below 0.12.

For each one it reports:

- a name, where theory has one;
- **why it might work**: the rules that do support it, such as planing, schema membership, shared
  notes, a chromatic mediant or a tritone substitute;
- what it breaks;
- real examples, with chords and key, that can be played in the lab.

Moves without a name are flagged "unnamed: why does it work?" for review. The lab keeps your marks
(interesting, understood, data error) in the browser.

**What turns up, by tradition:**

| tradition | typical tricks |
| --- | --- |
| art music | augmented sixths, written here as dominant 7ths on ♭VI or ♭V; diminished sevenths (♯iv°7); the Neapolitan ♭II; V/V |
| jazz | tritone substitutes (II7 → ♭II7, ii7 → ♭II7); chromatic mediants (V7 → ♭VII7, Imaj7 → ♭VImaj7); parallel dominants |
| popular | blues sevenths (V7 → IV7, IV → IV7); parallel planing (♭III → ♭II, ♭VII → VI); secondary dominants (IV → III, iii → II); chromatic mediants (IV → VI, I → ♭III) |

The automatic namer is conservative, so some names will be wrong. For example, a `♭V7` is usually an
augmented sixth spelled as a dominant chord. The review marks in the lab are for catching exactly
those cases.

### Review of the unnamed moves

These are the frequent moves the namer could not label (run of 2026-11-20). Each has a hypothesis for
why it works, to check by ear in the lab:

| tradition | move | likely explanation |
| --- | --- | --- |
| art | V → ♯iv° (386), I → ♯iv° (291), i → ♯iv° (119) | **Passing diminished chord** between I/V and a I6/4 or V: the bass slides chromatically. Also the bottom of a ♯iv°7 → I6/4 → V cadence, which is common-tone and leading-tone motion, not root motion. |
| art | v → IV (233), iv → iii° (174), IV → iii° (88) | **Descending bass by step** (e.g. the "lament" or a 6-chord chain). The middle chords are passing sonorities over a stepwise bass, and the analysis labels each one as a root-position chord. |
| art | ii → ♭ii° (127), I → iii° | Chromatic voice leading into a Neapolitan or an augmented sixth, which our labels split into two chords. |
| popular | v → IV (1,724) | **Mixolydian / Dorian loop** (e.g. v–IV–I in a Mixolydian song): the minor v is the natural fifth chord of the mode, and v → IV is planing down a step. Functional harmony expects V. |
| popular | ♭V → IV (300) | Blues or metal **chromatic slide** into IV, a passing chord of the same shape (planing). Also the ♭5 of the blues scale under a riff. |
| popular | V → iv (385) | **Minor plagal colour** after the dominant, an older pop habit (V–iv–I) borrowed from the parallel minor. It leans to I through the falling ♭6 → 5. |
| popular | ♭III → ii (398) | **Tritone substitute of V/ii**: ♭III(7) stands in for VI7 (E♭ for A7 in C) and falls a half step to ii, as in the turnaround I–♭III–ii–V. The rules only recognise the substitute before I. |
| jazz | Imaj7 → ♭VII7 (41), ii7 → ♭VII7 (19) | **Backdoor dominant**: ♭VII7 resolves to I by a whole step up (iv–♭VII7–I). The jazz rules know the tritone substitute but not the backdoor; a rule candidate. |
| jazz | VII7 → ♭VIImaj7 (16), I7 → VII7sus4 (15) | **Parallel planing** of the same shape a half step down (side-slipping), a soloist's and arranger's device. |
| jazz | i → ♭III7, I7 → ♭iii7 | ♭III7 as a **tritone substitute of VI7** (the V/ii), resolving to ii; I7 → ♭iii7 is the start of a chromatic ii–V chain to ii. |
| reference | I → ♭V, V → ♭V, ♭VI → ♭V, iii → ♭iii° | Mostly **audio chord-recognition artefacts** in POP909 (♭V is rare in practice) and chromatic passing chords in jazz changes. Not used as evidence for rules. |

**Rule candidates from this review:** a *backdoor dominant* (♭VII7 → I) in the jazz rulebook; a
*passing chord* rule (a dissonant chord between two chords whose bass it connects by step); and a
*modal fifth* rule (minor v in Mixolydian or Dorian). The tritone-substitute rule could also accept
substitutes for applied dominants, not only for V.

## Next

- **More dated popular music with melodies**, e.g. Hooktheory-style lead sheets if licensing allows,
  and **jazz with dates**: the Weimar Jazz Database has solos over changes with recording years.
- **More 19th-century song:** the OpenScore Lieder corpus has When in Rome analyses, and the voice is
  a real melody.
- **Rule structure:** PCA or factor analysis over per-chord rule verdicts, to find which rules move
  together.
- **Motion in the frequency domain** (overtone spectra) as a later, separate study.
