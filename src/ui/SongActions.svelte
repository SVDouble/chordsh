<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Sequence } from '../engine/sequence';
  import { session, ui } from './store.svelte';
  import { canRedo, canUndo, composition, editSequence, exportSequenceMidi, saveSong } from './composition.svelte';

  let { song }: { song: Sequence } = $props();
  const history = $derived.by(() => {
    void composition.revision;
    return { undo: canUndo(), redo: canRedo() };
  });
  const guide = $derived.by(() => {
    void ui.tick;
    return session.songGuide;
  });
</script>

<fieldset class="tool-group arrangement-actions" aria-label="Transpose and piano guide">
  <button
    type="button"
    class="icon"
    aria-label="Transpose down"
    title="Transpose down one semitone"
    onclick={() => editSequence((e) => e.transpose(-1))}
  >
    <Icon name="arrowDown" />
  </button>
  <button
    type="button"
    class="icon"
    aria-label="Transpose up"
    title="Transpose up one semitone"
    onclick={() => editSequence((e) => e.transpose(1))}
  >
    <Icon name="arrowUp" />
  </button>
  <button
    type="button"
    class="icon"
    class:chosen={guide}
    aria-label="Piano guide"
    aria-pressed={guide}
    title="Piano guide"
    onclick={() => {
      session.songGuide = !guide;
      session.onChange();
    }}
  >
    <Icon name="keyboard" />
  </button>
</fieldset>

<fieldset class="tool-group song-actions" aria-label="Project tools">
  <button
    type="button"
    class="icon"
    class:chosen={ui.projectSavePending}
    aria-label="Save project"
    disabled={!ui.projectSavePending}
    title={ui.projectSavePending ? 'Retry saving projects (Ctrl/Cmd S)' : 'Projects autosaved'}
    onclick={saveSong}
  >
    <Icon name="save" />
  </button>
  <button
    type="button"
    class="icon"
    aria-label="Export MIDI"
    title="Export MIDI"
    disabled={!song.steps.length && !song.melody?.length}
    onclick={exportSequenceMidi}
  >
    <Icon name="download" />
  </button>
  <button
    type="button"
    class="icon"
    aria-label="Undo"
    title="Undo (Ctrl/Cmd Z)"
    disabled={!history.undo}
    onclick={() => editSequence((e) => e.undo())}
  >
    <Icon name="undo" />
  </button>
  <button
    type="button"
    class="icon"
    aria-label="Redo"
    title="Redo (Ctrl/Cmd Shift Z)"
    disabled={!history.redo}
    onclick={() => editSequence((e) => e.redo())}
  >
    <Icon name="redo" />
  </button>
</fieldset>
