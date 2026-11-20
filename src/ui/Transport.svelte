<script lang="ts">
  import Icon from './Icon.svelte';
  import SourcePicker from './SourcePicker.svelte';
  import { onMount } from 'svelte';
  import { resetWorkspace } from './composition.svelte';
  import {
    downloadMidi,
    playSelection,
    pausePlayback,
    persist,
    settings,
    recorder,
    startRecording,
    stopPlayback,
    stopRecording,
    ui,
    updatePlaybackClock,
  } from './store.svelte';

  const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  let recorded = $state(0);
  onMount(() => {
    const timer = setInterval(() => {
      updatePlaybackClock();
      if (ui.recording) {
        recorded = recorder.elapsed;
        ui.recordingElapsed = recorded;
      }
    }, 100);
    return () => clearInterval(timer);
  });
  function stop() {
    stopPlayback();
    if (ui.recording) void stopRecording();
  }
</script>

<section class="transport" aria-label="Playback controls">
  <div class="transport-buttons">
    <button
      type="button"
      class="icon"
      onclick={() => (ui.nowPlaying ? pausePlayback() : playSelection())}
      disabled={ui.loading || !!ui.preview || !ui.playbackDuration}
      aria-label={ui.nowPlaying ? 'Pause' : 'Play'}
      title={ui.nowPlaying ? 'Pause' : ui.playbackPaused ? 'Resume' : 'Play'}
      aria-pressed={!!ui.nowPlaying}
    >
      <Icon name={ui.nowPlaying ? 'pause' : 'play'} />
    </button>
    <button type="button" class="icon stop-playback" onclick={stop} aria-label="Stop" title="Stop (Esc)">
      <Icon name="stop" />
    </button>
    <button
      type="button"
      class="icon"
      class:active={settings.preferences.loopPlayback}
      aria-label="Loop playback"
      aria-pressed={settings.preferences.loopPlayback}
      title={settings.preferences.loopPlayback
        ? 'Loop on — repeat the whole song'
        : 'Loop off — click to repeat the whole song'}
      onclick={() => {
        settings.preferences.loopPlayback = !settings.preferences.loopPlayback;
        persist();
      }}
    >
      <Icon name="loop" />
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
        else {
          recorded = 0;
          startRecording();
        }
      }}
    >
      <Icon name="record" />
    </button>
  </div>
  <button
    type="button"
    class="icon reset-workspace"
    aria-label="Clear this song's chords and melody"
    title="Clear this song's chords and melody (the song stays; Undo brings them back)"
    onclick={resetWorkspace}
  >
    <Icon name="reset" />
  </button>
  <SourcePicker />
  <button
    type="button"
    class="icon"
    aria-label="Export MIDI"
    title="Export current song as MIDI"
    disabled={!ui.playbackDuration}
    onclick={() => downloadMidi()}
  >
    <Icon name="download" />
  </button>
  {#if ui.recording}
    <span class="rec-on"><i class="rec-dot"></i>{time(recorded)}</span>
    <input class="rec-note" bind:value={ui.recNote} placeholder="Recording note (optional)" aria-label="Recording note">
  {:else if ui.recMsg}
    <span class="small rec-msg" title={ui.recMsg}>{ui.recMsg.startsWith('Saved') ? '✓ saved' : ui.recMsg}</span>
  {/if}
  <span class="playback-status sr-only" aria-live="polite"
    >{ui.loading ? 'Loading…' : (ui.preview ?? (ui.nowPlaying ? 'Playing' : ui.playbackPaused ? 'Paused' : ''))}</span
  >
  {#if ui.playbackError}
    <span class="warn small" role="alert">{ui.playbackError}</span>
  {/if}
</section>
