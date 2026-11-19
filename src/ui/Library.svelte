<script lang="ts">
  import Icon from './Icon.svelte';
  let { onselect = () => {} }: { onselect?: () => void } = $props();
  import { onMount } from 'svelte';
  import { choosePerformance, registerPerformance, ui } from './store.svelte';
  import { BUILT_IN, type Piece, fromBenchmark, fromMidi, fromRecording } from '../library/pieces';
  import { midiFileMeta, parseMidiFile } from '../io/midifile';
  import { composition, exampleSequences, newSequence, selectSequence } from './composition.svelte';

  let recordings = $state<string[]>([]);
  let corpora = $state<Record<string, string[]>>({});
  let corpus = $state('');
  let opened = $state<Piece[]>([]);
  let query = $state('');
  let shown = $state(50);
  let fileInput = $state<HTMLInputElement>();
  const matches = (text: string) => text.toLowerCase().includes(query.trim().toLowerCase());
  const songs = $derived(composition.documents.filter((s) => matches(s.title)));
  const examples = $derived(
    exampleSequences.filter((s) => !composition.documents.some((d) => d.id === s.id) && matches(s.title)),
  );
  const performances = $derived([...BUILT_IN, ...opened].filter((p) => matches(p.title)));
  const files = $derived(recordings.filter((f) => matches(recordingName(f))));
  // Search every corpus; browsing a single corpus never silently hides items past a fixed cap.
  const references = $derived(
    Object.entries(corpora).flatMap(([group, ids]) =>
      !query.trim() && group !== corpus
        ? []
        : ids.filter((id) => matches(`${group} ${id}`)).map((id) => ({ group, id })),
    ),
  );
  const hasMatches = $derived(
    songs.length + examples.length + performances.length + files.length + references.length > 0,
  );
  $effect(() => {
    void query;
    void corpus;
    shown = 50;
  });

  function recordingName(file: string) {
    return file.replace(/^session-|\.json$/g, '').replace(/T(\d\d)-(\d\d).*/, ' $1:$2');
  }
  async function refresh() {
    try {
      const r = await fetch('/__library');
      if (!r.ok) return;
      const j = await r.json();
      if (!Array.isArray(j.recordings) || typeof j.corpora !== 'object' || !j.corpora) return;
      recordings = j.recordings;
      for (const file of recordings)
        registerPerformance(`recording:${file}`, recordingName(file), async () =>
          fromRecording(`recording:${file}`, await getJson(`recordings/${file}`)),
        );
      corpora = j.corpora;
      corpus ||= Object.keys(j.corpora)[0] ?? '';
    } catch {
      /* The local library is optional outside the dev server. */
    }
  }
  onMount(refresh);
  $effect(() => {
    if (!ui.recording) void refresh();
  });
  const getJson = async (path: string) => {
    const response = await fetch(`/__library/${path}`);
    if (!response.ok) throw new Error(`Couldn't open ${path}. Choose another performance or try again.`);
    return response.json();
  };
  async function loadPerformance(load: () => Promise<Piece>, id: string, title: string, play = false) {
    registerPerformance(id, title, load);
    await choosePerformance(id, play || !!ui.nowPlaying);
    if (!ui.playbackError) onselect();
  }
  async function openFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    await loadPerformance(
      async () => {
        const buffer = await file.arrayBuffer();
        const piece = fromMidi(`file:${file.name}`, file.name, parseMidiFile(buffer), midiFileMeta(buffer));
        opened = [piece, ...opened.filter((p) => p.id !== piece.id)];
        return piece;
      },
      `file:${file.name}`,
      file.name,
    );
    if (fileInput) fileInput.value = '';
  }
</script>

