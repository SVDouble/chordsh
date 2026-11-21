<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import { PLAYBACK_STYLES, STYLE_GROUPS, playbackStyle } from '../engine/accompaniment';
  import { sequencePiece, type Sequence } from '../engine/sequence';
  import { barQuarters } from '../theory/meter';
  import { composition } from './composition.svelte';
  import { previewArrangement, settings, stopAudition, ui } from './store.svelte';

  let {
    sequence,
    bar,
    previewBar,
    onapply,
    onclose,
  }: {
    sequence: Sequence;
    bar: number | null;
    previewBar: number;
    onapply: (style: string | null) => void;
    onclose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let choice = $state('');
  let previewing = false;
  /** The style that plays at this bar without a marker of its own (what "no change" continues). */
  const before = $derived(
    playbackStyle(
      bar ? (sequence.styleMarks?.filter((m) => m.bar < bar).at(-1)?.style ?? sequence.style) : sequence.style,
    ),
  );
  const marked = $derived(!!bar && !!sequence.styleMarks?.some((m) => m.bar === bar));
  const selected = $derived(choice ? playbackStyle(choice) : before);
  const start = $derived(previewBar * barQuarters(sequence.meter, sequence.denominator));
  const hasChords = $derived(
    sequence.steps.some(
      (step) =>
        step.start < start + barQuarters(sequence.meter, sequence.denominator) && step.start + step.beats > start,
    ),
  );

  function preview() {
    const song = {
      ...sequence,
      barStyles: [
        ...(sequence.barStyles ?? []).filter((entry) => entry.bar !== previewBar),
        { bar: previewBar, style: selected.id },
      ],
    };
    const piece = sequencePiece(song, $state.snapshot(settings.editor), { melody: composition.mutedTracks.melody });
    const at = (start * 60000) / sequence.bpm;
    const length = (barQuarters(sequence.meter, sequence.denominator) * 60000) / sequence.bpm;
    previewing = true;
    previewArrangement(
      {
        ...piece,
        durationMs: length,
        notes: piece.notes
          .filter(([t, d]) => t < at + length && t + d > at)
          .map(([t, d, n, v]) => [Math.max(t, at) - at, Math.min(t + d, at + length) - Math.max(t, at), n, v]),
      },
      `${selected.name} preview`,
    );
  }
  function stopPreview() {
    if (!previewing) return;
    previewing = false;
    stopAudition();
  }
  function close() {
    stopPreview();
    onclose();
  }
  onMount(() => {
    choice =
      bar === null || bar === 0
        ? (sequence.style ?? 'once')
        : (sequence.styleMarks?.find((mark) => mark.bar === bar)?.style ?? '');
    dialog.showModal();
    return stopPreview;
  });
</script>

<dialog
  bind:this={dialog}
  class="style-picker"
  aria-label={bar === null ? 'Project playback style' : `Playback style for bar ${bar + 1}`}
  onclose={close}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      stopPreview();
      onapply(choice || null);
      close();
    }}
  >
    <div class="row">
      <strong>{bar === null ? 'Project style' : bar === 0 ? 'Opening style' : `Style from bar ${bar + 1}`}</strong>
      <button type="button" class="icon right" aria-label="Close style picker" title="Close" onclick={close}>
        <Icon name="close" />
      </button>
    </div>
    <select aria-label="Playback style" bind:value={choice} onchange={stopPreview}>
      {#if bar}
        <option value="">{marked ? 'Remove this change' : 'No change here'} (continue {before.name})</option>
      {/if}
      {#each STYLE_GROUPS as group}
        <optgroup label={group}>
          {#each PLAYBACK_STYLES.filter((style) => style.group === group) as style}
            <option value={style.id}>{style.name}</option>
          {/each}
        </optgroup>
      {/each}
    </select>
    <p class="small muted">{selected.description}</p>
    <div class="style-pattern" role="img" aria-label={`${selected.name}: chord and bass rhythm across one bar`}>
      {#each ['chord', 'bass'] as part}
        <div class="style-pattern-line">
          <span>{part === 'chord' ? 'Chords' : 'Bass'}</span>
          <div class="style-pattern-track">
            {#each selected.hits.filter((hit) => hit.part === part) as hit}
              <i
                style:left={`${(hit.at / selected.cycle) * 100}%`}
                style:width={`${(Math.min(hit.beats, selected.cycle - hit.at) / selected.cycle) * 100}%`}
              ></i>
            {/each}
            {#if selected.id === 'once' && part === 'chord'}
              <i style="left:0;width:95%"></i>
            {/if}
          </div>
        </div>
      {/each}
    </div>
    <div class="row">
      <button
        type="button"
        class="icon"
        disabled={!hasChords || ui.recording}
        aria-label="Preview playback style"
        title={hasChords ? `Hear ${selected.name} in bar ${previewBar + 1}` : 'Add a chord to this bar to preview'}
        onclick={preview}
      >
        <Icon name="ear" />
      </button>
      <span class="small muted"
        >{bar === null || bar === 0
          ? 'From the start, until the first style change'
          : 'From this bar until the next style change'}</span
      >
      <button type="submit" class="icon right active" aria-label="Apply playback style" title="Apply style">
        <Icon name="check" />
      </button>
    </div>
  </form>
</dialog>
