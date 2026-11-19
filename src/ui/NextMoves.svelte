<script lang="ts">
  import { audition, session, ui } from './store.svelte';

  const moves = $derived.by(() => {
    ui.tick;
    return session.next.map((m) => ({ ...m, id: `next:${m.name}` }));
  });
</script>

<section class="card next">
  <h2>Where next <span class="muted small">— click to hear it from your current hand position</span></h2>
  {#if !moves.length}<p class="muted">Suggestions appear once a key is established.</p>{/if}
  {#each moves as m (m.id)}
    <button class="move" class:playing={ui.playingId === m.id} onclick={() => audition([m.voicing], m.id)}>
      <span class="m-name">{m.name}</span>
      <span class="m-roman">{m.roman}</span>
      <span class="m-why">{#if m.tag}<em class="tag">{m.tag}</em>{/if}{m.why}</span>
      <span class="m-bar"><i style="width:{Math.round(m.prob * 100)}%"></i></span>
    </button>
  {/each}
</section>
