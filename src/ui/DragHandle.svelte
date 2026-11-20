<script lang="ts">
  import Icon from './Icon.svelte';
  import { type ChordDrag, dragging, startChordDrag } from './composition.svelte';

  /**
   * Drag an idea into the timeline. A span, not a button: Firefox does not start drags from buttons.
   * Click or Enter places the idea at its usual spot (the keyboard alternative to dragging).
   */
  let { idea, label, onplace }: { idea: ChordDrag; label: string; onplace: () => void } = $props();
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: Firefox does not start drags from <button> elements -->
<span
  class="drag-handle"
  draggable="true"
  role="button"
  tabindex="0"
  aria-label={`${label}: drag into the timeline, or press Enter to place it here`}
  title="Drag into the timeline: onto a chord to replace it, onto a gap to add it (click places it here)"
  ondragstart={(e) => startChordDrag(e, idea)}
  ondragend={() => (dragging.idea = null)}
  onclick={onplace}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onplace();
    }
  }}
>
  <Icon name="grip" size={14} />
</span>
