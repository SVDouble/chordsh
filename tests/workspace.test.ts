import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Sequence, SequenceEditor, sequenceFromChart } from '../src/engine/sequence';
import { songFromReference } from '../src/library/toSong';

vi.mock('../src/io/synth', () => ({
  Synth: class {
    blocked = false;
    configure() {}
    init() {}
    setMuted() {}
    setPedal() {}
    silence() {}
    stop() {}
    play = vi.fn();
    noteOn = vi.fn();
    noteOff() {}
    dispose() {}
  },
}));
vi.mock('../src/io/recorder', async (original) => ({
  ...(await original<typeof import('../src/io/recorder')>()),
  saveRecording: async () => 'test recording',
}));

let workspace: typeof import('../src/ui/composition.svelte');
let store: typeof import('../src/ui/store.svelte');
const storedLibrary = (): { sequences: Sequence[]; activeSequenceId: string } =>
  JSON.parse(localStorage.getItem('chordsh') ?? '{}');

beforeAll(async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('requestAnimationFrame', () => 0);
  workspace = await import('../src/ui/composition.svelte');
  store = await import('../src/ui/store.svelte');
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  store.stopPlayback();
  store.session.clear();
  workspace.newSequence();
  workspace.assist.recordTarget = 'both';
  workspace.selectEditorMode('chords');
  store.settings.preferences.monitor = false;
});

