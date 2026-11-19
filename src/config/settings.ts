import { z } from 'zod';
import { PLAYBACK_STYLES } from '../engine/accompaniment';

export const METER_DENOMINATORS = [1, 2, 4, 8, 16, 32, 64, 128, 256] as const;
const meterDenominator = (title: string) =>
  z.literal(METER_DENOMINATORS).default(4).meta({
    title,
    description: 'Beat note value: 1, 2, 4, 8, 16, 32, 64, 128 or 256. Tempo remains quarter notes per minute.',
  });

/** Defaults, constraints and help text live together; the settings form uses this schema too. */
const number = (value: number, min: number, max: number, title: string, description: string, unit = '', step = 0.01) =>
  z.number().min(min).max(max).default(value).meta({ title, description, unit, step });
const integer = (value: number, min: number, max: number, title: string, description: string, unit = '') =>
  z.number().int().min(min).max(max).default(value).meta({ title, description, unit, step: 1 });
const choice = <T extends string>(values: readonly T[], value: T, title: string, description: string) =>
  z.enum(values).default(value).meta({ title, description });
const flag = (value: boolean, title: string, description: string) =>
  z.boolean().default(value).meta({ title, description });

export const preferencesSchema = z.object({
  sound: choice(
    ['synth', 'midi', 'both', 'off'],
    'synth',
    'Playback output',
    'Browser synth, DAW / MIDI output, both, or silent analysis.',
  ),
  monitor: flag(true, 'Monitor sound', 'Hear incoming notes through the browser synth.'),
  theme: choice(['dark', 'light'], 'dark', 'Theme', 'Appearance of the workspace.'),
  style: choice(
    ['jazz', 'triads'],
    'jazz',
    'Chord suggestions',
    'Jazz uses seventh chords; triads uses three-note chords.',
  ),
  input: z
    .string()
    .default('all')
    .meta({ title: 'MIDI input', description: 'Listen to all controllers or one device.' }),
  output: z
    .string()
    .default('')
    .meta({ title: 'MIDI output', description: 'Choose a virtual MIDI port connected to your DAW.' }),
  splitMode: choice(
    ['auto', 'off', 'fixed'],
    'auto',
    'Hand split',
    'Estimate the hand boundary, disable it, or use the split note below.',
  ),
  splitNote: integer(
    60,
    0,
    127,
    'Split note',
    'In fixed mode, lower MIDI notes are harmony; higher notes can be melody.',
    'MIDI',
  ),
  keyLock: integer(-1, -1, 23, 'Key', 'Automatic detection, or lock harmonic analysis to a key.'),
  bars: choice(['auto', 'metronome'], 'auto', 'Bars', 'Estimate beats from playing or use a fixed metronome.'),
  tempo: number(
    80,
    4,
    1000,
    'Metronome / preview tempo',
    'Quarter-note beats per minute. A song or MIDI file uses its own tempo.',
    'BPM',
    1,
  ),
  meter: integer(
    4,
    1,
    255,
    'Beats per bar',
    'Top number of the metronome time signature; the denominator sets each beat’s note value.',
    'beats',
  ),
  meterDenominator: meterDenominator('Metronome denominator'),
  click: flag(true, 'Metronome click', 'Sound the click when the metronome is enabled.'),
});

