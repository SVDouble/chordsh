<script lang="ts">
  import Icon from './Icon.svelte';
  import { onMount } from 'svelte';
  import { assist } from './composition.svelte';
  import {
    playSelection,
    pausePlayback,
    persist,
    recorder,
    setMetronome,
    settings,
    startRecording,
    stopRecording,
    stopTransport,
    ui,
    updatePlaybackClock,
  } from './store.svelte';

  const captureTargets = [
    { id: 'both', icon: 'voices', label: 'Capture chords and melody' },
    { id: 'melody', icon: 'melody', label: 'Capture melody only' },
    { id: 'chords', icon: 'chord', label: 'Capture chords only' },
  ] as const;
  onMount(() => {
    const timer = setInterval(() => {
      updatePlaybackClock();
      if (ui.recording) ui.recordingElapsed = recorder.elapsed;
    }, 100);
    return () => clearInterval(timer);
  });
</script>

<section class="transport" aria-label="Playback controls">
  <fieldset class="capture-target" aria-label="What recording captures">
    {#each captureTargets as target}
      <button
        type="button"
        class="icon"
        class:chosen={assist.recordTarget === target.id}
        aria-label={target.label}
        title={target.label}
        aria-pressed={assist.recordTarget === target.id}
        disabled={ui.recording}
        onclick={() => (assist.recordTarget = target.id)}
      >
        <Icon name={target.icon} />
      </button>
    {/each}
  </fieldset>
  <div class="transport-buttons">
    <button
      type="button"
      class="icon"
      class:active={ui.metronome}
      aria-label="Metronome"
      aria-pressed={ui.metronome}
      title="Metronome"
      onclick={() => setMetronome(!ui.metronome)}
    >
      <Icon name="metronome" />
    </button>
    <button
      type="button"
      class="icon"
      class:active={settings.preferences.loopPlayback}
      aria-label="Loop playback"
      aria-pressed={settings.preferences.loopPlayback}
      title={settings.preferences.loopPlayback
        ? 'Loop on — repeat the whole project'
        : 'Loop off — click to repeat the whole project'}
      onclick={() => {
        settings.preferences.loopPlayback = !settings.preferences.loopPlayback;
        persist();
      }}
    >
      <Icon name="loop" />
    </button>
    <button type="button" class="icon stop-playback" onclick={stopTransport} aria-label="Stop" title="Stop (Esc)">
      <Icon name="stop" />
    </button>
    <button
      type="button"
      class="icon"
      onclick={() => (ui.nowPlaying ? pausePlayback() : playSelection())}
      disabled={ui.loading || ui.recording || !!ui.preview || !ui.playbackDuration}
      aria-label={ui.nowPlaying ? 'Pause' : 'Play'}
      title={ui.nowPlaying ? 'Pause' : ui.playbackPaused ? 'Resume' : 'Play'}
      aria-pressed={!!ui.nowPlaying}
    >
      <Icon name={ui.nowPlaying ? 'pause' : 'play'} />
    </button>
    <button
      type="button"
      class="icon record-toggle"
      class:recording={ui.recording}
      aria-label={ui.recording ? 'Save recording' : 'Record'}
      aria-pressed={ui.recording}
      title={ui.recording ? 'Stop recording and save' : 'Record'}
      onclick={() => {
        if (ui.recording) void stopRecording();
        else startRecording();
      }}
    >
      <Icon name="record" />
    </button>
  </div>
  <span class="playback-status sr-only" aria-live="polite"
    >{ui.loading ? 'Loading…' : (ui.preview ?? (ui.nowPlaying ? 'Playing' : ui.playbackPaused ? 'Paused' : ''))}</span
  >
</section>
