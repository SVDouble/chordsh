<script lang="ts">
  import Icon from './Icon.svelte';
  import { DEFAULT_SETTINGS, MUSIC_LIMITS } from '../config/settings';
  import { tick } from 'svelte';
  import {
    acceptChords,
    canRedo,
    canUndo,
    inputTimeline,
    commitInputPreview,
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
  import { audition, seekPlayback, session, settings, ui } from './store.svelte';
  import { sequenceChart, sequenceRegions, sequenceKeyAt, type KeyRegion, type SequenceStep } from '../engine/sequence';
  import { reharmHints } from '../engine/reharm';
  import { ALL_KEYS, keyFromIndex, keyIndex, keyLong } from '../theory/scales';
  import { parseChordSymbol } from '../theory/symbols';
  import { voiceChord } from '../theory/voicing';

  let zoom = $state(44);
  let scroller = $state<HTMLDivElement>();
  let timelineWidth = $state(600);
  let regionDialog = $state<HTMLDialogElement>();
  let chartDialog = $state<HTMLDialogElement>();
  let regionStart = $state(0);
  let regionKey = $state('auto');
  let regionLabel = $state('');
  let regionId = $state<string | null>(null);
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
    grab: number;
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
  const hints = $derived(
    selectedIndex < 0
      ? []
      : reharmHints({ ...chart, key: sequenceKeyAt(document, selected?.start ?? 0) ?? chart.key }, selectedIndex),
  );
  const undoable = $derived.by(() => {
    void composition.revision;
    return canUndo();
  });
  const redoable = $derived.by(() => {
    void composition.revision;
    return canRedo();
  });
  const incoming = $derived(inputTimeline());
  const end = $derived([...document.steps, ...incoming].reduce((last, s) => Math.max(last, s.start + s.beats), 0));
  const length = $derived(
    Math.max(
      document.meter * settings.editor.visibleBars,
      Math.ceil((end + document.meter * 2) / document.meter) * document.meter,
    ),
  );
  const barsPerRow = $derived(Math.max(1, Math.floor(timelineWidth / (document.meter * zoom))));
  const beatsPerRow = $derived(barsPerRow * document.meter);
  const beatWidth = $derived(timelineWidth / beatsPerRow);
  const rows = $derived(Array.from({ length: Math.ceil(length / beatsPerRow) }, (_, i) => i * beatsPerRow));
  const regions = $derived(sequenceRegions(document));
  const playing = $derived(!!ui.nowPlaying && ui.sourceId === `sequence:${document.id}`);
  const playBeat = $derived((ui.playbackPosition * document.bpm) / 60000);
  const focusBeat = $derived(playing || ui.playbackPaused ? playBeat : (selected?.start ?? composition.cursor));
  const localKey = $derived(sequenceKeyAt(document, focusBeat));

  $effect(() => {
    void document.id;
    popup = false;
  });
  $effect(() => {
    const focus = composition.take
      ? composition.take.at + (ui.recordingElapsed * composition.take.bpm) / 60000
      : playing
        ? playBeat
        : (incoming.at(-1)?.start ?? selected?.start);
    if (focus === undefined || !scroller) return;
    const row = Math.floor(focus / beatsPerRow);
    const top = row * 192;
    if (top < scroller.scrollTop || top > scroller.scrollTop + scroller.clientHeight - 180)
      scroller.scrollTop = Math.max(0, top - 40);
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
      grab: pointerBeat(e),
      original: s.start,
      originalBeats: s.beats,
      at: s.start,
      beats: s.beats,
    };
  }
  function moveDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.pointer) return;
    const delta = Math.round((pointerBeat(e) - drag.grab) / settings.editor.snapBeats) * settings.editor.snapBeats;
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
  <div class="timeline-scroll wrapped-timeline" bind:this={scroller} bind:clientWidth={timelineWidth}>
    {#each rows as rowStart}
      {@const rowEnd = rowStart + beatsPerRow}
      {@const head = composition.take
        ? composition.take.at + (ui.recordingElapsed * composition.take.bpm) / 60000
        : playing || ui.playbackPosition > 0
          ? playBeat
          : composition.cursor}
      <div class="chord-timeline timeline-row" data-start={rowStart}>
        <section class="key-regions" aria-label={`Key regions from bar ${Math.floor(rowStart / document.meter) + 1}`}>
          {#each regions.filter((r, i) => r.start < rowEnd && (regions[i + 1]?.start ?? length) > rowStart) as region}
            {@const next = regions[regions.indexOf(region) + 1]?.start ?? length}
            <button
              type="button"
              class="key-region"
              class:current={focusBeat >= region.start && focusBeat < next}
              style:left={`${Math.max(0, region.start - rowStart) * beatWidth}px`}
              style:width={`${(Math.min(next, rowEnd) - Math.max(region.start, rowStart)) * beatWidth}px`}
              aria-label={`Edit key region at beat ${region.start + 1}`}
              title={`${region.label ? region.label + ' · ' : ''}${region.key ? keyLong(region.key) : 'Auto key'} — click to edit`}
              onclick={() => editRegion(region.start, region)}
            >
              <Icon name="key" size={12} />
              <span>{region.label ? `${region.label} · ` : ''}{region.key ? keyLong(region.key) : 'Auto key'}</span>
            </button>
          {/each}
        </section>
        {#each Array.from({ length: beatsPerRow }, (_, i) => rowStart + i) as beat}
          <button
            type="button"
            class="timeline-ruler"
            class:bar-start={beat % document.meter === 0}
            style:left={`${(beat - rowStart) * beatWidth}px`}
            style:width={`${beatWidth}px`}
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
            style:left={`${(beat - rowStart) * beatWidth}px`}
            style:width={`${beatWidth}px`}
            aria-label={`Add chord at bar ${Math.floor(beat / document.meter) + 1} beat ${(beat % document.meter) + 1}`}
            title="Click to add a chord"
            onclick={() => openAt(beat)}
          >
            <span><Icon name="plus" size={14} /></span>
          </button>
        {/each}
        {#each document.steps as step, i (step.id)}
          {@const at = drag?.id === step.id ? drag.at : step.start}
          {@const beats = drag?.id === step.id ? drag.beats : step.beats}
          {#if at < rowEnd && at + beats > rowStart}
            <div
              class="timeline-clip"
              class:selected={step.id === composition.selectedId}
              class:playing={playing && playBeat >= step.start && playBeat < step.start + step.beats}
              style:left={`${Math.max(0, at - rowStart) * beatWidth + 2}px`}
              style:width={`${Math.max(18, (Math.min(at + beats, rowEnd) - Math.max(at, rowStart)) * beatWidth - 4)}px`}
            >
              <button
                type="button"
                class="clip-body f-{chart.chords[i].roman?.func ?? ''}"
                aria-label={`Edit ${step.symbol} at beat ${step.start + 1}`}
                onclick={() => openAt(step.start, step)}
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
                            step.beats +
                              (e.key === 'ArrowRight' ? settings.editor.snapBeats : -settings.editor.snapBeats),
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
        {#each incoming.filter((s) => s.start < rowEnd && s.start + s.beats > rowStart) as step (step.id)}
          <div
            class="timeline-input"
            class:recording={!!composition.take}
            style:left={`${Math.max(0, step.start - rowStart) * beatWidth + 2}px`}
            style:width={`${Math.max(50, (Math.min(step.start + step.beats, rowEnd) - Math.max(step.start, rowStart)) * beatWidth - 4)}px`}
          >
            <b>{step.symbol}</b><span class="small">{composition.take ? 'Recording' : 'Input preview'}</span>
            {#if !composition.take}
              <button
                type="button"
                class="icon"
                title="Keep this chord"
                aria-label={`Keep played ${step.symbol}`}
                onclick={commitInputPreview}
              >
                <Icon name="check" />
              </button>
            {/if}
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
          <Icon name="play" />
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
          </button><button type="button" class="icon" aria-label="Delete chord" title="Delete" onclick={removeSelected}>
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
            <Icon name="play" />
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
      <h3>Key region · bar {Math.floor(regionStart / document.meter) + 1}</h3>
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