<div class="panel library">
  <div class="library-actions">
    <input type="search" aria-label="Search library" placeholder="Find a song or performance…" bind:value={query}>
    <button
      type="button"
      class="icon"
      title="New song"
      aria-label="New song"
      onclick={() => {
        newSequence();
        onselect();
      }}
    >
      <Icon name="plus" />
    </button>
    <button type="button" title="Import a MIDI performance" onclick={() => fileInput?.click()}>Import MIDI</button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".mid,.midi"
      aria-label="Import MIDI file"
      hidden
      onchange={openFile}
    >
  </div>
  {#if !hasMatches}
    <p class="muted">No matches for “{query}”. Try a song title or clear the search.</p>
  {/if}
  {#if songs.length}
    <div class="label">My songs</div>
    <div class="lib-list">
      {#each songs as song (song.id)}
        <div class="lib-row" class:current={ui.sourceId === `sequence:${song.id}`}>
          <button
            type="button"
            class="lib-item"
            aria-current={ui.sourceId === `sequence:${song.id}` ? 'true' : undefined}
            onclick={() => {
              selectSequence(song.id, !!ui.nowPlaying);
              onselect();
            }}
          >
            <b>{song.title}</b
            ><span class="small muted"
              >{song.steps.length ? `${song.steps.length} chords · ${song.bpm} BPM` : 'Empty song'}{ui.sourceId ===
              `sequence:${song.id}`
                ? ' · current'
                : ''}</span
            >
          </button>
          <button
            type="button"
            class="icon lib-play"
            aria-label={`Play ${song.title}`}
            title={`Play ${song.title}`}
            disabled={!song.steps.length}
            onclick={() => {
              selectSequence(song.id, true);
              onselect();
            }}
          >
            <Icon name="play" />
          </button>
        </div>
      {/each}
    </div>
  {/if}
  {#if examples.length}
    <div class="label">Starting points</div>
    <div class="lib-list">
      {#each examples as song (song.id)}
        <div class="lib-row">
          <button
            type="button"
            class="lib-item"
            onclick={() => {
              selectSequence(song.id, !!ui.nowPlaying);
              onselect();
            }}
          >
            <b>{song.title}</b><span class="small muted">Editable example · {song.steps.length} chords</span>
          </button>
          <button
            type="button"
            class="icon lib-play"
            aria-label={`Play ${song.title}`}
            title={`Play ${song.title}`}
            onclick={() => {
              selectSequence(song.id, true);
              onselect();
            }}
          >
            <Icon name="play" />
          </button>
        </div>
      {/each}
    </div>
  {/if}
  {#if performances.length || files.length}
    <div class="label">Listen & explore</div>
    <p class="small muted">Select to open, ▶ to listen. Heard chords can be added to your song.</p>
    <div class="lib-list">
      {#each performances as piece (piece.id)}
        <div class="lib-row" class:current={ui.sourceId === `piece:${piece.id}`}>
          <button
            type="button"
            class="lib-item"
            aria-current={ui.sourceId === `piece:${piece.id}` ? 'true' : undefined}
            onclick={() => loadPerformance(async () => piece, piece.id, piece.title)}
          >
            <b>{piece.title}</b
            ><span class="muted small"
              >{piece.bpm ? `${Math.round(piece.bpm)} BPM` : 'Performance'}{ui.sourceId === `piece:${piece.id}`
                ? ' · current'
                : ''}</span
            >
          </button>
          <button
            type="button"
            class="icon lib-play"
            aria-label={`Play ${piece.title}`}
            title={`Play ${piece.title}`}
            onclick={() => loadPerformance(async () => piece, piece.id, piece.title, true)}
          >
            <Icon name="play" />
          </button>
        </div>
      {/each}
      {#each files as file (file)}
        <div class="lib-row" class:current={ui.sourceId === `piece:recording:${file}`}>
          <button
            type="button"
            class="lib-item"
            aria-current={ui.sourceId === `piece:recording:${file}` ? 'true' : undefined}
            onclick={async () => {
              await choosePerformance(`recording:${file}`, !!ui.nowPlaying);
              if (!ui.playbackError) onselect();
            }}
          >
            <b>{recordingName(file)}</b
            ><span class="muted small">Recording{ui.sourceId === `piece:recording:${file}` ? ' · current' : ''}</span>
          </button>
          <button
            type="button"
            class="icon lib-play"
            aria-label={`Play recording ${recordingName(file)}`}
            title="Play recording"
            onclick={async () => {
              await choosePerformance(`recording:${file}`, true);
              if (!ui.playbackError) onselect();
            }}
          >
            <Icon name="play" />
          </button>
        </div>
      {/each}
    </div>
  {/if}
  {#if Object.keys(corpora).length}
    <details class="library-browser" open={!!query.trim() && references.length > 0}>
      <summary>Reference performances <span class="muted small">{references.length}</span></summary>
      <p class="small muted">Annotated performances to explore and learn from.</p>
      {#if !query.trim()}
        <label class="row small"
          >Collection
          <select aria-label="Reference collection" bind:value={corpus}>
            {#each Object.keys(corpora) as name}
              <option value={name}>{name} ({corpora[name].length})</option>
            {/each}
          </select></label
        >
      {/if}
      <div class="lib-list">
        {#each references.slice(0, shown) as ref (`${ref.group}/${ref.id}`)}
          <div class="lib-row" class:current={ui.sourceId === `piece:${ref.group}/${ref.id}`}>
            <button
              type="button"
              class="lib-item"
              onclick={() =>
                loadPerformance(
                  async () =>
                    fromBenchmark(`${ref.group}/${ref.id}`, await getJson(`data/${ref.group}/${ref.id}.json`)),
                  `${ref.group}/${ref.id}`,
                  ref.id,
                )}
            >
              <b>{ref.id}</b><span class="small muted">{ref.group}</span>
            </button>
            <button
              type="button"
              class="icon lib-play"
              aria-label={`Play ${ref.group} ${ref.id}`}
              title="Play performance"
              onclick={() =>
                loadPerformance(
                  async () =>
                    fromBenchmark(`${ref.group}/${ref.id}`, await getJson(`data/${ref.group}/${ref.id}.json`)),
                  `${ref.group}/${ref.id}`,
                  ref.id,
                  true,
                )}
            >
              <Icon name="play" />
            </button>
          </div>
        {/each}
      </div>
      {#if references.length > shown}
        <button type="button" class="library-more" onclick={() => (shown += 50)}>
          Show more ({shown} of {references.length})
        </button>
      {/if}
    </details>
  {/if}
</div>
