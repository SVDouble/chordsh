<script lang="ts">
  import Icon from './Icon.svelte';
  import { chordsFromNotes, melodyFromPart } from '../engine/partImport';
  import { melodyPart, midiFileMeta, midiParts, type MidiPart } from '../io/midifile';
  import {
    chordsFromChart,
    composition,
    currentSequence,
    type FileMeta,
    loadChords,
    loadMelody,
    previewPart,
  } from './composition.svelte';
  import { notify } from './store.svelte';

  type Role = 'melody' | 'chords';
  let role = $state<Role>('melody');
  let input = $state<HTMLInputElement>();
  let dialog = $state<HTMLDialogElement>();
  let fileName = $state('');
  let parts = $state<MidiPart[]>([]);
  let meta = $state<FileMeta | null>(null);
  /** Melody: the one part to use. Chords: the parts whose notes are read together as chords. */
  let chosenMelody = $state('');
  let chosenChords = $state<string[]>([]);

  /**
   * Drag and drop anywhere on the page. Without this, Firefox tries to open a dropped file itself
   * ("may not load or link to file:///"). A MIDI file opens the part dialog, where melody or chords can be chosen.
   */
  let dragging = $state(false);
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  function dragOver(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    dragging = true;
  }
  function dragLeave(e: DragEvent) {
    if (!e.relatedTarget) dragging = false;
  }
  function drop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (!/\.(mid|midi|txt)$/i.test(file.name)) {
      notify(`${file.name}: drop a MIDI file (.mid) or a chord chart (.txt).`);
      return;
    }
    const doc = currentSequence();
    role = doc.melody?.length && !doc.steps.length ? 'chords' : /\.txt$/i.test(file.name) ? 'chords' : 'melody';
    opened(file);
  }

  /** Open the file picker to load the melody or the chords (the song's other part stays). */
  export function pick(r: Role) {
    role = r;
    if (input) {
      input.accept = r === 'melody' ? '.mid,.midi' : '.mid,.midi,.txt';
      input.value = '';
      input.click();
    }
  }

  async function opened(file: File) {
    fileName = file.name;
    composition.error = '';
    try {
      if (/\.txt$/i.test(file.name)) {
        loadChords(chordsFromChart(await file.text()), null, file.name);
        return;
      }
      const buffer = await file.arrayBuffer();
      parts = midiParts(buffer);
      meta = midiFileMeta(buffer);
      if (!parts.length) throw new Error(`${file.name} has no notes (drums are left out).`);
      const melody = melodyPart(parts);
      chosenMelody = melody?.id ?? parts[0].id;
      // chords: every part except the melody, unless the file has only one part
      chosenChords = parts.length > 1 ? parts.filter((p) => p.id !== melody?.id).map((p) => p.id) : [parts[0].id];
      dialog?.showModal();
    } catch (error) {
      composition.error = (error as Error).message;
    }
  }

  function load() {
    if (role === 'melody') {
      const part = parts.find((p) => p.id === chosenMelody);
      if (part) loadMelody(melodyFromPart(part.notes), meta, `${fileName} (${part.name})`);
    } else {
      const notes = parts.filter((p) => chosenChords.includes(p.id)).flatMap((p) => p.notes);
      const doc = currentSequence();
      loadChords(chordsFromNotes(notes, doc.meter), meta, fileName);
    }
    dialog?.close();
  }
  const describe = (p: MidiPart) =>
    `${p.notes.length} notes · ${p.overlap < 0.15 ? 'single line' : 'chords'} · around ${noteName(Math.round(p.meanPitch))}`;
  const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
</script>

<svelte:window ondragover={dragOver} ondragleave={dragLeave} ondrop={drop} />
{#if dragging}
  <div class="drop-hint" aria-hidden="true">Drop a MIDI file (melody or chords) or a chord chart (.txt)</div>
{/if}

<input
  bind:this={input}
  type="file"
  hidden
  aria-label="Choose a file to load"
  onchange={(e) => {
    const file = e.currentTarget.files?.[0];
    if (file) opened(file);
  }}
>

<dialog bind:this={dialog} class="region-dialog load-parts-dialog" aria-label="Choose the parts to load">
  <form
    onsubmit={(e) => {
      e.preventDefault();
      load();
    }}
  >
    <div class="row tight load-role">
      <span class="small muted">Use this file for</span>
      <label><input type="radio" name="load-role" value="melody" bind:group={role}> the melody</label>
      <label><input type="radio" name="load-role" value="chords" bind:group={role}> the chords</label>
    </div>
    <h3>{role === 'melody' ? 'Which part is the melody?' : 'Which parts make the chords?'}</h3>
    <p class="small muted">
      {fileName}{meta ? ` · ${Math.round(meta.bpm)} BPM · ${meta.beatsPerBar}/${meta.denominator}` : ''}
      {#if !currentSequence().steps.length && !currentSequence().melody?.length}
        · the empty song takes this tempo and meter
      {/if}
    </p>
    <ul class="load-part-list">
      {#each parts as p (p.id)}
        <li>
          <span class="load-part-choice">
            {#if role === 'melody'}
              <input id={`part-${p.id}`} type="radio" name="melody-part" value={p.id} bind:group={chosenMelody}>
            {:else}
              <input id={`part-${p.id}`} type="checkbox" value={p.id} bind:group={chosenChords}>
            {/if}
            <label for={`part-${p.id}`}><b>{p.name}</b> <span class="small muted">{describe(p)}</span></label>
          </span>
          <button
            type="button"
            class="icon"
            aria-label={`Hear ${p.name}`}
            title="Hear the first bars"
            onclick={() => previewPart(p.notes, meta?.bpm ?? 120, p.name)}
          >
            <Icon name="ear" size={14} />
          </button>
        </li>
      {/each}
    </ul>
    <p class="small muted">
      {role === 'melody'
        ? 'Where the part plays several notes at once, the top note is the melody. The chords stay as they are.'
        : 'The notes are read as one chord per bar, split where the harmony changes. The melody stays as it is.'}
    </p>
    <div class="row">
      <button type="button" onclick={() => dialog?.close()}>Cancel</button>
      <button type="submit" class="primary" disabled={role === 'melody' ? !chosenMelody : !chosenChords.length}>
        Load {role}
      </button>
    </div>
  </form>
</dialog>
