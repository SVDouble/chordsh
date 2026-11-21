<script lang="ts">
  import type { ScorePart } from './suggestionScores';

  let { parts, maxTotal }: { parts: ScorePart[]; maxTotal: number } = $props();
  const description = $derived(parts.map(({ label, points }) => `${label} ${points}`).join(' · '));
</script>

<div class="suggestion-score-track" role="img" aria-label={description || 'No scores'} title={description || undefined}>
  {#each parts as part (part.id)}
    {#if part.points > 0 && maxTotal > 0}
      <span data-factor={part.id} style:width={`${(100 * part.points) / maxTotal}%`}></span>
    {/if}
  {/each}
</div>
