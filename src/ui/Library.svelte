<script lang="ts">
  import { onMount } from 'svelte';
  import { playPiece, session, stopPlayback, ui } from './store.svelte';
  import { BUILT_IN, type Piece, fromBenchmark, fromMidi, fromRecording } from '../library/pieces';
  import { midiFileMeta, parseMidiFile } from '../io/midifile';
  import Song from './Song.svelte';

  let recordings = $state<string[]>([]);
  let corpora = $state<Record<string, string[]>>({});
  let corpus = $state('');
  let opened = $state<Piece[]>([]);
  let error = $state('');
  const hasSong = $derived.by(() => {
    void ui.tick;
    return !!session.song;
  });

  async function refresh() {
    try {
      const r = await fetch('/__library');
      if (!r.ok) return;
      const j = await r.json();
      recordings = j.recordings;
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

  async function play(load: () => Promise<Piece>) {
    stopPlayback();
    const request = ui.playbackRequest;
    ui.loading = true;
    try {
      error = '';
      const piece = await load();
      if (request !== ui.playbackRequest) return;
      playPiece(piece);
      ui.tab = 'progression';
    } catch (e) {
      if (request === ui.playbackRequest) error = (e as Error).message;
    } finally {
      if (request === ui.playbackRequest) ui.loading = false;
    }
  }
  const getJson = async (p: string) => {
    const r = await fetch(`/__library/${p}`);
    if (!r.ok) throw new Error(`can't load ${p}`);
    return r.json();
  };
  async function openFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    void play(async () => {
      const buf = await f.arrayBuffer();
      const p = fromMidi(`file:${f.name}`, f.name, parseMidiFile(buf), midiFileMeta(buf));
      opened = [p, ...opened.filter((x) => x.id !== p.id)];
      return p;
    });
  }
</script>

<div class="panel library">
  {#if error}
    <p class="warn small">{error}</p>
  {/if}

  <details class="library-browser" open={!hasSong}>
    <summary>Performances <span class="muted small">· demo, MIDI and recordings</span></summary>
    <div class="label">Play into the app <span class="muted">— analysed exactly as if you played it</span></div>
    <div class="lib-list">
      {#each [...BUILT_IN, ...opened] as p (p.id)}
        <button type="button" class="lib-item" onclick={() => play(async () => p)}>
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
          <button
            type="button"
            class="lib-item"
            onclick={() => play(async () => fromRecording(f, await getJson(`recordings/${f}`)))}
          >
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
              play(async () => fromBenchmark(`${corpus}/${id}`, await getJson(`data/${corpus}/${id}.json`)))}
          >
            <b>{id}</b>
          </button>
        {/each}
      </div>
    {/if}
  </details>
  <div class="label">Chord charts <span class="muted">— open, create or play along</span></div>
  <Song />
</div>
