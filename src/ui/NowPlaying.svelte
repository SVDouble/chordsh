<script lang="ts">
  import { session, ui } from './store.svelte';
  import { chordName, inversionLabel, toneNames } from '../theory/chords';
  import { SCALE_LABEL, keyLong } from '../theory/scales';

  const FUNC = { T: 'Tonic', PD: 'Predominant', D: 'Dominant', '?': 'Colour' };

  const v = $derived.by(() => {
    ui.tick;
    const id = session.now, key = session.activeKey, c = id.best;
    return {
      kind: id.kind,
      name: c ? chordName(c, key) : id.notes.map((n) => session.spell(n)).join('–') || '—',
      interval: id.intervalName,
      roman: session.nowRoman,
      key: key ? keyLong(key) + (session.flavour ? ` · ${SCALE_LABEL[session.flavour]} colour` : '') : null,
      tones: c ? toneNames(c, key) : [],
      inversion: c ? inversionLabel(c) : '',
      alts: id.alternatives.slice(0, 3).map((a) => chordName(a, key)),
    };
  });
</script>

<section class="card now">
  {#if v.kind === 'none'}
    <div class="big muted">—</div>
    <p class="muted">
      Play something. No piano connected? Use <kbd>A</kbd>…<kbd>;</kbd> on your keyboard (<kbd>Z</kbd>/<kbd>X</kbd> octave,
      <kbd>Space</kbd> pedal), click the keys below, or press <b>Demo</b>.
    </p>
  {:else}
    <div class="now-top">
      <div class="big">{v.name}</div>
      {#if v.roman}
        <div class="roman"><span class="numeral">{v.roman.numeral}</span><span class="muted">in {v.key}</span></div>
      {/if}
    </div>
    <div class="badges">
      {#if v.roman}
        <span class="func f-{v.roman.func}">{FUNC[v.roman.func]}</span>
        <span class="badge">{v.roman.kind.replaceAll('-', ' ')}</span>
      {/if}
      {#if v.interval}<span class="badge">{v.interval}</span>{/if}
      {#if v.inversion}<span class="badge">{v.inversion}</span>{/if}
    </div>
    {#if v.roman}<p class="explain">{v.roman.explain}</p>{/if}
    <div class="tones">
      {#each v.tones as t}
        <span class="tone" class:implied={t.implied}><b>{t.name}</b><i>{t.role}</i></span>
      {/each}
    </div>
    {#if v.alts.length}<p class="muted small">Also readable as {v.alts.join(' · ')}</p>{/if}
  {/if}
</section>