export const beatSchema = z.object({
  binMs: integer(10, 2, 100, 'Time resolution', 'Smaller bins improve timing precision and increase CPU use.', 'ms'),
  windowMs: integer(
    8000,
    1000,
    60000,
    'Analysis window',
    'Longer windows stabilise tempo but adapt more slowly.',
    'ms',
  ),
  minBpm: number(
    48,
    20,
    400,
    'Slowest detected tempo',
    'Lower bound for automatic tempo detection. Fixed tempo bypasses this range.',
    'BPM',
    1,
  ),
  maxBpm: number(
    60000 / 380,
    20,
    400,
    'Fastest detected tempo',
    'Upper bound for automatic tempo detection; the default is approximately 158 BPM.',
    'BPM',
    1,
  ),
  updateMs: integer(1000, 50, 10000, 'Update interval', 'Time between automatic tempo estimates.', 'ms'),
  onsetGroupMs: integer(30, 0, 500, 'Onset grouping', 'Nearby note attacks count as one rhythmic onset.', 'ms'),
  minOnsets: integer(6, 2, 100, 'Minimum onsets', 'Wait for this many attacks before estimating tempo.'),
  revisionMs: integer(
    4000,
    0,
    60000,
    'Editable beat history',
    'Only recent beats are regridded; older beats stay fixed.',
    'ms',
  ),
  retentionWindows: integer(4, 1, 16, 'Onset retention', 'Keep this many windows of recent attacks.', 'windows'),
  periodStepBins: integer(
    2,
    1,
    10,
    'Tempo search spacing',
    'Search periods in multiples of the time-resolution bin.',
    'bins',
  ),
  kernelRadius: integer(3, 0, 10, 'Onset smoothing radius', 'Spread each onset over nearby timing bins.', 'bins'),
  kernelWidth: number(4, 0.1, 100, 'Onset smoothing width', 'Gaussian denominator for onset smoothing.'),
  preferredBpm: number(100, 20, 400, 'Preferred tempo', 'A gentle preference, not a detection limit.', 'BPM', 1),
  priorWidth: number(
    0.6,
    0.05,
    4,
    'Tempo preference width',
    'Higher values reduce the bias toward the preferred tempo.',
    'octaves',
  ),
  halfTempoWeight: number(0.5, 0, 2, 'Half-tempo support', 'Weight of evidence from every second beat.'),
  confidenceScale: number(
    6,
    0.1,
    100,
    'Confidence scale',
    'Higher values require a clearer tempo peak for high confidence.',
  ),
  periodTolerance: number(0.08, 0, 1, 'Tempo smoothing tolerance', 'Smooth period changes smaller than this fraction.'),
  periodSmoothing: number(0.3, 0, 1, 'New tempo weight', 'Fraction of a nearby new tempo retained after smoothing.'),
  confidenceSmoothing: number(
    0.4,
    0,
    1,
    'New confidence weight',
    'Fraction of the new estimate retained in confidence.',
  ),
  accentTolerance: number(
    0.3,
    0.01,
    0.5,
    'Accent timing tolerance',
    'Maximum accent distance from the nearest beat, as a fraction of a beat.',
  ),
  meterCandidates: z.array(z.number().int().min(1).max(12)).min(1).max(12).default([3, 4]).meta({
    title: 'Detected meters',
    description: 'Comma-separated quarter-note beat counts (1–12) to compare during automatic detection.',
  }),
  triplePenalty: number(
    0.05,
    0,
    10,
    'Triple-meter penalty',
    'Slight preference against three beats per bar; zero treats all meters equally.',
  ),
  barJumpCost: number(
    2.5,
    0,
    100,
    'Downbeat jump cost',
    'Higher values resist changing the inferred downbeat position.',
  ),
  halfBarWeight: number(0.3, 0, 1, 'Half-bar accent weight', 'How strongly beat three supports a four-beat bar.'),
});

export const accentSchema = z.object({
  memoryMs: integer(
    700,
    0,
    10000,
    'Pitch memory',
    'New pitch classes outside this window add downbeat evidence.',
    'ms',
  ),
  bassCeiling: integer(60, 0, 127, 'Bass ceiling', 'Notes below this MIDI note can count as a new bass.'),
  lowBassCeiling: integer(
    55,
    0,
    127,
    'Low-bass ceiling',
    'Notes below this MIDI note add a smaller accent even without a bass change.',
  ),
  bassMoveWeight: number(1.5, 0, 10, 'Bass-change accent', 'Downbeat evidence from a changed bass pitch class.'),
  lowBassWeight: number(0.4, 0, 10, 'Low-bass accent', 'Downbeat evidence from a repeated low bass.'),
  freshPitchWeight: number(0.3, 0, 10, 'New-pitch accent', 'Downbeat evidence per new pitch class.'),
});

