<script lang="ts">
  import { audition, persist, session, ui } from './store.svelte';
  import { EXAMPLES, parseChart } from '../engine/chart';
  import { reharmHints } from '../engine/reharm';
  import { type Chord, toneNames } from '../theory/chords';
  import { keyLong } from '../theory/scales';
  import { voiceChord } from '../theory/voicing';
  import { roleClass } from './colours';

  let editing = $state(false);
  let title = $state('');
  let text = $state('');
  let selected = $state<number | null>(null);

  const library = $derived([...EXAMPLES, ...ui.charts]);
  const draft = $derived(editing ? parseChart(text, title) : null);
  const VERDICT = {
    exact: '✓ exact',
    match: '✓ close enough',
    substitute: '↺ substitute',
    wrong: '✗ different chord',
    skipped: 'skipped',
  };

  function load(c: { title: string; text: string }) {
    session.loadSong(parseChart(c.text, c.title));
    selected = null;
    editing = false;
  }
  function edit(fromPlaying = false) {
    const cur = session.song?.chart;
    title = fromPlaying ? 'My session' : (cur?.title ?? 'New song');
    text = fromPlaying ? session.historyAsChart() : (cur?.text ?? '');
    editing = true;
  }
  function save() {
    ui.charts = [...ui.charts.filter((c) => c.title !== title), { title, text }];
    persist();
    load({ title, text });
  }
  function remove(t: string) {
    ui.charts = ui.charts.filter((c) => c.title !== t);
    persist();
    session.loadSong(null);
  }
  /** Voice a chord sequence from your current hand position and play it. */
  function hear(chords: Chord[], id: string, beats?: number[]) {
    let prev = session.lastVoicing;
    audition(
      chords.map((c) => (prev = voiceChord(c, prev))),
      id,
      beats ?? 2,
    );
  }
  /** Each chord gets its share of the bar (a bar of 4 beats split between its chords). */
  const chartBeats = (cells: { bar: number }[]) =>
    cells.map((c) => ui.meter / cells.filter((x) => x.bar === c.bar).length);

  const v = $derived.by(() => {
    void ui.tick; // re-run when the engine changes
    const f = session.song;
    if (!f) return null;
    const ch = f.chart;
    const bars = new Map<
      number,
      {
        section?: string;
        cells: {
          i: number;
          symbol: string;
          roman: string;
          kind: string;
          func: string;
          result: ReturnType<typeof f.results.get>;
          current: boolean;
        }[];
      }
    >();
    for (const c of ch.chords) {
      const b = bars.get(c.bar) ?? { section: c.section, cells: [] };
      b.cells.push({
        i: c.i,
        symbol: c.symbol,
        roman: c.roman?.numeral ?? '',
        kind: c.roman?.kind ?? '',
        func: c.roman?.func ?? '',
        result: f.results.get(c.i),
        current: f.pos === c.i,
      });
      bars.set(c.bar, b);
    }
    const sel = selected !== null ? ch.chords[selected] : null;
    return {
      title: ch.title,
      builtin: EXAMPLES.some((e) => e.title === ch.title),
      key: ch.key ? keyLong(ch.key) : '—',
      bars: [...bars.values()],
      expected: f.expected
        ? { symbol: f.expected.symbol, roman: f.expected.roman?.numeral, tones: toneNames(f.expected.chord, ch.key) }
        : null,
      live: f.live,
      passes: [...f.passes],
      habits: f.habits(),
      insights: ch.insights,
      sel,
      hints: sel ? reharmHints(ch, sel.i) : [],
      all: ch.chords,
    };
  });
</script>

