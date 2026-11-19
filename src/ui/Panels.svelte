<script lang="ts">
  import { settings } from './store.svelte';
  import { persist, ui } from './store.svelte';

  function preset(focus: 'all' | 'song' | 'progression') {
    settings.panels.now = focus === 'all';
    settings.panels.next = focus === 'all';
    settings.panels.map = focus === 'all';
    settings.panels.piano = true;
    if (focus === 'song') ui.tab = 'editor';
    if (focus === 'progression') ui.tab = 'progression';
    persist();
  }
</script>

<details class="settings panel-settings">
  <summary>Panels</summary>
  <div class="settings-panel">
    <div class="label">Focus</div>
    <div class="row">
      <button type="button" onclick={() => preset('all')}>All panels</button>
      <button type="button" onclick={() => preset('song')}>Song</button>
      <button type="button" onclick={() => preset('progression')}>Progression</button>
    </div>
    <label
      ><span>Now playing</span>
      <input type="checkbox" bind:checked={settings.panels.now} onchange={() => persist()}></label
    >
    <label
      ><span>Where next</span>
      <input type="checkbox" bind:checked={settings.panels.next} onchange={() => persist()}></label
    >
    <label
      ><span>Tonal map</span>
      <input type="checkbox" bind:checked={settings.panels.map} onchange={() => persist()}></label
    >
    <label
      ><span>Piano</span><input type="checkbox" bind:checked={settings.panels.piano} onchange={() => persist()}></label
    >
    <p class="small muted">Drag the dividers to resize. Your layout is remembered.</p>
  </div>
</details>
