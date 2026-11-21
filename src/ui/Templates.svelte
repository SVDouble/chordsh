<script lang="ts">
  import { keyAt, templates, type Template } from '../engine/advisor';
  import { rateProgression, type Tradition } from '../engine/sequences';
  import { barQuarters } from '../theory/meter';
  import { keyLong } from '../theory/scales';
  import { parseChordSymbol } from '../theory/symbols';
  import IdeaTags from './IdeaTags.svelte';
  import IdeaPreview from './IdeaPreview.svelte';
  import SuggestionChords from './SuggestionChords.svelte';
  import SuggestionRating from './SuggestionRating.svelte';
  import SuggestionScoreLegend from './SuggestionScoreLegend.svelte';
  import { scoreParts, suggestionScoreScale } from './suggestionScores';
  import {
    assist,
    composition,
    currentSequence,
    habits,
    insertTemplate,
    previewSuggestion,
  } from './composition.svelte';
  import { progressionContext } from './progressionContext';
  import { schemaTitle, suggestionHarmony } from './suggestionHarmony';

  let { tradition }: { tradition: Tradition } = $props();
  const context = $derived.by(() => {
    void composition.revision;
    const project = currentSequence();
    const selected = project.steps.find((step) => step.id === composition.selectedId);
    const start = composition.cursor;
    const key = keyAt(project, selected?.start ?? start);
    return { project, start, key, bar: barQuarters(project.meter, project.denominator) };
  });
  const rows = $derived.by(() => {
    const { project, start, key, bar } = context;
    return templates(key)
      .map((template) => {
        const span = { start, end: start + template.symbols.length * bar };
        const surrounding = progressionContext(project, span);
        const harmony = suggestionHarmony(template.symbols, key, surrounding.before.at(-1) ?? null, surrounding.after);
        const rating = rateProgression(
          {
            ...surrounding,
            key,
            span,
            meter: bar,
            style: assist.style,
            tradition,
            stats: habits.stats,
            adventurous: assist.adventurous,
          },
          template.symbols.map(parseChordSymbol).filter((chord) => chord !== null),
        );
        const parts = rating
          ? scoreParts({
              anchor: rating.anchor,
              motion: rating.motion,
              melody: rating.melody,
              focus: rating.rules,
              patterns: rating.habit,
            })
          : [];
        return { template, harmony, parts, score: rating?.score ?? 0 };
      })
      .sort((a, b) => b.score - a.score);
  });
  const scale = $derived(suggestionScoreScale(rows.map(({ parts }) => parts)));
  const previewId = (template: Template) => `template:${context.start}:${template.name}`;

  function preview(template: Template, inContext: boolean) {
    const { start, key, bar } = context;
    previewSuggestion({ start, end: start + template.symbols.length * bar }, template.symbols, {
      info: { id: previewId(template), key, sources: [template.name] },
      inContext,
    });
  }
</script>

<div class="sequence-ideas">
  <div class="ideas-heading">
    <span class="small muted">{keyLong(context.key)}</span>
  </div>
  <ol class="sequence-list" aria-label="Progression templates">
    {#each rows as { template, harmony, parts } (template.name)}
      {@const name = schemaTitle(template.name)}
      <li>
        <IdeaPreview
          previewId={previewId(template)}
          idea={{ kind: 'run', names: template.symbols, beats: template.symbols.length * context.bar }}
          class="suggestion-entry rated-idea"
          title={template.name}
          label={`Hear ${name}: ${template.symbols.join(' → ')}`}
          onpreview={(inContext) => preview(template, inContext)}
          onplace={() => insertTemplate(template.symbols)}
        >
          <div class="suggestion-harmony">
            <span class="template-name">{name} <small>{template.symbols.length} bars</small></span>
            <SuggestionChords
              names={template.symbols}
              key={context.key}
              numerals={harmony.proposed}
              borrowedFrom={harmony.borrowedFrom}
              previewId={previewId(template)}
            />
            <IdeaTags tags={[...harmony.colourTags, ...harmony.tags.map((label) => ({ label }))]} />
          </div>
          <SuggestionRating {parts} maxTotal={scale.maxTotal} />
        </IdeaPreview>
      </li>
    {/each}
  </ol>
  <SuggestionScoreLegend categories={scale.categories} />
</div>
