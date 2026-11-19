<script lang="ts">
  import { audition, persist, playMidiFile, session, stopMidiFile, ui } from './store.svelte';
  import { EXAMPLES, parseChart } from '../engine/chart';
  import { reharmHints } from '../engine/reharm';
  import { parseMidiFile } from '../io/midifile';
  import { type Chord, toneNames } from '../theory/chords';
  import { keyLong } from '../theory/scales';
  import { voiceChord } from '../theory/voicing';

  let editing = $state(false);
  let title = $state('');
  let text = $state('');
  let selected = $state<number | null>(null);
  let fileError = $state('');

  const library = $derived([...EXAMPLES, ...ui.charts]);
  const draft = $derived(editing ? parseChart(text, title) : null);
  const VERDICT = { exact: '✓ exact', match: '✓ close enough', substitute: '↺ substitute', wrong: '✗ different chord', skipped: 'skipped' };

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
  function hear(chords: Chord[], id: string) {
    let prev = session.lastVoicing;
    audition(chords.map((c) => (prev = voiceChord(c, prev))), id);
  }
  async function openFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      fileError = '';
      session.clear();
      playMidiFile(parseMidiFile(await file.arrayBuffer()));
    } catch (err) {
      fileError = (err as Error).message;
    }
  }

  const v = $derived.by(() => {
    ui.tick;
    const f = session.song;
    if (!f) return null;
    const ch = f.chart;
    const bars = new Map<number, { section?: string; cells: { i: number; symbol: string; roman: string; kind: string; result: ReturnType<typeof f.results.get>; current: boolean }[] }>();
    for (const c of ch.chords) {
      const b = bars.get(c.bar) ?? { section: c.section, cells: [] };
      b.cells.push({ i: c.i, symbol: c.symbol, roman: c.roman?.numeral ?? '', kind: c.roman?.kind ?? '', result: f.results.get(c.i), current: f.pos === c.i });
      bars.set(c.bar, b);
    }
    const sel = selected !== null ? ch.chords[selected] : null;
    return {
      title: ch.title,
      builtin: EXAMPLES.some((e) => e.title === ch.title),
      key: ch.key ? keyLong(ch.key) : '—',
      bars: [...bars.values()],
      expected: f.expected ? { symbol: f.expected.symbol, roman: f.expected.roman?.numeral, tones: toneNames(f.expected.chord, ch.key) } : null,
      live: f.live,
      passes: [...f.passes],
      habits: f.habits(),
      insights: ch.insights,
      sel: sel ? { ...sel, explain: sel.roman?.explain ?? '' } : null,
      hints: sel ? reharmHints(ch, sel.i) : [],
      all: ch.chords,
    };
  });
</script>

