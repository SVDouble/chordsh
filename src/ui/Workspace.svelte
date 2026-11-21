<script lang="ts">
  import { settings, ui } from './store.svelte';
  import { Pane, PaneGroup, PaneResizer } from 'paneforge';
  import NowPlaying from './NowPlaying.svelte';
  import NextMoves from './NextMoves.svelte';
  import Suggestions, { type SuggestionLength } from './Suggestions.svelte';
  import KeyWheel from './KeyWheel.svelte';
  import Editor from './Editor.svelte';
  import Icon from './Icon.svelte';
  import { suggestionScope } from './composition.svelte';
  const harmony = $derived(settings.panels.now || settings.panels.next || settings.panels.map);
  const circle = $derived(settings.panels.next || settings.panels.map);
  type Tab = 'circle' | 'suggestions';
  const previous = remembered();
  let tab = $state(previous.tab);
  let length = $state(previous.length);
  let browsingTemplates = $state(false);
  function remembered(): { tab: Tab; length: SuggestionLength } {
    try {
      const t = localStorage.getItem('chordsh-harmony-tab');
      const defaultLength = t === 'sequences' ? 2 : 0;
      const length = Number(localStorage.getItem('chordsh-suggestion-length') ?? defaultLength);
      return {
        tab: t === 'ideas' || t === 'sequences' || t === 'suggestions' ? 'suggestions' : 'circle',
        length: length === 0 || length === 1 || length === 2 || length === 4 ? length : defaultLength,
      };
    } catch {
      /* storage unavailable: use the default */
    }
    return { tab: 'circle', length: 0 };
  }
  function choose(t: Tab) {
    tab = t;
    try {
      localStorage.setItem('chordsh-harmony-tab', t);
    } catch {
      /* storage unavailable */
    }
  }
  function chooseLength(value: SuggestionLength) {
    length = value;
    try {
      localStorage.setItem('chordsh-suggestion-length', String(value));
    } catch {
      /* storage unavailable */
    }
  }
  const shown = $derived(tab === 'circle' && !circle ? 'suggestions' : tab);
  const suggestionSpan = $derived.by(() => {
    if (!harmony || shown !== 'suggestions' || ui.recording) return null;
    const preview = ui.previewScore;
    if (browsingTemplates) return preview?.id.startsWith('template:') ? (preview.suggestionSpan ?? null) : null;
    if (!length && preview?.id.startsWith('develop:') && preview.suggestionSpan) return preview.suggestionSpan;
    const { span, straddles } = suggestionScope(length);
    return straddles ? null : span;
  });
</script>

<PaneGroup direction="horizontal" autoSaveId={`chordsh-harmony-v3-${harmony}`} class="workspace">
  {#if harmony}
    <Pane id="harmony" order={1} defaultSize={34} minSize={25} maxSize={50}>
      <aside class="pane harmony-pane" aria-label="Harmony exploration">
        {#if settings.panels.now || ui.previewScore || circle}
          <div class="harmony-header" class:with-inspector={settings.panels.now || !!ui.previewScore}>
            {#if settings.panels.now || ui.previewScore}
              <NowPlaying />
            {/if}
            {#if circle}
              <fieldset class="harmony-view-toggle" aria-label="Harmony view">
                <button
                  type="button"
                  aria-label="Circle of fifths"
                  title="Circle of fifths"
                  aria-pressed={shown === 'circle'}
                  onclick={() => choose('circle')}
                >
                  <Icon name="compass" size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Suggestions"
                  title="Suggestions"
                  aria-pressed={shown === 'suggestions'}
                  onclick={() => choose('suggestions')}
                >
                  <Icon name="sparkles" size={15} />
                </button>
              </fieldset>
            {/if}
          </div>
        {/if}
        {#if shown === 'circle'}
          {#if settings.panels.next}
            <NextMoves />
          {:else}
            <KeyWheel compact />
          {/if}
        {:else}
          <Suggestions {length} onlength={chooseLength} bind:browsingTemplates />
        {/if}
      </aside>
    </Pane>
    <PaneResizer class="pane-resizer" aria-label="Resize harmony and timeline" />
  {/if}
  <Pane id="timeline" order={2} defaultSize={harmony ? 66 : 100} minSize={45}>
    <section class="pane right timeline-panel">
      <div class="tab-body"><Editor {suggestionSpan} /></div>
    </section>
  </Pane>
</PaneGroup>