export const segmentationSchema = z.object({
  groupMs: integer(70, 1, 1000, 'Chord grouping', 'Collect attacks for this long before recognising a chord.', 'ms'),
  rollMs: integer(220, 1, 3000, 'Rolled-chord window', 'Notes within this interval can join a rolled chord.', 'ms'),
  releaseMemoryMs: integer(
    1200,
    0,
    10000,
    'Released-note memory',
    'Released harmony notes remain available for broken chords.',
    'ms',
  ),
  splitHistory: integer(
    48,
    8,
    1000,
    'Hand-split history',
    'Number of recent note attacks used to find a pitch gap.',
    'notes',
  ),
  splitMinNotes: integer(8, 2, 100, 'Hand-split evidence', 'Minimum attacks before estimating a hand split.', 'notes'),
  splitGap: integer(5, 1, 36, 'Hand-split gap', 'Minimum pitch gap between hands.', 'semitones'),
  splitSideNotes: integer(3, 1, 50, 'Notes per hand', 'Minimum recent attacks on each side of the split.', 'notes'),
  scoreTolerance: number(
    0.6,
    0,
    10,
    'Broken-chord tolerance',
    'Allowed decrease in chord fit before starting a new harmony.',
  ),
  analysisGroupMs: integer(
    40,
    0,
    1000,
    'Analysis onset group',
    'Minimum gap from the start of a harmonic segment to start another.',
    'ms',
  ),
  releaseActiveMs: integer(
    1500,
    0,
    10000,
    'Release analysis time',
    'Keep updating analysis after the last note is released.',
    'ms',
  ),
  releaseTailMs: integer(800, 0, 10000, 'Release tail', 'Maximum released-note tail included in a segment.', 'ms'),
});

export const harmonySchema = z.object({
  chordChange: number(0.61, 0, 20, 'Chord change cost', 'Higher values favour fewer chord changes.'),
  transitionWeight: number(
    0.125,
    0,
    10,
    'Learned transitions',
    'Weight of corpus-trained root transitions; zero disables this contribution.',
  ),
  keyChange: number(3.6, 0, 50, 'Key change cost', 'Higher values require more evidence for modulation.'),
  extraNote: number(0.6, 0, 20, 'Outside-note cost', 'Penalty for notes outside a candidate chord.'),
  missingTone: number(0.2, 0, 20, 'Missing-tone cost', 'Penalty for absent defining chord tones.'),
  prior: z
    .object({
      diatonic: number(0, -10, 10, 'Diatonic prior', 'Bias for chords belonging to the key.'),
      secondary: number(-0.065, -10, 10, 'Secondary dominant prior', 'Bias for secondary dominant chords.'),
      borrowed: number(-0.25, -10, 10, 'Borrowed chord prior', 'Bias for modal mixture.'),
      other: number(-0.74, -10, 10, 'Other chord prior', 'Bias for other non-diatonic chords.'),
      tonic: number(0.43, -10, 10, 'Tonic prior', 'Extra bias for the tonic chord.'),
      dominant: number(0.44, -10, 10, 'Dominant prior', 'Extra bias for the dominant chord.'),
    })
    .prefault({}),
  keyFit: number(0.47, 0, 20, 'Key fit', 'Weight of how well a chord fits the key.'),
  bassRoot: number(0.3, -10, 10, 'Root in bass', 'Bias when the bass is the chord root.'),
  bassInChord: number(0.02, -10, 10, 'Chord tone in bass', 'Bias when the bass is another chord tone.'),
  bassOutside: number(-0.04, -10, 10, 'Outside bass', 'Bias when the bass falls outside the chord.'),
  heldDecayMs: number(2460, 1, 60000, 'Held-note decay', 'How quickly older held notes lose influence.', 'ms', 1),
  durExp: number(0.8, 0, 3, 'Duration exponent', 'How strongly longer segments influence harmonic analysis.'),
  saturation: number(1.5, 0.01, 20, 'Tone saturation', 'How quickly pitch salience counts as fully present.'),
  durationWeight: number(
    0,
    0,
    1,
    'Passing-note suppression',
    'Zero counts all segment notes fully; one weights notes by their sounding duration.',
  ),
});
export type HarmonizerParams = z.output<typeof harmonySchema>;
/** Tuned against the benchmark tune split and checked against the test split. */
export const DEFAULT_PARAMS: HarmonizerParams = harmonySchema.parse({});

