<script lang="ts">
  import Icon from './Icon.svelte';
  import { settings } from './store.svelte';
  import { persist, ui } from './store.svelte';

  function preset(focus: 'all' | 'song') {
    settings.panels.now = focus === 'all';
    settings.panels.next = focus === 'all';
    settings.panels.map = focus === 'all';
    settings.panels.piano = true;
    if (focus === 'song') ui.tab = 'editor';
    persist();
  }
</script>

<div class="panel-settings">
  <button
    type="button"
    popovertarget="workspace-panels"
    class="icon"
    aria-label="Workspace panels"
    title="Workspace panels"
  >
    <Icon name="panels" />
  </button>
  <div id="workspace-panels" popover="auto" class="settings-panel navbar-popover">
    <div class="label">Focus</div>
    <div class="row">
      <button type="button" onclick={() => preset('all')}>All panels</button>
      <button type="button" onclick={() => preset('song')}>Project</button>
    </div>
    <label
      ><span>Chord inspector</span>
      <input type="checkbox" bind:checked={settings.panels.now} onchange={() => persist()}></label
    >
    <label
      ><span>Ideas</span>
      <input type="checkbox" bind:checked={settings.panels.next} onchange={() => persist()}></label
    >
    <label
      ><span>Key exploration</span>
      <input type="checkbox" bind:checked={settings.panels.map} onchange={() => persist()}></label
    >
    <label
      ><span>Piano</span><input type="checkbox" bind:checked={settings.panels.piano} onchange={() => persist()}></label
    >
    {#if settings.panels.piano}
      <label
        ><span>Piano note names</span>
        <input type="checkbox" bind:checked={settings.editor.pianoNoteNames} onchange={() => persist()}></label
      >
      <label
        ><span>Piano chord tones</span>
        <input type="checkbox" bind:checked={settings.editor.pianoChordRoles} onchange={() => persist()}></label
      >
    {/if}
    <p class="small muted">Drag the dividers to resize. Your layout is remembered.</p>
  </div>
</div>