<section class="card song">
  <h2>
    Song
    <span class="muted small">— play along with a chart; any voicing counts, substitutions too</span>
    <span class="right row">
      <select value="" onchange={(e) => { const c = library.find((x) => x.title === e.currentTarget.value); if (c) load(c); e.currentTarget.value = ''; }}>
        <option value="">Open chart…</option>
        <optgroup label="Examples">{#each EXAMPLES as c}<option>{c.title}</option>{/each}</optgroup>
        {#if ui.charts.length}<optgroup label="Saved">{#each ui.charts as c}<option>{c.title}</option>{/each}</optgroup>{/if}
      </select>
      <button class="ghost" onclick={() => { title = 'New song'; text = ''; editing = true; }}>New</button>
      <button class="ghost" disabled={!session.chords.length} onclick={() => edit(true)} title="Turn the progression you played into a chart">From my playing</button>
      <label class="ghost filebtn" title="Analyse a recording: it is replayed through the engine">
        {ui.filePlaying ? 'Playing file…' : 'Open MIDI file'}<input type="file" accept=".mid,.midi" onchange={openFile} />
      </label>
      {#if ui.filePlaying}<button class="ghost" onclick={stopMidiFile}>■</button>{/if}
    </span>
  </h2>
  {#if fileError}<p class="warn small">{fileError}</p>{/if}

  {#if editing}
    <div class="editor">
      <input class="title-in" bind:value={title} placeholder="Title" />
      <textarea bind:value={text} rows="7" spellcheck="false"
        placeholder={'[Verse]\n| Dm7 G7 | Cmaj7 | A7 | % |\n// chords per bar between |, % repeats, [Section] labels'}></textarea>
      <div class="row small">
        {#if draft}
          <span class="muted">{draft.chords.length} chords · key {draft.key ? keyLong(draft.key) : '—'}</span>
          {#if draft.errors.length}<span class="warn">Can't read: {draft.errors.join(', ')}</span>{/if}
        {/if}
        <span class="right row">
          <button class="ghost" onclick={() => (editing = false)}>Cancel</button>
          <button class="active" disabled={!draft?.chords.length || !title.trim()} onclick={save}>Save & open</button>
        </span>
      </div>
    </div>
  {:else if !v}
    <p class="muted">Open an example or paste your own chart. Play along and you'll see, chord by chord, what you hit, what you missed, and which substitutions you used. Click any chord for reharmonisation ideas.</p>
  {:else}
    <div class="row small">
      <b>{v.title}</b><span class="muted">in {v.key}</span>
      <button class="ghost" onclick={() => hear(v.all.map((c) => c.chord), 'chart')}>▶ Hear chart</button>
      <label class="muted"><input type="checkbox" checked={session.songGuide} onchange={(e) => { session.songGuide = e.currentTarget.checked; session.onChange(); }} /> show next chord on the piano</label>
      <span class="right row">
        {#if v.passes.length}<span class="muted">passes: {v.passes.map((p) => p + '%').join(' · ')}</span>{/if}
        <button class="ghost" onclick={() => edit()}>Edit</button>
        {#if !v.builtin}<button class="ghost" onclick={() => remove(v.title)}>Delete</button>{/if}
        <button class="ghost" onclick={() => session.loadSong(null)}>✕</button>
      </span>
    </div>

    <div class="bars">
      {#each v.bars as bar}
        <div class="bar">
          {#if bar.section}<span class="section">{bar.section}</span>{/if}
          {#each bar.cells as c (c.i)}
            <button class="cell v-{c.result?.verdict ?? 'none'} k-{c.kind}" class:current={c.current} class:sel={selected === c.i}
              title={c.result ? `${VERDICT[c.result.verdict]}${c.result.played ? ` — you played ${c.result.played}` : ''}\n${c.result.notes.join('\n')}` : 'click: start here + reharm ideas'}
              onclick={() => { selected = c.i; session.song?.jump(c.i); session.onChange(); }}>
              <span class="c-name">{c.symbol}</span><span class="c-roman">{c.roman}</span>
            </button>
          {/each}
        </div>
      {/each}
    </div>

    <div class="song-cols">
      <div>
        {#if v.expected}
          <p>Next: <b>{v.expected.symbol}</b> <span class="muted">{v.expected.roman}</span> —
            {#each v.expected.tones as t}<span class="tone mini"><b>{t.name}</b><i>{t.role}</i></span>{/each}</p>
        {/if}
        {#if v.live}
          <p class="live v-{v.live.verdict}">You're holding <b>{v.live.played}</b>: {VERDICT[v.live.verdict]}{v.live.notes.length ? ' — ' + v.live.notes.join('; ') : ''}</p>
        {/if}
        {#if v.habits.length}
          <h3>What you tend to miss</h3>
          <ul class="small">{#each v.habits as h}<li>{h}</li>{/each}</ul>
        {/if}
        <h3>Big picture</h3>
        {#if v.insights.length}
          <ul class="small insights">{#each v.insights as x}<li><span class="muted">{x.where}:</span> {x.text}</li>{/each}</ul>
        {:else}<p class="small muted">All diatonic — a good chart to try reharmonising.</p>{/if}
      </div>
      <div>
        {#if v.sel}
          <h3>{v.sel.symbol} <span class="muted">{v.sel.roman?.numeral}</span></h3>
          <p class="small muted">{v.sel.explain}</p>
          {#each v.hints as h, i}
            <div class="hint">
              <button onclick={() => hear(h.chords, `hint${i}`)} class:playing={ui.playingId === `hint${i}`}>▶</button>
              <div><b>{h.label}:</b> {h.names.join(' → ')}<br /><span class="small muted">{h.why}</span></div>
            </div>
          {:else}<p class="small muted">No obvious reharm here — it's already doing its job.</p>{/each}
        {:else}
          <p class="small muted">Click a chord in the chart for reharmonisation ideas (tritone subs, secondary dominants, °7s, borrowed chords).</p>
        {/if}
      </div>
    </div>
  {/if}
</section>
