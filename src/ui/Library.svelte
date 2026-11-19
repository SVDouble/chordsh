<script lang="ts">
  import { onMount } from 'svelte';
  import { choosePerformance, registerPerformance, ui } from './store.svelte';
  import { BUILT_IN, type Piece, fromBenchmark, fromMidi, fromRecording } from '../library/pieces';
  import { midiFileMeta, parseMidiFile } from '../io/midifile';
  import { composition, exampleSequences, selectSequence } from './composition.svelte';

  let recordings = $state<string[]>([]);
  let corpora = $state<Record<string, string[]>>({});
  let corpus = $state('');
  let opened = $state<Piece[]>([]);
  let error = $state('');

  async function refresh() {
    try {
      const r = await fetch('/__library');
      if (!r.ok) return;
      const j = await r.json();
      recordings = j.recordings;
      for (const file of recordings)
        if (!ui.performanceChoices.some((p) => p.id === `recording:${file}`))
          registerPerformance(`recording:${file}`, file.replace(/^session-|\.json$/g, ''), async () =>
            fromRecording(`recording:${file}`, await getJson(`recordings/${file}`)),
          );
      corpora = j.corpora;
      corpus ||= Object.keys(j.corpora)[0] ?? '';
    } catch {
      /* not under the dev server */
    }
  }
  onMount(refresh);
  $effect(() => {
    if (!ui.recording) void refresh();
  }); // a new recording appears after saving

  async function play(load: () => Promise<Piece>, id: string, title: string) {
    error = '';
    registerPerformance(id, title, load);
    await choosePerformance(id, true);
  }
  const getJson = async (p: string) => {
    const r = await fetch(`/__library/${p}`);
    if (!r.ok) throw new Error(`can't load ${p}`);
    return r.json();
  };
  async function openFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    void play(
      async () => {
        const buf = await f.arrayBuffer();
        const p = fromMidi(`file:${f.name}`, f.name, parseMidiFile(buf), midiFileMeta(buf));
        opened = [p, ...opened.filter((x) => x.id !== p.id)];
        return p;
      },
      `file:${f.name}`,
      f.name,
    );
  }
</script>

<div class="panel library">
  <div class="label">Songs</div>
  <div class="lib-list">
    {#each composition.documents as s (s.id)}
      <button type="button" class="lib-item" onclick={() => selectSequence(s.id)}>
        <b>{s.title}</b><span class="small muted">{s.steps.length} chords</span>
      </button>
    {/each}
    {#each exampleSequences.filter((s) => !composition.documents.some((d) => d.id === s.id)) as s (s.id)}
      <button type="button" class="lib-item" onclick={() => selectSequence(s.id)}>
        <b>{s.title}</b><span class="small muted">example</span>
      </button>
    {/each}
  </div>
  {#if error}
    <p class="warn small">{error}</p>
  {/if}

  <details class="library-browser" open>
    <summary>Browse performances</summary>
    <div class="label">Play into the app <span class="muted">— analysed exactly as if you played it</span></div>
    <div class="lib-list">
      {#each [...BUILT_IN, ...opened] as p (p.id)}
        <button type="button" class="lib-item" onclick={() => play(async () => p, p.id, p.title)}>
          <b>{p.title}</b><span class="muted small">{p.source}{p.bpm ? ` · ♩${Math.round(p.bpm)}` : ''}</span>
        </button>
      {/each}
      <label class="lib-item filebtn">
        <b>Open a MIDI file…</b><span class="muted small">a recording or a score</span>
        <input type="file" accept=".mid,.midi" onchange={openFile}>
      </label>
    </div>

    {#if recordings.length}
      <div class="label">Your recordings</div>
      <div class="lib-list">
        {#each recordings as f (f)}
          <button type="button" class="lib-item" onclick={() => choosePerformance(`recording:${f}`, true)}>
            <b>{f.replace(/^session-|\.json$/g, '').replace(/T(\d\d)-(\d\d).*/, ' $1:$2')}</b
            ><span class="muted small"> recording </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if Object.keys(corpora).length}
      <div class="label">
        Benchmark pieces <span class="muted">— expert-annotated; see how the analysis compares</span>
      </div>
      <div class="row">
        <select bind:value={corpus}>
          {#each Object.keys(corpora) as c}
            <option value={c}>{c} ({corpora[c].length})</option>
          {/each}
        </select>
      </div>
      <div class="lib-list scrolly">
        {#each (corpora[corpus] ?? []).slice(0, 200) as id (id)}
          <button
            type="button"
            class="lib-item"
            onclick={() =>
              play(
                async () => fromBenchmark(`${corpus}/${id}`, await getJson(`data/${corpus}/${id}.json`)),
                `${corpus}/${id}`,
                id,
              )}
          >
            <b>{id}</b>
          </button>
        {/each}
      </div>
    {/if}
  </details>
</div>