describe('suggestion previews', () => {
  it('shows the surrounding chords while auditioning the idea, then plays the full passage in context', () => {
    workspace.openSong(sequenceFromChart('| C | Dm | G7 |', 'Context'));
    workspace.previewSuggestion({ start: 4, end: 8 }, ['F']);
    expect(store.synth.play).toHaveBeenCalledTimes(1);
    expect(store.ui.previewScore?.cues.map((cue) => cue.name)).toEqual(['F']);
    expect(store.ui.previewScore?.suggestionSpan).toEqual({ start: 4, end: 8 });
    expect(store.ui.previewScore?.context).toMatchObject({ before: { name: 'C' }, after: { name: 'G7' } });
    expect(workspace.focusedChord().name).toBe('F');
    workspace.previewSuggestion({ start: 4, end: 8 }, ['F'], { inContext: true });
    expect(store.ui.previewScore?.cues.map((cue) => cue.name)).toEqual(['C', 'F', 'G7']);
    expect(store.ui.previewScore?.suggestionSpan).toEqual({ start: 4, end: 8 });
    expect(workspace.focusedChord().name).toBe('C');
    vi.advanceTimersByTime(1400);
    expect(workspace.focusedChord().name).toBe('F');
    workspace.previewSuggestion({ start: 4, end: 8 }, ['F']);
    expect(store.ui.previewScore?.cues.map((cue) => cue.name)).toEqual(['F']);
  });

  it('keeps the chords at both ends of a suggested sequence in their local keys', () => {
    workspace.openSong(sequenceFromChart('| C | Dm | G7 | G |', 'Sequence in context'));
    workspace.editSequence((editor) => editor.setRegion(12, { tonic: 7, mode: 'major' }));
    workspace.previewSuggestion({ start: 4, end: 12 }, ['Am', 'F', 'Em', 'G7']);
    expect(store.ui.previewScore?.cues.map((cue) => cue.name)).toEqual(['Am', 'F', 'Em', 'G7']);
    expect(store.ui.previewScore?.context).toEqual({
      before: { name: 'C', key: { tonic: 0, mode: 'major' } },
      after: { name: 'G', key: { tonic: 7, mode: 'major' } },
    });
    expect(store.synth.play).toHaveBeenCalledTimes(4);
  });

  it('plays the melody clipped to the auditioned chord and honors Melody mute', () => {
    const song = sequenceFromChart('| C | Dm | G7 |', 'Melody preview');
    song.bpm = 120;
    song.melody = [
      { start: 3.5, beats: 1, pitch: 81, velocity: 85 },
      { start: 7.5, beats: 1, pitch: 84, velocity: 92 },
      { start: 8.5, beats: 1, pitch: 86, velocity: 90 },
    ];
    workspace.openSong(song);
    workspace.previewSuggestion({ start: 4, end: 8 }, ['F']);
    expect(store.synth.play).toHaveBeenCalledWith([81], 0.06, 0.0875, 85);
    const [, onset, duration, velocity] = vi.mocked(store.synth.play).mock.calls.find(([notes]) => notes[0] === 84)!;
    expect(onset).toBeCloseTo(0.6725);
    expect(duration).toBeCloseTo(0.0875);
    expect(velocity).toBe(92);
    expect(store.synth.play).toHaveBeenCalledTimes(3);
    expect(store.ui.previewScore?.cues.map((cue) => cue.name)).toEqual(['F']);

    workspace.toggleTrackMute('melody');
    vi.mocked(store.synth.play).mockClear();
    workspace.previewSuggestion({ start: 4, end: 8 }, ['F']);
    expect(store.synth.play).toHaveBeenCalledTimes(1);
    expect(workspace.currentSequence().melody).toEqual(song.melody);
  });

  it('auditions all the chords of a slow four-bar suggestion in under three seconds', () => {
    const song = sequenceFromChart('| C | Dm | F | G7 |', 'Slow preview');
    song.bpm = 60;
    workspace.openSong(song);
    const names = ['C', 'Am', 'F', 'G7'];
    workspace.previewSuggestion({ start: 0, end: 16 }, names);
    const cues = store.ui.previewScore?.cues ?? [];
    expect(cues.map((cue) => cue.name)).toEqual(names);
    expect(cues[3].startMs).toBeCloseTo(2100);
    expect(cues[3].durationMs).toBeCloseTo(700);
    expect(store.synth.play).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(2200);
    expect(workspace.focusedChord().name).toBe('G7');
    vi.advanceTimersByTime(700);
    expect(store.ui.previewScore?.status).toBe('finished');
    expect(workspace.currentSequence().bpm).toBe(60);
  });

  it('plays a suggested chord in one attack and keeps its label after the sound finishes', () => {
    const song = sequenceFromChart('| C | G7 |', 'Preview');
    workspace.openSong(song);
    const before = workspace.currentSequence();
    workspace.previewChords(['F'], { id: 'suggestion:F', sources: ['Functional harmony'] });
    expect(store.synth.play).toHaveBeenCalledTimes(1);
    expect(store.ui.previewScore?.cues.map((cue) => cue.name)).toEqual(['F']);
    expect(workspace.focusedChord().name).toBe('F');
    vi.advanceTimersByTime(2000);
    expect(store.ui.preview).toBeNull();
    expect(store.ui.previewScore?.status).toBe('finished');
    expect(workspace.focusedChord().name).toBe('F');
    expect(workspace.currentSequence()).toEqual(before);
  });

  it('highlights context chords on the score clock without changing labels when melody notes enter or release', () => {
    const song = sequenceFromChart('| C | Dm | G7 |', 'Context');
    song.bpm = 120;
    song.melody = [{ start: 4.5, beats: 1, pitch: 73, velocity: 90 }];
    workspace.openSong(song);
    const before = workspace.currentSequence();
    workspace.previewSuggestion({ start: 4, end: 8 }, ['F'], { inContext: true, info: { id: 'context:F' } });
    expect(store.ui.previewScore?.cues.map((cue) => [cue.name, cue.startMs])).toEqual([
      ['C', 0],
      ['F', 4000 / 3],
      ['G7', 8000 / 3],
    ]);
    vi.advanceTimersByTime(1400);
    expect(store.ui.previewScore?.active).toBe(1);
    store.ui.playing = [73];
    expect(workspace.focusedChord().name).toBe('F');
    store.ui.playing = [];
    expect(workspace.focusedChord().name).toBe('F');
    vi.advanceTimersByTime(1334);
    expect(store.ui.previewScore?.active).toBe(2);
    expect(workspace.focusedChord().name).toBe('G7');
    expect(workspace.currentSequence()).toEqual(before);
  });

  it('cancels old cue timers when another idea is previewed or dismissed', () => {
    workspace.previewChords(['C', 'G'], { id: 'old' });
    vi.advanceTimersByTime(200);
    workspace.previewChords(['Dm'], { id: 'new' });
    vi.advanceTimersByTime(2000);
    expect(store.ui.previewScore).toMatchObject({ id: 'new', active: 0, status: 'finished' });
    workspace.previewChords(['Dm'], { id: 'new' });
    store.stopAudition();
    vi.advanceTimersByTime(10000);
    expect(store.ui.previewScore).toBeNull();
  });
});

