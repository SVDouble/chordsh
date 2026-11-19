<script lang="ts">
  import Icon from './Icon.svelte';
  import DevicePicker from './DevicePicker.svelte';
  import { settings } from './store.svelte';
  import { onMount } from 'svelte';
  import { live, setBars, stopPlayback, stopRecording, midi, persist, synth, ui, dismissNotice } from './store.svelte';
  import { editSequence } from './composition.svelte';
  import { attachQwerty } from '../io/qwerty';
  import Piano from './Piano.svelte';
  import Workspace from './Workspace.svelte';
  import Transport from './Transport.svelte';
  import Panels from './Panels.svelte';
  import Settings from './Settings.svelte';

  let topbarHeight = $state(0);
  $effect(() => {
    document.documentElement.dataset.theme = settings.preferences.theme;
  });
  let unlockRequested = false;
  function toggleSound() {
    settings.preferences.monitor = unlockRequested || ui.audioBlocked ? true : !settings.preferences.monitor;
    synth.setMuted(!settings.preferences.monitor);
    unlockRequested = false;
    persist();
    synth.unlock();
  }

  onMount(() => {
    midi.inputId = settings.preferences.input;
    midi.outputId = settings.preferences.output;
    void midi.init();
    if (settings.preferences.bars === 'metronome') setBars('metronome');
    return attachQwerty(live);
  });
</script>

<div class="app" style:--topbar-height={`${topbarHeight}px`}>
  <header class="topbar" bind:clientHeight={topbarHeight}>
    <div class="brand">chord.sh</div>
    <DevicePicker />
    <Transport />
    <span class="spacer"></span>
    <button
      type="button"
      class="icon sound-toggle"
      class:dim={!settings.preferences.monitor}
      class:locked={ui.audioBlocked && settings.preferences.monitor}
      aria-label={ui.audioBlocked && settings.preferences.monitor
        ? 'Enable sound'
        : settings.preferences.monitor
          ? 'Mute sound'
          : 'Unmute sound'}
      onpointerdown={() => (unlockRequested = ui.audioBlocked)}
      onkeydown={() => (unlockRequested = ui.audioBlocked)}
      onclick={toggleSound}
      title={ui.audioBlocked && settings.preferences.monitor
        ? 'Enable sound — click to unlock browser audio'
        : settings.preferences.monitor
          ? 'Sound on — you hear what you play (click to mute)'
          : 'Sound off (click to hear what you play)'}
    >
      <Icon
        name={ui.audioBlocked && settings.preferences.monitor
          ? 'unlock'
          : settings.preferences.monitor
            ? 'volume'
            : 'mute'}
      />
    </button>
    <button
      type="button"
      class="icon"
      onclick={() => {
        settings.preferences.theme = settings.preferences.theme === 'dark' ? 'light' : 'dark';
        persist();
      }}
      title="Switch light / dark"
    >
      <Icon name={settings.preferences.theme === 'dark' ? 'sun' : 'moon'} />
    </button>
    <Panels />
    <Settings />
  </header>

  <main class="stage"><Workspace /></main>
  {#if ui.notice}
    <div class="workspace-notice" role="status" aria-live="polite">
      <span>{ui.notice.message}</span>
      {#if ui.notice.action}
        <button
          type="button"
          onclick={() => {
            const action = ui.notice?.action;
            dismissNotice();
            action?.();
          }}
        >
          {ui.notice.actionLabel}
        </button>
      {/if}
      <button type="button" class="icon" aria-label="Dismiss notification" title="Dismiss" onclick={dismissNotice}>
        ×
      </button>
    </div>
  {/if}

  {#if settings.panels.piano}
    <footer><Piano /></footer>
  {/if}
</div>

<!-- any click or key press unlocks browser audio (MIDI notes don't count as a gesture) -->
<svelte:window
  onpointerdown={() => synth.unlock()}
  onkeydown={(e) => {
    synth.unlock();
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') {
      stopPlayback();
      if (ui.recording) void stopRecording();
    }
    const typing =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement;
    if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      editSequence((s) => (e.shiftKey ? s.redo() : s.undo()));
    }
  }}
/>
