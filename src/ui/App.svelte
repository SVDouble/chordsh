<script lang="ts">
  import { onMount } from 'svelte';
  import {
    live,
    recorder,
    setBars,
    startRecording,
    stopRecording,
    stopAudition,
    midi,
    persist,
    savedSettings,
    session,
    synth,
    ui,
  } from './store.svelte';
  import { attachQwerty } from '../io/qwerty';
  import { ALL_KEYS, keyFromIndex, keyIndex, keyLong, keyShort } from '../theory/scales';
  import { midiName } from '../theory/pitch';
  import NowPlaying from './NowPlaying.svelte';
  import KeyWheel from './KeyWheel.svelte';
  import History from './History.svelte';
  import NextMoves from './NextMoves.svelte';
  import Route from './Route.svelte';
  import Piano from './Piano.svelte';
  import Song from './Song.svelte';
  import Library from './Library.svelte';

  let lock = $state('auto');
  let recClock = $state('0:00');
  $effect(() => {
    if (!ui.recording) return;
    const id = setInterval(() => {
      const s = Math.floor(recorder.elapsed / 1000);
      recClock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
    return () => clearInterval(id);
  });
  $effect(() => {
    document.documentElement.dataset.theme = ui.theme;
  });
  function toggleSound() {
    ui.monitor = !ui.monitor;
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
      target: session.target,
      song: session.song?.chart.title ?? '',
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

<div class="app">
  <header class="topbar">
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
      {#key m.last?.t}<i class="led" class:flash={m.last}></i>{/key}
      {m.label}
      {#if m.last}<code class="muted">{m.last.text}</code>{:else if m.devices.length}<span class="muted">
          · press a key
        </span>{/if}
    </span>
    {#if m.errors.length}<span class="warn small">{m.errors[0].device}: {m.errors[0].error}</span>{/if}
    {#if ui.audioBlocked && ui.monitor}<button
        class="sound-btn"
        onclick={() => synth.unlock()}
        title="Browsers only allow sound after you click the page"
      >
        Click to enable sound
      </button>{/if}
    {#if ui.recording}
      <span class="rec-on"><i class="rec-dot"></i>{recClock}</span>
      <input
        class="rec-note"
        bind:value={ui.recNote}
        placeholder="What are you playing? e.g. held Cmaj7 LH, improvising RH"
      />
      <button class="rec-stop" onclick={stopRecording}>■ Save</button>
    {:else}
      <button
        onclick={startRecording}
        title="Record your MIDI and the app's analysis to a file, for debugging the predictions"
      >
        ● Rec
      </button>
    {/if}
    {#if ui.recMsg && !ui.recording}<span class="small rec-msg" title={ui.recMsg}>
        {ui.recMsg.startsWith('Saved') ? '✓ saved' : ui.recMsg}
      </span>{/if}
    <span class="spacer"></span>
    <label>
      Key
      <select bind:value={lock} onchange={() => session.setKeyLock(lock === 'auto' ? null : keyFromIndex(+lock))}>
        <option value="auto">Auto-detect</option>
        {#each ALL_KEYS as k}<option value={String(keyIndex(k))}>{keyLong(k)}</option>{/each}
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
        <option value="jazz">Jazz (7ths)</option><option value="triads">Triads</option>
      </select>
    </label>
    <button
      class="icon"
      class:dim={!ui.monitor}
      onclick={toggleSound}
      title={ui.monitor
        ? 'Sound on — you hear what you play (click to mute)'
        : 'Sound off (click to hear what you play)'}
    >
      {ui.monitor ? '🔊' : '🔇'}
    </button>
    <button
      class="icon"
      onclick={() => {
        ui.theme = ui.theme === 'dark' ? 'light' : 'dark';
        persist();
      }}
      title="Switch light / dark"
    >
      {ui.theme === 'dark' ? '☀' : '☾'}
    </button>
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
            {#each m.inputs as p}<option value={p.id}>{p.name}</option>{/each}
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
              {#each m.outputs as p}<option value={p.id}>{p.name}</option>{/each}
            </select>
            <button disabled={!m.outputId} onclick={() => midi.send([48, 52, 55, 60], performance.now(), 800)}>
              Test
            </button>
          </span>
        </label>
        <label>
          Suggestions sound
          <select bind:value={ui.sound} onchange={() => persist()}>
            <option value="synth">Browser synth</option><option value="midi">MIDI out</option>
            <option value="both">Both</option><option value="off">Off</option>
          </select>
        </label>
        <label>
          Hand split
          <select
            bind:value={split}
            onchange={() => (session.seg.splitMode = split === 'auto' || split === 'off' ? split : +split)}
          >
            <option value="auto">Auto</option><option value="off">Off (one hand)</option>
            {#each [48, 53, 55, 57, 60, 62, 64] as n}<option value={String(n)}>at {midiName(n)}</option>{/each}
          </select>
        </label>
        <label>
          Tempo <span class="row tight">
            <input
              type="range"
              min="50"
              max="160"
              bind:value={ui.tempo}
              onchange={() => {
                persist();
                if (ui.bars === 'metronome') setBars('metronome');
              }}
            />
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
              <option value="auto">From my playing</option><option value="metronome">Metronome</option>
            </select>
            <select
              bind:value={ui.meter}
              onchange={() => {
                persist();
                if (ui.bars !== 'auto') setBars(ui.bars);
              }}
            >
              <option value={3}>3/4</option><option value={4}>4/4</option><option value={6}>6/8</option>
            </select>
          </span>
        </label>
        {#if ui.bars === 'metronome'}<label>
            Click <input type="checkbox" bind:checked={ui.click} onchange={() => persist()} />
          </label>{/if}
        <p class="small muted">
          Piano colours: <b style="color:var(--harmony)">harmony</b> · <b style="color:var(--melody)">melody</b> ·
          <b style="color:var(--audition)">suggestion</b>
          · <b style="color:var(--guide)">practice target</b>
        </p>
      </div>
    </details>
  </header>

  <main class="stage">
    <section class="pane left">
      <NowPlaying />
      <NextMoves />
    </section>
    <section class="pane centre"><KeyWheel /></section>
    <section class="pane right">
      <nav class="tabs">
        <button class:on={ui.tab === 'library'} onclick={() => (ui.tab = 'library')}>Library</button>
        <button class:on={ui.tab === 'song'} onclick={() => (ui.tab = 'song')}>
          Song{m.song ? `: ${m.song}` : ''}
        </button>
        <button class:on={ui.tab === 'route'} onclick={() => (ui.tab = 'route')}>
          Change key{m.target ? ` → ${keyShort(m.target)}` : ''}
        </button>
      </nav>
      <div class="tab-body">
        {#if ui.tab === 'library'}<Library />{:else if ui.tab === 'song'}<Song />{:else}<Route />{/if}
      </div>
    </section>
    <section class="pane bottom"><History /></section>
  </main>

  <footer><Piano /></footer>
</div>

<!-- any click or key press unlocks browser audio (MIDI notes don't count as a gesture) -->
<svelte:window
  onpointerdown={() => synth.unlock()}
  onkeydown={(e) => {
    synth.unlock();
    if (e.key === 'Escape') stopAudition();
  }}
/>
