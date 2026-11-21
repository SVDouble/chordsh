<script lang="ts">
  import Icon from './Icon.svelte';
  import { tick } from 'svelte';
  import { choosePerformance, registerPerformance, stopPlayback, ui } from './store.svelte';
  import type { Sequence } from '../engine/sequence';
  import { type Piece, fromBenchmark, fromMidi, fromRecording } from '../library/pieces';
  import { midiFileMeta, parseMidiFile } from '../io/midifile';
  import {
    closeSong,
    composition,
    deleteSequence,
    duplicateSequence,
    editSequence,
    importChart,
    newSequence,
    openSong,
    resetWorkspace,
    selectSequence,
  } from './composition.svelte';
  import { recordedChords, songFromPerformance, songFromReference } from '../library/toSong';

  let { open, song, onselect }: { open: boolean; song: Sequence; onselect: () => void } = $props();
  const SECTION = {
    songs: 'My projects',
    recordings: 'Recordings',
    collections: 'Collections',
  };
  type Section = keyof typeof SECTION;
  type LibraryFile = {
    id: string;
    title: string;
    path: string;
    detail?: string;
    current: boolean;
    projectId?: string;
    open: () => void;
    play?: () => void;
  };
  const PAGE_SIZE = 50;

  let recordings = $state<string[]>([]);
  let corpora = $state<Record<string, string[]>>({});
  let titles = $state<Record<string, Record<string, string>>>({});
  let folder = $state<Section | null>(null);
  let collection = $state<string | null>(null);
  let query = $state('');
  let shown = $state(PAGE_SIZE);
  let fileInput = $state<HTMLInputElement>();
  let contents = $state<HTMLElement>();
  let error = $state('');
  let chartDialog = $state<HTMLDialogElement>();
  let pasted = $state('');
  let chartError = $state('');
  const hasMusic = $derived(!!(song.steps.length || song.melody?.length));
  const search = $derived(query.trim().toLowerCase());
  const collections = $derived(Object.keys(corpora).sort((a, b) => a.localeCompare(b)));
  const folders = $derived([
    { id: 'songs', count: composition.documents.length },
    { id: 'recordings', count: recordings.length },
    { id: 'collections', count: collections.length },
  ] as const);
  const location = $derived(collection ?? (folder ? SECTION[folder] : 'Library'));
  const includesSection = (section: Section) => folder === section || (folder === null && !!search);
  const matches = (text: string) => text.toLowerCase().includes(search);

  const entries = $derived.by((): LibraryFile[] => {
    const files: LibraryFile[] = [];
    if (includesSection('songs')) {
      for (const project of composition.documents) {
        if (!matches(`${SECTION.songs} ${project.title}`)) continue;
        const playable = !!(project.steps.length || project.melody?.length);
        files.push({
          id: `sequence:${project.id}`,
          title: project.title,
          path: SECTION.songs,
          detail: playable ? `${project.bpm} BPM` : 'Empty',
          current: project.id === song.id,
          projectId: project.id,
          open: () => openSequence(project.id, !!ui.nowPlaying),
          play: playable ? () => openSequence(project.id, true) : undefined,
        });
      }
    }
    if (includesSection('recordings')) {
      for (const file of recordings) {
        const title = recordingName(file);
        if (!matches(`${SECTION.recordings} ${title}`)) continue;
        files.push({
          id: `piece:recording:${file}`,
          title,
          path: SECTION.recordings,
          current: isCurrentPerformance(`recording:${file}`),
          open: () => openRecording(file),
          play: () => playRecording(file),
        });
      }
    }
    if (includesSection('collections') && (collection || search)) {
      for (const group of collection ? [collection] : collections) {
        for (const id of corpora[group] ?? []) {
          const title = titles[group]?.[id] || id;
          if (!matches(`${group} ${id} ${title}`)) continue;
          const ref = `${group}/${id}`;
          files.push({
            id: `piece:${ref}`,
            title,
            path: group,
            current: isCurrentPerformance(ref),
            open: () => openReference(group, id),
            play: () => playReference(group, id),
          });
        }
      }
    }
    return files;
  });

  function isCurrentPerformance(id: string) {
    return ui.sourceId === `piece:${id}` || ui.sourceId === `sequence:song:${id}`;
  }
  function openSequence(id: string, play: boolean) {
    selectSequence(id, play);
    onselect();
  }
  async function removeProject(id: string) {
    deleteSequence(id);
    await tick();
    contents?.focus();
  }
  function insertChart() {
    importChart(pasted);
    chartError = composition.error;
    if (chartError) return;
    pasted = '';
    chartDialog?.close();
    onselect();
  }
  async function navigate(section: Section | null, group: string | null = null) {
    folder = section;
    collection = group;
    query = '';
    error = '';
    await tick();
    contents?.focus();
  }
  $effect(() => {
    void search;
    void location;
    shown = PAGE_SIZE;
    if (contents) contents.scrollTop = 0;
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
      corpora = j.corpora;
      titles = j.titles ?? {};
    } catch {
      /* The local library is optional outside the dev server. */
    }
  }
  $effect(() => {
    if (open) {
      error = '';
      void refresh();
    }
  });
  const getJson = async (path: string) => {
    const response = await fetch(`/__library/${path}`);
    if (!response.ok) throw new Error(`Couldn't open ${path}. Choose another performance or try again.`);
    return response.json();
  };
  async function loadPerformance(
    load: () => Promise<Piece>,
    id: string,
    title: string,
    play = false,
    makeSong?: (piece: Piece) => Sequence | Promise<Sequence>,
  ) {
    error = '';
    registerPerformance(id, title, load);
    await choosePerformance(id, play, makeSong);
    if (ui.playbackError) error = ui.playbackError;
    else onselect();
  }
  /** Open a library entry in the timeline as a song (already open: just switch to it). */
  async function openAsSong(id: string, make: () => Promise<Sequence>) {
    error = '';
    stopPlayback();
    const request = ui.playbackRequest;
    const open = composition.documents.find((d) => d.id === id);
    if (open) selectSequence(open.id);
    else {
      try {
        ui.loading = true;
        const song = await make();
        if (request !== ui.playbackRequest) return;
        openSong({ ...song, id });
      } catch (cause) {
        if (request !== ui.playbackRequest) return;
        error = (cause as Error).message;
        return;
      } finally {
        if (request === ui.playbackRequest) ui.loading = false;
      }
    }
    onselect();
  }
  const openRecording = (file: string) =>
    openAsSong(`song:recording:${file}`, async () => {
      const rec = await getJson(`recordings/${file}`);
      return songFromPerformance(fromRecording(`recording:${file}`, rec), recordedChords(rec.engine));
    });
  const openReference = (group: string, id: string) =>
    openAsSong(`song:${group}/${id}`, async () => {
      const raw = await getJson(`data/${group}/${id}.json`);
      return { ...songFromReference(raw), title: `${raw.title ?? id} (${group})` };
    });
  function playReference(group: string, id: string) {
    let raw: Awaited<ReturnType<typeof getJson>>;
    return loadPerformance(
      async () => {
        raw = await getJson(`data/${group}/${id}.json`);
        return fromBenchmark(`${group}/${id}`, raw);
      },
      `${group}/${id}`,
      id,
      true,
      () => ({ ...songFromReference(raw), title: `${raw.title ?? id} (${group})` }),
    );
  }
  function playRecording(file: string) {
    let raw: Awaited<ReturnType<typeof getJson>>;
    return loadPerformance(
      async () => {
        raw = await getJson(`recordings/${file}`);
        return fromRecording(`recording:${file}`, raw);
      },
      `recording:${file}`,
      recordingName(file),
      true,
      (piece) => songFromPerformance(piece, recordedChords(raw.engine)),
    );
  }
  async function openFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    await loadPerformance(
      async () => {
        const buffer = await file.arrayBuffer();
        return fromMidi(`file:${file.name}`, file.name, parseMidiFile(buffer), midiFileMeta(buffer));
      },
      `file:${file.name}`,
      file.name,
    );
    if (fileInput) fileInput.value = '';
  }
