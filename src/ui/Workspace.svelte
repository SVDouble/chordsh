<script lang="ts">
  import { settings } from './store.svelte';
  import { Pane, PaneGroup, PaneResizer } from 'paneforge';
  import NowPlaying from './NowPlaying.svelte';
  import NextMoves from './NextMoves.svelte';
  import ChordIdeas from './ChordIdeas.svelte';
  import SequenceIdeas from './SequenceIdeas.svelte';
  import KeyWheel from './KeyWheel.svelte';
  import Editor from './Editor.svelte';
  const harmony = $derived(settings.panels.now || settings.panels.next || settings.panels.map);
  const circle = $derived(settings.panels.next || settings.panels.map);
  type Tab = 'circle' | 'ideas' | 'sequences';
  /** The left column's tab, remembered in this browser (a convenience only). */
  let tab = $state<Tab>(remembered());
  function remembered(): Tab {
    try {
      const t = localStorage.getItem('chordsh-harmony-tab');
      if (t === 'circle' || t === 'ideas' || t === 'sequences') return t;
    } catch {
      /* storage unavailable: use the default */
    }
    return 'circle';
  }
  function choose(t: Tab) {
    tab = t;
    try {
      localStorage.setItem('chordsh-harmony-tab', t);
    } catch {
      /* storage unavailable */
    }
  }
  const shown = $derived(tab === 'circle' && !circle ? 'ideas' : tab);
</script>

<PaneGroup direction="horizontal" autoSaveId={`chordsh-harmony-v3-${harmony}`} class="workspace">
  {#if harmony}
    <Pane id="harmony" order={1} defaultSize={34} minSize={25} maxSize={50}>
      <aside class="pane harmony-pane" aria-label="Harmony exploration">
        {#if settings.panels.now}
          <NowPlaying />
        {/if}
        <div class="harmony-tabs" role="tablist" aria-label="Harmony tools">
          {#if circle}
            <button type="button" role="tab" aria-selected={shown === 'circle'} onclick={() => choose('circle')}>
              Circle
            </button>
          {/if}
          <button type="button" role="tab" aria-selected={shown === 'ideas'} onclick={() => choose('ideas')}>
            Chord ideas
          </button>
          <button type="button" role="tab" aria-selected={shown === 'sequences'} onclick={() => choose('sequences')}>
            Sequences
          </button>
        </div>
        {#if shown === 'circle'}
          {#if settings.panels.next}
            <NextMoves />
          {:else}
            <KeyWheel compact />
          {/if}
        {:else if shown === 'ideas'}
          <ChordIdeas />
        {:else}
          <SequenceIdeas />
        {/if}
      </aside>
    </Pane>
    <PaneResizer class="pane-resizer" aria-label="Resize harmony and timeline" />
  {/if}
  <Pane id="timeline" order={2} defaultSize={harmony ? 66 : 100} minSize={45}>
    <section class="pane right timeline-panel">
      <div class="tab-body"><Editor /></div>
    </section>
  </Pane>
</PaneGroup>
