<script lang="ts">
  import Icon from './Icon.svelte';
  import { advise, keyAt, STYLES, templates, type Advice } from '../engine/advisor';
  import { noteRole } from '../engine/assist';
  import { barQuarters, meterPosition } from '../theory/meter';
  import { keyLong } from '../theory/scales';
  import { parseChordSymbol } from '../theory/symbols';
  import { voiceChord } from '../theory/voicing';
  import {
    acceptChords,
    assist,
    clearMelody,
    composition,
    currentSequence,
    fillMelodyGaps,
    insertTemplate,
  } from './composition.svelte';
  import { audition, settings, ui } from './store.svelte';

  /** The slot being harmonised: the selected chord, or the bar at the insertion cursor. */
  const v = $derived.by(() => {
    void composition.revision;
    void ui.tick;
    const doc = currentSequence();
    const bar = barQuarters(doc.meter, doc.denominator);
    const selected = doc.steps.find((s) => s.id === composition.selectedId) ?? null;
    const start = selected ? selected.start : Math.floor(composition.cursor / bar + 1e-8) * bar;
    const span = { start, end: selected ? selected.start + selected.beats : start + bar };
    const prevStep = doc.steps.filter((s) => s.start + s.beats <= span.start + 1e-8).at(-1) ?? null;
    const nextStep = doc.steps.find((s) => s.start >= span.end - 1e-8) ?? null;
    const melody = (doc.melody ?? []).map(({ start, beats, pitch }) => ({ start, beats, pitch }));
    const inSlot = melody.filter((n) => n.start < span.end - 1e-8 && n.start + n.beats > span.start + 1e-8);
    const key = keyAt(doc, span.start);
    const prev = prevStep ? parseChordSymbol(prevStep.symbol) : null;
    const next = nextStep ? parseChordSymbol(nextStep.symbol) : null;
    const ideas = advise({
      key,
      prev,
      next,
      melody: melody.filter((n) => n.start < span.end + 2 && n.start + n.beats > span.start - 1),
      span,
      meter: bar,
      style: assist.style,
      adventurous: assist.adventurous,
      limit: 8,
    });
    const current = selected ? parseChordSymbol(selected.symbol) : null;
    const roles = current ? inSlot.map((n) => noteRole(n.pitch, current)) : [];
    return {
      doc,
      bar,
      selected,
      span,
      key,
      ideas,
      inSlot,
      roles,
      prevNotes: prevStep?.notes ?? null,
      where: meterPosition(span.start, doc.meter, doc.denominator),
      templates: templates(key),
      hasMelody: !!doc.melody?.length,
    };
  });
  const percent = (x: number | null) => (x === null ? '–' : `${Math.round(100 * x)}%`);
  function voicing(idea: Advice) {
    return voiceChord(idea.chord, v.prevNotes);
  }
  function preview(idea: Advice) {
    audition([voicing(idea)], `idea:${idea.name}`, 2, `${idea.name} · ${idea.roman}`, settings.editor.velocity);
  }
  function use(idea: Advice) {
    const input = { symbol: idea.name, notes: voicing(idea), beats: v.span.end - v.span.start };
    acceptChords([input], !!v.selected);
  }
  /** “3 rest, 1 pull”: how the melody sits on the selected chord. */
  function roleSummary(roles: string[]) {
    return ['rest', 'colour', 'lean', 'pull']
      .map((r) => [r, roles.filter((x) => x === r).length] as const)
      .filter(([, n]) => n)
      .map(([r, n]) => `${n} ${r}`)
      .join(', ');
  }
</script>

