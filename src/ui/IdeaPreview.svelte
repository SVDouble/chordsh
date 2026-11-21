<script lang="ts">
  import type { Snippet } from 'svelte';
  import { type ChordDrag, dragging, startChordDrag } from './composition.svelte';
  import { ui } from './store.svelte';

  let {
    idea,
    children,
    onpreview,
    class: className = '',
    title,
    label,
    previewId,
    onplace,
  }: {
    idea: ChordDrag;
    children: Snippet;
    onpreview: (inContext: boolean) => void;
    class?: string;
    title?: string;
    label?: string;
    previewId?: string;
    onplace?: () => void;
  } = $props();
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: Firefox needs a non-button element to start native drags -->
<div
  class="idea-preview-drag {className}"
  class:preview-selected={previewId !== undefined && ui.previewScore?.id === previewId}
  role="button"
  tabindex="0"
  draggable={!ui.recording}
  aria-label={label}
  aria-disabled={ui.recording}
  title={`${title ?? 'Click to preview'} · Shift-click or Alt+Enter to hear in context · Drag or Shift+Enter to place`}
  ondragstart={(event) => startChordDrag(event, idea)}
  ondragend={() => (dragging.idea = null)}
  onclick={(event) => {
    if (!ui.recording) onpreview(event.shiftKey);
  }}
  onkeydown={(event) => {
    if (ui.recording) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (event.key === 'Enter' && event.shiftKey && onplace) onplace();
      else onpreview(event.altKey || event.shiftKey);
    }
  }}
>
  {@render children()}
</div>