<div class="panel song">
  <div class="toolbar">
    <select
      value=""
      onchange={(e) => {
        const c = library.find((x) => x.title === e.currentTarget.value);
        if (c) load(c);
        e.currentTarget.value = '';
      }}
    >
      <option value="">Open chart…</option>
      <optgroup label="Examples">
        {#each EXAMPLES as c}
          <option>{c.title}</option>
        {/each}
      </optgroup>
      {#if ui.charts.length}
        <optgroup label="Saved">
          {#each ui.charts as c}
            <option>{c.title}</option>
          {/each}
        </optgroup>
      {/if}
    </select>
    <button
      type="button"
      onclick={() => {
        title = 'New song';
        text = '';
        editing = true;
      }}
    >
      New
    </button>
    <button
      type="button"
      disabled={!session.chords.length}
      onclick={() => edit(true)}
      title="Turn the progression you played into a chart"
    >
      From playing
    </button>
  </div>

  {#if editing}
    <div class="editor">
      <input class="title-in" bind:value={title} placeholder="Title">
      <textarea
        bind:value={text}
        rows="8"
        spellcheck="false"
        placeholder={'[Verse]\n| Dm7 G7 | Cmaj7 | A7 | % |\n// chords per bar between |, % repeats, [Section] labels'}
      ></textarea>
      <div class="row small">
        {#if draft}
          <span class="muted">{draft.chords.length} chords · {draft.key ? keyLong(draft.key) : '—'}</span>
          {#if draft.errors.length}
            <span class="warn">Can't read: {draft.errors.join(', ')}</span>
          {/if}
        {/if}
        <span class="right row tight">
          <button type="button" onclick={() => (editing = false)}>Cancel</button>
          <button type="button" class="active" disabled={!draft?.chords.length || !title.trim()} onclick={save}>
            Save & open
          </button>
        </span>
      </div>
    </div>
  {:else if !v}
    <p class="muted">
      Open an example or paste your own chart and play along: you'll see chord by chord what you hit, what you missed
      and which substitutions you used. Click a chord for reharmonisation ideas.
    </p>
  {:else}
    <div class="row small">
      <b>{v.title}</b><span class="muted">{v.key}</span>
      <button
        type="button"
        class="link"
        onclick={() =>
          hear(
            v.all.map((c) => c.chord),
            'chart',
            chartBeats(v.all),
          )}
      >
        ▶ hear
      </button>
      <label class="muted">
        <input
          type="checkbox"
          checked={session.songGuide}
          onchange={(e) => {
            session.songGuide = e.currentTarget.checked;
            session.onChange();
          }}
        >
        show on piano
      </label>
      <span class="right row tight">
        {#if v.passes.length}
          <span class="muted" title="Score per pass through the song">
            {v.passes.map((p) => p + '%').join(' · ')}
          </span>
        {/if}
        <button type="button" class="link" onclick={() => edit()}>edit</button>
        {#if !v.builtin}
          <button type="button" class="link" onclick={() => remove(v.title)}>delete</button>
        {/if}
        <button type="button" class="link" onclick={() => session.loadSong(null)}>close</button>
      </span>
    </div>

    <div class="bars">
      {#each v.bars as bar}
        <div class="bar">
          {#if bar.section}
            <span class="section">{bar.section}</span>
          {/if}
          {#each bar.cells as c (c.i)}
            <button
              type="button"
              class="cell f-{c.func} v-{c.result?.verdict ?? 'none'} k-{c.kind}"
              class:current={c.current}
              class:sel={selected === c.i}
              title={c.result
                ? `${VERDICT[c.result.verdict]}${c.result.played ? ` — you played ${c.result.played}` : ''}\n${c.result.notes.join('\n')}`
                : 'Click: start here and see reharm ideas'}
              onclick={() => {
                selected = c.i;
                session.song?.jump(c.i);
                session.onChange();
              }}
            >
              <span class="c-name">{c.symbol}</span><span class="c-roman">{c.roman}</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>

    {#if v.live}
      <p class="live v-{v.live.verdict}">
        <b>{v.live.played}</b>: {VERDICT[v.live.verdict]}{v.live.notes.length ? ' — ' + v.live.notes.join('; ') : ''}
      </p>
    {:else if v.expected}
      <p>
        Next <b>{v.expected.symbol}</b> <span class="muted">{v.expected.roman}</span>
        {#each v.expected.tones as t}
          <span class="tone mini {roleClass(t.role)}">
            <b>{t.name}</b><i>{t.role}</i>
          </span>
        {/each}
      </p>
    {/if}

    {#if v.sel}
      <div class="label">Ideas for {v.sel.symbol} <span class="muted">{v.sel.roman?.numeral}</span></div>
      {#each v.hints as h, i}
        <div class="hint">
          <button type="button" onclick={() => hear(h.chords, `hint${i}`)} class:playing={ui.playingId === `hint${i}`}>
            ▶
          </button>
          <div>
            <b>{h.label}</b>
            {h.names.join(' → ')}
            <div class="small muted">{h.why}</div>
          </div>
        </div>
      {:else}
        <p class="small muted">No obvious reharm here — it's already doing its job.</p>
      {/each}
    {/if}
    {#if v.habits.length}
      <div class="label">What you tend to miss</div>
      <ul class="small">
        {#each v.habits as h}
          <li>{h}</li>
        {/each}
      </ul>
    {/if}
    <div class="label">Big picture</div>
    {#if v.insights.length}
      <ul class="small insights">
        {#each v.insights as x}
          <li><span class="muted">{x.where}:</span> {x.text}</li>
        {/each}
      </ul>
    {:else}
      <p class="small muted">All diatonic — a good chart to try reharmonising (click a chord).</p>
    {/if}
  {/if}
</div>
