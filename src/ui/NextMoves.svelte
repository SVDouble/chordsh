<script lang="ts">
  import Icon from './Icon.svelte';
  import { audition, session, ui } from './store.svelte';
  import { keyShort } from '../theory/scales';
  import Route from './Route.svelte';
  import { acceptChords, compositionContext, suggestionDestination } from './composition.svelte';
  import { suggestNext } from '../engine/coach';

  const destination = $derived(suggestionDestination());

  const target = $derived.by(() => {
    void ui.tick;
    return session.target;
  });

  const moves = $derived.by(() => {
    void ui.tick; // re-run when the engine changes
    const context = compositionContext();
    const suggestions = context.key ? suggestNext(context.key, context.last, session.style, context.voicing) : [];
    return suggestions.map((m) => ({ ...m, id: `next:${m.name}` }));
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
  <p class="suggestion-destination small muted" title={`Suggestions will be added to ${destination.title}`}>
    Add to {destination.title} · {destination.position}
  </p>
  <div class="scroll">
    {#if ui.nextTab === 'key'}
      <Route />
    {:else}
      {#if !moves.length}
        <p class="muted small">Play a few chords or choose a key for your song to hear suggestions.</p>
      {/if}
      {#each moves as m (m.id)}
        <div class="move-row">
          <button
            type="button"
            class="move f-{m.func}"
            class:playing={ui.playingId === m.id}
            onclick={() => audition([m.voicing], m.id, 2, m.name)}
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
          <button
            type="button"
            class="accept-move"
            title={`Add ${m.name} to ${destination.title} at ${destination.position}`}
            aria-label={`Add ${m.name} to sequence`}
            onclick={() => acceptChords([{ symbol: m.name, notes: m.voicing }])}
          >
            <Icon name="plus" />
          </button>
        </div>
      {/each}
    {/if}
  </div>
</div>
