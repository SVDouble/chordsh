<script lang="ts">
  import Icon from './Icon.svelte';
  import { midi, settings, ui, applySettings } from './store.svelte';
  const ports = $derived.by(() => {
    void ui.tick;
    return { inputs: midi.inputs, outputs: midi.outputs, devices: midi.devices, status: midi.status };
  });
  function change(field: 'input' | 'output' | 'sound', value: string) {
    const next = $state.snapshot(settings);
    if (field === 'sound') {
      next.preferences.sound = value as typeof next.preferences.sound;
      next.preferences.monitor = value === 'synth' || value === 'both';
    } else next.preferences[field] = value;
    applySettings(next);
  }
</script>
<details class="device-picker settings">
  <summary
    class="midi-chip"
    title="Choose MIDI input, instrument output and monitoring"
    aria-label="Choose MIDI devices"
  >
    <Icon name="keyboard" size={15} />
    <span
      >{ports.devices.length
        ? ports.devices.join(', ')
        : ports.status === 'denied'
          ? 'MIDI access denied'
          : 'Computer keys'}</span
    ><Icon name="down" size={12} />
  </summary>
  <div class="settings-panel device-options">
    <b>Devices & sound</b>
    <label
      >MIDI input<select
        aria-label="Device MIDI input"
        value={settings.preferences.input}
        onchange={(e) => change('input', e.currentTarget.value)}
      >
        <option value="all">All devices</option>
        {#each ports.inputs as port}
          <option value={port.id}>{port.name}{port.error ? ' (unavailable)' : ''}</option>
        {/each}
      </select></label
    >
    <label
      >MIDI output<select
        aria-label="Device MIDI output"
        value={settings.preferences.output}
        onchange={(e) => change('output', e.currentTarget.value)}
      >
        <option value="">None</option>
        {#each ports.outputs as port}
          <option value={port.id}>{port.name}</option>
        {/each}
      </select></label
    >
    <label
      >Hear through<select
        aria-label="Device playback output"
        value={settings.preferences.sound}
        onchange={(e) => change('sound', e.currentTarget.value)}
      >
        <option value="synth">Browser synth</option>
        <option value="midi">DAW / MIDI output</option>
        <option value="both">Both</option>
        <option value="off">Off</option>
      </select></label
    >
    {#if ports.status === 'denied'}
      <p class="small warn">Allow MIDI access in your browser's site permissions to connect a controller.</p>
    {/if}
    {#if !ports.devices.length}
      <p class="small muted">Computer keys A W S E D… and the on-screen piano also work.</p>
    {/if}
  </div>
</details>
