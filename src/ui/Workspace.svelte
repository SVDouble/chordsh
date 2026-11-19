<script lang="ts">
  import { Pane, PaneGroup, PaneResizer } from 'paneforge';
  import { ui } from './store.svelte';
  import NowPlaying from './NowPlaying.svelte';
  import NextMoves from './NextMoves.svelte';
  import KeyWheel from './KeyWheel.svelte';
  import History from './History.svelte';
  import Library from './Library.svelte';
  import Editor from './Editor.svelte';
  import { currentSequence, selectSequence } from './composition.svelte';

  const left = $derived(ui.panels.now || ui.panels.next);
  const count = $derived(1 + Number(left) + Number(ui.panels.map));
</script>

<PaneGroup direction="horizontal" autoSaveId={`musify-workspace-${left}-${ui.panels.map}`} class="workspace">
  {#if left}
    <Pane id="assistant" order={1} defaultSize={count === 3 ? 34 : 32} minSize={18}>
      <section class="pane left">
        {#if ui.panels.now}
          <NowPlaying />
        {/if}
        {#if ui.panels.next}
          <NextMoves />
        {/if}
      </section>
    </Pane>
    <PaneResizer class="pane-resizer" aria-label="Resize suggestions" />
  {/if}
  {#if ui.panels.map}
    <Pane id="tonal-map" order={2} defaultSize={count === 3 ? 29 : 32} minSize={16}>
      <section class="pane centre"><KeyWheel /></section>
    </Pane>
    <PaneResizer class="pane-resizer" aria-label="Resize tonal map" />
  {/if}
  <Pane id="music" order={3} defaultSize={count === 3 ? 37 : count === 2 ? 68 : 100} minSize={25}>
    <section class="pane right">
      <nav class="tabs">
        <button type="button" class:on={ui.tab === 'editor'} onclick={() => selectSequence(currentSequence().id)}>
          Editor
        </button>
        <button type="button" class:on={ui.tab === 'progression'} onclick={() => (ui.tab = 'progression')}>Live</button>
        <button type="button" class:on={ui.tab === 'library'} onclick={() => (ui.tab = 'library')}>Library</button>
      </nav>
      <div class="tab-body">
        {#if ui.tab === 'progression'}
          <History />
        {:else if ui.tab === 'editor'}
          <Editor />
        {:else}
          <Library />
        {/if}
      </div>
    </section>
  </Pane>
</PaneGroup>
