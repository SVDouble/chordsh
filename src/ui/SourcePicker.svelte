<script lang="ts">
  import Library from './Library.svelte';
  import Icon from './Icon.svelte';
  import { ui } from './store.svelte';
  let dialog = $state<HTMLDialogElement>();
  function close() {
    dialog?.close();
  }
</script>
<button
  type="button"
  class="source-trigger"
  aria-label="Choose song or performance"
  aria-haspopup="dialog"
  title={ui.loadedTitle || 'Choose a song'}
  onclick={() => dialog?.showModal()}
>
  <span>{ui.loadedTitle || 'Untitled'}</span><Icon name="down" size={14} />
</button>
<dialog bind:this={dialog} class="source-dialog" aria-labelledby="source-title">
  <header>
    <h2 id="source-title">Songs & performances</h2>
    <button type="button" class="icon" aria-label="Close song picker" onclick={close}><Icon name="close" /></button>
  </header>
  <Library onselect={close} />
</dialog>
