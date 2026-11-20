<script lang="ts">
  import { keyAt } from '../engine/advisor';
  import { suggestSequences, type SequenceIdea, type Tradition } from '../engine/sequences';
  import { barQuarters, meterPosition } from '../theory/meter';
  import { parseChordSymbol } from '../theory/symbols';
  import type { Chord } from '../theory/chords';
  import DragHandle from './DragHandle.svelte';
  import { assist, composition, currentSequence, habits, previewInContext, useSequence } from './composition.svelte';

  let bars = $state(2);
  let perBar = $state(1);
  let tradition = $state<'auto' | Tradition>('auto');
  const TRADITION_OF: Record<string, Tradition> = { pop: 'popular', jazz: 'jazz' };

  const v = $derived.by(() => {
    void composition.revision;
    const doc = currentSequence();
    const bar = barQuarters(doc.meter, doc.denominator);
    const selected = doc.steps.find((s) => s.id === composition.selectedId) ?? null;
    const at = selected ? selected.start : composition.cursor;
    const start = Math.floor(at / bar + 1e-8) * bar;
    const span = { start, end: start + bars * bar };
    const parse = (symbol: string) => parseChordSymbol(symbol);
    const before = doc.steps
      .filter((s) => s.start + s.beats <= span.start + 1e-8)
      .slice(-3)
      .map((s) => parse(s.symbol))
      .filter((c): c is Chord => !!c);
    const afterStep = doc.steps.find((s) => Math.abs(s.start - span.end) < 1e-8) ?? null;
    const melody = (doc.melody ?? []).map(({ start, beats, pitch }) => ({ start, beats, pitch }));
    const later = melody.filter((n) => n.start >= span.end - 1e-8);
    const lastIn = melody.filter((n) => n.start < span.end).reduce((e, n) => Math.max(e, n.start + n.beats), 0);
    const phraseEnd = !later.length || later[0].start - lastIn >= 1 - 1e-8;
    const songEnd = !later.length && !doc.steps.some((s) => s.start >= span.end - 1e-8);
    const straddles = doc.steps.some((s) => s.start < span.start - 1e-8 && s.start + s.beats > span.start + 1e-8);
    const trad = tradition === 'auto' ? (TRADITION_OF[assist.style] ?? 'art') : tradition;
    const key = keyAt(doc, span.start);
    const ideas = straddles
      ? []
      : suggestSequences({
          key,
          before,
          after: afterStep ? parse(afterStep.symbol) : null,
          melody,
          span,
          meter: bar,
          count: bars * perBar,
          style: assist.style,
          tradition: trad,
          stats: habits.stats,
          adventurous: assist.adventurous,
          phraseEnd,
          songStart: span.start < 1e-8 && !before.length,
          songEnd: songEnd && phraseEnd,
          limit: 6,
        });
    return {
      span,
      ideas,
      straddles,
      trad,
      from: meterPosition(span.start, doc.meter, doc.denominator).bar,
      after: afterStep?.symbol ?? null,
    };
  });
  const percent = (x: number | null) => (x === null ? '–' : `${Math.round(100 * x)}%`);
  /** "melody 85% · rules 70%": only the judges that had something to say. */
  const judges = (list: [string, number | null][]) =>
    list
      .filter(([, x]) => x !== null)
      .map(([name, x]) => `${name} ${percent(x)}`)
      .join(' · ');
</script>

<div class="card sequence-ideas">
  <div class="ideas-heading">
    <span class="label">Sequences</span>
    <span class="small muted"
      >{habits.status === 'ready'
        ? `rules + ${v.trad} habits`
        : habits.status === 'loading'
          ? 'loading habits…'
          : 'rules only (no habit data found)'}</span
    >
  </div>
  <p class="small muted">Bars {v.from}–{v.from + bars - 1}{v.after ? `, leading into ${v.after}` : ''}</p>
  <div class="row tight chord-ideas-controls">
    <label class="small"
      >Length
      <select aria-label="Sequence length in bars" bind:value={bars}>
        <option value={1}>1 bar</option>
        <option value={2}>2 bars</option>
        <option value={4}>4 bars</option>
      </select></label
    >
    <label class="small"
      >per bar
      <select aria-label="Chords per bar in the sequence" bind:value={perBar}>
        <option value={1}>1</option>
        <option value={2}>2</option>
      </select></label
    >
    <label class="small"
      >Habits of
      <select aria-label="Tradition for habits" bind:value={tradition}>
        <option value="auto">the style</option>
        <option value="popular">popular music</option>
        <option value="art">art music</option>
        <option value="jazz">jazz</option>
      </select></label
    >
  </div>
  {#if v.straddles}
    <p class="small muted">A chord crosses the start of bar {v.from}: select a chord that starts on a bar line.</p>
  {/if}
  <ol class="sequence-list">
    {#each v.ideas as idea (idea.names.join(' '))}
      {@const s = idea as SequenceIdea}
      <li class="sequence-idea">
        <button
          type="button"
          class="sequence-main"
          title="Hear it in context: the chord before, these bars with the melody, the chord after (Shift: these bars only)"
          onclick={(e) => previewInContext(v.span, s.names, e.shiftKey)}
        >
          <b>{s.names.join(' ')}</b>
          <span class="c-roman">{s.numerals.join(' ')}</span>
          <span class="idea-meter" role="img" aria-label={`Score ${percent(s.score)}`}
            ><span style:width={`${Math.round(100 * s.score)}%`}></span></span
          >
        </button>
        <DragHandle
          idea={{ kind: 'run', names: s.names, beats: v.span.end - v.span.start }}
          label={s.names.join(' ')}
          onplace={() => useSequence(v.span, s.names)}
        />
        <div class="idea-judges small muted">
          {judges([
            ['melody', s.melody],
            ['rules', s.rules],
            ['habit', s.habit],
          ])}
        </div>
        {#if s.reasons.length}
          <div class="idea-why small">{s.reasons.join(' · ')}</div>
        {/if}
        {#each s.idioms as idiom}
          <div class="idea-why small muted">↺ idiom: {idiom}</div>
        {/each}
      </li>
    {/each}
  </ol>
</div>
