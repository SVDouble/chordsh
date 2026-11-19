<script lang="ts">
  import { onMount } from 'svelte';
  import { live, setBars, stopPlayback, midi, persist, savedSettings, session, synth, ui } from './store.svelte';
  import { attachQwerty } from '../io/qwerty';
  import { ALL_KEYS, keyFromIndex, keyIndex, keyLong } from '../theory/scales';
  import { midiName } from '../theory/pitch';
  import Piano from './Piano.svelte';
  import Workspace from './Workspace.svelte';
  import Transport from './Transport.svelte';
  import Panels from './Panels.svelte';

  let lock = $state('auto');
  let topbarHeight = $state(0);
  $effect(() => {
    document.documentElement.dataset.theme = ui.theme;
  });
  let unlockRequested = false;
  function toggleSound() {
    ui.monitor = unlockRequested || ui.audioBlocked ? true : !ui.monitor;
    unlockRequested = false;
    persist();
    synth.unlock();
  }
  let split = $state('auto');

  onMount(() => {
    if (savedSettings.style) session.setStyle(savedSettings.style);
    midi.inputId = savedSettings.input ?? 'all';
    midi.outputId = savedSettings.output ?? '';
    void midi.init();
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
    <div class="brand">Musify</div>
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
    <label>
      Key
      <select bind:value={lock} onchange={() => session.setKeyLock(lock === 'auto' ? null : keyFromIndex(+lock))}>
        <option value="auto">Auto-detect</option>
        {#each ALL_KEYS as k}
          <option value={String(keyIndex(k))}>{keyLong(k)}</option>
        {/each}
      </select>
    </label>
    <label>
      Chords
      <select
        value={session.style}
        onchange={(e) => {
          session.setStyle(e.currentTarget.value as 'jazz' | 'triads');
          persist();
        }}
      >
        <option value="jazz">Jazz (7ths)</option>
        <option value="triads">Triads</option>
      </select>
    </label>
    <button
      type="button"
      class="icon sound-toggle"
      class:dim={!ui.monitor}
      class:locked={ui.audioBlocked && ui.monitor}
      aria-label={ui.audioBlocked && ui.monitor ? 'Enable sound' : ui.monitor ? 'Mute sound' : 'Unmute sound'}
      onpointerdown={() => (unlockRequested = ui.audioBlocked)}
      onkeydown={() => (unlockRequested = ui.audioBlocked)}
      onclick={toggleSound}
      title={ui.audioBlocked && ui.monitor
        ? 'Enable sound — click to unlock browser audio'
        : ui.monitor
          ? 'Sound on — you hear what you play (click to mute)'
          : 'Sound off (click to hear what you play)'}
    >
      {ui.audioBlocked && ui.monitor ? '🔓' : ui.monitor ? '🔊' : '🔇'}
    </button>
    <button
      type="button"
      class="icon"
      onclick={() => {
        ui.theme = ui.theme === 'dark' ? 'light' : 'dark';
        persist();
      }}
      title="Switch light / dark"
    >
      {ui.theme === 'dark' ? '☀' : '☾'}
    </button>
    <Panels />
    <details class="settings">
      <summary title="Settings">⚙</summary>
      <div class="settings-panel">
        <label>
          MIDI in
          <select
            value={m.inputId}
            onchange={(e) => {
              midi.inputId = e.currentTarget.value;
              midi.refresh();
              persist();
            }}
          >
            <option value="all">All devices</option>
            {#each m.inputs as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
        <label>
          MIDI out
          <span class="row tight">
            <select
              value={m.outputId}
              onchange={(e) => {
                midi.outputId = e.currentTarget.value;
                persist();
                ui.tick++;
              }}
            >
              <option value="">None</option>
              {#each m.outputs as p}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
            <button
              type="button"
              disabled={!m.outputId}
              onclick={() => midi.send([48, 52, 55, 60], performance.now(), 800)}
            >
              Test
            </button>
          </span>
        </label>
        <label>
          Suggestions sound
          <select bind:value={ui.sound} onchange={() => persist()}>
            <option value="synth">Browser synth</option>
            <option value="midi">MIDI out</option>
            <option value="both">Both</option>
            <option value="off">Off</option>
          </select>
        </label>
        <label>
          Hand split
          <select
            bind:value={split}
            onchange={() => (session.seg.splitMode = split === 'auto' || split === 'off' ? split : +split)}
          >
            <option value="auto">Auto</option>
            <option value="off">Off (one hand)</option>
            {#each [48, 53, 55, 57, 60, 62, 64] as n}
              <option value={String(n)}>at {midiName(n)}</option>
            {/each}
          </select>
        </label>
        <label>
          Tempo
          <span class="row tight">
            <input
              type="range"
              min="50"
              max="160"
              bind:value={ui.tempo}
              onchange={() => {
                persist();
                if (ui.bars === 'metronome') setBars('metronome');
              }}
            >
            {ui.tempo}
          </span>
        </label>
        <label title="Bars come from your playing (estimated), or from a metronome (exact)">
          Bars
          <span class="row tight">
            <select
              value={ui.bars === 'metronome' ? 'metronome' : 'auto'}
              onchange={(e) => setBars(e.currentTarget.value as 'auto' | 'metronome')}
            >
              <option value="auto">From my playing</option>
              <option value="metronome">Metronome</option>
            </select>
            <select
              bind:value={ui.meter}
              onchange={() => {
                persist();
                if (ui.bars !== 'auto') setBars(ui.bars);
              }}
            >
              <option value={3}>3/4</option>
              <option value={4}>4/4</option>
              <option value={6}>6/8</option>
            </select>
          </span>
        </label>
        {#if ui.bars === 'metronome'}
          <label> Click <input type="checkbox" bind:checked={ui.click} onchange={() => persist()}> </label>
        {/if}
        <p class="small muted">
          Piano colours: <b style="color:var(--harmony)">harmony</b> · <b style="color:var(--melody)">melody</b> ·
          <b style="color:var(--audition)">suggestion</b>
          · <b style="color:var(--guide)">practice target</b>
        </p>
      </div>
    </details>
  </header>

  <main class="stage"><Workspace /></main>

  {#if ui.panels.piano}
    <footer><Piano /></footer>
  {/if}
</div>

<!-- any click or key press unlocks browser audio (MIDI notes don't count as a gesture) -->
<svelte:window
  onpointerdown={() => synth.unlock()}
  onkeydown={(e) => {
    synth.unlock();
    if (e.key === 'Escape') stopPlayback();
  }}
/>
