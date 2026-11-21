<script lang="ts">
  import type { ScoreCategory } from './suggestionScores';

  let { categories }: { categories: ScoreCategory[] } = $props();
</script>

{#if categories.length}
  <ul class="suggestion-score-legend" aria-label="Suggestion score legend">
    {#each categories as category (category.id)}
      <li data-factor={category.id}>{category.label}</li>
    {/each}
  </ul>
{/if}
