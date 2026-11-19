<script lang="ts">
  import { audition, session, ui } from './store.svelte';
  import { keyLong } from '../theory/scales';

  let scroller: HTMLDivElement;

  const v = $derived.by(() => {
    ui.tick;
    const items = session.history.slice(-40);
    const col = new Map(items.map((h, i) => [h.id, i + 1]));
    // Patterns become brackets under the chips; overlapping ones stack on separate rows.
    const rowEnd: number[] = [];
    const pats = session.patterns
      .filter((p) => col.has(p.endId))
      .map((p) => ({ ...p, a: col.get(p.startId) ?? 1, b: col.get(p.endId)! }))
      // cadences claim the first bracket row; loops and cycles fill in where there is room
      .sort((x, y) => Number(x.kind === 'cycle' || x.kind === 'loop') - Number(y.kind === 'cycle' || y.kind === 'loop') || x.a - y.a)
      .map((p) => {
        let row = rowEnd.findIndex((end) => end < p.a);
        if (row < 0) row = rowEnd.push(0) - 1;
        rowEnd[row] = p.b;
        return { ...p, row: row + 2 };
      })
      .filter((p) => p.row <= 3);
    return {
      items: items.map((h) =>
        h.type === 'chord'
          ? { ...h, numeral: h.roman?.numeral ?? '', func: h.roman?.func ?? '', kind: h.roman?.kind ?? '', label: '' }
          : { ...h, label: (h.from ? '→ ' : '') + keyLong(h.key) },
      ),
      pats,
      melody: session.melody.slice(-24).map((m) => ({ ...m })),
    };
  });

  $effect(() => {
    v.items.length;
    scroller?.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' });
  });
</script>

<div class="card history">
  <div class="h-head">
    <div class="label">Progression
      {#if v.items.length}<button class="link" onclick={() => session.clear()}>clear</button>{/if}
    </div>
    <div class="func-legend small" title="Chord function in the key">
      <span class="fl f-T">tonic</span><span class="fl f-PD">predominant</span><span class="fl f-D">dominant</span><span class="fl f-?">chromatic</span>
    </div>
    {#if v.melody.length}
      <div class="melody" title="Melody notes and their role over the chord (blue = chord tone, amber = tension, red = outside)">
        {#each v.melody as m (m.id)}
          <span class="mel r-{m.role?.kind}" title={m.over ? `${m.role?.label} over ${m.over}` : ''}><b>{m.name}</b><i>{m.role?.label ?? m.degree ?? ''}</i></span>
        {/each}
        <span class="label inline">melody</span>
      </div>
    {/if}
  </div>
  <div class="h-scroll" bind:this={scroller}>
    {#if !v.items.length}<p class="muted small">Your chords appear here with their function in the key — click one to hear it again.</p>{/if}
    <div class="h-grid">
      {#each v.items as h, i (h.id)}
        {#if h.type === 'chord'}
          <button class="chip f-{h.func} k-{h.kind}" style="grid-column:{i + 1}" onclick={() => audition([h.notes], '', 1.5)} title={h.roman?.explain}>
            <span class="c-name">{h.name}</span>
            <span class="c-roman">{h.numeral}{h.count > 1 ? ` ×${h.count}` : ''}</span>
            {#if h.pivot}<span class="c-pivot" title="Pivot chord">{h.pivot.from} = {h.pivot.to}</span>{/if}
          </button>
        {:else}
          <div class="keychange" style="grid-column:{i + 1}">{h.label}</div>
        {/if}
      {/each}
      {#each v.pats as p (p.startId + p.kind)}
        <div class="bracket b-{p.kind}" style="grid-column:{p.a} / {p.b + 1}; grid-row:{p.row}" title={p.label}>{p.label}</div>
      {/each}
    </div>
  </div>
</div>
