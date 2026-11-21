<script lang="ts">
  import Icon from './Icon.svelte';
  import { settings, ui } from './store.svelte';
  import { chordFromIntervals, inversionLabel } from '../theory/chords';
  import { mod12 } from '../theory/pitch';
  import { keyLong } from '../theory/scales';
  import { focusedChord, previewChords } from './composition.svelte';
  const FUNC = { T: 'Tonic', PD: 'Predominant', D: 'Dominant', '?': 'Colour' };
  const v = $derived.by(() => {
    const focus = focusedChord();
    const bass = focus.notes.length ? mod12(Math.min(...focus.notes)) : focus.chord?.bass;
    const chord = focus.chord;
    const voiced =
      chord && bass !== chord.bass
        ? chordFromIntervals(
            chord.root,
            chord.tones.map((tone) => tone.interval),
            bass,
          )
        : chord;
    return {
      ...focus,
      kind: focus.chord ? 'chord' : 'none',
      keyName: focus.key ? keyLong(focus.key) : null,
      inversion: voiced ? inversionLabel(voiced) : '',
      empty: ui.nowPlaying || ui.playbackPaused ? 'Rest' : '—',
    };
  });
  const previewing = $derived(ui.previewScore?.status === 'playing');
  const sounding = $derived(previewing || v.heading === 'Playing' || !!ui.playing?.length);

  function hearChord() {
    if (previewing) return;
    previewChords(
      [v.name],
      { id: 'inspector', key: v.key },
      v.notes.length ? [v.notes] : undefined,
      v.step?.beats ?? 2,
      v.step?.velocity ?? settings.editor.velocity,
      v.step?.start,
    );
  }
</script>

<div class="card now">
  <div class="inspector-chord">
    {#if v.kind === 'none'}
      <span class="muted">{v.empty}</span>
    {:else}
      <div class="now-top">
        <span class="big" title={v.name}>{v.name}</span>
        {#if v.roman}
          <span class="numeral f-{v.roman.func}">{v.roman.numeral}</span>
          <span class="func f-{v.roman.func}">{FUNC[v.roman.func]}</span>
        {/if}
      </div>
    {/if}
    {#if v.heading === 'Recording' || v.heading === 'Paused'}
      <span class="label inspector-status">{v.heading}</span>
    {/if}
    {#if v.chord}
      <button
        type="button"
        class="icon"
        class:sounding
        aria-disabled={previewing}
        aria-label={previewing ? `Playing ${v.name}` : `Hear ${v.name}`}
        title={previewing ? `Playing ${v.name}` : `Hear ${v.name}`}
        onclick={hearChord}
      >
        <Icon name="volume" size={15} />
      </button>
    {/if}
  </div>
  {#if v.kind !== 'none'}
    <div
      class="inspector-meta small muted"
      title={[v.position, ...(ui.previewScore?.sources ?? [])].filter(Boolean).join(' · ')}
    >
      {[v.keyName, v.inversion].filter(Boolean).join(' · ')}
    </div>
  {/if}
</div>
