<script lang="ts">
  import Icon from './Icon.svelte';
  import StylePicker from './StylePicker.svelte';
  import LoadParts from './LoadParts.svelte';
  import { barPlaybackStyle, marksFromBarStyles } from '../engine/accompaniment';
  import { DEFAULT_SETTINGS, METER_DENOMINATORS, MUSIC_LIMITS } from '../config/settings';
  import { tick } from 'svelte';
  import { barQuarters, beatQuarters, meterPosition, notatedQuarters } from '../theory/meter';
  import {
    acceptChords,
    inputTimeline,
    recordingBeat,
    recordingMelody,
    selectEditorMode,
    confirmPlayedChord,
    composition,
    currentChart,
    currentSequence,
    editSequence,
    selectStep,
    selectTimeline,
    assist,
    habits,
    DRAG_TYPE,
    dragging,
    dropChords,
    dropTarget,
    clearMelody,
    clearChords,
    previewChords,
    toggleTrackMute,
  } from './composition.svelte';
  import {
    audition,
    playbackPositionAt,
    seekPlayback,
    pausePlayback,
    resumePlayback,
    settings,
    ui,
  } from './store.svelte';
  import { sequenceRegions, sequenceKeyAt, type KeyRegion, type SequenceStep } from '../engine/sequence';
  import { reharmHints } from '../engine/reharm';
  import { runFit } from '../engine/advisor';
  import { melodyFit, motion, noteRole } from '../engine/assist';
  import { habitScore, statsKey, tokenOf } from '../engine/progressions';
  import { judgeAll, RULEBOOKS, rulebookVerdict } from '../engine/rules';
  import { ALL_KEYS, keyFromIndex, keyIndex, keyLong } from '../theory/scales';
  import { parseChordSymbol } from '../theory/symbols';
  import { voiceChord } from '../theory/voicing';
  import { voicingChoices, type VoicingPreset, type VoicingChoice } from '../theory/voicingPresets';

  let { suggestionSpan = null }: { suggestionSpan?: { start: number; end: number } | null } = $props();
  let zoom = $state(44);
  let animatedPlayBeat = $state(0);
  let scroller = $state<HTMLDivElement>();
  let timelineWidth = $state(600);
  let regionDialog = $state<HTMLDialogElement>();
  let loader = $state<{ pick: (role: 'melody' | 'chords') => void }>();
  let regionStart = $state(0);
  let regionKey = $state('auto');
  let regionLabel = $state('');
  let regionId = $state<string | null>(null);
  let chordPopover = $state<HTMLElement>();
  let popupX = $state(12);
  let popupY = $state(80);
  let scrubbing = $state<{ pointer: number; resume: boolean } | null>(null);
  let chordInput = $state<HTMLInputElement>();
  let popup = $state(false);
  let editingId = $state<string | null>(null);
  let position = $state(0);
  let symbol = $state('');
  let duration = $state(4);
  let notes = $state('');
  let voicingPreset = $state<VoicingPreset | null>(null);
  let velocity = $state(DEFAULT_SETTINGS.editor.velocity);
  let styleTarget = $state<{ bar: number | null; previewBar: number } | null>(null);
  let drag = $state<{
    id: string;
    mode: 'move' | 'resize';
    pointer: number;
    x: number;
    y: number;
    active: boolean;
    grab: number;
    original: number;
    originalBeats: number;
    at: number;
    beats: number;
  } | null>(null);
  let suppressChordClick = false;
  /** Where a dragged idea would land (shown as a dashed box while dragging over the timeline). */
  let dropAt = $state<{ start: number; beats: number; replaceId: string | null } | null>(null);
  const draggingChords = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes(DRAG_TYPE);
  function dropBeat(e: DragEvent, rowStart: number) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const beat = rowStart + (e.clientX - rect.left) / beatWidth;
    return Math.max(0, Math.floor(beat / snap + 1e-8) * snap);
  }
  function chordDragOver(e: DragEvent, rowStart: number) {
    if (!draggingChords(e) || !dragging.idea) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dropAt = dropTarget(dragging.idea, dropBeat(e, rowStart));
  }
  function chordDragLeave(e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dropAt = null;
  }
  function chordDrop(e: DragEvent, rowStart: number) {
    if (!draggingChords(e)) return;
    e.preventDefault();
    const idea = dragging.idea ?? JSON.parse(e.dataTransfer?.getData(DRAG_TYPE) || 'null');
    if (idea) dropChords(idea, dropBeat(e, rowStart));
    dropAt = null;
    dragging.idea = null;
  }
  const connectionViews = [
    { id: 'motion', icon: 'motion', label: 'Chord motion' },
    { id: 'habit', icon: 'habit', label: 'Progression frequency' },
    { id: 'style', icon: 'styleScore', label: 'Style score' },
  ] as const;
  let lens = $state<'motion' | 'habit' | 'style'>('motion');
  const rulebook = $derived(RULEBOOKS.find((book) => book.id === assist.style) ?? RULEBOOKS[0]);
  const TRADITION_OF: Record<string, string> = { pop: 'popular', jazz: 'jazz' };
  const document = $derived.by(() => {
    void composition.revision;
    return currentSequence();
  });
  const chart = $derived(currentChart());
  const liveMelody = $derived(recordingMelody());
  const shownMelody = $derived([
    ...(document.melody ?? []).filter((note) => {
      const take = composition.take;
      return !take || take.target === 'chords' || note.start < take.at || note.start >= recordingBeat();
    }),
    ...liveMelody,
  ]);
  const melodyEnd = $derived(shownMelody.reduce((e, n) => Math.max(e, n.start + n.beats), 0));
  /** Melody lane: pitch range of the tune and the chord under each note (for rest / colour / lean / pull). */
  const melodyRange = $derived.by(() => {
    const pitches = shownMelody.map((n) => n.pitch);
    return pitches.length ? [Math.min(...pitches), Math.max(...pitches)] : [60, 72];
  });
  const parsedSteps = $derived(
    document.steps.map((s) => ({ start: s.start, end: s.start + s.beats, chord: parseChordSymbol(s.symbol) })),
  );
  /** How well each chord covers the melody above it (null: no melody there). */
  const coverage = $derived.by(() => {
    const melody = (document.melody ?? []).map(({ start, beats, pitch }) => ({ start, beats, pitch }));
    return parsedSteps.map((s, i) => {
      if (!s.chord || !melody.length) return null;
      const fit = melodyFit(
        s.chord,
        melody,
        { start: s.start, end: s.end },
        barLength,
        parsedSteps[i + 1]?.chord ?? null,
      );
      if (!fit) return null;
      const count = (role: string) => fit.notes.filter((n) => n.role === role).length;
      const parts = [
        ['rest', 'on chord tones'],
        ['colour', 'colour'],
        ['lean', 'leaning'],
        ['pull', 'pulling'],
      ]
        .map(([role, words]) => [count(role), words] as const)
        .filter(([n]) => n)
        .map(([n, words]) => `${n} ${words}`);
      return {
        score: fit.score,
        clashes: fit.clashes,
        title: `Covers the melody ${Math.round(100 * fit.score)}%: ${parts.join(', ')}${fit.clashes ? ` · ${fit.clashes} unresolved clash${fit.clashes > 1 ? 'es' : ''}` : ''}`,
      };
    });
  });
  const MOTION_SIGN: Record<string, string> = {
    resolves: '↘',
    glides: '≈',
    slides: '∼',
    steps: '→',
    opens: '↗',
    leaps: '⤴',
    stays: '=',
  };
  /** How each chord moves to the next one that touches it: kind, brightness, and how natural it is. */
  const connections = $derived.by(() =>
    parsedSteps.flatMap((s, i) => {
      const n = parsedSteps[i + 1];
      if (!s.chord || !n?.chord || Math.abs(n.start - s.end) > 1e-6) return [];
      const key = sequenceKeyAt(document, n.start) ?? chart.key ?? { tonic: 0, mode: 'major' as const };
      const m = motion(s.chord, n.chord, key);
      // habit: how often the tradition makes this move after these chords (study counts)
      const tradition = TRADITION_OF[assist.style] ?? 'art';
      const stats = habits.stats?.traditions[statsKey(key, tradition)];
      const history = parsedSteps
        .slice(Math.max(0, i - 2), i + 1)
        .map((x) => (x.chord ? tokenOf(x.chord, key) : ''))
        .filter(Boolean);
      // a repeated chord is not a move (the study folds repeats), so it has no habit
      const habit =
        tokenOf(s.chord, key) === tokenOf(n.chord, key) ? null : habitScore(stats, history, tokenOf(n.chord, key));
      // style: the rulebook's verdict on the second chord with its real neighbours
      const verdict = rulebookVerdict(
        rulebook,
        judgeAll({
          key,
          chord: n.chord,
          prev: s.chord,
          next: parsedSteps[i + 2]?.chord ?? null,
          melody: (document.melody ?? []).map(({ start, beats, pitch }) => ({ start, beats, pitch })),
          span: { start: n.start, end: n.end },
          meter: barLength,
          phraseEnd: false,
        }),
      );
      const style = verdict === null ? null : (verdict + 1) / 2;
      const value = lens === 'habit' ? habit : lens === 'style' ? style : m.score;
      const grade = (x: number | null, hi: number, lo: number) =>
        x === null ? 'plain' : x >= hi ? 'smooth' : x >= lo ? 'plain' : 'rough';
      return [
        {
          at: n.start,
          nextId: document.steps[i + 1].id,
          kind: m.kind,
          sign:
            lens === 'motion' ? (MOTION_SIGN[m.kind] ?? '→') : value === null ? '–' : String(Math.round(100 * value)),
          brightness: lens === 'motion' ? m.brightness : 0,
          quality: lens === 'motion' ? grade(m.score, 0.75, 0.5) : grade(value, 0.6, 0.35),
          title: `${document.steps[i].symbol} → ${document.steps[i + 1].symbol}: ${m.text} · ${m.common} shared note${m.common === 1 ? '' : 's'} · natural ${Math.round(100 * m.score)}%${habit === null ? '' : ` · habit in ${tradition} music ${Math.round(100 * habit)}%`}${style === null ? '' : ` · ${rulebook.name} ${Math.round(100 * style)}%`}`,
        },
      ];
    }),
  );
  const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  function melodyIn(rowStart: number, rowEnd: number) {
    const [lo, hi] = melodyRange;
    return shownMelody
      .filter((n) => n.start < rowEnd - 1e-8 && n.start + n.beats > rowStart + 1e-8)
      .map((n, i) => {
        const under = parsedSteps.find((s) => s.start <= n.start + 1e-8 && n.start < s.end - 1e-8)?.chord;
        const role = under ? noteRole(n.pitch, under) : 'none';
        const from = Math.max(n.start, rowStart);
        return {
          id: `${n.start}:${n.pitch}:${i}`,
          role,
          left: (from - rowStart) * beatWidth,
          width: Math.max(3, (Math.min(n.start + n.beats, rowEnd) - from) * beatWidth - 1),
          top: 4 + 48 * (1 - (n.pitch - lo) / Math.max(1, hi - lo)),
          name: `${NOTE_NAMES[n.pitch % 12]}${Math.floor(n.pitch / 12) - 1}`,
          pitch: n.pitch,
          beats: n.beats,
          title: `${NOTE_NAMES[n.pitch % 12]}${Math.floor(n.pitch / 12) - 1} · ${
            role === 'none'
              ? 'no chord under it'
              : {
                  rest: 'a chord tone',
                  colour: 'colours the chord',
                  lean: 'leans on the chord',
                  pull: 'pulls against the chord',
                }[role]
          }`,
        };
      });
  }
  const unit = $derived(beatQuarters(document.denominator));
  const barLength = $derived(barQuarters(document.meter, document.denominator));
  const snap = $derived(notatedQuarters(settings.editor.snapBeats, document.denominator));
  const positionAt = (quarters: number) => meterPosition(quarters, document.meter, document.denominator);
  const selectedIndex = $derived(document.steps.findIndex((s) => s.id === composition.selectedId));
  const selected = $derived(document.steps[selectedIndex]);
  const cursorBar = $derived(Math.floor((selected?.start ?? composition.cursor) / barLength + 1e-8));
  const voicings = $derived.by(() => {
    const chord = parseChordSymbol(symbol);
    const previous = document.steps.find((step) => step.id === editingId)?.notes ?? null;
    return chord ? voicingChoices(chord, previous) : [];
  });
  const chosenVoicing = $derived(voicings.find((choice) => choice.id === voicingPreset));
  /** Reharmonisation ideas, each checked against the melody; ideas that clash with it go last. */
  const hints = $derived.by(() => {
    if (selectedIndex < 0) return [];
    const raw = reharmHints(
      { ...chart, key: sequenceKeyAt(document, selected?.start ?? 0) ?? chart.key },
      selectedIndex,
    );
    const span = { start: selected.start, end: selected.start + selected.beats };
    const after = parseChordSymbol(document.steps[selectedIndex + 1]?.symbol ?? '');
    const scored = raw.map((h) => ({ ...h, fit: runFit(h.chords, document.melody ?? [], span, barLength, after) }));
    return scored.sort((a, b) => (a.fit?.clashes ?? 0) - (b.fit?.clashes ?? 0));
  });
  const incoming = $derived(inputTimeline());
  const regions = $derived(sequenceRegions(document));
  const styleMarkers = $derived.by(() => {
    const marks = document.barStyles?.length ? marksFromBarStyles(document) : (document.styleMarks ?? []);
    const bars = marks.map((mark) => mark.bar);
    if (bars[0] !== 0 && barPlaybackStyle(document, 0).id !== 'once') bars.unshift(0);
    return bars.map((bar) => ({ bar, start: bar * barLength, name: barPlaybackStyle(document, bar).name }));
  });
  const markers = $derived(
    [
      ...regions.map((region) => ({ type: 'key' as const, start: region.start, region })),
      ...styleMarkers.map((mark) => ({ type: 'style' as const, ...mark })),
    ].sort((a, b) => a.start - b.start),
  );
  const markerWidth = 18;
  function rulerMarkers(rowStart: number, rowEnd: number) {
    let next = 1;
    const positioned = markers
      .filter((marker) => marker.start >= rowStart - 1e-8 && marker.start < rowEnd - 1e-8)
      .map((marker) => {
        const anchor = Math.max(0, (marker.start - rowStart) * beatWidth);
        const left = Math.max(next, anchor + 1);
        next = left + markerWidth + 1;
        return { ...marker, anchor, left };
      });
    // Fit handles at the right edge while leaving their beat ticks at the actual positions.
    let last = timelineWidth - markerWidth - 2;
    for (const marker of positioned.toReversed()) {
      marker.left = Math.max(1, Math.min(marker.left, last));
      last = marker.left - markerWidth - 1;
    }
    return positioned;
  }
  const end = $derived(
    [...document.steps, ...incoming].reduce(
      (last, s) => Math.max(last, s.start + s.beats),
      Math.max(
        melodyEnd,
        regions.at(-1)?.start ?? 0,
        composition.take ? recordingBeat() : 0,
        ...styleMarkers.map((mark) => mark.start + barLength),
      ),
    ),
  );
  const length = $derived(
    Math.max(
      barLength * settings.editor.visibleBars,
      Math.ceil((end + barLength * 2) / barLength) * barLength,
      Math.ceil((suggestionSpan?.end ?? 0) / barLength) * barLength,
    ),
  );
  const barsPerRow = $derived(Math.max(1, Math.floor(timelineWidth / (document.meter * zoom))));
  const beatsPerRow = $derived(barsPerRow * barLength);
  const beatWidth = $derived(timelineWidth / beatsPerRow);
  const rows = $derived(Array.from({ length: Math.ceil(length / beatsPerRow) }, (_, i) => i * beatsPerRow));
  const playing = $derived(!!ui.nowPlaying && ui.sourceId === `sequence:${document.id}`);
  const playBeat = $derived(playing ? animatedPlayBeat : (ui.playbackPosition * document.bpm) / 60000);
  const playingStepId = $derived(
    playing
      ? document.steps.find((step) => playBeat >= step.start && playBeat < step.start + step.beats)?.id
      : undefined,
  );
  const focusBeat = $derived(playing || ui.playbackPaused ? playBeat : (selected?.start ?? composition.cursor));
  const cursorBeat = $derived(composition.take ? recordingBeat() : focusBeat);
  const cursorRow = $derived(Math.floor(cursorBeat / beatsPerRow) * beatsPerRow);
  const followBeat = $derived(composition.take || playing ? cursorBeat : (incoming.at(-1)?.start ?? selected?.start));
  const followRow = $derived(
    followBeat === undefined ? undefined : Math.floor((followBeat + 1e-8) / beatsPerRow) * beatsPerRow,
  );
  const isInsertionBeat = (beat: number) =>
    !selected && composition.cursor >= beat - 1e-8 && composition.cursor < beat + unit - 1e-8;
  const regionName = (region: KeyRegion) => {
    const key = region.key ?? chart.key;
    return key ? keyLong(key) : 'Auto key';
  };
  const cursorRegion = $derived(
    regions.findLast((region) => region.start <= (selected?.start ?? composition.cursor) + 1e-8) ?? regions[0],
  );
  const recordingTime = $derived(
    `${Math.floor(ui.recordingElapsed / 60000)}:${String(Math.floor(ui.recordingElapsed / 1000) % 60).padStart(2, '0')}`,
  );

  $effect(() => {
    void document.id;
    popup = false;
    if (scroller) scroller.scrollTop = 0;
  });
  $effect(() => {
    if (composition.input) popup = false;
  });
  $effect(() => {
    if (!playing) return;
    const bpm = document.bpm;
    let frame: number;
    function draw(now: number) {
      animatedPlayBeat = (playbackPositionAt(now) * bpm) / 60000;
      frame = requestAnimationFrame(draw);
    }
    draw(performance.now());
    return () => cancelAnimationFrame(frame);
  });
  $effect(() => {
    void beatsPerRow;
    if (drag || followRow === undefined || !scroller) return;
    const row = scroller.querySelector<HTMLElement>(`[data-start="${followRow}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    if (top < scroller.scrollTop || top + row.offsetHeight > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = Math.max(0, top - 12);
  });

  function editRegion(at: number) {
    const region = regions.find((entry) => Math.abs(entry.start - at) < 1e-8);
    regionStart = region?.start ?? at;
    regionId = region?.id ?? null;
    const key = region?.key ?? sequenceKeyAt(document, at);
    regionKey = key ? String(keyIndex(key)) : 'auto';
    regionLabel = region?.label ?? '';
    regionDialog?.showModal();
  }
  function pointerBeat(e: PointerEvent) {
    const elements = [...(scroller?.querySelectorAll<HTMLElement>('.timeline-row') ?? [])];
    const row =
      elements.find((r) => {
        const box = r.getBoundingClientRect();
        return e.clientY >= box.top && e.clientY <= box.bottom;
      }) ??
      elements.reduce<HTMLElement | undefined>(
        (best, next) =>
          !best ||
          Math.abs(next.getBoundingClientRect().top - e.clientY) <
            Math.abs(best.getBoundingClientRect().top - e.clientY)
            ? next
            : best,
        undefined,
      );
    if (!row) return 0;
    return (
      Number(row.dataset.start) +
      Math.max(0, Math.min(beatsPerRow, (e.clientX - row.getBoundingClientRect().left) / beatWidth))
    );
  }

  function seekTo(beat: number) {
    const at = Math.max(0, Math.round(beat / snap) * snap);
    selectTimeline(at);
    seekPlayback((at * 60000) / document.bpm);
  }
  function selectLaneAt(mode: 'melody' | 'chords', beat: number, step?: SequenceStep) {
    if (ui.recording) return;
    const keepPlaying = mode === 'chords' && !!ui.nowPlaying;
    if (playing && !keepPlaying) pausePlayback();
    if (step) {
      selectEditorMode(mode);
      selectStep(step.id);
    } else selectEditorMode(mode, beat);
    if (!keepPlaying) seekPlayback((beat * 60000) / document.bpm);
  }

  function beginSeek(e: PointerEvent) {
    if (e.button !== 0 || ui.recording) return;
    e.preventDefault();
    const resume = playing;
    if (resume) pausePlayback();
    scrubbing = { pointer: e.pointerId, resume };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekTo(Number((e.currentTarget as HTMLElement).dataset.beat));
  }
  function movePointer(e: PointerEvent) {
    if (scrubbing?.pointer === e.pointerId) seekTo(pointerBeat(e));
    else moveDrag(e);
  }
  function endPointer(e: PointerEvent) {
    if (scrubbing?.pointer === e.pointerId) {
      const resume = scrubbing.resume;
      scrubbing = null;
      if (resume) resumePlayback(ui.playbackPosition);
    } else endDrag(e);
  }

  async function openAt(at: number, step?: SequenceStep) {
    if (ui.recording) return;
    selectEditorMode('chords');
    const existing = step ?? document.steps.find((s) => s.start <= at + 1e-8 && s.start + s.beats > at + 1e-8);
    if (existing) selectStep(existing.id);
    else selectTimeline(at);
    editingId = existing?.id ?? null;
    position = existing?.start ?? at;
    symbol = existing?.symbol ?? '';
    duration =
      (existing?.beats ??
        Math.min(
          barLength,
          (document.steps.find((s) => s.start > at + 1e-8)?.start ?? at + barLength) - at || barLength,
        )) / unit;
    if (Math.abs(duration - Math.round(duration)) < 1e-9) duration = Math.round(duration);
    notes = existing?.notes.join(' ') ?? '';
    voicingPreset = null;
    velocity = existing?.velocity ?? settings.editor.velocity;
    popup = true;
    await tick();
    chordPopover?.showPopover();
    const rowStart = Math.floor((at + 1e-8) / beatsPerRow) * beatsPerRow;
    const row = scroller?.querySelector<HTMLElement>(`[data-start="${rowStart}"]`);
    const box = row?.getBoundingClientRect();
    const panel = chordPopover?.getBoundingClientRect();
    popupX = Math.max(
      12,
      Math.min(innerWidth - (panel?.width ?? 440) - 12, (box?.left ?? 12) + (at - rowStart) * beatWidth),
    );
    popupY = Math.max(12, Math.min(innerHeight - (panel?.height ?? 260) - 12, (box?.top ?? 40) + 150));
    chordInput?.focus();
    chordInput?.select();
  }
  function save() {
    const existing = document.steps.find((s) => s.id === editingId);
    const keepNotes =
      !!notes.trim() && (!existing || symbol === existing.symbol || notes.trim() !== existing.notes.join(' '));
    const input = {
      symbol,
      beats: notatedQuarters(duration, document.denominator),
      notes: keepNotes
        ? notes
            .trim()
            .split(/[\s,]+/)
            .map(Number)
        : undefined,
      velocity,
    };
    if (editingId) editSequence((e) => e.replace(editingId!, input));
    else {
      selectTimeline(position);
      acceptChords([input], false, false);
    }
    if (!composition.error) popup = false;
  }
  function preview() {
    const chord = parseChordSymbol(symbol);
    if (!chord) {
      composition.error = `Can't read chord: ${symbol}`;
      return;
    }
    const old = document.steps.find((s) => s.id === editingId);
    const voicing =
      notes.trim() && (!old || symbol === old.symbol || notes.trim() !== old.notes.join(' '))
        ? notes
            .trim()
            .split(/[\s,]+/)
            .map(Number)
        : voiceChord(chord, old?.notes ?? null);
    if (voicing.some((n) => !Number.isInteger(n) || n < 0 || n > 127)) {
      composition.error = 'Choose MIDI notes from 0 to 127.';
      return;
    }
    previewChords(
      [symbol],
      { id: 'edit-preview', key: sequenceKeyAt(document, position) ?? chart.key },
      [voicing],
      notatedQuarters(duration, document.denominator),
      velocity,
      position,
    );
  }
  function useVoicing(choice: VoicingChoice) {
    if (!choice.notes) return;
    notes = choice.notes.join(' ');
    voicingPreset = choice.id;
    preview();
  }
  function beginDrag(e: PointerEvent, s: SequenceStep, mode: 'move' | 'resize', body = false) {
    if (e.button !== 0 || drag || ui.recording) return;
    if (!body) e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    suppressChordClick = false;
    selectStep(s.id);
    popup = false;
    drag = {
      id: s.id,
      mode,
      pointer: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      active: false,
      grab: pointerBeat(e),
      original: s.start,
      originalBeats: s.beats,
      at: s.start,
      beats: s.beats,
    };
  }
  function moveDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < settings.editor.dragThresholdPx) return;
      drag.active = true;
      // The scroller survives row wrapping when the original chord button is moved or unmounted.
      scroller?.setPointerCapture(e.pointerId);
    }
    const delta = Math.round((pointerBeat(e) - drag.grab) / snap) * snap;
    if (drag.mode === 'move') drag.at = Math.max(0, drag.original + delta);
    else
      drag.beats = Math.max(
        MUSIC_LIMITS.minChordBeats,
        Math.min(MUSIC_LIMITS.maxChordBeats, drag.originalBeats + delta),
      );
  }
  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const change = $state.snapshot(drag);
    drag = null;
    if (!change.active) return;
    suppressChordClick = true;
    if (change.mode === 'move' && change.at !== change.original) {
      const overlap = document.steps.find(
        (s) => s.id !== change.id && s.start < change.at && s.start + s.beats > change.at,
      );
      editSequence((ed) => ed.moveTo(change.id, overlap?.start ?? change.at));
    } else if (change.mode === 'resize' && change.beats !== change.originalBeats) {
      const old = document.steps.find((s) => s.id === change.id)!;
      editSequence((ed) => ed.replace(change.id, { ...old, beats: change.beats }));
    }
  }
  function removeSelected() {
    if (!editingId) return;
    const id = editingId;
    selectTimeline(position);
    editSequence((e) => e.remove(id));
    popup = false;
  }
  function cancelGestures() {
    if (drag) suppressChordClick = true;
    drag = null;
    scrubbing = null;
  }
