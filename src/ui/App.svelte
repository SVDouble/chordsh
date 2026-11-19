<script lang="ts">
  import { onMount } from 'svelte';
  import { stopAudition, midi, persist, savedSettings, session, ui } from './store.svelte';
  import { attachQwerty } from '../io/qwerty';
  import { ALL_KEYS, keyFromIndex, keyIndex, keyLong } from '../theory/scales';
  import { midiName } from '../theory/pitch';
  import { runDemo, stopDemo } from './demo';
  import NowPlaying from './NowPlaying.svelte';
  import KeyWheel from './KeyWheel.svelte';
  import History from './History.svelte';
  import NextMoves from './NextMoves.svelte';
  import Route from './Route.svelte';
  import Piano from './Piano.svelte';

  let demo = $state(false);
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

  const ports = $derived.by(() => {
    ui.tick;
    return { inputs: midi.inputs, outputs: midi.outputs, status: midi.status, inputId: midi.inputId, outputId: midi.outputId };
  });
  const status = $derived(
    ports.status === 'unsupported' ? 'Web MIDI not available in this browser — try Chrome or Edge'
      : ports.status === 'denied' ? 'MIDI access denied'
      : ports.status === 'pending' ? 'Connecting MIDI…'
      : ports.inputs.length ? `● ${ports.inputs.map((p) => p.name).join(', ')}`
      : 'No MIDI device — plug in your piano, or use the computer keyboard',
  );

  function toggleDemo() {
    demo = !demo;
    if (demo) runDemo(96, () => (demo = false));
    else stopDemo();
  }
</script>

<header class="topbar">
  <div class="brand">Musify</div>
  <label>In
    <select value={ports.inputId} onchange={(e) => { midi.inputId = e.currentTarget.value; midi.refresh(); persist(); }}>
      <option value="all">All inputs</option>
      {#each ports.inputs as p}<option value={p.id}>{p.name}</option>{/each}
    </select>
  </label>
  <label>Out
    <select value={ports.outputId} onchange={(e) => { midi.outputId = e.currentTarget.value; persist(); ui.tick++; }}>
      <option value="">None</option>
      {#each ports.outputs as p}<option value={p.id}>{p.name}</option>{/each}
    </select>
  </label>
  <button class="ghost" title="Send a C major chord to the MIDI output" disabled={!ports.outputId}
    onclick={() => midi.send([48, 52, 55, 60], performance.now(), 800)}>Test out</button>
  <label>Sound
    <select bind:value={ui.sound} onchange={() => persist()}>
      <option value="synth">Browser synth</option><option value="midi">MIDI out</option>
      <option value="both">Both</option><option value="off">Off</option>
    </select>
  </label>
  <label>Style
    <select value={session.style} onchange={(e) => { session.setStyle(e.currentTarget.value as 'jazz' | 'triads'); persist(); }}>
      <option value="jazz">Jazz (7ths)</option><option value="triads">Triads</option>
    </select>
  </label>
  <label>Key
    <select bind:value={lock} onchange={() => session.setKeyLock(lock === 'auto' ? null : keyFromIndex(+lock))}>
      <option value="auto">Auto-detect</option>
      {#each ALL_KEYS as k}<option value={String(keyIndex(k))}>{keyLong(k)}</option>{/each}
    </select>
  </label>
  <label>Split
    <select bind:value={split} onchange={() => (session.seg.splitMode = split === 'auto' || split === 'off' ? split : +split)}>
      <option value="auto">Auto</option><option value="off">Off (one hand)</option>
      {#each [48, 53, 55, 57, 60, 62, 64] as n}<option value={String(n)}>at {midiName(n)}</option>{/each}
    </select>
  </label>
  <label>Tempo <input type="range" min="50" max="160" bind:value={ui.tempo} onchange={() => persist()} /> {ui.tempo}</label>
  <button class:active={demo} onclick={toggleDemo}>{demo ? '■ Stop demo' : '▶ Demo'}</button>
  <span class="status small">{status}</span>
</header>

<main class="grid">
  <NowPlaying />
  <KeyWheel />
  <History />
  <NextMoves />
  <Route />
</main>

<footer><Piano /></footer>

<svelte:window onkeydown={(e) => e.key === 'Escape' && stopAudition()} />
