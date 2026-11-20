<script lang="ts">
  import Icon from './Icon.svelte';
  import DragHandle from './DragHandle.svelte';
  import { advise, type Development, developments, keyAt, STYLES, templates, type Advice } from '../engine/advisor';
  import { noteRole } from '../engine/assist';
  import { barQuarters, meterPosition } from '../theory/meter';
  import { keyLong } from '../theory/scales';
  import { parseChordSymbol } from '../theory/symbols';
  import { voiceChord } from '../theory/voicing';
  import {
    acceptChords,
    assist,
    composition,
    currentSequence,
    developAll,
    developAsVersion,
    previewInContext,
    previewDevelopment,
    fillMelodyGaps,
    insertTemplate,
    selectStep,
  } from './composition.svelte';
  import { ui } from './store.svelte';

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
  /** Pipeline step 4: ways to develop the basic chords that keep the melody intact. */
  const develop = $derived.by(() => {
    void composition.revision;
    return developments(v.doc, v.bar, assist.developLevel);
  });
  /** Hear a development in context: the chord before, the new chords with the melody, the chord after. */
  function hearDevelopment(d: Development, alone = false) {
    const step = v.doc.steps.find((s) => s.id === d.stepId);
    if (step) previewInContext({ start: step.start, end: step.start + step.beats }, d.names, alone);
  }
  function applyDevelopment(d: Development) {
    const step = v.doc.steps.find((s) => s.id === d.stepId);
    if (!step) return;
    selectStep(d.stepId);
    acceptChords(
      d.names.map((symbol) => ({ symbol, beats: step.beats / d.names.length })),
      true,
    );
  }
  const percent = (x: number | null) => (x === null ? '–' : `${Math.round(100 * x)}%`);
  function voicing(idea: Advice) {
    return voiceChord(idea.chord, v.prevNotes);
  }
  /** Hear the idea in context (the chord before → the idea, with the melody → the chord after); Shift: alone. */
  function preview(idea: Advice, alone: boolean) {
    previewInContext(v.span, [idea.name], alone);
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
        <button
          type="button"
          class="chord-idea-main"
          onclick={(e) => preview(idea, e.shiftKey)}
          title="Hear it in context: the chord before → this chord with the melody → the chord after (Shift: alone)"
        >
          <b>{idea.name}</b> <span class="c-roman">{idea.roman}</span>
          <span class="idea-meter" role="img" aria-label={`Score ${percent(idea.total)}`}
            ><span style:width={`${Math.round(100 * idea.total)}%`}></span></span
          >
        </button>
        <DragHandle idea={{ kind: 'slot', names: [idea.name] }} label={idea.name} onplace={() => use(idea)} />
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
  {#if v.doc.steps.length}
    <details class="develop">
      <summary class="small">
        <span class="label">Develop the chords</span>
        <span class="muted">{develop.length} idea{develop.length > 1 ? 's' : ''} that keep the melody</span>
      </summary>
      <label class="small"
        >How much
        <select aria-label="How much to develop" bind:value={assist.developLevel}>
          <option value="light">light: one chord per slot (7ths, substitutes)</option>
          <option value="rich">rich: also add chords (secondary dominants, ii–V, passing °7)</option>
        </select></label
      >
      <ol class="develop-list">
        {#each develop as d (d.stepId)}
          <li class="develop-idea" title={d.why}>
            <span class="small muted">bar {meterPosition(d.start, v.doc.meter, v.doc.denominator).bar}</span>
            <span><b>{d.from}</b> → {d.names.join(' ')}</span>
            <span class="small muted">{d.label}</span>
            <button
              type="button"
              class="icon"
              aria-label={`Hear ${d.names.join(' ')}`}
              title="Hear it in context (Shift: alone)"
              onclick={(e) => hearDevelopment(d, e.shiftKey)}
            >
              <Icon name="ear" size={14} />
            </button>
            <DragHandle
              idea={{ kind: 'slot', names: d.names }}
              label={d.names.join(' ')}
              onplace={() => applyDevelopment(d)}
            />
          </li>
        {/each}
      </ol>
      <div class="row tight develop-all">
        <button type="button" onclick={() => previewDevelopment(null)} title="A: the chords you have now">
          Hear as it is
        </button>
        <button
          type="button"
          disabled={!develop.length}
          onclick={() => previewDevelopment(develop)}
          title="B: with every idea above, without changing the song"
        >
          Hear developed
        </button>
        <button type="button" disabled={!develop.length} onclick={() => developAll(develop)}>
          Use all {develop.length}
        </button>
        <button
          type="button"
          disabled={!develop.length}
          title="Copy the song and develop the copy; the basic version stays in the song list"
          onclick={() => developAsVersion(develop)}
        >
          Keep as a new version
        </button>
      </div>
    </details>
  {/if}
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
    </div>
  </div>
</div>
