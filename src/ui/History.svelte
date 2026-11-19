<script lang="ts">
  import { audition, session, ui } from './store.svelte';
  import { keyIndex, keyLong } from '../theory/scales';
  import type { ChordEntry } from '../engine/session';

  let scroller: HTMLDivElement;
  const MAX_BARS = 24;

  const v = $derived.by(() => {
    ui.tick;
    const items = session.history;
    const chords = items.filter((h): h is ChordEntry => h.type === 'chord');
    const now = performance.now();
    const fresh = (c: ChordEntry) => !!c.revisedAt && now - c.revisedAt < 2500;
    const patterns = session.patterns;
    const bars = session.bars;
    const tempo = session.tempo;
    const theories = session.theories.map((t) => ({ ...t, idx: keyIndex(t.key) }));

    // ── bar view ──
    let barView: { n: number; t0: number; t1: number; current: boolean; keyChange: string | null; cells: { c: ChordEntry; share: number; cont: boolean; revised: boolean }[]; tags: string[] }[] = [];
    // bars only when there's a real pulse (metronome / file, or a confident estimate) — free playing stays a sequence
    if (bars.length >= 2 && chords.length && (tempo.fixed || tempo.confidence >= 0.55)) {
      const first = chords[0].t0;
      const startBar = Math.max(0, bars.findIndex((_, i) => (bars[i + 1] ?? Infinity) > first));
      const endTime = Math.max(now, chords[chords.length - 1].t1);
      for (let b = startBar; b < bars.length && bars[b] <= endTime; b++) {
        const t0 = bars[b], t1 = bars[b + 1] ?? t0 + (bars[b] - bars[b - 1] || 2000);
        const inBar = chords.filter((c) => c.t1 > t0 && c.t0 < t1);
        const keyAt = items.find((h) => h.type === 'key' && h.from && h.t0 >= t0 && h.t0 < t1);
        const ends = patterns.filter((p) => inBar.some((c) => c.id === p.endId && c.t0 >= t0)).map((p) => p.label);
        barView.push({
          n: b - startBar + 1, t0, t1, current: now >= t0 && now < t1,
          keyChange: keyAt && keyAt.type === 'key' ? `→ ${keyLong(keyAt.key)}` : null,
          cells: inBar.map((c) => ({ c, share: Math.max(0.12, (Math.min(c.t1, t1) - Math.max(c.t0, t0)) / (t1 - t0)), cont: c.t0 < t0 - 1, revised: fresh(c) })),
          tags: [...new Set(ends)],
        });
      }
      barView = barView.slice(-MAX_BARS);
    }

    // ── fallback chip view (no tempo yet) ──
    const recent = items.slice(-40);
    const col = new Map(recent.map((h, i) => [h.id, i + 1]));
    const rowEnd: number[] = [];
    const pats = patterns
      .filter((p) => col.has(p.endId))
      .map((p) => ({ ...p, a: col.get(p.startId) ?? 1, b: col.get(p.endId)! }))
      .sort((x, y) => Number(x.kind === 'cycle' || x.kind === 'loop') - Number(y.kind === 'cycle' || y.kind === 'loop') || x.a - y.a)
      .map((p) => {
        let row = rowEnd.findIndex((end) => end < p.a);
        if (row < 0) row = rowEnd.push(0) - 1;
        rowEnd[row] = p.b;
        return { ...p, row: row + 2 };
      })
      .filter((p) => p.row <= 3);

    return {
      barView, pats, theories, viewing: session.viewTheory,
      chips: recent.map((h) => (h.type === 'chord' ? { ...h, revised: fresh(h), label: '' } : { ...h, label: (h.from ? '→ ' : '') + keyLong(h.key) })),
      tempo: tempo.bpm ? `♩ ${tempo.fixed ? '' : tempo.confidence < 0.5 ? '≈' : ''}${tempo.bpm} · ${tempo.beatsPerBar}/4` : '',
      tempoTitle: tempo.fixed ? 'Fixed tempo (metronome / MIDI file) — bars are exact' : `Tempo and bars estimated from your playing (confidence ${Math.round(tempo.confidence * 100)}%) — they firm up as you keep a steady pulse`,
      melody: session.melody.slice(-24).map((m) => ({ ...m })),
      empty: !chords.length,
    };
  });

  $effect(() => {
    v.barView.length; v.chips.length;
    scroller?.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' });
  });
  const hear = (c: ChordEntry) => audition([c.notes], '', 1.5);
