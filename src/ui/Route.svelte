<script lang="ts">
  import Icon from './Icon.svelte';
  import { audition, session, ui } from './store.svelte';
  import { findPivots, suggestPaths } from '../engine/coach';
  import { acceptPath, compositionContext } from './composition.svelte';
  import { commonTones, fifthsDistance, keyLong, keyShort } from '../theory/scales';

  const v = $derived.by(() => {
    void ui.tick; // re-run when the engine changes
    const context = compositionContext();
    const from = context.key,
      to = session.target;
    const p = session.practice;
    return {
      from,
      to,
      paths: from && to ? suggestPaths(from, to, context.last, context.voicing, session.style) : [],
      pivots: from && to ? findPivots(from, to, session.style).slice(0, 4) : [],
      info:
        from && to ? `${fifthsDistance(from, to)} steps on the circle · ${commonTones(from, to)}/7 notes shared` : '',
      practice: p ? { ...p, steps: p.path.steps } : null,
      likely: context.reach
        .filter((r) => r.relation !== 'home')
        .sort((a, b) => b.likelihood - a.likelihood)
        .slice(0, 5),
    };
  });
</script>

<div class="panel route">
  {#if !v.to || !v.from}
    <p class="muted">
      Click a key on the tonal map to get several ways there from where you are — explained, playable and practisable.
    </p>
    {#if v.likely.length && v.from}
      <div class="label">Most natural destinations now</div>
      <div class="row">
        {#each v.likely as r}
          <button type="button" class="pill" onclick={() => session.setTarget(r.key)}>
            {keyLong(r.key)} <span class="muted">· {r.relation}</span>
          </button>
        {/each}
      </div>
    {/if}
  {:else if v.practice}
    {@const p = v.practice}
    <div class="row">
      <b>Practise {p.path.technique} → {keyShort(v.to)}</b
      ><button type="button" class="link right" onclick={() => session.stopPractice()}>stop</button>
    </div>
    <div class="row steps">
      {#each p.steps as s, i}
        <span class="step f-{s.func}" class:done={i < p.index} class:current={i === p.index && !p.done}>
          <b>{s.name}</b><i>{s.romanTo}</i>
        </span>
      {/each}
    </div>
    {#if p.done}
      <p class="success">Arrived in {keyLong(v.to)} 🎉 — try it from another key, the moves are the same.</p>
    {:else}
      <p>Play <b>{p.steps[p.index].name}</b> — any voicing or inversion counts.</p>
      {#if p.hit.length}
        <p class="small">✓ {p.hit.join(', ')}</p>
      {/if}
      {#if p.missing.length}
        <p class="small warn">missing: {p.missing.join(', ')}</p>
      {/if}
      <button type="button" onclick={() => audition([p.steps[p.index].voicing], 'hint')}>Hear it</button>
    {/if}
  {:else}
    <div class="row">
      <b class="route-title">{keyShort(v.from)} → {keyShort(v.to)}</b><span class="muted small">{v.info}</span>
      <button type="button" class="link right" onclick={() => session.setTarget(null)}>clear</button>
    </div>
    {#if v.pivots.length}
      <div class="row small">
        <span class="muted">Shared chords:</span>
        {#each v.pivots as p}
          <span class="pill" title={p.kind}>
            {p.name} <span class="muted">{p.fromNumeral} → {p.toNumeral}</span>
          </span>
        {/each}
      </div>
    {:else}
      <p class="small muted">No shared chords — use a dominant, a °7 or a tritone sub to jump.</p>
    {/if}
    {#each v.paths as path (path.id)}
      <div class="path" class:playing={ui.playingId === path.id}>
        <div class="path-head">
          <b>{path.technique}</b>
          <span class="right row tight">
            <button
              type="button"
              aria-label={`Preview ${path.technique}`}
              title={`Preview ${path.technique}`}
              onclick={() =>
                audition(
                  path.steps.map((s) => s.voicing),
                  path.id,
                )}
            >
              <Icon name="play" />
            </button>
            <button
              type="button"
              class="icon"
              aria-label={`Add ${path.technique} to sequence`}
              title="Add transition to sequence"
              onclick={() => acceptPath(path)}
            >
              <Icon name="plus" />
            </button>
            <button type="button" onclick={() => session.startPractice(path)}>Practise</button>
          </span>
        </div>
        <div class="row steps">
          {#each path.steps as s, i}
            <span class="step f-{s.func}" class:current={ui.playingId === path.id && ui.playingStep === i}>
              <b>{s.name}</b><i>{s.romanFrom} → {s.romanTo}</i>
            </span>
          {/each}
        </div>
        <div class="small muted">{path.explain}</div>
      </div>
    {/each}
  {/if}
</div>
