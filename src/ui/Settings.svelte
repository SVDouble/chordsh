<script lang="ts">
  import Icon from './Icon.svelte';
  import {
    SETTINGS_FIELDS,
    SETTINGS_SECTIONS,
    DEFAULT_SETTINGS,
    settingsSchema,
    settingValue,
    setSetting,
    type Settings,
  } from '../config/settings';
  import { refreshCompositionSettings } from './composition.svelte';
  import { ALL_KEYS, keyLong } from '../theory/scales';
  import { applySettings, midi, settings, settingsWarnings, ui } from './store.svelte';

  let dialog = $state<HTMLDialogElement>();
  let draft = $state<Settings>(structuredClone(DEFAULT_SETTINGS));
  let search = $state('');
  let errors = $state<{ path: string; message: string }[]>([]);
  const devices = $derived.by(() => {
    void ui.tick;
    return { input: midi.inputs, output: midi.outputs };
  });
  const labels: Record<string, string> = {
    synth: 'Browser synth',
    midi: 'DAW / MIDI out',
    both: 'Both',
    off: 'Off',
    auto: 'Automatic',
    fixed: 'Fixed',
    metronome: 'Metronome',
    jazz: 'Jazz (7ths)',
    triads: 'Triads',
    dark: 'Dark',
    light: 'Light',
  };

  function open() {
    draft = $state.snapshot(settings);
    search = '';
    errors = [];
    dialog?.showModal();
  }
  function change(path: string, value: unknown) {
    setSetting(draft, path, value);
    if (path === 'preferences.sound') draft.preferences.monitor = value === 'synth' || value === 'both';
    errors = [];
  }
  function apply(event: SubmitEvent) {
    event.preventDefault();
    const result = settingsSchema.safeParse($state.snapshot(draft));
    if (!result.success) {
      errors = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
      dialog?.querySelector('.settings-content')?.scrollTo({ top: 0 });
      return;
    }
    const gateChanged = settings.editor.gate !== result.data.editor.gate;
    applySettings(result.data);
    if (gateChanged) refreshCompositionSettings();
    dialog?.close();
  }
  function matching(section: string) {
    const query = search.toLowerCase().trim();
    return SETTINGS_FIELDS.filter(
      (f) =>
        f.path.startsWith(`${section}.`) &&
        (!query || `${f.title} ${f.description} ${section}`.toLowerCase().includes(query)),
    );
  }
</script>

<button type="button" class="icon" title="Settings" aria-label="Settings" onclick={open}>
  <Icon name="settings" />