describe('suggestion target ranges', () => {
  it('starts a single chord at the cursor in a gap and stops it before the next chord', () => {
    const song = sequenceFromChart('| C | Dm | G7 |', 'Gap for a suggestion');
    song.steps = song.steps.filter((step) => step.symbol !== 'Dm');
    workspace.openSong(song);
    workspace.selectTimeline(5);
    expect(workspace.suggestionScope(0).span).toEqual({ start: 5, end: 8 });
    expect(workspace.suggestionScope(2).span).toEqual({ start: 4, end: 12 });
    workspace.selectStep(song.steps[1].id);
    expect(workspace.suggestionScope(0).span).toEqual({ start: 8, end: 12 });
  });
});
afterAll(() => {
  store.stopPlayback();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('library project actions', () => {
  it('autosaves edits and undo immediately and keeps the project when closed', () => {
    const id = workspace.currentSequence().id;
    expect(storedLibrary().activeSequenceId).toBe(id);
    workspace.editSequence((editor) => {
      editor.update({ title: 'Autosaved' });
      editor.place([{ symbol: 'Dm7', beats: 4 }], 0);
    });
    const savedProject = () => storedLibrary().sequences.find((project) => project.id === id);
    expect(savedProject()).toMatchObject({ title: 'Autosaved', steps: [{ symbol: 'Dm7' }] });

    workspace.editSequence((editor) => editor.undo());
    expect(savedProject()).toMatchObject({ title: 'Autosaved', steps: [] });
    workspace.editSequence((editor) => editor.redo());
    workspace.closeSong();
    expect(storedLibrary().activeSequenceId).not.toBe(id);
    expect(savedProject()).toMatchObject({ title: 'Autosaved', steps: [{ symbol: 'Dm7' }] });
  });

  it('retains edits after a failed save and writes the latest state on retry', () => {
    const id = workspace.currentSequence().id;
    const previous = localStorage.getItem('chordsh');
    using setItem = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('Storage unavailable');
    });
    workspace.editSequence((editor) => editor.update({ title: 'Retry me' }));
    expect(setItem).toHaveBeenCalledOnce();
    expect(store.ui.projectSavePending).toBe(true);
    expect(localStorage.getItem('chordsh')).toBe(previous);

    workspace.saveSong();
    expect(store.ui.projectSavePending).toBe(false);
    expect(storedLibrary().sequences.find((project) => project.id === id)?.title).toBe('Retry me');
  });

  it('duplicates the requested project without changing its original', () => {
    const source = sequenceFromChart('| C | G7 |', 'Copy source');
    workspace.openSong(source);
    workspace.newSequence();

    workspace.duplicateSequence(source.id);
    const copy = workspace.currentSequence();
    expect(copy.id).not.toBe(source.id);
    expect(copy.title).toBe('Copy source (copy)');
    expect(copy.steps).toEqual(source.steps);
    workspace.editSequence((editor) => editor.transpose(1));
    expect(workspace.composition.documents.find(({ id }) => id === source.id)?.steps).toEqual(source.steps);
  });

  it('deletes and restores an inactive project without changing the active project', () => {
    const removed = sequenceFromChart('| F |', 'Delete source');
    workspace.openSong(removed);
    workspace.newSequence();
    const current = workspace.currentSequence();

    workspace.deleteSequence(removed.id);
    expect(workspace.currentSequence()).toEqual(current);
    expect(workspace.composition.documents.some(({ id }) => id === removed.id)).toBe(false);
    expect(storedLibrary().sequences.some(({ id }) => id === removed.id)).toBe(false);

    store.ui.notice?.action?.();
    expect(workspace.currentSequence()).toEqual(current);
    expect(workspace.composition.documents.find(({ id }) => id === removed.id)?.steps).toEqual(removed.steps);
    expect(storedLibrary().sequences.find(({ id }) => id === removed.id)?.title).toBe(removed.title);
  });
});

