<script lang="ts">
  import Library from './Library.svelte';
  import Icon from './Icon.svelte';
  import type { Snippet } from 'svelte';
  import type { Sequence } from '../engine/sequence';
  let {
    song,
    open = $bindable(false),
    notice,
  }: { song: Sequence; open: boolean; notice: Snippet<[boolean]> } = $props();
  let dialog = $state<HTMLDialogElement>();
  function close() {
    dialog?.close();
  }
</script>
<button
  type="button"
  class="source-trigger"
  aria-label="Choose project or performance"
  aria-haspopup="dialog"
  title={`Library · ${song.title}`}
  onclick={() => {
    dialog?.showModal();
    open = true;
  }}
>
  <Icon name="folder" /><span>{song.title}</span>
</button>
<dialog bind:this={dialog} class="source-dialog" aria-labelledby="source-title" onclose={() => (open = false)}>
  <header>
    <h2 id="source-title">Library</h2>
    <button type="button" class="icon" aria-label="Close Library" onclick={close}><Icon name="close" /></button>
  </header>
  <Library {open} {song} onselect={close} />
  {#if open}
    {@render notice(true)}
  {/if}
</dialog>
