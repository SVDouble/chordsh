<script lang="ts">
  import { audition, session, ui } from './store.svelte';
  import { keyLong } from '../theory/scales';

  let scroller: HTMLDivElement;

  const v = $derived.by(() => {
    ui.tick;
    const items = session.history.slice(-40);
    const col = new Map(items.map((h, i) => [h.id, i + 1]));
    // Patterns become brackets under the chips; stack overlapping ones on separate rows.
    const rowEnd: number[] = [];
    const pats = session.patterns
      .filter((p) => col.has(p.endId))
      .map((p) => ({ ...p, a: col.get(p.startId) ?? 1, b: col.get(p.endId)! }))
      .sort((x, y) => x.a - y.a)
      .map((p) => {
        let row = rowEnd.findIndex((end) => end < p.a);
        if (row < 0) row = rowEnd.push(0) - 1;
        rowEnd[row] = p.b;
        return { ...p, row: row + 2 };
      });
    return {
      items: items.map((h) =>
        h.type === 'chord'
          ? { ...h, numeral: h.roman?.numeral ?? '', func: h.roman?.func ?? '', kind: h.roman?.kind ?? '', label: '' }
          : { ...h, label: (h.from ? '→ ' : '') + keyLong(h.key) },
      ),
      pats,
      melody: session.melody.slice(-32).map((m) => ({ ...m })),
    };
  });

  $effect(() => {
    v.items.length;
    scroller?.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' });
  });
</script>

<section class="card history">
  <h2>
    Progression
    <span class="muted small">— click a chord to hear it again</span>
    <button class="ghost right" onclick={() => session.clear()}>Clear</button>
  </h2>
  <div class="h-scroll" bind:this={scroller}>
    {#if !v.items.length}<p class="muted">Your chords will appear here, with their function in the key.</p>{/if}
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
        <div class="bracket b-{p.kind}" style="grid-column:{p.a} / {p.b + 1}; grid-row:{p.row}">{p.label}</div>
      {/each}
    </div>
  </div>
  <div class="melody">
    <span class="muted small">Melody</span>
    {#each v.melody as m (m.id)}
      <span class="mel r-{m.role?.kind}" title={m.over ? `${m.role?.label} over ${m.over}` : ''}>
        <b>{m.name}</b><i>{m.role?.label ?? m.degree ?? ''}</i>
      </span>
    {/each}
  </div>
</section>
