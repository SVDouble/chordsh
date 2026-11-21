<script module lang="ts">
  export type SuggestionLength = 0 | 1 | 2 | 4;
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import type { Tradition } from '../engine/sequences';
  import ChordIdeas from './ChordIdeas.svelte';
  import SequenceIdeas from './SequenceIdeas.svelte';
  import Templates from './Templates.svelte';
  import { assist } from './composition.svelte';
  import { packFilters } from './packFilters';

  let {
    length,
    onlength,
    browsingTemplates = $bindable(false),
  }: { length: SuggestionLength; onlength: (length: SuggestionLength) => void; browsingTemplates?: boolean } = $props();
  let results = $state<HTMLDivElement>();
  let toolbar = $state<HTMLDivElement>();
  let positions = $state<{ id: string; row: number; offset: number; width: number }[]>([]);
  type Filter = {
    id: string;
    label: string;
    name?: string;
    options: { label: string; selected: boolean; choose: () => void }[];
  };
  let perBar = $state(1);
  let patterns = $state<'auto' | Tradition>('auto');
  const lengths = [
    { value: 0, label: '1 chord' },
    { value: 1, label: '1 bar' },
    { value: 2, label: '2 bars' },
    { value: 4, label: '4 bars' },
  ] as const;
  const focusOptions = [
    { id: 'pop', label: 'Pop' },
    { id: 'jazz', label: 'Jazz' },
    { id: 'functional', label: 'Functional' },
    { id: 'melody-fit', label: 'Melody fit' },
    { id: 'counterpoint', label: 'Voice leading' },
    { id: 'colour', label: 'Colour' },
    { id: 'chromatic', label: 'Film' },
  ] as const;
  const variety = [
    { value: 0, label: 'Familiar' },
    { value: 0.4, label: 'Explore' },
    { value: 0.8, label: 'Bold' },
  ] as const;
  const patternSources = { popular: 'Pop', art: 'Art music', jazz: 'Jazz' } as const;
  const autoPatterns: Record<string, Tradition> = { pop: 'popular', jazz: 'jazz' };
  const defaultPatterns = $derived(autoPatterns[assist.style] ?? 'art');
  const tradition = $derived(patterns === 'auto' ? defaultPatterns : patterns);
  const selectedVariety = $derived(Math.round(assist.adventurous / 0.4) * 0.4);

  const filters = $derived.by(() => {
    const rows: Filter[] = [
      {
        id: 'focus',
        label: 'Focus',
        options: focusOptions.map((option) => ({
          label: option.label,
          selected: assist.style === option.id,
          choose: () => (assist.style = option.id),
        })),
      },
      {
        id: 'type',
        label: 'Type',
        name: 'Suggestion type',
        options: [
          ...lengths.map((option) => ({
            label: option.label,
            selected: !browsingTemplates && length === option.value,
            choose: () => {
              browsingTemplates = false;
              onlength(option.value);
            },
          })),
          {
            label: 'Templates',
            selected: browsingTemplates,
            choose: () => (browsingTemplates = !browsingTemplates),
          },
        ],
      },
      {
        id: 'variety',
        label: 'Variety',
        options: variety.map((option) => ({
          label: option.label,
          selected: selectedVariety === option.value,
          choose: () => (assist.adventurous = option.value),
        })),
      },
    ];
    if (length && !browsingTemplates)
      rows.push({
        id: 'per-bar',
        label: 'Per bar',
        name: 'Chords per bar',
        options: [1, 2].map((count) => ({
          label: count === 1 ? '1 chord' : '2 chords',
          selected: perBar === count,
          choose: () => (perBar = count),
        })),
      });
    if (length || browsingTemplates)
      rows.push({
        id: 'patterns',
        label: 'Patterns',
        options: [
          {
            label: `Auto · ${patternSources[defaultPatterns]}`,
            selected: patterns === 'auto',
            choose: () => (patterns = 'auto'),
          },
          ...Object.entries(patternSources).map(([id, label]) => ({
            label,
            selected: patterns === id,
            choose: () => (patterns = id as Tradition),
          })),
        ],
      });
    return rows;
  });
  const inReadingOrder = $derived.by(() => {
    const byId = new Map(positions.map((position, index) => [position.id, { ...position, index }]));
    return filters
      .map((filter) => ({ ...filter, position: byId.get(filter.id) }))
      .sort((a, b) => (a.position?.index ?? Infinity) - (b.position?.index ?? Infinity));
  });

  function naturalWidth(group: HTMLElement) {
    const label = group.firstElementChild!;
    const options = group.lastElementChild!;
    const groupStyle = getComputedStyle(group);
    const style = getComputedStyle(options);
    const buttons = [...options.children];
    return (
      label.getBoundingClientRect().width +
      parseFloat(groupStyle.columnGap) +
      parseFloat(style.paddingLeft) +
      parseFloat(style.paddingRight) +
      parseFloat(style.borderLeftWidth) +
      parseFloat(style.borderRightWidth) +
      (buttons.length - 1) * parseFloat(style.columnGap) +
      buttons.reduce((width, button) => width + button.getBoundingClientRect().width, 0)
    );
  }
  $effect(() => {
    const element = toolbar;
    const ids = filters.map(({ id }) => id);
    if (!element) return;
    let measured = '';
    const resize = () => {
      const available = element.clientWidth;
      if (!available) return;
      const groups = ids.map((id) => element.querySelector<HTMLElement>(`[data-filter="${id}"]`));
      if (groups.some((group) => group === null)) return;
      const widths = groups.map((group) => naturalWidth(group!));
      const key = [available, ...widths].join();
      if (key === measured) return;
      measured = key;
      const button = document.activeElement;
      positions = packFilters(widths, available, parseFloat(getComputedStyle(element).columnGap)).map(
        ({ index, ...position }) => ({ id: ids[index], ...position }),
      );
      if (button instanceof HTMLButtonElement && element.contains(button))
        void tick().then(() => {
          if (button.isConnected && document.activeElement === document.body) button.focus({ preventScroll: true });
        });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  });

  $effect(() => {
    void browsingTemplates;
    void length;
    results?.scrollTo(0, 0);
  });
</script>

<div class="card suggestions">
  <div class="suggestion-toolbar" bind:this={toolbar}>
    {#each inReadingOrder as { id, label, name, options, position } (id)}
      <fieldset
        class="suggestion-option-group"
        data-filter={id}
        aria-label={name ?? label}
        style:grid-row={position?.row}
        style:margin-inline-start={position ? `${position.offset}px` : undefined}
        style:width={position ? `${position.width}px` : undefined}
      >
        <span aria-hidden="true">{label}</span>
        <div class="suggestion-option-buttons">
          {#each options as option (option.label)}
            <button type="button" aria-pressed={option.selected} onclick={option.choose}>{option.label}</button>
          {/each}
        </div>
      </fieldset>
    {/each}
  </div>
  <div class="suggestion-results" bind:this={results}>
    {#if browsingTemplates}
      <Templates {tradition} />
    {:else if length}
      <SequenceIdeas bars={length} {perBar} {tradition} />
    {:else}
      <ChordIdeas />
    {/if}
  </div>
</div>
