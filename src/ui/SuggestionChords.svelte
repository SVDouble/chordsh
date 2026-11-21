<script lang="ts">
  import { parseChordSymbol } from '../theory/symbols';
  import { analyzeRoman, type Roman } from '../theory/roman';
  import type { Key } from '../theory/scales';
  import { settings, ui } from './store.svelte';
  let {
    names,
    key = null,
    numerals,
    borrowedFrom,
    previewId,
  }: {
    names: string[];
    key?: Key | null;
    numerals?: Roman[];
    borrowedFrom?: (string | null)[];
    previewId?: string;
  } = $props();

  const playing = $derived.by(() => {
    const preview = ui.previewScore;
    if (!previewId || preview?.id !== previewId || preview.status !== 'playing' || ui.playingStep < 0) return -1;
    if (preview.cues[preview.active]?.stage !== 'idea') return -1;
    return preview.cues.slice(0, preview.active).filter((cue) => cue.stage === 'idea').length;
  });
</script>

<div class="suggestion-chords" class:single={names.length === 1}>
  {#each names as name, index}
    {@const chord = parseChordSymbol(name)}
    {@const roman = numerals?.[index] ?? (chord && key ? analyzeRoman(chord, key) : null)}
    {@const source = borrowedFrom?.[index]}
    <span class="suggestion-step">
      {#if index}
        <span class="suggestion-arrow" aria-hidden="true">→</span>
      {/if}
      <span
        class="suggestion-chord f-{roman?.func ?? '?'}"
        class:borrowed={!!source}
        class:playing={index === playing}
        aria-current={index === playing ? 'step' : undefined}
        title={source ? `${name} · Borrowed from ${source}` : undefined}
      >
        {#if settings.preferences.romanNumeralsFirst && roman}
          <b>{roman.numeral}</b>
          <small>{name}</small>
        {:else}
          <b>{name}</b>
          {#if roman}
            <small>{roman.numeral}</small>
          {/if}
        {/if}
      </span>
    </span>
  {/each}
</div>
