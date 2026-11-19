<script lang="ts">
  import { onMount } from 'svelte';
  import { composition, exampleSequences, newSequence, selectSequence } from './composition.svelte';
  import {
    choosePerformance,
    downloadMidi,
    playSelection,
    recorder,
    seekPlayback,
    startRecording,
    stopPlayback,
    stopRecording,
    ui,
    updatePlaybackClock,
  } from './store.svelte';

  const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  let recorded = $state(0);
  const examples = $derived(exampleSequences.filter((s) => !composition.documents.some((d) => d.id === s.id)));
  onMount(() => {
    const timer = setInterval(() => {
      updatePlaybackClock();
      if (ui.recording) recorded = recorder.elapsed;
    }, 100);
    return () => clearInterval(timer);
  });
  async function switchSource(e: Event) {
    const element = e.currentTarget as HTMLSelectElement;
    const value = element.value;
    const playing = !!ui.nowPlaying || !!ui.preview;
    if (value === 'new') newSequence();
    else if (value.startsWith('sequence:')) selectSequence(value.slice(9), playing);
    else await choosePerformance(value.slice(6), playing);
    element.value = ui.sourceId;
  }
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
      onclick={playSelection}
      disabled={ui.loading || !!ui.nowPlaying || !!ui.preview || !ui.playbackDuration}
      aria-label="Play"
      title="Play"
    >
      ▶
    </button>
    <button type="button" class="icon stop-playback" onclick={stop} aria-label="Stop" title="Stop (Esc)">■</button>
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
      ●
    </button>
  </div>
  <label class="source-picker">
    <span class="sr-only">Current song</span>
    <select aria-label="Current song" value={ui.sourceId} onchange={switchSource}>
      <optgroup label="My songs">
        {#each composition.documents as s (s.id)}
          <option value={`sequence:${s.id}`}>{s.title}</option>
        {/each}
      </optgroup>
      {#if examples.length}
        <optgroup label="Examples">
          {#each examples as s (s.id)}
            <option value={`sequence:${s.id}`}>{s.title}</option>
          {/each}
        </optgroup>
      {/if}
      <optgroup label="Performances">
        {#each ui.performanceChoices as p (p.id)}
          <option value={`piece:${p.id}`}>{p.title}</option>
        {/each}
      </optgroup>
      <option value="new">＋ New song</option>
    </select>
  </label>
  <button
    type="button"
    class="icon"
    aria-label="Export MIDI"
    title="Export current song as MIDI"
    disabled={!ui.playbackDuration}
    onclick={() => downloadMidi()}
  >
    ⇩
  </button>
  {#if ui.recording}
    <span class="rec-on"><i class="rec-dot"></i>{time(recorded)}</span>
    <input class="rec-note" bind:value={ui.recNote} placeholder="Recording note (optional)" aria-label="Recording note">
  {:else if ui.recMsg}
    <span class="small rec-msg" title={ui.recMsg}>{ui.recMsg.startsWith('Saved') ? '✓ saved' : ui.recMsg}</span>
  {/if}
  {#if ui.playbackDuration > 0 && !ui.preview}
    <label class="seek"
      ><span class="sr-only">Playback position</span>
      <input
        type="range"
        min="0"
        max={ui.playbackDuration}
        step="100"
        value={ui.playbackPosition}
        onchange={(e) => seekPlayback(+e.currentTarget.value)}
      ><span>{time(ui.playbackPosition)} / {time(ui.playbackDuration)}</span></label
    >
  {/if}
  <span class="playback-status" aria-live="polite"
    >{ui.loading ? 'Loading…' : (ui.preview ?? (ui.nowPlaying ? 'Playing' : ''))}</span
  >
  {#if ui.playbackError}
    <span class="warn small" role="alert">{ui.playbackError}</span>
  {/if}
</section>
