<script lang="ts">
  import Icon from './Icon.svelte';
  import Transport from './Transport.svelte';
  import StylePicker from './StylePicker.svelte';
  import { barPlaybackStyle, playbackStyle } from '../engine/accompaniment';
  import { DEFAULT_SETTINGS, METER_DENOMINATORS, MUSIC_LIMITS } from '../config/settings';
  import { tick } from 'svelte';
  import { barQuarters, beatQuarters, meterPosition, notatedQuarters } from '../theory/meter';
  import {
    acceptChords,
    canRedo,
    canUndo,
    inputTimeline,
    recordingBeat,
    composition,
    currentSequence,
    deleteSequence,
    duplicateSequence,
    editSequence,
    exportSequenceMidi,
    importChart,
    newSequence,
    selectStep,
    selectTimeline,
  } from './composition.svelte';
  import { audition, seekPlayback, pausePlayback, resumePlayback, session, settings, ui } from './store.svelte';
  import { sequenceChart, sequenceRegions, sequenceKeyAt, type KeyRegion, type SequenceStep } from '../engine/sequence';
  import { reharmHints } from '../engine/reharm';
  import { runFit } from '../engine/advisor';
  import { noteRole } from '../engine/assist';
  import { ALL_KEYS, keyFromIndex, keyIndex, keyLong } from '../theory/scales';
  import { parseChordSymbol } from '../theory/symbols';
  import { voiceChord } from '../theory/voicing';
  import { voicingChoices, type VoicingPreset, type VoicingChoice } from '../theory/voicingPresets';

  let zoom = $state(44);
  let scroller = $state<HTMLDivElement>();
  let timelineWidth = $state(600);
  let regionDialog = $state<HTMLDialogElement>();
  let chartDialog = $state<HTMLDialogElement>();
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
  let pasted = $state('');
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
  const document = $derived.by(() => {
    void composition.revision;
    return currentSequence();
  });
  const chart = $derived(sequenceChart(document));
  /** Melody lane: pitch range of the tune and the chord under each note (for rest / colour / lean / pull). */
  const melodyRange = $derived.by(() => {
    const pitches = (document.melody ?? []).map((n) => n.pitch);
    return pitches.length ? [Math.min(...pitches), Math.max(...pitches)] : [60, 72];
  });
  const parsedSteps = $derived(
    document.steps.map((s) => ({ start: s.start, end: s.start + s.beats, chord: parseChordSymbol(s.symbol) })),
  );
  function melodyIn(rowStart: number, rowEnd: number) {
    const [lo, hi] = melodyRange;
    return (document.melody ?? [])
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
          top: 3 + 24 * (1 - (n.pitch - lo) / Math.max(1, hi - lo)),
          title: `${n.pitch} · ${role === 'none' ? 'no chord' : role}`,
        };
      });
  }
  const unit = $derived(beatQuarters(document.denominator));
  const barLength = $derived(barQuarters(document.meter, document.denominator));
  const snap = $derived(notatedQuarters(settings.editor.snapBeats, document.denominator));
  const positionAt = (quarters: number) => meterPosition(quarters, document.meter, document.denominator);
  const selectedIndex = $derived(document.steps.findIndex((s) => s.id === composition.selectedId));
  const selected = $derived(document.steps[selectedIndex]);
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
  const undoable = $derived.by(() => {
    void composition.revision;
    return canUndo();
  });
  const redoable = $derived.by(() => {
    void composition.revision;
    return canRedo();
  });
  const incoming = $derived(inputTimeline());
  const end = $derived(
    [...document.steps, ...incoming].reduce(
      (last, s) => Math.max(last, s.start + s.beats),
      Math.max(0, ...(document.barStyles ?? []).map((entry) => (entry.bar + 1) * barLength)),
    ),
  );
  const length = $derived(
    Math.max(barLength * settings.editor.visibleBars, Math.ceil((end + barLength * 2) / barLength) * barLength),
  );
  const barsPerRow = $derived(Math.max(1, Math.floor(timelineWidth / (document.meter * zoom))));
  const beatsPerRow = $derived(barsPerRow * barLength);
  const beatWidth = $derived(timelineWidth / beatsPerRow);
  const rows = $derived(Array.from({ length: Math.ceil(length / beatsPerRow) }, (_, i) => i * beatsPerRow));
  const regions = $derived(sequenceRegions(document));
  const playing = $derived(!!ui.nowPlaying && ui.sourceId === `sequence:${document.id}`);
  const playBeat = $derived((ui.playbackPosition * document.bpm) / 60000);
  const focusBeat = $derived(playing || ui.playbackPaused ? playBeat : (selected?.start ?? composition.cursor));
  const localKey = $derived(sequenceKeyAt(document, focusBeat));
  const cursorBeat = $derived(playing || ui.playbackPaused || ui.playbackPosition > 0 ? playBeat : composition.cursor);

  $effect(() => {
    void document.id;
    popup = false;
  });
  $effect(() => {
    if (composition.input) popup = false;
  });
  $effect(() => {
    if (drag) return;
    const focus = composition.take ? recordingBeat() : playing ? playBeat : (incoming.at(-1)?.start ?? selected?.start);
    if (focus === undefined || !scroller) return;
    const rowStart = Math.floor((focus + 1e-8) / beatsPerRow) * beatsPerRow;
    const row = scroller.querySelector<HTMLElement>(`[data-start="${rowStart}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    if (top < scroller.scrollTop || top + row.offsetHeight > scroller.scrollTop + scroller.clientHeight)
      scroller.scrollTop = Math.max(0, top - 12);
  });

  function editRegion(at: number, region?: KeyRegion) {
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
    audition([voicing], 'edit-preview', notatedQuarters(duration, document.denominator), symbol, velocity);
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
  <div class="sequence-heading">
    <input
      class="sequence-title"
      aria-label="Song title"
      value={document.title}
      onchange={(e) => editSequence((s) => s.update({ title: e.currentTarget.value }))}
    >
    <div class="row tight">
      <button
        type="button"
        class="icon"
        aria-label="Undo"
        title="Undo (Ctrl/Cmd Z)"
        disabled={!undoable}
        onclick={() => editSequence((e) => e.undo())}
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        class="icon"
        aria-label="Redo"
        title="Redo (Ctrl/Cmd Shift Z)"
        disabled={!redoable}
        onclick={() => editSequence((e) => e.redo())}
      >
        <Icon name="redo" />
      </button>
      <details class="sequence-menu settings">
        <summary aria-label="Song actions" title="Song actions"><Icon name="more" /></summary>
        <div class="settings-panel">
          <button type="button" onclick={newSequence}>New song</button>
          <button type="button" onclick={duplicateSequence}>Duplicate song</button>
          <button type="button" onclick={exportSequenceMidi} disabled={!document.steps.length}>Export MIDI</button>
          <button type="button" onclick={() => chartDialog?.showModal()}>Paste chord chart</button>
          <div class="row">
            <span class="small muted">Transpose</span
            ><button type="button" aria-label="Transpose down" onclick={() => editSequence((e) => e.transpose(-1))}>
              −1
            </button><button
              type="button"
              aria-label="Transpose up"
              onclick={() => editSequence((e) => e.transpose(1))}
            >
              +1
            </button>
          </div>
          <label class="small"
            ><span>Piano guide</span>
            <input
              type="checkbox"
              checked={session.songGuide}
              onchange={(e) => {
                session.songGuide = e.currentTarget.checked;
                session.onChange();
              }}
            ></label
          >
          <button type="button" onclick={deleteSequence}>Delete song</button>
        </div>
      </details>
    </div>
  </div>
  <Transport />
  <div
    class="song-status small"
    class:warn={!ui.savedLocally}
    title={ui.savedLocally
      ? 'Songs are saved in this browser, on this device.'
      : 'Browser storage is unavailable. Keep this page open and export MIDI.'}
  >
    {ui.savedLocally ? 'Saved on this device' : 'Not saved'}
  </div>
  <div class="sequence-meta">
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
        value={document.denominator ?? 4}
        onchange={(e) => editSequence((s) => s.update({ denominator: +e.currentTarget.value }))}
      >
        {#each METER_DENOMINATORS as denominator}
          <option value={denominator}>{denominator}</option>
        {/each}
      </select>
    </fieldset>
    <span class="region-context small muted">{localKey ? keyLong(localKey) : 'Auto key'}</span>
    <button
      type="button"
      class="icon"
      title="Add a key region at the cursor"
      aria-label="Add key change"
      onclick={() => editRegion(composition.cursor)}
    >
      <Icon name="key" />
    </button>
    <button
      type="button"
      class="song-style"
      aria-label={`Song style: ${playbackStyle(document.style).name}`}
      title="Default playback style; individual bars can override it"
      disabled={ui.recording}
      onclick={() =>
        (styleTarget = {
          bar: null,
          previewBar: Math.floor((selected?.start ?? document.steps[0]?.start ?? 0) / barLength),
        })}
    >
      <Icon name="chord" size={14} /><span>{playbackStyle(document.style).name}</span><Icon name="down" size={12} />
    </button>
    <span class="timeline-position small muted" aria-live="off" title="Click or drag the bar ruler to seek"
      >Bar {positionAt(cursorBeat).bar} · beat {+positionAt(cursorBeat).beat.toFixed(2)}</span
    >
    <span class="right row tight timeline-zoom"
      ><button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={zoom <= 24}
        onclick={() => (zoom = Math.max(24, zoom - 10))}
      >
        <Icon name="minus" />
      </button><button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= 94}
        onclick={() => (zoom = Math.min(94, zoom + 10))}
      >
        <Icon name="plus" />
      </button></span
    >
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
      {@const head = composition.take
        ? recordingBeat()
        : playing || ui.playbackPosition > 0
          ? playBeat
          : composition.cursor}
      <div class="chord-timeline timeline-row" class:has-melody={!!document.melody?.length} data-start={rowStart}>
        {#each Array.from({ length: barsPerRow }, (_, i) => Math.round(rowStart / barLength) + i) as bar}
          {@const style = barPlaybackStyle(document, bar)}
          <button
            type="button"
            class="timeline-bar-style"
            class:overridden={document.barStyles?.some((entry) => entry.bar === bar)}
            style:left={`${(bar * barLength - rowStart) * beatWidth}px`}
            style:width={`${barLength * beatWidth}px`}
            aria-label={`Style for bar ${bar + 1}: ${style.name}`}
            title={`Bar ${bar + 1} · ${style.name} — click to change accompaniment`}
            disabled={ui.recording}
            onclick={() => (styleTarget = { bar, previewBar: bar })}
          >
            <Icon name="chord" size={12} /><span>{style.name}</span><Icon name="down" size={11} />
          </button>
        {/each}
        {#each regions.filter((region) => region.start >= rowStart - 1e-8 && region.start < rowEnd - 1e-8) as region}
          {@const next = regions[regions.indexOf(region) + 1]?.start ?? length}
          <div
            class="key-change-marker"
            class:current={focusBeat >= region.start - 1e-8 && focusBeat < next - 1e-8}
            style:left={`${(region.start - rowStart) * beatWidth}px`}
          >
            <button
              type="button"
              class="key-change-handle"
              aria-label={`Edit key region at beat ${+(region.start / unit + 1).toFixed(4)}`}
              title={`${region.label ? region.label + ' · ' : ''}${region.key ? keyLong(region.key) : 'Auto key'} — click to edit`}
              onclick={() => editRegion(region.start, region)}
            >
              <Icon name="key" size={12} />
            </button>
          </div>
        {/each}
        {#each Array.from(
          { length: barsPerRow * document.meter },
          (_, i) => rowStart + notatedQuarters(i, document.denominator),
        ) as beat}
          <button
            type="button"
            class="timeline-ruler"
            class:insertion={composition.cursor >= beat - 1e-8 && composition.cursor < beat + unit - 1e-8}
            data-beat={beat}
            class:bar-start={positionAt(beat).beat === 1}
            class:key-boundary={regions.some(
              (region) => region.start >= beat - 1e-8 && region.start < beat + unit - 1e-8,
            )}
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
            class:insertion={composition.cursor >= beat - 1e-8 && composition.cursor < beat + unit - 1e-8}
            aria-current={composition.cursor >= beat - 1e-8 && composition.cursor < beat + unit - 1e-8
              ? 'location'
              : undefined}
            class:bar-start={positionAt(beat).beat === 1}
            style:left={`${(beat - rowStart) * beatWidth}px`}
            style:width={`${beatWidth * unit}px`}
            aria-label={`Add chord at bar ${positionAt(beat).bar} beat ${positionAt(beat).beat}`}
            title="Click to add a chord"
            onclick={() => openAt(beat)}
          >
            <span><Icon name="plus" size={14} /></span>
          </button>
        {/each}
        {#each document.steps as step, i (step.id)}
          {@const at = drag?.id === step.id ? drag.at : step.start}
          {@const beats = drag?.id === step.id ? drag.beats : step.beats}
          {#if at < rowEnd - 1e-8 && at + beats > rowStart + 1e-8}
            <div
              class="timeline-clip"
              class:selected={step.id === composition.selectedId}
              class:input-replacement={composition.input?.target.selectedId === step.id}
              class:playing={playing && playBeat >= step.start && playBeat < step.start + step.beats}
              style:left={`${Math.max(0, at - rowStart) * beatWidth + 2}px`}
              style:width={`${Math.max(18, (Math.min(at + beats, rowEnd) - Math.max(at, rowStart)) * beatWidth - 4)}px`}
            >
              <button
                type="button"
                class="clip-body f-{chart.chords[i].roman?.func ?? ''}"
                aria-label={`Edit ${step.symbol} at beat ${+(step.start / unit + 1).toFixed(4)}`}
                title={`${step.symbol} · ${+(step.beats / unit).toFixed(2)} beats · play to replace, drag to move, Esc to append`}
                onpointerdown={(e) => beginDrag(e, step, 'move', true)}
                onclick={(e) => {
                  if (e.detail !== 0 && suppressChordClick) {
                    suppressChordClick = false;
                    return;
                  }
                  void openAt(step.start, step);
                }}
              >
                <b>{at < rowStart ? '↳ ' : ''}{step.symbol}</b
                ><span class="c-roman">{chart.chords[i].roman?.numeral ?? ''}</span>
              </button>
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
        {#if document.melody?.length}
          <div
            class="melody-lane"
            role="img"
            aria-label="Melody: green rests on the chord, blue colours it, amber and red rub"
          >
            {#each melodyIn(rowStart, rowEnd) as n (n.id)}
              <div
                class="melody-note {n.role}"
                style:left={`${n.left}px`}
                style:width={`${n.width}px`}
                style:top={`${n.top}px`}
                title={n.title}
              ></div>
            {/each}
          </div>
        {/if}
        {#each incoming.filter((s) => s.start < rowEnd - 1e-8 && s.start + s.beats > rowStart + 1e-8) as step (step.id)}
          <div
            class="timeline-input"
            class:recording={!!composition.take}
            title={composition.take
              ? 'Recording'
              : composition.input
                ? `Saves after ${settings.editor.inputIdleMs} ms of idle input; ${composition.input?.target.selectedId ? 'replaces the selected chord' : 'appends at the end'}`
                : 'Live analysis — playback and previews do not edit the song'}
            style:left={`${Math.max(0, step.start - rowStart) * beatWidth + 2}px`}
            style:width={`${Math.max(18, (Math.min(step.start + step.beats, rowEnd) - Math.max(step.start, rowStart)) * beatWidth - 4)}px`}
          >
            <b>{step.symbol}</b
            ><span class="small input-status"
              >{composition.take
                ? 'Recording'
                : !composition.input
                  ? 'Live analysis'
                  : composition.input?.target.selectedId
                    ? 'Replacing…'
                    : 'Adding…'}</span
            >
          </div>
        {/each}

        {#if head >= rowStart && head < rowEnd}
          <div
            class={playing || ui.playbackPosition > 0 || composition.take ? 'timeline-playhead' : 'timeline-cursor'}
            class:recording={!!composition.take}
            style:left={`${(head - rowStart) * beatWidth}px`}
            aria-hidden="true"
          ></div>
        {/if}
      </div>
    {/each}
  </div>
  <div class="timeline-caption muted small">
    {settings.editor.autoCaptureChords
      ? composition.selectedId
        ? 'Play to replace selected chord · Esc to append'
        : 'Play to append at the end · click a beat to type'
      : 'Click a beat to add · drag chords to arrange · drag the ruler to seek'}
  </div>

  {#if styleTarget}
    <StylePicker
      sequence={document}
      bar={styleTarget.bar}
      previewBar={styleTarget.previewBar}
      onclose={() => (styleTarget = null)}
      onapply={(style) =>
        editSequence((editor) =>
          styleTarget?.bar === null ? editor.setStyle(style ?? 'once') : editor.setBarStyle(styleTarget!.bar!, style),
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
            title="Preview"
            disabled={!symbol.trim()}
            onclick={preview}
          >
            <Icon name="ear" />
          </button>
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
                    audition(
                      h.chords.map((c) => voiceChord(c, selected.notes)),
                      `reharm:${i}`,
                      selected.beats / h.chords.length,
                      h.label,
                      selected.velocity,
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
  <dialog bind:this={chartDialog} class="region-dialog" aria-label="Insert chord chart">
    <h3>Insert chords at the cursor</h3>
    <textarea aria-label="Paste chord chart" bind:value={pasted} rows="4" placeholder="| Dm7 G7 | Cmaj7 |"></textarea>
    <div class="row">
      <button type="button" onclick={() => chartDialog?.close()}>Cancel</button
      ><button
        type="button"
        disabled={!pasted.trim()}
        onclick={() => {
          importChart(pasted);
          if (!composition.error) {
            pasted = '';
            chartDialog?.close();
          }
        }}
      >
        Insert chart
      </button>
    </div>
  </dialog>
</div>
