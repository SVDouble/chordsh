<script lang="ts">
  import { DEFAULT_SETTINGS, MUSIC_LIMITS } from '../config/settings';
  import { tick } from 'svelte';
  import {
    acceptChords,
    canRedo,
    canUndo,
    captureProgression,
    composition,
    currentSequence,
    deleteSequence,
    editSequence,
    exportSequenceMidi,
    importChart,
    newSequence,
    selectStep,
    selectTimeline,
  } from './composition.svelte';
  import { audition, seekPlayback, session, settings, ui } from './store.svelte';
  import { sequenceChart, type SequenceStep } from '../engine/sequence';
  import { reharmHints } from '../engine/reharm';
  import { ALL_KEYS, keyFromIndex, keyIndex, keyLong } from '../theory/scales';
  import { parseChordSymbol } from '../theory/symbols';
  import { voiceChord } from '../theory/voicing';

  let zoom = $state(44);
  let scroller = $state<HTMLDivElement>();
  let chordInput = $state<HTMLInputElement>();
  let popup = $state(false);
  let editingId = $state<string | null>(null);
  let position = $state(0);
  let symbol = $state('');
  let duration = $state(4);
  let notes = $state('');
  let velocity = $state(DEFAULT_SETTINGS.editor.velocity);
  let pasted = $state('');
  let drag = $state<{
    id: string;
    mode: 'move' | 'resize';
    pointer: number;
    x: number;
    original: number;
    originalBeats: number;
    at: number;
    beats: number;
  } | null>(null);
  const document = $derived.by(() => {
    void composition.revision;
    return currentSequence();
  });
  const chart = $derived(sequenceChart(document));
  const selectedIndex = $derived(document.steps.findIndex((s) => s.id === composition.selectedId));
  const selected = $derived(document.steps[selectedIndex]);
  const hints = $derived(selectedIndex < 0 ? [] : reharmHints(chart, selectedIndex));
  const undoable = $derived.by(() => {
    void composition.revision;
    return canUndo();
  });
  const redoable = $derived.by(() => {
    void composition.revision;
    return canRedo();
  });
  const captured = $derived.by(() => {
    void ui.tick;
    return session.chords.length;
  });
  const end = $derived(document.steps.reduce((last, s) => Math.max(last, s.start + s.beats), 0));
  const length = $derived(
    Math.max(
      document.meter * settings.editor.visibleBars,
      Math.ceil((end + document.meter * 2) / document.meter) * document.meter,
    ),
  );
  const slots = $derived(Array.from({ length }, (_, i) => i));
  const playing = $derived(!!ui.nowPlaying && ui.sourceId === `sequence:${document.id}`);
  const playBeat = $derived((ui.playbackPosition * document.bpm) / 60000);

  $effect(() => {
    if (playing && scroller) {
      const x = playBeat * zoom;
      if (x > scroller.scrollLeft + scroller.clientWidth * 0.8 || x < scroller.scrollLeft)
        scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.25);
    }
  });
  $effect(() => {
    void document.id;
    popup = false;
  });

  async function openAt(at: number, step?: SequenceStep) {
    const existing = step ?? document.steps.find((s) => s.start <= at && s.start + s.beats > at);
    if (existing) selectStep(existing.id);
    else selectTimeline(at);
    editingId = existing?.id ?? null;
    position = existing?.start ?? at;
    symbol = existing?.symbol ?? '';
    duration =
      existing?.beats ??
      Math.min(document.meter, document.steps.find((s) => s.start > at)?.start - at || document.meter);
    notes = existing?.notes.join(' ') ?? '';
    velocity = existing?.velocity ?? settings.editor.velocity;
    popup = true;
    await tick();
    chordInput?.focus();
    chordInput?.select();
  }
  function save() {
    const existing = document.steps.find((s) => s.id === editingId);
    const keepNotes =
      !!notes.trim() && (!existing || symbol === existing.symbol || notes.trim() !== existing.notes.join(' '));
    const input = {
      symbol,
      beats: duration,
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
      acceptChords([input]);
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
    audition([voicing], 'edit-preview', duration, symbol);
  }
  function beginDrag(e: PointerEvent, s: SequenceStep, mode: 'move' | 'resize') {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    selectStep(s.id);
    popup = false;
    drag = {
      id: s.id,
      mode,
      pointer: e.pointerId,
      x: e.clientX,
      original: s.start,
      originalBeats: s.beats,
      at: s.start,
      beats: s.beats,
    };
  }
  function moveDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const delta = Math.round((e.clientX - drag.x) / zoom / settings.editor.snapBeats) * settings.editor.snapBeats;
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
</script>

<svelte:window onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={() => (drag = null)} />
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
        ↶
      </button>
      <button
        type="button"
        class="icon"
        aria-label="Redo"
        title="Redo (Ctrl/Cmd Shift Z)"
        disabled={!redoable}
        onclick={() => editSequence((e) => e.redo())}
      >
        ↷
      </button>
      <button type="button" class="icon" aria-label="New song" title="New song" onclick={newSequence}>＋</button>
      <button
        type="button"
        class="icon"
        aria-label="Export sequence MIDI"
        title="Export MIDI"
        disabled={!document.steps.length}
        onclick={exportSequenceMidi}
      >
        ⇩
      </button>
    </div>
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
    <select
      aria-label="Sequence meter"
      title="Meter"
      value={document.meter}
      onchange={(e) => editSequence((s) => s.update({ meter: +e.currentTarget.value }))}
    >
      {#each Array.from({ length: MUSIC_LIMITS.maxMeter }, (_, i) => i + 1) as n}
        <option value={n}>{n}/4</option>
      {/each}
    </select>
    <select
      aria-label="Sequence key"
      title="Key"
      value={document.key ? String(keyIndex(document.key)) : 'auto'}
      onchange={(e) =>
        editSequence((s) =>
          s.update({ key: e.currentTarget.value === 'auto' ? null : keyFromIndex(+e.currentTarget.value) }),
        )}
    >
      <option value="auto">Auto key</option>
      {#each ALL_KEYS as k}
        <option value={String(keyIndex(k))}>{keyLong(k)}</option>
      {/each}
    </select>
    <span class="right row tight timeline-zoom"
      ><button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={zoom <= 24}
        onclick={() => (zoom = Math.max(24, zoom - 10))}
      >
        −
      </button><button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={zoom >= 94}
        onclick={() => (zoom = Math.min(94, zoom + 10))}
      >
        ＋
      </button></span
    >
  </div>
  {#if composition.error}
    <p class="warn small" role="alert">{composition.error}</p>
  {/if}
  <div class="timeline-scroll" bind:this={scroller}>
    <div class="chord-timeline" style:width={`${length * zoom}px`}>
      {#each slots as beat}
        <button
          type="button"
          class="timeline-ruler"
          class:bar-start={beat % document.meter === 0}
          style:left={`${beat * zoom}px`}
          style:width={`${zoom}px`}
          aria-label={`Seek bar ${Math.floor(beat / document.meter) + 1} beat ${(beat % document.meter) + 1}`}
          onclick={() => {
            selectTimeline(beat);
            seekPlayback((beat * 60000) / document.bpm);
          }}
        >
          {beat % document.meter === 0 ? Math.floor(beat / document.meter) + 1 : '·'}
        </button>
        <button
          type="button"
          class="timeline-slot"
          class:bar-start={beat % document.meter === 0}
          style:left={`${beat * zoom}px`}
          style:width={`${zoom}px`}
          aria-label={`Add chord at bar ${Math.floor(beat / document.meter) + 1} beat ${(beat % document.meter) + 1}`}
          title="Click to add a chord"
          onclick={() => openAt(beat)}
        >
          <span>＋</span>
        </button>
      {/each}
      {#each document.steps as s, i (s.id)}
        {@const at = drag?.id === s.id ? drag.at : s.start}
        {@const width = drag?.id === s.id ? drag.beats : s.beats}
        <div
          class="timeline-clip"
          class:selected={s.id === composition.selectedId}
          class:playing={playing && playBeat >= s.start && playBeat < s.start + s.beats}
          style:left={`${at * zoom + 2}px`}
          style:width={`${Math.max(18, width * zoom - 4)}px`}
        >
          <button
            type="button"
            class="clip-body f-{chart.chords[i].roman?.func ?? ''}"
            aria-label={`Edit ${s.symbol} at beat ${s.start + 1}`}
            onclick={() => openAt(s.start, s)}
          >
            <b>{s.symbol}</b><span class="c-roman">{chart.chords[i].roman?.numeral ?? ''}</span>
          </button>
          <button
            type="button"
            class="clip-drag"
            aria-label={`Move ${s.symbol}`}
            title="Drag to move"
            onpointerdown={(e) => beginDrag(e, s, 'move')}
          >
            ⠿
          </button>
          <button
            type="button"
            class="clip-resize"
            aria-label={`Resize ${s.symbol}`}
            title="Drag to change duration"
            onpointerdown={(e) => beginDrag(e, s, 'resize')}
            onkeydown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                editSequence((ed) =>
                  ed.replace(s.id, {
                    ...s,
                    beats: Math.max(
                      MUSIC_LIMITS.minChordBeats,
                      s.beats + (e.key === 'ArrowRight' ? settings.editor.snapBeats : -settings.editor.snapBeats),
                    ),
                  }),
                );
              }
            }}
          ></button>
        </div>
      {/each}
      {#if playing || ui.playbackPosition > 0}
        <div class="timeline-playhead" style:left={`${playBeat * zoom}px`} aria-hidden="true"></div>
      {:else}
        <div class="timeline-cursor" style:left={`${composition.cursor * zoom}px`} aria-hidden="true"></div>
      {/if}
    </div>
  </div>
  <div class="timeline-caption muted small">
    Click to add or change a chord · drag to move · drag its edge to resize
  </div>

  {#if popup}
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
          ▶
        </button>
        <button
          type="submit"
          class="icon"
          aria-label={editingId ? 'Save chord' : 'Add chord'}
          title={editingId ? 'Save chord' : 'Add chord'}
          disabled={!symbol.trim()}
        >
          ✓
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
            ⧉
          </button><button type="button" class="icon" aria-label="Delete chord" title="Delete" onclick={removeSelected}>
            ⌫
          </button>
        {/if}
        <button
          type="button"
          class="icon"
          aria-label="Close chord editor"
          title="Close"
          onclick={() => (popup = false)}
        >
          ×
        </button>
      </div>
      <div class="duration-choices">
        <span class="small muted">Beats</span>
        {#each [0.5, 1, 2, 4, 8] as n}
          <button type="button" class:on={duration === n} onclick={() => (duration = n)}>{n}</button>
        {/each}
        <input
          aria-label="Chord duration"
          type="number"
          min={MUSIC_LIMITS.minChordBeats}
          max={MUSIC_LIMITS.maxChordBeats}
          step="any"
          bind:value={duration}
        >
      </div>
      <details class="voicing-editor">
        <summary>Voicing</summary>
        <div class="row">
          <label>MIDI notes <input aria-label="Voicing MIDI notes" bind:value={notes} placeholder="48 52 55 59"></label
          ><label
            >Velocity <input aria-label="Chord velocity" type="number" min="1" max="127" bind:value={velocity}></label
          >
        </div>
      </details>
    </form>
  {/if}
  {#if selected && hints.length}
    <div class="timeline-ideas">
      <span class="small muted">Try instead</span>
      {#each hints as h, i}
        <span class="idea-chip" title={h.why}
          ><span>{h.names.join(' → ')}</span
          ><button
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
              )}
          >
            ▶
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
            ✓
          </button></span
        >
      {/each}
    </div>
  {/if}
  <details class="sequence-tools">
    <summary>Song tools</summary>
    <div class="row">
      <button type="button" disabled={!captured} onclick={captureProgression}>From playing</button
      ><button
        type="button"
        aria-label="Transpose down"
        title="Transpose down one semitone"
        onclick={() => editSequence((e) => e.transpose(-1))}
      >
        −♯
      </button><button
        type="button"
        aria-label="Transpose up"
        title="Transpose up one semitone"
        onclick={() => editSequence((e) => e.transpose(1))}
      >
        +♯
      </button><button type="button" onclick={deleteSequence}>Delete song</button>
    </div>
    <textarea
      aria-label="Paste chord chart"
      bind:value={pasted}
      rows="3"
      spellcheck="false"
      placeholder="| Dm7 G7 | Cmaj7 |"
    ></textarea><button
      type="button"
      disabled={!pasted.trim()}
      onclick={() => {
        importChart(pasted);
        if (!composition.error) pasted = '';
      }}
    >
      Insert chart
    </button><label class="small"
      ><input
        type="checkbox"
        checked={session.songGuide}
        onchange={(e) => {
          session.songGuide = e.currentTarget.checked;
          session.onChange();
        }}
      >
      Piano guide</label
    >
  </details>
</div>
