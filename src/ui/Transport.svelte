<script lang="ts">
  import { onMount } from 'svelte';
  import {
    playSelection,
    recorder,
    seekPlayback,
    session,
    startRecording,
    stopPlayback,
    stopRecording,
    ui,
    updatePlaybackClock,
  } from './store.svelte';

  const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  let recorded = $state(0);
  const chart = $derived.by(() => {
    void ui.tick;
    return session.song?.chart.title;
  });
  onMount(() => {
    const timer = setInterval(() => {
      updatePlaybackClock();
      if (ui.recording) recorded = recorder.elapsed;
    }, 100);
    return () => clearInterval(timer);
  });
</script>

<section class="transport" aria-label="Playback controls">
  <div class="transport-buttons">
    <button
      type="button"
      onclick={playSelection}
      disabled={ui.loading || !!ui.nowPlaying || !!ui.preview}
      title={chart ? `Hear ${chart}` : `Play ${ui.loadedTitle || 'the demo'}`}
    >
      ▶ Play
    </button>
    <button type="button" class="stop-playback" onclick={stopPlayback} title="Stop all playback and sound (Esc)">
      ■ Stop
    </button>
    {#if ui.recording}
      <span class="rec-on"><i class="rec-dot"></i>{time(recorded)}</span>
      <button type="button" class="rec-stop" onclick={stopRecording}>■ Save recording</button>
    {:else}
      <button
        type="button"
        onclick={() => {
          recorded = 0;
          startRecording();
        }}
        title="Record your MIDI and the app's analysis"
      >
        ● Rec
      </button>
    {/if}
  </div>
  {#if ui.recording}
    <input class="rec-note" bind:value={ui.recNote} placeholder="Recording note (optional)" aria-label="Recording note">
  {:else if ui.recMsg}
    <span class="small rec-msg" title={ui.recMsg}>{ui.recMsg.startsWith('Saved') ? '✓ saved' : ui.recMsg}</span>
  {/if}
  {#if ui.playbackDuration > 0 && !chart && !ui.preview}
    <label class="seek">
      <span class="sr-only">Playback position</span>
      <input
        type="range"
        min="0"
        max={ui.playbackDuration}
        step="100"
        value={ui.playbackPosition}
        onchange={(e) => seekPlayback(+e.currentTarget.value)}
      >
      <span>{time(ui.playbackPosition)} / {time(ui.playbackDuration)}</span>
    </label>
  {/if}
  <span class="playback-status" title={ui.nowPlaying ?? ui.preview ?? chart ?? ui.loadedTitle} aria-live="polite">
    {ui.loading
      ? 'Loading music…'
      : (ui.nowPlaying ?? ui.preview ?? (ui.bars === 'metronome' ? 'Metronome' : (chart ?? ui.loadedTitle)))}
  </span>
</section>