export const predictionSchema = z.object({
  primaryCount: integer(4, 1, 12, 'Main chord ideas', 'Number of primary continuations shown in Ideas.'),
  colourCount: integer(
    5,
    0,
    12,
    'Colour ideas',
    'Additional diminished, substitution and borrowing alternatives; zero hides them.',
  ),
  learnedWeight: number(
    0.85,
    0,
    1,
    'Learned suggestion ranking',
    'Blend learned continuations with functional chord suggestions; zero uses the original rules.',
  ),
  useSequence: flag(true, 'Use recent sequence', 'Consider the last two distinct chords when ranking continuations.'),
  priorStrength: number(
    20,
    0.01,
    100,
    'Single-chord smoothing',
    'How much mode-wide evidence supports rare chord contexts.',
  ),
  contextStrength: number(
    20,
    0.01,
    100,
    'Sequence smoothing',
    'How much single-chord evidence supports rare two-chord contexts.',
  ),
});
export type PredictionSettings = z.output<typeof predictionSchema>;

export const analysisSchema = z.object({
  refreshMs: integer(120, 16, 2000, 'Analysis refresh', 'Interval between live harmonic re-evaluations.', 'ms'),
  strikeMs: integer(
    150,
    0,
    3000,
    'Block-chord stability',
    'Wait this long before advancing song following after a chord strike.',
    'ms',
  ),
  settleMs: integer(
    350,
    0,
    5000,
    'Broken-chord stability',
    'Wait this long before committing a changing harmony.',
    'ms',
  ),
  strikeGapMs: integer(
    60,
    0,
    1000,
    'Separate-strike gap',
    'A later block chord can commit the previous pending harmony.',
    'ms',
  ),
  historyLimit: integer(
    300,
    10,
    10000,
    'Chord history',
    'Maximum displayed chord and key entries. This does not cap model memory.',
    'entries',
  ),
  melodyLimit: integer(64, 1, 10000, 'Melody history', 'Maximum retained melody entries.', 'notes'),
  patternHistory: integer(60, 8, 1000, 'Pattern history', 'Recent chords searched for cadences and cycles.', 'chords'),
  melodyWindowMs: integer(
    6000,
    0,
    60000,
    'Suggestion melody window',
    'Recent melody notes used when suggesting destination keys.',
    'ms',
  ),
  theoryCount: integer(3, 1, 24, 'Alternative keys', 'Number of competing harmonic explanations to retain.'),
  keyHalfLifeMs: number(
    40000,
    100,
    600000,
    'Modal-colour memory',
    'Half-life of pitch evidence used for modal colour; the main key comes from the harmonic model.',
    'ms',
    1,
  ),
  chordDecay: number(
    0.85,
    0,
    1,
    'Modal-colour chord decay',
    'Fraction of prior chord evidence retained at each new chord.',
  ),
});

