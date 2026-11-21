<script lang="ts">
  import Icon from './Icon.svelte';
  import KeyWheel from './KeyWheel.svelte';
  import { session, settings, ui } from './store.svelte';
  import { type Key, keyEq, keyIndex, keyShort } from '../theory/scales';
  import {
    acceptChords,
    acceptPath,
    compositionContext,
    focusedChord,
    composition,
    currentSequence,
    previewSuggestion,
  } from './composition.svelte';
  import IdeaPreview from './IdeaPreview.svelte';
  import SuggestionChords from './SuggestionChords.svelte';
  import IdeaTags from './IdeaTags.svelte';
  import { suggestionHarmony } from './suggestionHarmony';
  import { barQuarters } from '../theory/meter';
  import { suggestNext, suggestPaths, type NextMove, type Path } from '../engine/coach';
  type Idea = { id: string; kind: 'chord'; move: NextMove } | { id: string; kind: 'route'; path: Path; to: Key };
  let showKeys = $state(false);
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
      last: context.last,
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
  const source = (idea: Idea) =>
    idea.kind === 'chord' ? idea.move.source : `Key-change route · ${idea.path.technique}`;
  function preview(idea: Idea, inContext: boolean) {
    const info = {
      id: idea.id,
      key: v.key,
      sources: [source(idea), idea.kind === 'chord' ? idea.move.why : idea.path.explain],
    };
    previewSuggestion(span(idea), names(idea), {
      info,
      inContext,
      voicings: idea.kind === 'chord' ? [idea.move.voicing] : idea.path.steps.map((step) => step.voicing),
      velocity: v.velocity,
    });
  }
  function add(idea: Idea) {
    if (idea.kind === 'chord') acceptChords([{ symbol: idea.move.name, notes: idea.move.voicing }]);
    else acceptPath(idea.path, idea.to);
  }
</script>

<div class="card next idea-list">
  {#if v.target || !settings.panels.map}
    <div class="idea-controls">
      {#if v.target}
        <span class="label">To {keyShort(v.target)}</span>
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
      {#if !settings.panels.map}
        <button
          type="button"
          class="icon"
          aria-label="Explore destination keys"
          title="Explore destination keys"
          aria-expanded={showKeys}
          onclick={() => (showKeys = !showKeys)}
        >
          <Icon name="key" size={15} />
        </button>
      {/if}
    </div>
  {/if}
  {#if v.practice}
    {@const practice = v.practice}
    <div class="practice-summary">
      <span>{practice.done ? 'Route complete' : `Play ${practice.steps[practice.index].name}`}</span
      ><button type="button" class="link" onclick={() => session.stopPractice()}>Finish practice</button>
    </div>
  {/if}
  <section class="scroll next-ideas" aria-label="Chord and key-change ideas">
    {#if !v.ideas.length}
      <p class="muted small">Add or play a chord to explore what could follow.</p>
    {/if}
    {#each v.ideas as idea (idea.id)}
      {@const name = idea.kind === 'chord' ? idea.move.name : idea.path.steps.map((s) => s.name).join(' → ')}
      {@const harmony = suggestionHarmony(names(idea), v.key, v.last, null)}
      {@const why = idea.kind === 'chord' ? idea.move.why : idea.path.explain}
      <div>
        <IdeaPreview
          previewId={idea.id}
          idea={idea.kind === 'chord'
            ? { kind: 'slot', names: names(idea), voicings: [idea.move.voicing] }
            : {
                kind: 'run',
                names: names(idea),
                beats: span(idea).end - span(idea).start,
                voicings: idea.path.steps.map((step) => step.voicing),
                keys: idea.path.steps.map((_, index) => (index === idea.path.steps.length - 1 ? idea.to : v.key)),
              }}
          class="suggestion-entry"
          label={`Hear ${name} once`}
          title={`${why} · ${source(idea)}`}
          onpreview={(inContext) => preview(idea, inContext)}
          onplace={() => add(idea)}
        >
          <SuggestionChords
            names={names(idea)}
            key={v.key}
            numerals={harmony.proposed}
            borrowedFrom={harmony.borrowedFrom}
            previewId={idea.id}
          />
          <IdeaTags
            tags={idea.kind === 'chord'
              ? [
                  {
                    label: { T: 'Tonic', PD: 'Predominant', D: 'Dominant', '?': 'Colour' }[idea.move.func],
                    tone: idea.move.func === 'D' ? 'warm' : idea.move.func === 'T' ? 'good' : 'colour',
                  },
                  ...(idea.move.tag ? [{ label: idea.move.tag, tone: 'colour' as const }] : []),
                  ...harmony.colourTags,
                  ...harmony.tags.map((label) => ({ label })),
                ]
              : [{ label: `To ${keyShort(idea.to)}`, tone: 'colour' }, { label: idea.path.technique }]}
          />
        </IdeaPreview>
        {#if idea.kind === 'route'}
          <button
            type="button"
            class="link small"
            onclick={() => {
              session.setTarget(idea.to);
              session.startPractice(idea.path);
            }}
          >
            Practise route
          </button>
        {/if}
      </div>
    {/each}
  </section>
  {#if settings.panels.map || showKeys}
    <KeyWheel compact />
  {/if}
</div>
