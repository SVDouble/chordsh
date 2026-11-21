<script lang="ts">
  let { tags }: { tags: { label: string; title?: string; tone?: 'good' | 'colour' | 'warm' | 'neutral' }[] } = $props();
</script>

{#if tags.length}
  <div class="idea-tags">
    {#each tags as tag}
      <span class="idea-tag {tag.tone ?? 'neutral'}" title={tag.title}>{tag.label}</span>
    {/each}
  </div>
{/if}