export const editorSchema = z.object({
  pianoChordEntry: flag(
    false,
    'Piano chord entry',
    'Click keys to select a chord, then press Enter or the ear button to play it. Shift-click works without this mode.',
  ),
  pianoChordBeats: number(
    2,
    0.125,
    64,
    'Piano chord duration',
    'Length of a chord entered on the piano, in the current song’s notated beats.',
    'beats',
    0.125,
  ),
  pianoRootLabels: flag(
    true,
    'Piano chord roots',
    'Show Roman numerals on keys that root the chords of the current key: I, ii, iii…',
  ),
  pianoNoteNames: flag(
    false,
    'Piano note names',
    'Show note letters/octaves on every key. Names remain available on hover when hidden.',
  ),
  pianoChordRoles: flag(
    false,
    'Piano chord tones',
    'Show intervals of the focused chord above the key-relative Roman root labels.',
  ),
  pianoLabelSize: integer(
    18,
    12,
    28,
    'Piano label size',
    'Size of Roman chord-root labels. Keys widen to keep these readable.',
    'px',
  ),
  pianoKeyWidth: integer(
    20,
    12,
    40,
    'Piano key width',
    'Minimum white-key width. Narrow screens scroll the piano so notes and role labels stay readable.',
    'px',
  ),
  newTempo: number(100, 4, 1000, 'New song tempo', 'Initial tempo of a new sequence.', 'BPM', 1),
  newMeter: integer(4, 1, 255, 'New song meter', 'Top number of a new song’s time signature.', 'beats'),
  newDenominator: meterDenominator('New song denominator'),
  newPlaybackStyle: choice(
    PLAYBACK_STYLES.map((style) => style.id),
    'once',
    'New song playback style',
    'Default accompaniment for new songs. Each bar can override the song style.',
  ),
  accompanimentBassLevel: number(
    0.85,
    0,
    2,
    'Accompaniment bass level',
    'Bass velocity relative to the written chord velocity; zero mutes added bass.',
    '×',
    0.05,
  ),
  accompanimentBassOctave: integer(
    2,
    0,
    5,
    'Accompaniment bass octave',
    'Octave for generated bass notes; C2 is MIDI note 36.',
  ),
  accompanimentStrumMs: integer(
    18,
    0,
    100,
    'Accompaniment strum spacing',
    'Delay between notes in a strum. Zero plays them together.',
    'ms',
  ),
  accompanimentSwing: choice(
    ['preset', '0.5', '0.6', '0.6666666666666666', '0.75'],
    'preset',
    'Accompaniment swing',
    'Use each style’s swing, or override its long/short eighth-note ratio.',
  ),
  snapBeats: number(
    0.25,
    0.015625,
    4,
    'Timeline snap',
    'Spacing in the current meter’s notated beats for dragging, resizing and seeking.',
    'beats',
  ),
  visibleBars: integer(8, 1, 64, 'Initial timeline length', 'Minimum timeline length; it grows with the song.', 'bars'),
  undoLimit: integer(100, 1, 1000, 'Undo history', 'Maximum sequence edits retained in memory.', 'edits'),
  velocity: integer(80, 1, 127, 'New chord velocity', 'Default loudness of manually added chords.', 'MIDI'),
  gate: number(0.95, 0.01, 1, 'Chord gate', 'Fraction of each chord duration for which its notes are held.'),
});

