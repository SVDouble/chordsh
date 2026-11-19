<script lang="ts">
  import { settings } from './store.svelte';
  import { onMount } from 'svelte';
  import { live, setBars, stopPlayback, stopRecording, midi, persist, synth, ui } from './store.svelte';
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

  const m = $derived.by(() => {
    void ui.tick; // re-run when the engine changes
    const errors = midi.inputs.filter((p) => p.error);
    return {
      inputs: midi.inputs,
      outputs: midi.outputs,
      inputId: midi.inputId,
      outputId: midi.outputId,
      devices: midi.devices,
      last: midi.last,
      errors,
      label:
        midi.status === 'unsupported'
          ? 'Web MIDI unavailable — use Chrome or Edge'
          : midi.status === 'denied'
            ? 'MIDI access denied'
            : midi.status === 'pending'
              ? 'Connecting MIDI…'
              : midi.devices.length
                ? midi.devices.join(', ')
                : 'No MIDI device',
    };
  });
</script>

<div class="app" style:--topbar-height={`${topbarHeight}px`}>
  <header class="topbar" bind:clientHeight={topbarHeight}>
    <div class="brand">chord.sh</div>
    <span
      class="midi-chip"
      class:ok={m.devices.length && !m.errors.length}
      class:bad={m.errors.length}
      title={[
        ...m.inputs.map((p) => `${p.name}${p.error ? ' — ' + p.error : ''}`),
        m.last ? `last message: ${m.last.text} from ${m.last.port}` : 'no messages received yet',
      ].join('\n')}
    >
      {#key m.last?.t}
        <i class="led" class:flash={m.last}></i>
      {/key}
      {m.label}
      {#if m.last}
        <code class="muted">{m.last.text}</code>
      {:else if m.devices.length}
        <span class="muted"> · press a key </span>
      {/if}
    </span>
    {#if m.errors.length}
      <span class="warn small">{m.errors[0].device}: {m.errors[0].error}</span>
    {/if}
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
      {ui.audioBlocked && settings.preferences.monitor ? '🔓' : settings.preferences.monitor ? '🔊' : '🔇'}
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
      {settings.preferences.theme === 'dark' ? '☀' : '☾'}
    </button>
    <Panels />
    <Settings />
  </header>

  <main class="stage"><Workspace /></main>

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