</script>

<div class="card history">
  <div class="h-head">
    <div class="label">Progression
      {#if !v.empty}<button class="link" onclick={() => session.clear()}>clear</button>{/if}
    </div>
    {#if v.tempo}<span class="tempo small" title={v.tempoTitle}>{v.tempo}</span>{/if}
    {#if v.theories.length > 1}
      <div class="theories small" title="Competing explanations of what you've played. Click one to see the progression the way that theory reads it.">
        <span class="muted">theories</span>
        {#each v.theories as th, i}
          <button class="theory" class:on={v.viewing === th.idx || (v.viewing === null && i === 0)}
            onclick={() => session.setViewTheory(i === 0 || v.viewing === th.idx ? null : th.idx)}>
            {th.label} <b>{Math.round(th.prob * 100)}%</b>
          </button>
        {/each}
      </div>
    {/if}
    {#if v.melody.length}
      <div class="melody" title="Melody notes and their role over the chord (blue = chord tone, amber = tension, red = outside)">
        {#each v.melody as m (m.id)}
          <span class="mel r-{m.role?.kind}" title={m.over ? `${m.role?.label} over ${m.over}` : ''}><b>{m.name}</b><i>{m.role?.label ?? m.degree ?? ''}</i></span>
        {/each}
      </div>
    {/if}
  </div>

  <div class="h-scroll" bind:this={scroller}>
    {#if v.empty}
      <p class="muted small">Your chords appear here in bars, with their function in the key. Earlier readings can change when later music explains them better — those flash ↻.</p>
    {:else if v.barView.length}
      <div class="hbars">
        {#each v.barView as bar (bar.t0)}
          <div class="hbar" class:current={bar.current}>
            <div class="hbar-top"><span class="barno">{bar.n}</span>{#if bar.keyChange}<span class="bar-key">{bar.keyChange}</span>{/if}</div>
            <div class="hbar-cells">
              {#each bar.cells as cell (cell.c.id)}
                <button class="hcell f-{cell.c.roman?.func ?? ''} k-{cell.c.roman?.kind ?? ''}" class:cont={cell.cont} class:revised={cell.revised} class:tentative={cell.c.tentative}
                  style="flex:{cell.share}" onclick={() => hear(cell.c)} title={`${cell.c.name} — ${cell.c.roman?.explain ?? ''}${cell.revised ? '\n↻ re-interpreted with hindsight' : ''}`}>
                  <span class="c-name">{cell.cont ? '·' : cell.c.name}</span>
                  {#if !cell.cont}<span class="c-roman">{cell.c.roman?.numeral ?? ''}{cell.revised ? ' ↻' : ''}</span>{/if}
                  {#if cell.c.pivot && !cell.cont}<span class="c-pivot">{cell.c.pivot.from} = {cell.c.pivot.to}</span>{/if}
                </button>
              {/each}
            </div>
            {#if bar.tags.length}<div class="bar-tags">{bar.tags.join(' · ')}</div>{/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="h-grid">
        {#each v.chips as h, i (h.id)}
          {#if h.type === 'chord'}
            <button class="chip f-{h.roman?.func ?? ''} k-{h.roman?.kind ?? ''}" class:revised={h.revised} class:tentative={h.tentative} style="grid-column:{i + 1}" onclick={() => hear(h)} title={h.roman?.explain}>
              <span class="c-name">{h.name}</span>
              <span class="c-roman">{h.roman?.numeral ?? ''}{h.revised ? ' ↻' : ''}</span>
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
    {/if}
  </div>
</div>
