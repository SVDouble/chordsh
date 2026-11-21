<script lang="ts">
  import IdeaPreview from './IdeaPreview.svelte';
  import SuggestionChords from './SuggestionChords.svelte';
  import SuggestionRating from './SuggestionRating.svelte';
  import SuggestionScoreLegend from './SuggestionScoreLegend.svelte';
  import { scoreParts, suggestionScoreScale } from './suggestionScores';
  import IdeaTags from './IdeaTags.svelte';
  import { chordConnection, openingUse, suggestionHarmony } from './suggestionHarmony';
  import { advise, type Development, developments, keyAt, STYLES, type Advice } from '../engine/advisor';
  import { meterPosition } from '../theory/meter';
  import { keyLong, nameInKey, type Key } from '../theory/scales';
  import { parseChordSymbol } from '../theory/symbols';
  import { voiceChord } from '../theory/voicing';
  import { toneNames } from '../theory/chords';
  import {
    acceptChords,
    assist,
    composition,
    currentSequence,
    developAll,
    developAsVersion,
    previewSuggestion,
    previewDevelopment,
    fillMelodyGaps,
    selectStep,
    suggestionScope,
  } from './composition.svelte';

  /** The slot being harmonised: the selected chord, or the bar at the insertion cursor. */
  const v = $derived.by(() => {
    void composition.revision;
    const doc = currentSequence();
    const { bar, selected, span } = suggestionScope(0);
    const prevStep = doc.steps.filter((s) => s.start + s.beats <= span.start + 1e-8).at(-1) ?? null;
    const nextStep = doc.steps.find((s) => s.start >= span.end - 1e-8) ?? null;
    const melody = (doc.melody ?? []).map(({ start, beats, pitch }) => ({ start, beats, pitch }));
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
    return {
      doc,
      bar,
      selected,
      span,
      key,
      ideas,
      prev,
      next,
      prevNotes: prevStep?.notes ?? null,
      hasMelody: !!doc.melody?.length,
    };
  });
  const rows = $derived(
    v.ideas.map((idea) => ({
      idea,
      parts: scoreParts({
        anchor: idea.anchor,
        focus: idea.anchor === null ? null : idea.style,
        melody: idea.verdicts.melody,
        motion: idea.verdicts.rules,
      }),
    })),
  );
  const scale = $derived(suggestionScoreScale(rows.map(({ parts }) => parts)));
  /** Pipeline step 4: ways to develop the basic chords that keep the melody intact. */
  const develop = $derived.by(() => {
    void composition.revision;
    return developments(v.doc, v.bar, assist.developLevel);
  });
  function hearDevelopment(d: Development, inContext: boolean) {
    const step = v.doc.steps.find((s) => s.id === d.stepId);
    const info = { id: `develop:${d.stepId}`, key: v.key, sources: [d.label, d.why] };
    if (!step) return;
    previewSuggestion({ start: step.start, end: step.start + step.beats }, d.names, {
      info,
      inContext,
      beats: step.beats / d.names.length,
    });
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
  function voicing(idea: Advice) {
    return voiceChord(idea.chord, v.prevNotes);
  }
  const previewId = (idea: Advice) => `slot:${v.span.start}:${idea.name}`;
  const rulebook = $derived(STYLES.find((style) => style.id === assist.style)?.name ?? 'Harmony rules');
  const functions: Record<string, string> = { T: 'Tonic', PD: 'Predominant', D: 'Dominant' };
  const chordsPerBar = [1, 2] as const;
  function melodyTags(idea: Advice, key: Key) {
    const notes = idea.melody?.notes ?? [];
    const clashes = notes.filter(
      (note) => note.strong && !note.resolved && (note.role === 'lean' || note.role === 'pull'),
    );
    const tones = clashes.length ? clashes : notes.filter((note) => note.strong && note.role === 'rest');
    const names = [...new Set(tones.map(({ note }) => nameInKey(note.pitch, key)))];
    if (!names.length) return [];
    return [
      {
        label: `${clashes.length ? 'Clash' : 'Melody tones'} · ${names.join(', ')}`,
        tone: clashes.length ? ('warm' as const) : ('good' as const),
      },
    ];
  }
  function preview(idea: Advice, inContext: boolean) {
    const info = { id: previewId(idea), key: v.key, sources: [rulebook, ...idea.reasons] };
    previewSuggestion(v.span, [idea.name], { info, inContext, voicings: [voicing(idea)] });
  }
  function use(idea: Advice) {
    const input = { symbol: idea.name, notes: voicing(idea), beats: v.span.end - v.span.start };
    if (v.selected) selectStep(v.selected.id);
    acceptChords([input], !!v.selected);
  }
</script>

<div class="chord-ideas">
  <div class="ideas-heading">
    {#if v.selected}
      <span class="label">Replace {v.selected.symbol}</span>
    {/if}
    <span class="small muted">{keyLong(v.key)}</span>
  </div>
  <ol class="chord-idea-list">
    {#each rows as { idea, parts } (idea.name)}
      {@const harmony = suggestionHarmony([idea.name], v.key, v.prev, v.next)}
      {@const roman = harmony.proposed[0]}
      {@const role = functions[roman?.func ?? '']}
      {@const useHint =
        v.prev || v.next ? chordConnection(idea.chord, v.key, v.prev, v.next) : openingUse(idea.chord, v.key, roman)}
      {@const notes = toneNames(idea.chord, v.key)
        .map(({ name }) => name)
        .join(' · ')}
      <li class="chord-idea">
        <IdeaPreview
          previewId={previewId(idea)}
          idea={{ kind: 'slot', names: [idea.name], voicings: [voicing(idea)] }}
          class="suggestion-entry rated-idea"
          onpreview={(inContext) => preview(idea, inContext)}
          onplace={() => use(idea)}
          label={`Hear ${idea.name} once`}
          title={idea.reasons.join(' · ')}
        >
          <div class="suggestion-harmony">
            <SuggestionChords
              names={[idea.name]}
              key={v.key}
              numerals={harmony.proposed}
              borrowedFrom={harmony.borrowedFrom}
              previewId={previewId(idea)}
            />
            <span class="suggestion-tones" title="Chord tones">{notes}</span>
            <IdeaTags
              tags={[
                ...harmony.colourTags,
                ...harmony.tags.map((label) => ({ label })),
                ...(useHint ? [{ label: useHint }] : []),
                ...(role && !harmony.tags.length && !harmony.colourTags.length && !useHint ? [{ label: role }] : []),
                ...melodyTags(idea, v.key),
              ]}
            />
          </div>
          <SuggestionRating {parts} maxTotal={scale.maxTotal} />
        </IdeaPreview>
      </li>
    {/each}
  </ol>
  <SuggestionScoreLegend categories={scale.categories} />
  {#if v.doc.steps.length}
    <details class="develop">
      <summary class="small">
        <span class="label">Develop the chords</span>
        <span class="muted">{develop.length} idea{develop.length > 1 ? 's' : ''} that keep the melody</span>
      </summary>
      <fieldset class="choice-group" aria-label="How much to develop">
        <button
          type="button"
          class:chosen={assist.developLevel === 'light'}
          aria-pressed={assist.developLevel === 'light'}
          onclick={() => (assist.developLevel = 'light')}
        >
          Subtle
        </button>
        <button
          type="button"
          class:chosen={assist.developLevel === 'rich'}
          aria-pressed={assist.developLevel === 'rich'}
          onclick={() => (assist.developLevel = 'rich')}
        >
          Richer
        </button>
      </fieldset>
      <ol class="develop-list">
        {#each develop as d (d.stepId)}
          <li class="develop-idea">
            <IdeaPreview
              previewId={`develop:${d.stepId}`}
              idea={{ kind: 'slot', names: d.names }}
              class="suggestion-entry"
              onpreview={(inContext) => hearDevelopment(d, inContext)}
              onplace={() => applyDevelopment(d)}
              title={d.why}
            >
              <span class="small muted"
                >Bar {meterPosition(d.start, v.doc.meter, v.doc.denominator).bar} · replacing {d.from}</span
              >
              <SuggestionChords names={d.names} key={v.key} previewId={`develop:${d.stepId}`} />
              <IdeaTags tags={[{ label: d.label, tone: 'colour' }]} />
            </IdeaPreview>
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
          title="B: with every idea above, without changing the project"
        >
          Hear developed
        </button>
        <button type="button" disabled={!develop.length} onclick={() => developAll(develop)}>
          Use all {develop.length}
        </button>
        <button
          type="button"
          disabled={!develop.length}
          title="Create a version in My projects and develop its chords"
          onclick={() => developAsVersion(develop)}
        >
          Keep as a new version
        </button>
      </div>
    </details>
  {/if}
  {#if v.hasMelody}
    <div class="row tight">
      <fieldset class="suggestion-option-group" aria-label="Chords per bar when filling">
        <span aria-hidden="true">Per bar</span>
        <div class="suggestion-option-buttons">
          {#each chordsPerBar as count (count)}
            <button type="button" aria-pressed={assist.perBar === count} onclick={() => (assist.perBar = count)}>
              {count}
            </button>
          {/each}
        </div>
      </fieldset>
      <button type="button" onclick={fillMelodyGaps} title="Fill empty bars under the melody">
        Fill chords under the melody
      </button>
    </div>
  {/if}
</div>