</script>

{#snippet muteTrack(track: 'melody' | 'chords', hasNotes: boolean)}
  {@const muted = composition.mutedTracks[track]}
  <button
    type="button"
    class="icon track-mute"
    aria-label={`Mute ${track}`}
    aria-pressed={muted}
    title={`${muted ? 'Unmute' : 'Mute'} ${track}`}
    disabled={!hasNotes && !muted}
    onclick={() => toggleTrackMute(track)}
  >
    <Icon name={muted ? 'mute' : 'volume'} />
  </button>
{/snippet}

<svelte:window
  onblur={cancelGestures}
  onpointermove={movePointer}
  onpointerup={endPointer}
  onpointercancel={(e) => {
    if (scrubbing?.pointer === e.pointerId) endPointer(e);
    if (drag?.pointer === e.pointerId) cancelGestures();
  }}
/>
<div class="sequence-editor">
  <LoadParts bind:this={loader} />
  {#if ui.recording || ui.recMsg || ui.playbackError}
    <div class="row tight transport-status">
      {#if ui.recording}
        <span class="rec-on"><i class="rec-dot"></i>{recordingTime}</span>
        <input
          class="rec-note"
          bind:value={ui.recNote}
          placeholder="Recording note (optional)"
          aria-label="Recording note"
        >
      {:else if ui.recMsg}
        <span class="small rec-msg" title={ui.recMsg}>{ui.recMsg.startsWith('Saved') ? '✓ saved' : ui.recMsg}</span>
      {/if}
      {#if ui.playbackError}
        <span class="warn small" role="alert">{ui.playbackError}</span>
      {/if}
    </div>
  {/if}
  {#if !ui.savedLocally}
    <p class="warn small" role="status">Browser storage is unavailable. Export MIDI to keep this project.</p>
  {/if}
  <div class="timeline-edit-tools">
    <div class="sequence-meta">
      <fieldset class="tool-group song-setup" aria-label="Tempo, time signature, key and playback style">
        <label title="Tempo"
          >♩
          <input
            aria-label="Sequence tempo"
            type="number"
            min={MUSIC_LIMITS.minBpm}
            max={MUSIC_LIMITS.maxBpm}
            value={document.bpm}
            onchange={(e) => editSequence((s) => s.update({ bpm: +e.currentTarget.value }))}
          ></label
        >
        <fieldset class="sequence-meter" title="Time signature. Tempo remains quarter notes per minute.">
          <legend class="sr-only">Time signature</legend>
          <input
            aria-label="Sequence meter numerator"
            type="number"
            min={MUSIC_LIMITS.minMeter}
            max={MUSIC_LIMITS.maxMeter}
            step="1"
            value={document.meter}
            onchange={(e) => editSequence((s) => s.update({ meter: e.currentTarget.valueAsNumber }))}
          >
          <span aria-hidden="true">/</span>
          <select
            aria-label="Sequence meter denominator"
            title="Note value of one beat (4 = quarter note, 8 = eighth note)"
            value={document.denominator ?? 4}
            onchange={(e) => editSequence((s) => s.update({ denominator: +e.currentTarget.value }))}
          >
            {#each METER_DENOMINATORS.filter((value) => value <= 32 || value === document.denominator) as denominator}
              <option value={denominator}>{denominator}</option>
            {/each}
          </select>
        </fieldset>
        <button
          type="button"
          class="icon"
          title={`${regionName(cursorRegion)} · Edit key at the selected position`}
          aria-label="Add key change"
          onclick={() => editRegion(selected?.start ?? composition.cursor)}
        >
          <Icon name="key" />
        </button>
        <button
          type="button"
          class="icon"
          aria-label={`Playback style at bar ${cursorBar + 1}: ${barPlaybackStyle(document, cursorBar).name}`}
          title={`Playback style at bar ${cursorBar + 1}; click to change it from this bar on`}
          disabled={ui.recording}
          onclick={() => (styleTarget = { bar: cursorBar, previewBar: cursorBar })}
        >
          <Icon name="playbackStyle" />
        </button>
      </fieldset>
      <div class="tool-group song-parts">
        <fieldset class="song-part" aria-label="Melody tools">
          <button
            type="button"
            class="part-mode"
            class:chosen={composition.mode === 'melody'}
            aria-label="Melody mode"
            title="Melody mode"
            aria-pressed={composition.mode === 'melody'}
            disabled={ui.recording}
            onclick={() => selectEditorMode('melody', selected?.start)}
          >
            <Icon name="melody" /> Melody
          </button>
          <span class="part-count muted" title="Melody notes">{document.melody?.length ?? 0}</span>
          {@render muteTrack('melody', !!document.melody?.length)}
          <button
            type="button"
            class="icon"
            aria-label="Load a melody"
            title="Load a melody from a MIDI file (or drop one on the page). The chords stay."
            onclick={() => loader?.pick('melody')}
          >
            <Icon name="upload" />
          </button>
          <button
            type="button"
            class="icon"
            aria-label="Clear the melody"
            title="Clear the melody. The chords stay; Undo brings it back."
            disabled={!document.melody?.length}
            onclick={clearMelody}
          >
            <Icon name="delete" />
          </button>
        </fieldset>
        <fieldset class="song-part" aria-label="Chord tools">
          <button
            type="button"
            class="part-mode"
            class:chosen={composition.mode === 'chords'}
            aria-label="Chords mode"
            title="Chords mode"
            aria-pressed={composition.mode === 'chords'}
            disabled={ui.recording}
            onclick={() => selectEditorMode('chords')}
          >
            <Icon name="chord" /> Chords
          </button>
          <span class="part-count muted" title="Chords">{document.steps.length}</span>
          {@render muteTrack('chords', !!document.steps.length)}
          <button
            type="button"
            class="icon"
            aria-label="Load chords"
            title="Load chords from a MIDI file or a chord chart (.txt), or drop one on the page. The melody stays."
            onclick={() => loader?.pick('chords')}
          >
            <Icon name="upload" />
          </button>
          <button
            type="button"
            class="icon"
            aria-label="Clear the chords"
            title="Clear the chords. The melody stays; Undo brings them back."
            disabled={!document.steps.length}
            onclick={clearChords}
          >
            <Icon name="delete" />
          </button>
        </fieldset>
      </div>
    </div>
    <div class="timeline-view-tools">
      <fieldset class="tool-group" aria-label="Chord connection badges">
        {#each connectionViews as view (view.id)}
          <button
            type="button"
            class="icon"
            class:chosen={lens === view.id}
            aria-label={view.label}
            aria-pressed={lens === view.id}
            title={view.id === 'style' ? `${view.label} · ${rulebook.name}` : view.label}
            disabled={view.id === 'habit' && !habits.stats}
            onclick={() => (lens = view.id)}
          >
            <Icon name={view.icon} />
          </button>
        {/each}
      </fieldset>
      {#if composition.mode === 'chords'}
        <fieldset class="tool-group" aria-label="Chord entry">
          <button
            type="button"
            class="icon"
            aria-label={selected ? 'Edit chord' : 'Type chord'}
            title={selected ? 'Edit chord' : 'Type chord'}
            disabled={ui.recording}
            onclick={() => openAt(selected?.start ?? composition.cursor, selected)}
          >
            <Icon name="edit" />
          </button>
          {#if composition.input}
            <button
              type="button"
              class="icon chosen"
              aria-label="Place chord"
              title="Place chord (Enter)"
              onclick={confirmPlayedChord}
            >
              <Icon name="check" />
            </button>
          {/if}
        </fieldset>
      {/if}
      <fieldset class="tool-group timeline-zoom" aria-label="Timeline zoom">
        <span
          class="timeline-position small muted"
          aria-live="off"
          title={`Bar ${positionAt(cursorBeat).bar}, beat ${+positionAt(cursorBeat).beat.toFixed(2)}`}
          >{positionAt(cursorBeat).bar}:{+positionAt(cursorBeat).beat.toFixed(2)}</span
        >
        <button
          type="button"
          class="icon"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= 24}
          onclick={() => (zoom = Math.max(24, zoom - 10))}
        >
          <Icon name="minus" />
        </button>
        <button
          type="button"
          class="icon"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= 94}
          onclick={() => (zoom = Math.min(94, zoom + 10))}
        >
          <Icon name="plus" />
        </button>
      </fieldset>
    </div>
  </div>
  {#if composition.error}
    <p class="warn small" role="alert">{composition.error}</p>
  {/if}
  <div
    class="timeline-scroll wrapped-timeline"
    class:dragging={drag?.active}
    bind:this={scroller}
    bind:clientWidth={timelineWidth}
  >
    {#each rows as rowStart}
      {@const rowEnd = rowStart + beatsPerRow}
      {@const rowMarkers = rulerMarkers(rowStart, rowEnd)}
      <section
        class="chord-timeline timeline-row"
        class:has-markers={!!rowMarkers.length}
        data-start={rowStart}
        style:--marker-width={`${markerWidth}px`}
        aria-label={`Bars ${positionAt(rowStart).bar}–${positionAt(rowEnd - 1e-6).bar}`}
        ondragover={(e) => chordDragOver(e, rowStart)}
        ondragleave={chordDragLeave}
        ondrop={(e) => chordDrop(e, rowStart)}
      >
        {#if dropAt && dragging.idea && dropAt.start < rowEnd - 1e-8 && dropAt.start + dropAt.beats > rowStart + 1e-8}
          <div
            class="drop-preview"
            class:replace={!!dropAt.replaceId}
            style:left={`${(Math.max(dropAt.start, rowStart) - rowStart) * beatWidth + 2}px`}
            style:width={`${(Math.min(dropAt.start + dropAt.beats, rowEnd) - Math.max(dropAt.start, rowStart)) * beatWidth - 4}px`}
          >
            <span>{dropAt.replaceId ? 'replace with' : 'add'} {dragging.idea.names.join(' ')}</span>
          </div>
        {/if}
        {#if suggestionSpan &&
          !dragging.idea &&
          !drag?.active &&
          suggestionSpan.start < rowEnd - 1e-8 &&
          suggestionSpan.end > rowStart + 1e-8}
          <div
            class="suggestion-target"
            aria-hidden="true"
            style:left={`${(Math.max(suggestionSpan.start, rowStart) - rowStart) * beatWidth}px`}
            style:width={`${(Math.min(suggestionSpan.end, rowEnd) - Math.max(suggestionSpan.start, rowStart)) * beatWidth}px`}
          ></div>
        {/if}
        {#each Array.from(
          { length: barsPerRow * document.meter },
          (_, i) => rowStart + notatedQuarters(i, document.denominator),
        ) as beat}
          <button
            type="button"
            class="timeline-ruler"
            class:insertion={isInsertionBeat(beat)}
            data-beat={beat}
            class:bar-start={positionAt(beat).beat === 1}
            style:left={`${(beat - rowStart) * beatWidth}px`}
            style:width={`${beatWidth * unit}px`}
            aria-label={`Seek bar ${positionAt(beat).bar} beat ${positionAt(beat).beat}`}
            disabled={ui.recording}
            title="Click or drag to seek"
            onpointerdown={beginSeek}
            onclick={(e) => {
              if (e.detail === 0 && !ui.recording) seekTo(beat);
            }}
          >
            {positionAt(beat).beat === 1 ? positionAt(beat).bar : '·'}
          </button>
          <button
            type="button"
            class="timeline-slot"
            class:insertion={composition.mode === 'chords' && isInsertionBeat(beat)}
            aria-current={composition.mode === 'chords' && isInsertionBeat(beat) ? 'location' : undefined}
            class:bar-start={positionAt(beat).beat === 1}
            style:left={`${(beat - rowStart) * beatWidth}px`}
            style:width={`${beatWidth * unit}px`}
            aria-label={`Select chord position at bar ${positionAt(beat).bar} beat ${positionAt(beat).beat}`}
            title="Click to select this beat. Double-click to type a chord."
            disabled={ui.recording}
            onclick={() => selectLaneAt('chords', beat)}
            ondblclick={() => openAt(beat)}
          >
            <span><Icon name="plus" size={14} /></span>
          </button>
        {/each}
        {#each rowMarkers as marker (marker.type === 'key' ? marker.region.id : `style:${marker.bar}`)}
          <span
            class="ruler-marker-line"
            class:key-change-marker={marker.type === 'key'}
            style:left={`${marker.anchor}px`}
            aria-hidden="true"
          ></span>
          {#if marker.type === 'key'}
            {@const region = marker.region}
            <button
              type="button"
              class="ruler-marker key-change-handle"
              style:left={`${marker.left}px`}
              aria-label={`Edit key region at beat ${+(region.start / unit + 1).toFixed(4)}: ${regionName(region)}`}
              title={`${region.label ? region.label + ' · ' : ''}${regionName(region)}${region.key ? '' : ' (auto)'}`}
              onclick={() => editRegion(region.start)}
            >
              <Icon name="key" size={12} />
            </button>
          {:else}
            <button
              type="button"
              class="ruler-marker style-change-handle"
              style:left={`${marker.left}px`}
              aria-label={`Playback style from bar ${marker.bar + 1}: ${marker.name}`}
              title={`Bar ${marker.bar + 1} · ${marker.name}`}
              disabled={ui.recording}
              onclick={() => (styleTarget = { bar: marker.bar, previewBar: marker.bar })}
            >
              <Icon name="playbackStyle" size={12} />
            </button>
          {/if}
        {/each}
        {#each document.steps as step, i (step.id)}
          {@const at = drag?.id === step.id ? drag.at : step.start}
          {@const beats = drag?.id === step.id ? drag.beats : step.beats}
          {#if at < rowEnd - 1e-8 && at + beats > rowStart + 1e-8}
            <div
              class="timeline-clip"
              class:selected={step.id === composition.selectedId}
              class:input-replacement={composition.input?.target.selectedId === step.id}
              class:playing={step.id === playingStepId}
              style:left={`${Math.max(0, at - rowStart) * beatWidth + 2}px`}
              style:width={`${Math.max(18, (Math.min(at + beats, rowEnd) - Math.max(at, rowStart)) * beatWidth - 4)}px`}
            >
              <button
                type="button"
                class="clip-body f-{chart.chords[i].roman?.func ?? ''}"
                aria-label={`Select ${step.symbol} at beat ${+(step.start / unit + 1).toFixed(4)}`}
                aria-pressed={step.id === composition.selectedId}
                title={`${step.symbol} · ${+(step.beats / unit).toFixed(2)} beats · Double-click to edit`}
                disabled={ui.recording}
                ondblclick={() => openAt(step.start, step)}
                onpointerdown={(e) => beginDrag(e, step, 'move', true)}
                onclick={(e) => {
                  if (e.detail !== 0 && suppressChordClick) {
                    suppressChordClick = false;
                    return;
                  }
                  selectLaneAt('chords', step.start, step);
                }}
              >
                <b>{at < rowStart ? '↳ ' : ''}{step.symbol}</b
                ><span class="c-roman">{chart.chords[i].roman?.numeral ?? ''}</span>
              </button>
              {#if coverage[i]}
                {@const c = coverage[i]!}
                <span
                  class="clip-coverage"
                  class:good={c.score >= 0.8 && !c.clashes}
                  class:fair={(c.score >= 0.55 && c.score < 0.8) || (c.clashes > 0 && c.score >= 0.55)}
                  class:poor={c.score < 0.55}
                  role="img"
                  aria-label={c.title}
                  title={c.title}
                  ><i style:width={`${Math.round(100 * c.score)}%`}></i></span
                >
              {/if}
              <button
                type="button"
                class="clip-drag"
                aria-label={`Move ${step.symbol}`}
                title="Drag to move between beats or rows"
                onpointerdown={(e) => beginDrag(e, step, 'move')}
              >
                <Icon name="grip" size={13} />
              </button>
              {#if at + beats <= rowEnd}
                <button
                  type="button"
                  class="clip-resize"
                  aria-label={`Resize ${step.symbol}`}
                  title="Drag to resize"
                  onpointerdown={(e) => beginDrag(e, step, 'resize')}
                  onkeydown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      editSequence((ed) =>
                        ed.replace(step.id, {
                          ...step,
                          beats: Math.max(
                            MUSIC_LIMITS.minChordBeats,
                            step.beats + (e.key === 'ArrowRight' ? snap : -snap),
                          ),
                        }),
                      );
                    }
                  }}
                ></button>
              {/if}
            </div>
          {/if}
        {/each}
        <div class="motion-lane">
          {#each connections.filter((c) => c.at > rowStart - 1e-8 && c.at < rowEnd - 1e-8) as c (c.at)}
            <button
              type="button"
              class="motion-badge {c.quality}"
              style:left={`${Math.max(12, (c.at - rowStart) * beatWidth)}px`}
              aria-label={`${c.title}. Select the chord after it`}
              title={`${c.title} — click to see other chords here`}
              onclick={() => selectStep(c.nextId)}
            >
              {c.sign}
              {#if c.brightness > 0}
                <sup>☀</sup>
              {:else if c.brightness < 0}
                <sup>☾</sup>
              {/if}
            </button>
          {/each}
        </div>
        <div class="melody-lane">
          <span class="lane-label">Melody</span>
          {#each Array.from({ length: barsPerRow * document.meter }, (_, i) => rowStart + i * unit) as beat}
            <button
              type="button"
              class="melody-edit-slot"
              class:insertion={composition.mode === 'melody' && isInsertionBeat(beat)}
              style:left={`${(beat - rowStart) * beatWidth}px`}
              style:width={`${beatWidth * unit}px`}
              aria-label={`Select melody at bar ${positionAt(beat).bar} beat ${positionAt(beat).beat}`}
              title="Set the melody cursor"
              disabled={ui.recording}
              onclick={() => selectLaneAt('melody', beat)}
            ></button>
          {/each}
          {#each melodyIn(rowStart, rowEnd) as n (n.id)}
            <button
              type="button"
              class="melody-note {n.role}"
              style:left={`${n.left}px`}
              style:width={`${n.width}px`}
              style:top={`${n.top}px`}
              title={`${n.title} — click to hear`}
              aria-label={`Hear ${n.title}`}
              onclick={() => audition([[n.pitch]], `melody:${n.id}`, n.beats, n.name, settings.editor.velocity)}
            >
              {#if n.width >= 24}
                <span>{n.name}</span>
              {/if}
            </button>
          {/each}
        </div>
        {#each incoming.filter((s) => s.start < rowEnd - 1e-8 && s.start + s.beats > rowStart + 1e-8) as step (step.id)}
          <div
            class="timeline-input"
            class:recording={!!composition.take}
            title={composition.take ? 'Recording' : 'Press Enter or Place chord to confirm'}
            style:left={`${Math.max(0, step.start - rowStart) * beatWidth + 2}px`}
            style:width={`${Math.max(18, (Math.min(step.start + step.beats, rowEnd) - Math.max(step.start, rowStart)) * beatWidth - 4)}px`}
          >
            <b>{step.symbol}</b><span class="small input-status">{composition.take ? 'Recording' : 'Pending'}</span>
          </div>
        {/each}

        {#if cursorRow === rowStart}
          <div
            class={playing || ui.playbackPaused || composition.take ? 'timeline-playhead' : 'timeline-cursor'}
            class:recording={!!composition.take}
            style:transform={`translateX(${(cursorBeat - rowStart) * beatWidth}px)`}
            aria-hidden="true"
          ></div>
        {/if}
      </section>
    {/each}
  </div>

  {#if styleTarget}
    <StylePicker
      sequence={document}
      bar={styleTarget.bar}
      previewBar={styleTarget.previewBar}
      onclose={() => (styleTarget = null)}
      onapply={(style) =>
        editSequence((editor) =>
          styleTarget?.bar === null ? editor.setStyle(style ?? 'once') : editor.setStyleMark(styleTarget!.bar!, style),
        )}
    />
  {/if}

  {#if popup}
    <section
      bind:this={chordPopover}
      popover="auto"
      class="chord-editor-popover"
      style:left={`${popupX}px`}
      style:top={`${popupY}px`}
      aria-label={editingId ? 'Edit chord' : 'Add chord'}
      ontoggle={() => {
        if (chordPopover && !chordPopover.matches(':popover-open')) popup = false;
      }}
    >
      <form
        class="chord-popover"
        aria-label={editingId ? 'Edit chord' : 'Add chord'}
        onsubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div class="chord-popover-main">
          <input
            bind:this={chordInput}
            aria-label="Chord symbol"
            bind:value={symbol}
            placeholder="Cmaj7"
            autocomplete="off"
            spellcheck="false"
          >
          <button
            type="button"
            class="icon"
            aria-label="Preview chord"
            title={composition.mutedTracks.melody ? 'Preview chord' : 'Preview chord with melody'}
            disabled={!symbol.trim()}
            onclick={preview}
          >
            <Icon name="ear" />
          </button>
          {#if document.melody?.length}
            {@render muteTrack('melody', true)}
          {/if}
          <button
            type="submit"
            class="icon"
            aria-label={editingId ? 'Save chord' : 'Add chord'}
            title={editingId ? 'Save chord' : 'Add chord'}
            disabled={!symbol.trim()}
          >
            <Icon name="check" />
          </button>
          {#if editingId}
            <button
              type="button"
              class="icon"
              aria-label="Duplicate chord"
              title="Duplicate"
              onclick={() => {
                const id = editingId!;
                editSequence((e) => {
                  composition.selectedId = e.duplicate(id);
                });
                popup = false;
              }}
            >
              <Icon name="copy" />
            </button><button
              type="button"
              class="icon"
              aria-label="Delete chord"
              title="Delete"
              onclick={removeSelected}
            >
              <Icon name="delete" />
            </button>
          {/if}
          <button
            type="button"
            class="icon"
            aria-label="Close chord editor"
            title="Close"
            onclick={() => (popup = false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <div class="duration-choices">
          <span class="small muted" title={`One beat is 1/${document.denominator ?? 4} of a whole note`}>Beats</span>
          {#each [0.5, 1, 2, 4, 8] as n}
            <button type="button" class:on={duration === n} onclick={() => (duration = n)}>{n}</button>
          {/each}
          <input
            aria-label="Chord duration"
            type="number"
            min={MUSIC_LIMITS.minChordBeats / unit}
            max={MUSIC_LIMITS.maxChordBeats / unit}
            step="any"
            bind:value={duration}
          >
        </div>
        <details class="voicing-editor">
          <summary>Voicing</summary>
          <fieldset class="voicing-presets">
            <legend class="sr-only">Voicing choices</legend>
            {#each voicings as choice}
              <button
                type="button"
                class:on={voicingPreset === choice.id}
                aria-pressed={voicingPreset === choice.id}
                aria-label={`Use ${choice.label.toLowerCase()} voicing`}
                title={choice.description}
                disabled={!choice.notes}
                onclick={() => useVoicing(choice)}
              >
                {choice.label}
              </button>
            {/each}
          </fieldset>
          {#if chosenVoicing}
            <p class="small muted voicing-description">{chosenVoicing.description} Preview only until ✓.</p>
          {/if}
          <div class="row">
            <label
              >MIDI notes
              <input
                aria-label="Voicing MIDI notes"
                bind:value={notes}
                oninput={() => (voicingPreset = null)}
                placeholder="48 52 55 59"
              ></label
            ><label
              >Velocity <input aria-label="Chord velocity" type="number" min="1" max="127" bind:value={velocity}></label
            >
          </div>
        </details>
        {#if selected && hints.length}
          <div class="timeline-ideas">
            <span class="small muted">Try instead</span>
            {#each hints as h, i}
              <span
                class="idea-chip"
                class:clashes={!!h.fit?.clashes}
                title={h.fit
                  ? `${h.why}\nMelody fit ${Math.round(100 * h.fit.score)}%${h.fit.clashes ? `, ${h.fit.clashes} clashing note${h.fit.clashes > 1 ? 's' : ''}` : ''}`
                  : h.why}
                ><span>{h.names.join(' → ')}</span>
                {#if h.fit}
                  <span class="idea-fit">{h.fit.clashes ? '✗' : '♪'}{Math.round(100 * h.fit.score)}%</span>
                {/if}
                <button
                  type="button"
                  class="icon"
                  aria-label={`Preview ${h.label}`}
                  title={h.label}
                  onclick={() =>
                    previewChords(
                      h.names,
                      { id: `reharm:${i}`, key: sequenceKeyAt(document, selected.start) ?? chart.key },
                      h.chords.map((c) => voiceChord(c, selected.notes)),
                      selected.beats / h.chords.length,
                      selected.velocity,
                      selected.start,
                    )}
                >
                  <Icon name="ear" />
                </button><button
                  type="button"
                  class="icon"
                  aria-label={`Use ${h.label}`}
                  title={`Use ${h.label}`}
                  disabled={selected.beats / h.chords.length < MUSIC_LIMITS.minChordBeats}
                  onclick={() => {
                    acceptChords(
                      h.names.map((name) => ({ symbol: name, beats: selected.beats / h.chords.length })),
                      true,
                    );
                    popup = false;
                  }}
                >
                  <Icon name="check" />
                </button></span
              >
            {/each}
          </div>
        {/if}
      </form>
    </section>
  {/if}
  <dialog bind:this={regionDialog} class="region-dialog" aria-label="Edit key region">
    <form
      onsubmit={(e) => {
        e.preventDefault();
        if (
          editSequence((editor) =>
            editor.setRegion(regionStart, regionKey === 'auto' ? null : keyFromIndex(+regionKey), regionLabel),
          )
        )
          regionDialog?.close();
      }}
    >
      <h3>Key region · bar {positionAt(regionStart).bar}</h3>
      <label>Section name<input aria-label="Region name" bind:value={regionLabel} placeholder="Verse, bridge…"></label>
      <label
        >Key<select aria-label="Region key" bind:value={regionKey}>
          <option value="auto">Auto-detect</option>
          {#each ALL_KEYS as key}
            <option value={String(keyIndex(key))}>{keyLong(key)}</option>
          {/each}
        </select></label
      >
      <div class="row">
        {#if regionId && regionStart > 0}
          <button
            type="button"
            onclick={() => {
              if (editSequence((e) => e.removeRegion(regionId!))) regionDialog?.close();
            }}
          >
            Remove region
          </button>
        {/if}
        <span class="spacer"></span><button type="button" onclick={() => regionDialog?.close()}>Cancel</button
        ><button type="submit">Save region</button>
      </div>
    </form>
  </dialog>
</div>
