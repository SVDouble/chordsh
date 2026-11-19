<script lang="ts">
  import { audition, session, ui } from './store.svelte';
  import { keyShort } from '../theory/scales';
  import Route from './Route.svelte';

  const target = $derived.by(() => {
    void ui.tick;
    return session.target;
  });

  const moves = $derived.by(() => {
    void ui.tick; // re-run when the engine changes
    return session.next.map((m) => ({ ...m, id: `next:${m.name}` }));
  });
</script>

<div class="card next">
  <div class="label" title="Click a move to hear it from your current hand position">Where next</div>
  <nav class="tabs next-tabs" aria-label="Suggestions">
    <button type="button" class:on={ui.nextTab === 'chords'} onclick={() => (ui.nextTab = 'chords')}>Next chord</button>
    <button type="button" class:on={ui.nextTab === 'key'} onclick={() => (ui.nextTab = 'key')}>
      Change key{target ? ` → ${keyShort(target)}` : ''}
    </button>
  </nav>
  <div class="scroll">
    {#if ui.nextTab === 'key'}
      <Route />
    {:else}
      {#if !moves.length}
        <p class="muted small">Suggestions appear once a key is established.</p>
      {/if}
      {#each moves as m (m.id)}
        <button
          type="button"
          class="move f-{m.func}"
          class:playing={ui.playingId === m.id}
          onclick={() => audition([m.voicing], m.id)}
          title={m.why}
        >
          <span class="m-name">{m.name}</span>
          <span class="m-roman">{m.roman}</span>
          <span class="m-why">
            {#if m.tag}
              <em class="tag">{m.tag}</em>
            {/if}
            {m.why}
          </span>
          <span class="m-bar" style="--p:{m.prob}"></span>
        </button>
      {/each}
    {/if}
  </div>
</div>
