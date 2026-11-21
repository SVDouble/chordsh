<script lang="ts">
  import Icon from './Icon.svelte';

  let dialog = $state<HTMLDialogElement>();
</script>

<button
  type="button"
  class="icon"
  title="Timeline help"
  aria-label="Timeline help"
  aria-haspopup="dialog"
  onclick={() => dialog?.showModal()}
>
  <Icon name="help" />
</button>
<dialog bind:this={dialog} class="help-dialog" aria-labelledby="help-title">
  <header class="settings-heading">
    <h2 id="help-title">Timeline guide</h2>
    <button type="button" class="icon" aria-label="Close help" title="Close help" onclick={() => dialog?.close()}>
      <Icon name="close" />
    </button>
  </header>
  <dl class="help-content">
    <dt>Time signature</dt>
    <dd>
      The top number counts beats per bar. The bottom number gives the note value of one beat. In 6/8, each bar has six
      eighth-note beats.
    </dd>
    <dt>Ruler</dt>
    <dd>Click or drag the ruler to seek. Click a key or playback-style marker to edit it.</dd>
    <dt>Chords</dt>
    <dd>
      Green marks tonic, amber predominant, and red dominant. The bar under a chord shows how well it fits the melody.
    </dd>
    <dt>Chord connections</dt>
    <dd>
      In motion view, ↘ resolves, ≈ keeps shared notes, ∼ slides a semitone, → steps, ↗ opens, ⤴ leaps, and = stays. ☀
      and ☾ indicate brighter and darker moves on the circle of fifths.
    </dd>
    <dd>
      The three connection buttons switch between motion, how common a move is, and the current style's score. The two
      scores range from 0 to 100. Badge colours run from green through blue to red.
    </dd>
    <dt>Melody</dt>
    <dd>
      Green notes are chord tones, blue adds colour, amber leans into a chord tone, and red pulls against it. Hatched
      notes have no chord underneath.
    </dd>
    <dt>Playback style</dt>
    <dd>Select a bar and use the playback-style button above the timeline to change the style from there on.</dd>
  </dl>
</dialog>