describe('song loading and live takes', () => {
  it('reads the current playback position between transport updates and holds it when paused', () => {
    const song = sequenceFromChart('| C | G7 |', 'Playhead clock');
    workspace.openSong(song);
    store.seekPlayback(400);
    const requestedAt = performance.now();
    store.playSelection();

    expect(store.playbackPositionAt(requestedAt + 200)).toBe(400);
    expect(store.playbackPositionAt(requestedAt + 316)).toBe(416);
    expect(store.ui.playbackPosition).toBe(400);

    vi.advanceTimersByTime(625);
    store.pausePlayback();
    expect(store.playbackPositionAt(performance.now() + 500)).toBe(725);
  });

  it('updates the active playback mix at the current playhead without editing the project', () => {
    const song = sequenceFromChart('| C | G7 |', 'Playback mutes');
    song.bpm = 120;
    song.melody = [{ start: 0, beats: 4, pitch: 84, velocity: 92 }];
    workspace.openSong(song);
    const before = workspace.currentSequence();
    store.playSelection();
    vi.advanceTimersByTime(800);

    vi.mocked(store.synth.noteOn).mockClear();
    workspace.toggleTrackMute('chords');
    expect(store.ui.playbackPosition).toBe(500);
    vi.advanceTimersByTime(100);
    expect(store.synth.noteOn).toHaveBeenCalledExactlyOnceWith(84, 92);

    vi.mocked(store.synth.noteOn).mockClear();
    workspace.toggleTrackMute('melody');
    vi.advanceTimersByTime(100);
    expect(store.ui.nowPlaying).toBe(song.title);
    expect(store.synth.noteOn).not.toHaveBeenCalled();
    expect(workspace.currentSequence()).toEqual(before);

    workspace.newSequence();
    expect(workspace.composition.mutedTracks).toEqual({ melody: false, chords: false });
  });
  it('shows the timeline Roman numeral in the inspector for a song with an inferred key', () => {
    const song = sequenceFromChart('| C | A7 | Dm | G7 | C |', 'Auto key');
    song.key = null;
    workspace.openSong(song);
    workspace.selectStep(workspace.currentSequence().steps[1].id);
    expect(workspace.focusedChord()).toMatchObject({
      name: 'A7',
      key: { tonic: 0, mode: 'major' },
      roman: { numeral: 'V7/ii' },
    });
  });

  it('keeps a played chord pending until confirmation, then places it at the chosen beat', () => {
    workspace.selectEditorMode('chords', 4);
    for (const note of [60, 64, 67]) store.live.noteOn(note, 90);
    for (const note of [60, 64, 67]) store.live.noteOff(note);
    vi.advanceTimersByTime(5000);
    expect(workspace.currentSequence().steps).toEqual([]);
    expect(workspace.inputTimeline()[0]).toMatchObject({ symbol: 'C', start: 4 });
    workspace.confirmPlayedChord();
    expect(workspace.currentSequence().steps[0]).toMatchObject({ symbol: 'C', start: 4, notes: [60, 64, 67] });
    expect(workspace.inputTimeline()).toEqual([]);
  });

  it('opens a database song in place of the old timeline without playing it or showing an extra live chord', () => {
    workspace.editSequence((editor) => editor.place([{ symbol: 'C', beats: 4 }], 0));
    const song = songFromReference({
      title: 'Pop song',
      beats: [0, 500, 1000, 1500, 2000],
      beats_per_bar: 4,
      notes: [[0, 1000, 74, 90]],
      chords: [[0, 2000, 7, 'maj', 'G:maj', 7, 'major']],
    });
    workspace.openSong(song);
    expect(workspace.currentSequence().steps.map((s) => s.symbol)).toEqual(['G']);
    expect(workspace.currentSequence().melody?.map((n) => n.pitch)).toEqual([74]);
    expect(workspace.composition.cursor).toBe(0);
    expect(store.ui.nowPlaying).toBeNull();
    expect(workspace.inputTimeline()).toEqual([]);
  });

  it('opening an original performance also loads its annotated song, without modifying it during playback', async () => {
    const song = sequenceFromChart('| F | G |', 'Annotated song');
    song.melody = [{ start: 12, beats: 2, pitch: 76, velocity: 90 }];
    workspace.editSequence((editor) => editor.place([{ symbol: 'C' }], 0));
    const piece = {
      id: 'pop',
      title: song.title,
      source: 'benchmark' as const,
      bpm: 120,
      notes: [
        [0, 500, 60, 80],
        [0, 500, 64, 80],
        [0, 500, 67, 80],
      ] as [number, number, number, number][],
    };
    store.registerPerformance(piece.id, piece.title, async () => piece);
    await store.choosePerformance(piece.id, true, () => song);
    const loaded = workspace.currentSequence();
    expect(loaded.steps.map((s) => s.symbol)).toEqual(['F', 'G']);
    expect(loaded.melody).toEqual(song.melody);
    vi.advanceTimersByTime(1000);
    expect(workspace.currentSequence()).toEqual(loaded);
    expect(workspace.inputTimeline()).toEqual([]);
  });

  it('shows a held melody note live at the clicked beat, then saves its actual duration', async () => {
    workspace.selectEditorMode('melody', 8);
    expect(store.ui.recording).toBe(false);
    expect(workspace.assist.recordTarget).toBe('both');
    store.startRecording();
    vi.advanceTimersByTime(1000); // waiting before the first note does not insert a rest
    store.live.noteOn(72, 91);
    vi.advanceTimersByTime(600);
    store.ui.recordingElapsed = store.recorder.elapsed;
    expect(workspace.recordingMelody()).toEqual([{ start: 8, beats: 1, pitch: 72, velocity: 91 }]);
    expect(workspace.currentSequence().melody ?? []).toEqual([]);
    store.live.noteOff(72);
    vi.advanceTimersByTime(600);
    await store.stopRecording();
    expect(workspace.currentSequence().melody).toEqual([{ start: 8, beats: 1, pitch: 72, velocity: 91 }]);
    expect(workspace.currentSequence().steps).toEqual([]);
    expect(workspace.composition.take).toBeNull();
  });

  it('records chords into the selected passage without shifting the later chords', async () => {
    const song = sequenceFromChart('| C | G |', 'Overdub');
    workspace.openSong(song);
    workspace.selectEditorMode('chords', 0);
    expect(store.ui.recording).toBe(false);
    store.startRecording();
    for (const note of [53, 57, 60]) store.live.noteOn(note, 88);
    vi.advanceTimersByTime(1200);
    store.ui.recordingElapsed = store.recorder.elapsed;
    expect(workspace.inputTimeline()[0]?.symbol).toBe('F');
    for (const note of [53, 57, 60]) store.live.noteOff(note);
    await store.stopRecording();
    expect(workspace.composition.error).toBe('');
    const chords = workspace.currentSequence().steps;
    expect(chords[0].symbol).toBe('F');
    expect(chords[0].start).toBe(0);
    expect(chords.at(-1)).toMatchObject({ symbol: 'G', start: 4 });
  });

  it('ignores a slow performance load after another song has been selected', async () => {
    let resolve!: (piece: import('../src/library/pieces').Piece) => void;
    store.registerPerformance(
      'slow',
      'Slow',
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loading = store.choosePerformance('slow', true);
    const song = sequenceFromChart('| Dm |', 'Chosen next');
    workspace.openSong(song);
    resolve({ id: 'slow', title: 'Slow', source: 'midi file', notes: [[0, 500, 72, 80]] });
    await loading;
    expect(workspace.currentSequence().id).toBe(song.id);
    expect(store.ui.nowPlaying).toBeNull();
  });
});

describe('recording over existing chords', () => {
  it('preserves both ends of a chord crossed by a take and keeps key regions at their score positions', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C | G |', 'Overdub'));
    editor.setRegion(4, { tonic: 7, mode: 'major' });
    const before = editor.document;
    editor.recordChords([{ start: 1, beats: 1, symbol: 'F' }], 1, 2);
    expect(editor.document.steps.map((s) => [s.symbol, s.start, s.beats])).toEqual([
      ['C', 0, 1],
      ['F', 1, 1],
      ['C', 2, 2],
      ['G', 4, 4],
    ]);
    expect(editor.document.regions).toEqual(before.regions);
    editor.undo();
    expect(editor.document).toEqual(before);
  });

  it('rejects overlapping or invalid recorded chords atomically', () => {
    const editor = new SequenceEditor(sequenceFromChart('| C |', 'Overdub'));
    const before = editor.document;
    expect(() =>
      editor.recordChords(
        [
          { start: 1, beats: 2, symbol: 'F' },
          { start: 2, beats: 1, symbol: 'G' },
        ],
        1,
        4,
      ),
    ).toThrow();
    expect(() => editor.recordChords([{ start: NaN, beats: 1, symbol: 'F' }], 1, 4)).toThrow();
    expect(editor.document).toEqual(before);
  });
});