</script>

<div class="library">
  <div class="library-actions">
    <input
      type="search"
      aria-label="Search library"
      placeholder={folder ? `Search ${location}…` : 'Search library…'}
      bind:value={query}
    >
    <button
      type="button"
      class="icon"
      title="New project"
      aria-label="New project"
      disabled={ui.loading}
      onclick={() => {
        newSequence();
        onselect();
      }}
    >
      <Icon name="plus" />
    </button>
    <button
      type="button"
      class="icon"
      title="Import MIDI"
      aria-label="Import MIDI"
      disabled={ui.loading}
      onclick={() => fileInput?.click()}
    >
      <Icon name="upload" />
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".mid,.midi"
      aria-label="Import MIDI file"
      hidden
      onchange={openFile}
    >
  </div>
  <fieldset class="library-project" aria-label="Current project">
    <label class="library-project-name" title="Rename current project">
      <Icon name="edit" size={15} />
      <input
        type="text"
        aria-label="Project name"
        value={song.title}
        disabled={ui.loading}
        onchange={(event) => editSequence((editor) => editor.update({ title: event.currentTarget.value }))}
        onkeydown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      >
    </label>
    <button
      type="button"
      class="icon"
      aria-label="Paste chord chart"
      aria-haspopup="dialog"
      title="Paste chord chart"
      disabled={ui.loading}
      onclick={() => {
        chartError = '';
        chartDialog?.showModal();
      }}
    >
      <Icon name="paste" size={16} />
    </button>
    <button
      type="button"
      class="icon"
      aria-label="Clear chords and melody"
      title="Clear chords and melody"
      disabled={!hasMusic || ui.loading}
      onclick={() => {
        resetWorkspace();
        onselect();
      }}
    >
      <Icon name="erase" size={16} />
    </button>
    <button
      type="button"
      class="icon"
      aria-label="Close project"
      title="Close project"
      disabled={ui.loading}
      onclick={() => {
        closeSong();
        onselect();
      }}
    >
      <Icon name="closeFolder" size={16} />
    </button>
  </fieldset>
  {#if folder}
    <nav class="library-path" aria-label="Library path">
      <button
        type="button"
        class="icon"
        title="Back"
        aria-label="Back"
        onclick={() => navigate(collection ? 'collections' : null)}
      >
        <Icon name="back" size={15} />
      </button>
      <button type="button" class="link" onclick={() => navigate(null)}>Library</button>
      <Icon name="right" size={13} />
      {#if collection}
        <button type="button" class="link" onclick={() => navigate('collections')}>Collections</button>
        <Icon name="right" size={13} />
      {/if}
      <span aria-current="page">{location}</span>
    </nav>
  {/if}
  {#if error}
    <p class="library-error library-message" role="alert">{error}</p>
  {/if}
  <section class="library-contents" aria-label={location} tabindex="-1" bind:this={contents} aria-busy={ui.loading}>
    {#if !folder && !search}
      <div class="lib-list">
        {#each folders as item (item.id)}
          {@render folderRow(SECTION[item.id], item.count, () => navigate(item.id))}
        {/each}
      </div>
    {:else if folder === 'collections' && !collection && !search}
      <div class="lib-list">
        {#each collections as group (group)}
          {@render folderRow(group, corpora[group].length, () => navigate('collections', group))}
        {:else}
          <p class="muted library-message">No collections available.</p>
        {/each}
      </div>
    {:else}
      <div class="lib-list">
        {#each entries.slice(0, shown) as entry (entry.id)}
          <div class="lib-row" class:current={entry.current}>
            <button
              type="button"
              class="lib-item"
              aria-current={entry.current ? 'true' : undefined}
              disabled={ui.loading}
              onclick={entry.open}
            >
              <Icon name="musicFile" size={16} />
              <span class="lib-name">{entry.title}</span>
              {#if search && !collection && (!folder || folder === 'collections')}
                <span class="lib-detail small muted">{entry.path}</span>
              {:else if entry.detail}
                <span class="lib-detail small muted">{entry.detail}</span>
              {/if}
            </button>
            {#if entry.play}
              <button
                type="button"
                class="icon lib-action"
                title={`Play ${entry.title}`}
                aria-label={`Play ${entry.title}`}
                onclick={entry.play}
                disabled={ui.loading}
              >
                <Icon name="play" size={16} />
              </button>
            {/if}
            {#if entry.projectId}
              {@const id = entry.projectId}
              <button
                type="button"
                class="icon lib-action"
                aria-label={`Duplicate ${entry.title}`}
                title={`Duplicate ${entry.title}`}
                disabled={ui.loading}
                onclick={() => {
                  duplicateSequence(id);
                  onselect();
                }}
              >
                <Icon name="copy" size={16} />
              </button>
              <button
                type="button"
                class="icon lib-action lib-delete"
                aria-label={`Delete ${entry.title}`}
                title={`Delete ${entry.title}`}
                disabled={ui.loading}
                onclick={() => removeProject(id)}
              >
                <Icon name="delete" size={16} />
              </button>
            {/if}
          </div>
        {:else}
          <p class="muted library-message">{search ? 'No matches in the Library.' : 'This folder is empty.'}</p>
        {/each}
      </div>
      {#if entries.length > shown}
        <button type="button" class="library-more" onclick={() => (shown += PAGE_SIZE)}>
          Show more ({shown} of {entries.length})
        </button>
      {/if}
    {/if}
  </section>
</div>

<dialog bind:this={chartDialog} class="region-dialog" aria-label="Insert chord chart">
  <h3>Insert chords at the cursor</h3>
  <textarea aria-label="Paste chord chart" bind:value={pasted} rows="4" placeholder="| Dm7 G7 | Cmaj7 |"></textarea>
  {#if chartError}
    <p class="library-error small" role="alert">{chartError}</p>
  {/if}
  <div class="row">
    <button type="button" onclick={() => chartDialog?.close()}>Cancel</button>
    <button type="button" disabled={!pasted.trim()} onclick={insertChart}>Insert chart</button>
  </div>
</dialog>

{#snippet folderRow(label: string, count: number, enter: () => void)}
  <button type="button" class="lib-item lib-folder" onclick={enter}>
    <Icon name="folder" />
    <span class="lib-name">{label}</span>
    <span class="lib-detail small muted">{count}</span>
    <Icon name="right" size={15} />
  </button>
{/snippet}
