<script lang="ts">
  import Icon from './Icon.svelte';
  import { audition, settings, ui } from './store.svelte';
  import { inversionLabel } from '../theory/chords';
  import { keyLong } from '../theory/scales';
  import { focusedChord } from './composition.svelte';
  const FUNC = { T: 'Tonic', PD: 'Predominant', D: 'Dominant', '?': 'Colour' };
  const v = $derived.by(() => {
    const focus = focusedChord();
    return {
      ...focus,
      kind: focus.chord ? 'chord' : 'none',
      key: focus.key ? keyLong(focus.key) : null,
      inversion: focus.chord ? inversionLabel(focus.chord) : '',
      empty: ui.nowPlaying || ui.playbackPaused ? 'Rest' : 'Click the timeline or play a chord.',
    };
  });
</script>

<div class="card now">
  <div class="inspector-heading">
    <span class="label">{v.heading}</span>
    {#if v.notes.length}
      <button
        type="button"
        class="icon"
        aria-label={`Preview ${v.name}`}
        title={`Hear ${v.name}`}
        onclick={() => audition([v.notes], 'inspector', 2, v.name, v.step?.velocity ?? settings.editor.velocity)}
      >
        <Icon name="play" />
      </button>
    {/if}
  </div>
  {#if v.kind === 'none'}
    <p class="muted small">{v.empty}</p>
  {:else}
    <div class="now-top">
      <span class="big">{v.name}</span>
      {#if v.roman}
        <span class="numeral f-{v.roman.func}">{v.roman.numeral}</span>
      {/if}
    </div>
    {#if v.position}
      <p class="small muted">{v.position}</p>
    {/if}
    <div class="badges">
      {#if v.roman}
        <span class="func f-{v.roman.func}">{FUNC[v.roman.func]}</span>
      {/if}
      {#if v.inversion}
        <span class="badge">{v.inversion}</span>
      {/if}
      {#if v.key}
        <span class="muted small">in {v.key}</span>
      {/if}
    </div>
    {#if v.roman}
      <p class="explain">{v.roman.explain}</p>
    {/if}
  {/if}
</div>
