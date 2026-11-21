<script lang="ts">
  import { keyAt } from '../engine/advisor';
  import { suggestSequences, type SequenceIdea, type Tradition } from '../engine/sequences';
  import { meterPosition } from '../theory/meter';
  import IdeaPreview from './IdeaPreview.svelte';
  import SuggestionChords from './SuggestionChords.svelte';
  import SuggestionRating from './SuggestionRating.svelte';
  import SuggestionScoreLegend from './SuggestionScoreLegend.svelte';
  import { scoreParts, suggestionScoreScale } from './suggestionScores';
  import IdeaTags from './IdeaTags.svelte';
  import { schemaTitle, suggestionHarmony } from './suggestionHarmony';
  import { progressionContext } from './progressionContext';
  import { RULEBOOKS } from '../engine/rules';
  import {
    assist,
    composition,
    currentSequence,
    habits,
    previewSuggestion,
    suggestionScope,
    useSequence,
  } from './composition.svelte';

  let { bars, perBar, tradition }: { bars: number; perBar: number; tradition: Tradition } = $props();

  const v = $derived.by(() => {
    void composition.revision;
    const doc = currentSequence();
    const { bar, span, straddles } = suggestionScope(bars);
    const context = progressionContext(doc, span);
    const key = keyAt(doc, span.start);
    const ideas = straddles
      ? []
      : suggestSequences({
          key,
          ...context,
          span,
          meter: bar,
          count: bars * perBar,
          style: assist.style,
          tradition,
          stats: habits.stats,
          adventurous: assist.adventurous,
          limit: 6,
        });
    return {
      span,
      ideas,
      straddles,
      from: meterPosition(span.start, doc.meter, doc.denominator).bar,
      key,
      before: context.before,
      afterChord: context.after,
    };
  });
  const rows = $derived(
    v.ideas.map((idea) => ({
      idea,
      parts: scoreParts({
        anchor: idea.anchor,
        motion: idea.motion,
        melody: idea.melody,
        focus: idea.rules,
        patterns: idea.habit,
      }),
    })),
  );
  const scale = $derived(suggestionScoreScale(rows.map(({ parts }) => parts)));
  const rulebook = $derived(RULEBOOKS.find((book) => book.id === assist.style)?.name ?? 'Harmony rules');
  const previewId = (idea: SequenceIdea) => `sequence:${v.span.start}:${idea.names.join(' ')}`;
  function preview(idea: SequenceIdea, inContext: boolean) {
    const info = { id: previewId(idea), key: v.key, sources: [rulebook, ...idea.reasons] };
    previewSuggestion(v.span, idea.names, { info, inContext, beats: (v.span.end - v.span.start) / idea.names.length });
  }
</script>

<div class="sequence-ideas">
  {#if v.straddles}
    <p class="small muted">Bar {v.from} starts inside a chord.</p>
  {/if}
  <ol class="sequence-list">
    {#each rows as { idea, parts } (idea.names.join(' '))}
      {@const harmony = suggestionHarmony(idea.names, v.key, v.before.at(-1) ?? null, v.afterChord)}
      <li class="sequence-idea">
        <IdeaPreview
          previewId={previewId(idea)}
          idea={{ kind: 'run', names: idea.names, beats: v.span.end - v.span.start }}
          class="suggestion-entry rated-idea"
          title={[...idea.reasons, ...idea.idioms].join(' · ')}
          label={`Hear ${idea.names.join(' → ')} once`}
          onpreview={(inContext) => preview(idea, inContext)}
          onplace={() => useSequence(v.span, idea.names)}
        >
          <div class="suggestion-harmony">
            <SuggestionChords
              names={idea.names}
              key={v.key}
              numerals={harmony.proposed}
              borrowedFrom={harmony.borrowedFrom}
              previewId={previewId(idea)}
            />
            <IdeaTags
              tags={[
                ...(idea.schema ? [{ label: schemaTitle(idea.schema) }] : []),
                ...harmony.colourTags,
                ...harmony.tags.map((label) => ({ label })),
              ]}
            />
          </div>
          <SuggestionRating {parts} maxTotal={scale.maxTotal} />
        </IdeaPreview>
      </li>
    {/each}
  </ol>
  <SuggestionScoreLegend categories={scale.categories} />
</div>