</button>
<dialog bind:this={dialog} class="settings-dialog" aria-labelledby="settings-title">
  <form onsubmit={apply} novalidate>
    <header class="settings-heading">
      <h2 id="settings-title">Settings</h2>
      <button
        type="button"
        class="icon"
        aria-label="Close settings"
        title="Close settings"
        onclick={() => dialog?.close()}
      >
        <Icon name="close" />
      </button>
    </header>
    <div class="settings-content">
      <input
        class="settings-search"
        type="search"
        placeholder="Find a setting…"
        aria-label="Find a setting"
        bind:value={search}
      >
      {#if settingsWarnings.length}
        <p class="warn small" role="status">{settingsWarnings.join(' ')}</p>
      {/if}
      {#if errors.length}
        <div class="settings-errors" role="alert">
          {#each errors as error}
            <p><b>{SETTINGS_FIELDS.find((f) => f.path === error.path)?.title ?? error.path}:</b> {error.message}</p>
          {/each}
        </div>
      {/if}
      {#each SETTINGS_SECTIONS as section}
        {@const fields = matching(section.id)}
        {#if fields.length}
          <details class="settings-section" open={!section.advanced || !!search}>
            <summary>
              {section.title}
              {#if section.advanced}
                <span class="muted small">Advanced</span>
              {/if}
            </summary>
            {#each fields as field}
              {@const value = settingValue(draft, field.path)}
              <div class="setting-field">
                <div class="setting-description">
                  <label for={`setting-${field.path}`}
                    >{field.title}
                    {#if field.unit}
                      <span class="muted small">{field.unit}</span>
                    {/if}</label
                  >
                  <p id={`help-${field.path}`} class="small muted">{field.description}</p>
                  {#if (field.minimum !== undefined || field.maximum !== undefined) &&
                    field.path !== 'preferences.keyLock'}
                    <p class="small muted setting-limits">
                      Range: {field.minimum}–{field.maximum}. Default:
                      {Array.isArray(field.default)
                        ? field.default.join(', ')
                        : typeof field.default === 'number'
                          ? +field.default.toFixed(4)
                          : String(field.default)}.
                    </p>
                  {/if}
                </div>
                {#if field.path === 'preferences.input' || field.path === 'preferences.output'}
                  {@const isInput = field.path.endsWith('input')}
                  {@const ports = isInput ? devices.input : devices.output}
                  <select
                    id={`setting-${field.path}`}
                    aria-describedby={`help-${field.path}`}
                    value={String(value)}
                    onchange={(e) => change(field.path, e.currentTarget.value)}
                  >
                    <option value={isInput ? 'all' : ''}>{isInput ? 'All devices' : 'None'}</option>
                    {#each ports as port}
                      <option value={port.id}>{port.name}</option>
                    {/each}
                    {#if value && value !== 'all' && !ports.some((p) => p.id === value)}
                      <option value={String(value)}>Disconnected device ({String(value)})</option>
                    {/if}
                  </select>
                {:else if field.path === 'preferences.keyLock'}
                  <select
                    id={`setting-${field.path}`}
                    aria-describedby={`help-${field.path}`}
                    value={Number(value)}
                    onchange={(e) => change(field.path, +e.currentTarget.value)}
                  >
                    <option value={-1}>Auto-detect</option>
                    {#each ALL_KEYS as key, i}
                      <option value={i}>{keyLong(key)}</option>
                    {/each}
                  </select>
                {:else if field.enum}
                  <select
                    id={`setting-${field.path}`}
                    aria-describedby={`help-${field.path}`}
                    value={String(value)}
                    onchange={(e) => change(field.path, e.currentTarget.value)}
                  >
                    {#each field.enum as option}
                      <option value={option}>{labels[option] ?? option}</option>
                    {/each}
                  </select>
                {:else if field.type === 'boolean'}
                  <input
                    id={`setting-${field.path}`}
                    aria-describedby={`help-${field.path}`}
                    type="checkbox"
                    checked={!!value}
                    onchange={(e) => change(field.path, e.currentTarget.checked)}
                  >
                {:else if field.type === 'array'}
                  <input
                    id={`setting-${field.path}`}
                    aria-describedby={`help-${field.path}`}
                    type="text"
                    value={(value as number[]).join(', ')}
                    onchange={(e) =>
                      change(
                        field.path,
                        e.currentTarget.value.split(',').map((v) => (v.trim() ? Number(v) : NaN)),
                      )}
                  >
                {:else}
                  <input
                    id={`setting-${field.path}`}
                    aria-describedby={`help-${field.path}`}
                    type="number"
                    min={field.minimum}
                    max={field.maximum}
                    step={field.step ?? 'any'}
                    value={Number(value)}
                    oninput={(e) => change(field.path, e.currentTarget.valueAsNumber)}
                  >
                {/if}
              </div>
            {/each}
          </details>
        {/if}
      {/each}
      {#if !SETTINGS_FIELDS.some((f) =>
        `${f.title} ${f.description} ${f.path.split('.')[0]}`.toLowerCase().includes(search.toLowerCase().trim()),
      )}
        <p class="muted">No matching settings.</p>
      {/if}
    </div>
    <footer class="settings-actions">
      <button
        type="button"
        onclick={() => {
          draft = structuredClone(DEFAULT_SETTINGS);
          errors = [];
        }}
      >
        Restore defaults
      </button>
      <span class="spacer"></span>
      <span class="small muted settings-note">Analysis changes restart live analysis. Songs are kept.</span>
      <button type="button" onclick={() => dialog?.close()}>Cancel</button>
      <button type="submit" class="primary">Apply</button>
    </footer>
  </form>
</dialog>