<div class="card chord-ideas">
  <div class="ideas-heading">
    <span class="label">Chords for the melody</span>
    <span class="small muted">{keyLong(v.key)}</span>
  </div>
  <p class="small muted">
    {v.selected ? `Replacing ${v.selected.symbol}` : 'Adding'} at bar {v.where.bar}{v.where.beat !== 1
      ? ` beat ${+v.where.beat.toFixed(2)}`
      : ''}
    ·
    {#if v.inSlot.length}
      {v.inSlot.length} melody note{v.inSlot.length > 1 ? 's' : ''}{v.roles.length ? ` (${roleSummary(v.roles)})` : ''}
    {:else}
      no melody here, ideas from the neighbouring chords
    {/if}
  </p>
  <div class="row tight chord-ideas-controls">
    <label class="small"
      >Style
      <select aria-label="Style rulebook" bind:value={assist.style}>
        {#each STYLES as s}
          <option value={s.id} title={s.idea}>{s.name}</option>
        {/each}
      </select></label
    >
    <label class="small" title="0 = in-key chords first, 1 = colour chords compete equally"
      >Expected
      <input type="range" min="0" max="1" step="0.1" bind:value={assist.adventurous} aria-label="How adventurous">
      Fresh</label
    >
  </div>
  <ol class="chord-idea-list">
    {#each v.ideas as idea (idea.name)}
      <li class="chord-idea">
        <button type="button" class="chord-idea-main" onclick={() => preview(idea)} title="Preview">
          <b>{idea.name}</b> <span class="c-roman">{idea.roman}</span>
          <span class="idea-meter" role="img" aria-label={`Score ${percent(idea.total)}`}
            ><span style:width={`${Math.round(100 * idea.total)}%`}></span></span
          >
        </button>
        <button
          type="button"
          class="icon"
          aria-label={v.selected ? `Replace with ${idea.name}` : `Add ${idea.name}`}
          title={v.selected ? 'Replace the selected chord' : 'Add at the cursor'}
          onclick={() => use(idea)}
        >
          <Icon name={v.selected ? 'check' : 'plus'} size={14} />
        </button>
        <div class="idea-judges small muted">
          melody {percent(idea.verdicts.melody)} · context {percent(idea.verdicts.context)} · motion
          {percent(idea.verdicts.rules)}
          · style {percent(idea.style)}
        </div>
        <div
          class="idea-why small"
          title={[...idea.pro.map((p) => `✓ ${p}`), ...idea.con.map((c) => `✗ ${c}`)].join('\n')}
        >
          {idea.reasons.slice(0, 2).join(' · ')}{idea.pro.length
            ? ` · ✓ ${idea.pro.length} style rule${idea.pro.length > 1 ? 's' : ''}`
            : ''}{idea.con.length ? ` · ✗ ${idea.con.length}` : ''}
        </div>
      </li>
    {/each}
  </ol>
  <div class="chord-ideas-tools">
    <label class="small"
      >Start from
      <select
        aria-label="Insert a chord template"
        value=""
        onchange={(e) => {
          const t = v.templates.find((x) => x.name === e.currentTarget.value);
          if (t) insertTemplate(t.symbols);
          e.currentTarget.value = '';
        }}
      >
        <option value="">a template…</option>
        {#each v.templates as t}
          <option value={t.name}>{t.symbols.join(' ')} · {t.name}</option>
        {/each}
      </select></label
    >
    <label class="small"
      >Recording captures
      <select aria-label="What recording captures" bind:value={assist.recordTarget}>
        <option value="both">chords and melody</option>
        <option value="melody">melody only</option>
        <option value="chords">chords only</option>
      </select></label
    >
    <div class="row tight">
      <label class="small" title="Harmonic rhythm for filling"
        >per bar
        <select aria-label="Chords per bar when filling" bind:value={assist.perBar}>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select></label
      >
      <button
        type="button"
        onclick={fillMelodyGaps}
        disabled={!v.hasMelody}
        title="One basic chord per bar where the melody has none"
      >
        Fill chords under the melody
      </button>
      <button type="button" onclick={clearMelody} disabled={!v.hasMelody}>Clear melody</button>
    </div>
  </div>
</div>
