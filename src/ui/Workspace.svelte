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
</script>

<PaneGroup direction="horizontal" autoSaveId={`chordsh-harmony-v3-${harmony}`} class="workspace">
  {#if harmony}
    <Pane id="harmony" order={1} defaultSize={34} minSize={25} maxSize={50}>
      <aside class="pane harmony-pane" aria-label="Harmony exploration">
        {#if settings.panels.now}
          <NowPlaying />
        {/if}
        <ChordIdeas />
        <SequenceIdeas />
        {#if settings.panels.next}
          <NextMoves />
        {:else if settings.panels.map}
          <KeyWheel compact />
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