export const settingsSchema = z
  .object({
    preferences: preferencesSchema.prefault({}),
    panels: z
      .object({
        now: flag(true, 'Chord inspector', 'Show the focused chord and its harmonic function.'),
        next: flag(true, 'Ideas', 'Show chord and key-change ideas in one list.'),
        map: flag(true, 'Key exploration', 'Show the circle of fifths as a destination picker for ideas.'),
        piano: flag(true, 'Piano', 'Show the interactive piano.'),
      })
      .prefault({}),
    beats: beatSchema.prefault({}),
    accents: accentSchema.prefault({}),
    segmentation: segmentationSchema.prefault({}),
    harmony: harmonySchema.prefault({ prior: {} }),
    analysis: analysisSchema.prefault({}),
    prediction: predictionSchema.prefault({}),
    editor: editorSchema.prefault({}),
  })
  .superRefine((s, ctx) => {
    const issue = (path: string[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    if (s.beats.minBpm > s.beats.maxBpm) issue(['beats', 'minBpm'], 'Slowest tempo must not exceed fastest tempo.');
    if (s.beats.windowMs < 120000 / s.beats.minBpm)
      issue(['beats', 'windowMs'], 'Analysis window must contain at least two beats at the slowest tempo.');
    if (s.beats.windowMs / s.beats.binMs > 4000)
      issue(['beats', 'binMs'], 'Use at most 4,000 timing bins per window to keep live analysis responsive.');
    if (s.beats.revisionMs > s.beats.windowMs)
      issue(['beats', 'revisionMs'], 'Editable beat history must fit inside the analysis window.');
    if (s.segmentation.groupMs > s.segmentation.rollMs)
      issue(['segmentation', 'rollMs'], 'Rolled-chord window must be at least as long as chord grouping.');
    if (
      s.segmentation.splitHistory < s.segmentation.splitMinNotes ||
      s.segmentation.splitHistory < 2 * s.segmentation.splitSideNotes
    )
      issue(['segmentation', 'splitHistory'], 'Hand-split history must fit the required evidence for both hands.');
    if (s.segmentation.releaseTailMs > s.segmentation.releaseActiveMs)
      issue(['segmentation', 'releaseTailMs'], 'Release tail must not exceed release analysis time.');
  });
export type Settings = z.output<typeof settingsSchema>;
export type BeatSettings = Settings['beats'];
export type AccentSettings = Settings['accents'];
export type SegmentationSettings = Settings['segmentation'];
export type EditorSettings = Settings['editor'];
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export const SETTINGS_SECTIONS = [
  { id: 'preferences', title: 'Playback & input', advanced: false },
  { id: 'panels', title: 'Workspace', advanced: false },
  { id: 'editor', title: 'Editor', advanced: false },
  { id: 'prediction', title: 'Chord suggestions', advanced: false },
  { id: 'beats', title: 'Beat & bar detection', advanced: true },
  { id: 'accents', title: 'Downbeat evidence', advanced: true },
  { id: 'segmentation', title: 'Chord & melody detection', advanced: true },
  { id: 'harmony', title: 'Harmonic model', advanced: true },
  { id: 'analysis', title: 'Analysis & history', advanced: true },
] as const;

export interface SettingField {
  path: string;
  title: string;
  description: string;
  unit?: string;
  step?: number;
  type: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  enum?: (string | number)[];
}
/** Use public JSON Schema output so forms do not inspect Zod's implementation internals. */
export const SETTINGS_FIELDS: SettingField[] = [];
interface FormSchema {
  type?: string;
  properties?: Record<string, FormSchema>;
  [key: string]: unknown;
}
function fields(schema: FormSchema, prefix = '') {
  for (const [name, value] of Object.entries(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (value.type === 'object') fields(value, path);
    else SETTINGS_FIELDS.push({ ...value, path } as unknown as SettingField);
  }
}
fields(z.toJSONSchema(settingsSchema) as unknown as FormSchema);

export function settingValue(settings: Settings, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], settings);
}
export function setSetting(settings: Settings, path: string, value: unknown) {
  if (!SETTINGS_FIELDS.some((f) => f.path === path)) throw new Error(`Unknown setting: ${path}`);
  const parts = path.split('.');
  const parent = parts.slice(0, -1).reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], settings);
  (parent as Record<string, unknown>)[parts[parts.length - 1]] = value;
}

/** Recover each known field independently so one invalid saved value cannot discard the user's other settings. */
export function restoreSettings(raw: unknown): { settings: Settings; warnings: string[] } {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const warnings: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return { settings, warnings: ['Saved settings were invalid; defaults restored.'] };
  for (const field of SETTINGS_FIELDS) {
    let value: unknown = raw;
    for (const key of field.path.split('.'))
      value = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
    if (value === undefined) continue;
    const candidate = structuredClone(settings);
    setSetting(candidate, field.path, value);
    // Group-level relationships are checked after recovering the individual values.
    const schemas = {
      preferences: preferencesSchema,
      beats: beatSchema,
      accents: accentSchema,
      segmentation: segmentationSchema,
      harmony: harmonySchema,
      analysis: analysisSchema,
      prediction: predictionSchema,
      editor: editorSchema,
      panels: settingsSchema.shape.panels,
    };
    const section = field.path.split('.')[0] as keyof typeof schemas;
    if (schemas[section].safeParse(candidate[section]).success) setSetting(settings, field.path, value);
    else warnings.push(`${field.title}: invalid saved value; default restored.`);
  }
  const parsed = settingsSchema.safeParse(settings);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const section = issue.path[0] as keyof Settings;
      settings[section] = structuredClone(DEFAULT_SETTINGS[section]) as never;
      warnings.push(`${section}: ${issue.message} Defaults restored for this section.`);
    }
  }
  return { settings, warnings };
}

/** Musical document validity and MIDI protocol constraints are shared, not preference overrides. */
export const MUSIC_LIMITS = {
  minBpm: 4,
  maxBpm: 1000,
  minChordBeats: 1 / 64,
  maxChordBeats: 4096,
  minMeter: 1,
  maxMeter: 255,
  maxDenominator: 256,
} as const;
