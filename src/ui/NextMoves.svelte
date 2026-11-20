<script lang="ts">
  import Icon from './Icon.svelte';
  import KeyWheel from './KeyWheel.svelte';
  import { audition, session, settings, ui } from './store.svelte';
  import { ALL_KEYS, type Key, keyEq, keyIndex, keyLong, keyShort } from '../theory/scales';
  import {
    acceptChords,
    acceptPath,
    compositionContext,
    suggestionDestination,
    focusedChord,
    composition,
    currentSequence,
    previewInContext,
  } from './composition.svelte';
  import DragHandle from './DragHandle.svelte';
  import { barQuarters } from '../theory/meter';
  import { suggestNext, suggestPaths, type NextMove, type Path } from '../engine/coach';
  type Idea = { id: string; kind: 'chord'; move: NextMove } | { id: string; kind: 'route'; path: Path; to: Key };
  const destination = $derived(suggestionDestination());
  const v = $derived.by(() => {
    void ui.tick;
    const context = compositionContext();
    const key = context.key;
    const moves = key
      ? suggestNext(key, context.last, session.style, context.voicing, context.recent, settings.prediction)
      : [];
    const ideas: Idea[] =
      key && session.target && !keyEq(key, session.target)
        ? suggestPaths(key, session.target, context.last, context.voicing, session.style).map((path) => ({
            id: `route:${keyIndex(session.target!)}:${path.id}`,
            kind: 'route' as const,
            path,
            to: session.target!,
          }))
        : moves.map((move) => ({ id: `next:${move.name}`, kind: 'chord' as const, move }));
    const practice = session.practice;
    return {
      ideas,
      key,
      target: session.target,
      velocity: focusedChord().step?.velocity ?? settings.editor.velocity,
      practice: practice ? { ...practice, steps: practice.path.steps } : null,
    };
  });
  const names = (idea: Idea) => (idea.kind === 'chord' ? [idea.move.name] : idea.path.steps.map((s) => s.name));
  /** A bar per chord from the cursor: what the idea would fill when placed there. */
  function span(idea: Idea) {
    const doc = currentSequence();
    const bar = barQuarters(doc.meter, doc.denominator);
    return { start: composition.cursor, end: composition.cursor + bar * names(idea).length };
  }
  /** Hear the idea after the chord before it (with the melody); Shift: the idea alone. */
  function preview(idea: Idea, alone: boolean) {
    if (!alone) previewInContext(span(idea), names(idea));
    else if (idea.kind === 'chord') audition([idea.move.voicing], idea.id, 2, idea.move.name, v.velocity);
    else
      audition(
        idea.path.steps.map((s) => s.voicing),
        idea.id,
        2,
        `${keyShort(idea.to)} · ${idea.path.technique}`,
        v.velocity,
      );
  }
  function add(idea: Idea) {
    if (idea.kind === 'chord') acceptChords([{ symbol: idea.move.name, notes: idea.move.voicing }]);
    else acceptPath(idea.path, idea.to);
  }
</script>

<div class="card next idea-list">
  <div class="ideas-heading">
    <span class="label">Ideas{v.target ? ` · to ${keyShort(v.target)}` : ''}</span>
    {#if v.target}
      <button
        type="button"
        class="icon"
        aria-label="Show next chord ideas"
        title="Back to next chords"
        onclick={() => session.setTarget(null)}
      >
        <Icon name="close" size={14} />
      </button>
    {/if}
  </div>
  <p class="suggestion-destination small muted">
    {destination.position} ·
    {v.target ? 'Routes from the focused chord' : 'Click to hear it after the chord before · drag ⠿ into the timeline'}
  </p>
  {#if !settings.panels.map}
    <select
      aria-label="Explore a destination key"
      value={v.target ? String(keyIndex(v.target)) : 'chords'}
      onchange={(e) => session.setTarget(e.currentTarget.value === 'chords' ? null : ALL_KEYS[+e.currentTarget.value])}
    >
      <option value="chords">Next chords</option>
      {#each ALL_KEYS as key}
        <option value={String(keyIndex(key))} disabled={keyEq(key, v.key)}>{keyLong(key)}</option>
      {/each}
    </select>
  {/if}
  {#if v.practice}
    {@const practice = v.practice}
    <div class="practice-summary">
      <span>{practice.done ? 'Route complete' : `Play ${practice.steps[practice.index].name}`}</span
      ><button type="button" class="link" onclick={() => session.stopPractice()}>Finish practice</button>
    </div>
  {/if}
  <section class="scroll" aria-label="Chord and key-change ideas">
    {#if !v.ideas.length}
      <p class="muted small">Add or play a chord to explore what could follow.</p>
    {/if}
    {#each v.ideas as idea (idea.id)}
      {@const name = idea.kind === 'chord' ? idea.move.name : idea.path.steps.map((s) => s.name).join(' → ')}
      {@const why = idea.kind === 'chord' ? idea.move.why : idea.path.explain}
      <div class="idea-option compact-idea" class:playing={ui.playingId === idea.id}>
        <div class="move-row">
          <button
            type="button"
            class="move idea-preview f-{idea.kind === 'chord' ? idea.move.func : 'route'}"
            aria-label={`Preview ${name}`}
            title={why}
            onclick={(e) => preview(idea, e.shiftKey)}
          >
            <span class="m-name">{name}</span>
            <span class="m-roman">{idea.kind === 'chord' ? idea.move.roman : `→ ${keyShort(idea.to)}`}</span>
            <span class="m-why">{idea.kind === 'chord' ? why : idea.path.technique}</span>
          </button>
          <DragHandle
            idea={idea.kind === 'chord'
              ? { kind: 'slot', names: names(idea) }
              : { kind: 'run', names: names(idea), beats: span(idea).end - span(idea).start }}
            label={name}
            onplace={() => add(idea)}
          />
        </div>
        {#if idea.kind === 'route'}
          <details class="idea-detail">
            <summary>Why this route</summary>
            <p class="small muted">{why}</p>
            <button
              type="button"
              class="link"
              onclick={() => {
                session.setTarget(idea.to);
                session.startPractice(idea.path);
              }}
            >
              Practise route
            </button>
          </details>
        {/if}
      </div>
    {/each}
  </section>
  {#if settings.panels.map}
    <KeyWheel compact />
  {/if}
</div>
