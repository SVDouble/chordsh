<script lang="ts">
  import { settings } from './store.svelte';
  import { Pane, PaneGroup, PaneResizer } from 'paneforge';
  import NowPlaying from './NowPlaying.svelte';
  import NextMoves from './NextMoves.svelte';
  import KeyWheel from './KeyWheel.svelte';
  import Editor from './Editor.svelte';

  const left = $derived(settings.panels.now || settings.panels.next);
  const count = $derived(1 + Number(left) + Number(settings.panels.map));
</script>

<PaneGroup direction="horizontal" autoSaveId={`musify-workspace-${left}-${settings.panels.map}`} class="workspace">
  {#if left}
    <Pane id="assistant" order={1} defaultSize={count === 3 ? 34 : 32} minSize={18}>
      <section class="pane left">
        {#if settings.panels.now}
          <NowPlaying />
        {/if}
        {#if settings.panels.next}
          <NextMoves />
        {/if}
      </section>
    </Pane>
    <PaneResizer class="pane-resizer" aria-label="Resize suggestions" />
  {/if}
  {#if settings.panels.map}
    <Pane id="tonal-map" order={2} defaultSize={count === 3 ? 29 : 32} minSize={16}>
      <section class="pane centre"><KeyWheel /></section>
    </Pane>
    <PaneResizer class="pane-resizer" aria-label="Resize tonal map" />
  {/if}
  <Pane id="music" order={3} defaultSize={count === 3 ? 37 : count === 2 ? 68 : 100} minSize={25}>
    <section class="pane right">
      <div class="tab-body">
        <Editor />
      </div>
    </section>
  </Pane>
</PaneGroup>
