<script lang="ts">
  import { audition, session, ui } from './store.svelte';
  import { findPivots } from '../engine/coach';
  import { commonTones, fifthsDistance, keyEq, keyLong, keyShort } from '../theory/scales';

  const v = $derived.by(() => {
    ui.tick;
    const from = session.activeKey, to = session.target;
    const p = session.practice;
    return {
      from, to,
      paths: session.paths.map((x) => ({ ...x })),
      pivots: from && to ? findPivots(from, to, session.style).slice(0, 4) : [],
      info: from && to ? `${fifthsDistance(from, to)} steps on the circle · ${commonTones(from, to)} of 7 notes in common` : '',
      practice: p ? { ...p, steps: p.path.steps } : null,
      likely: session.reach
        .filter((r) => r.relation !== 'home')
        .sort((a, b) => b.likelihood - a.likelihood)
        .slice(0, 4),
    };
  });
</script>

<section class="card route">
  {#if !v.to || !v.from}
    <h2>Change key</h2>
    <p class="muted">Pick a destination on the tonal map and you'll get several ways to get there from where you are — explained, playable, practisable.</p>
    {#if v.likely.length}
      <p class="small muted">Most natural destinations right now:</p>
      <div class="row">
        {#each v.likely as r}
          <button class="pill" onclick={() => session.setTarget(r.key)}>{keyLong(r.key)} <span class="muted">· {r.relation}</span></button>
        {/each}
      </div>
    {/if}
  {:else if v.practice}
    {@const p = v.practice}
    <h2>Practise: {p.path.technique} → {keyShort(v.to)} <button class="ghost right" onclick={() => session.stopPractice()}>Stop</button></h2>
    <div class="row steps">
      {#each p.steps as s, i}
        <span class="step" class:done={i < p.index} class:current={i === p.index && !p.done}><b>{s.name}</b><i>{s.romanTo}</i></span>
      {/each}
    </div>
    {#if p.done}
      <p class="success">Arrived in {keyLong(v.to)}. 🎉 Try it again in another key — the moves are the same.</p>
    {:else}
      <p>Play <b>{p.steps[p.index].name}</b> — any voicing or inversion counts.</p>
      {#if p.hit.length}<p class="small">✓ {p.hit.join(', ')}</p>{/if}
      {#if p.missing.length}<p class="small warn">missing: {p.missing.join(', ')}</p>{/if}
      <button class="ghost" onclick={() => audition([p.steps[p.index].voicing], 'hint')}>Hear it</button>
    {/if}
  {:else}
    <h2>
      {keyShort(v.from)} → {keyShort(v.to)} <span class="muted small">{v.info}</span>
      <button class="ghost right" onclick={() => session.setTarget(null)}>✕</button>
    </h2>
    {#if v.pivots.length}
      <div class="row small">
        <span class="muted">Shared chords:</span>
        {#each v.pivots as p}<span class="pill" title={p.kind}>{p.name} <span class="muted">{p.fromNumeral} → {p.toNumeral}</span></span>{/each}
      </div>
    {:else}
      <p class="small muted">No shared chords — use a dominant, a °7 or a tritone sub to jump.</p>
    {/if}
    {#each v.paths as path (path.id)}
      <div class="path" class:playing={ui.playingId === path.id}>
        <div class="path-head">
          <b>{path.technique}</b>
          <span class="right">
            <button onclick={() => audition(path.steps.map((s) => s.voicing), path.id)}>▶ Play</button>
            <button onclick={() => session.startPractice(path)}>Practise</button>
          </span>
        </div>
        <div class="row steps">
          {#each path.steps as s, i}
            <span class="step" class:current={ui.playingId === path.id && ui.playingStep === i}>
              <b>{s.name}</b><i>{s.romanFrom} → {s.romanTo}</i>
            </span>
          {/each}
        </div>
        <p class="small muted">{path.explain}</p>
      </div>
    {/each}
    {#if keyEq(v.from, v.to)}<p class="muted">You're already there.</p>{/if}
  {/if}
</section>
