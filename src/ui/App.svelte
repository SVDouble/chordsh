<script lang="ts">
  import { onMount } from 'svelte';
  import { stopAudition, midi, persist, savedSettings, session, ui } from './store.svelte';
  import { attachQwerty } from '../io/qwerty';
  import { ALL_KEYS, keyFromIndex, keyIndex, keyLong } from '../theory/scales';
  import { midiName } from '../theory/pitch';
  import { toggleDemo } from './demo';
  import NowPlaying from './NowPlaying.svelte';
  import KeyWheel from './KeyWheel.svelte';
  import History from './History.svelte';
  import NextMoves from './NextMoves.svelte';
  import Route from './Route.svelte';
  import Piano from './Piano.svelte';
  import Song from './Song.svelte';

  let lock = $state('auto');
  let split = $state('auto');

  onMount(() => {
    if (savedSettings.style) session.setStyle(savedSettings.style);
    midi.inputId = savedSettings.input ?? 'all';
    midi.outputId = savedSettings.output ?? '';
    void midi.init();
    return attachQwerty({
      noteOn: (n, v, t) => session.noteOn(n, v, t),
      noteOff: (n, t) => session.noteOff(n, t),
      pedal: (on, t) => session.pedal(on, t),
    });
  });

  const m = $derived.by(() => {
    ui.tick;
    const errors = midi.inputs.filter((p) => p.error);
    return {
      inputs: midi.inputs, outputs: midi.outputs, inputId: midi.inputId, outputId: midi.outputId,
      devices: midi.devices, last: midi.last, errors,
      label:
        midi.status === 'unsupported' ? 'Web MIDI unavailable — use Chrome or Edge'
        : midi.status === 'denied' ? 'MIDI access denied'
        : midi.status === 'pending' ? 'Connecting MIDI…'
        : midi.devices.length ? midi.devices.join(', ')
        : 'No MIDI device',
    };
  });

</script>

<header class="topbar">
  <div class="brand">Musify</div>

  <span class="midi-chip" class:ok={m.devices.length && !m.errors.length} class:bad={m.errors.length}
    title={[...m.inputs.map((p) => `${p.name}${p.error ? ' — ' + p.error : ''}`), m.last ? `last message: ${m.last.text} from ${m.last.port}` : 'no messages received yet'].join('\n')}>
    {#key m.last?.t}<i class="led" class:flash={m.last}></i>{/key}
    {m.label}
    {#if m.last}<code class="small muted">{m.last.text}</code>{:else if m.devices.length}<span class="small muted">— press a key</span>{/if}
  </span>
  {#if m.errors.length}<span class="warn small">{m.errors[0].device}: {m.errors[0].error}</span>{/if}

  <label>Key
    <select bind:value={lock} onchange={() => session.setKeyLock(lock === 'auto' ? null : keyFromIndex(+lock))}>
      <option value="auto">Auto-detect</option>
      {#each ALL_KEYS as k}<option value={String(keyIndex(k))}>{keyLong(k)}</option>{/each}
    </select>
  </label>
  <label>Chords
    <select value={session.style} onchange={(e) => { session.setStyle(e.currentTarget.value as 'jazz' | 'triads'); persist(); }}>
      <option value="jazz">Jazz (7ths)</option><option value="triads">Triads</option>
    </select>
  </label>
  <button class:active={ui.demo} onclick={toggleDemo}>{ui.demo ? '■ Stop demo' : '▶ Demo'}</button>

  <details class="settings">
    <summary>⚙ Settings</summary>
    <div class="settings-panel">
      <label>MIDI in
        <select value={m.inputId} onchange={(e) => { midi.inputId = e.currentTarget.value; midi.refresh(); persist(); }}>
          <option value="all">All devices</option>
          {#each m.inputs as p}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </label>
      <label>MIDI out
        <select value={m.outputId} onchange={(e) => { midi.outputId = e.currentTarget.value; persist(); ui.tick++; }}>
          <option value="">None</option>
          {#each m.outputs as p}<option value={p.id}>{p.name}</option>{/each}
        </select>
        <button disabled={!m.outputId} onclick={() => midi.send([48, 52, 55, 60], performance.now(), 800)}>Test</button>
      </label>
      <label>Sound
        <select bind:value={ui.sound} onchange={() => persist()}>
          <option value="synth">Browser synth</option><option value="midi">MIDI out</option>
          <option value="both">Both</option><option value="off">Off</option>
        </select>
      </label>
      <label>Hand split
        <select bind:value={split} onchange={() => (session.seg.splitMode = split === 'auto' || split === 'off' ? split : +split)}>
          <option value="auto">Auto</option><option value="off">Off (one hand)</option>
          {#each [48, 53, 55, 57, 60, 62, 64] as n}<option value={String(n)}>at {midiName(n)}</option>{/each}
        </select>
      </label>
      <label>Tempo <input type="range" min="50" max="160" bind:value={ui.tempo} onchange={() => persist()} /> {ui.tempo}</label>
    </div>
  </details>
</header>

<main class="layout">
  <div class="col">
    <NowPlaying />
    <NextMoves />
  </div>
  <div class="col">
    <KeyWheel />
    <Route />
  </div>
  <div class="wide"><History /></div>
  <div class="wide"><Song /></div>
</main>

<footer><Piano /></footer>

<svelte:window onkeydown={(e) => e.key === 'Escape' && stopAudition()} />
