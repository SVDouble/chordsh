<script lang="ts">
  import { midi, session, ui } from './store.svelte';
  import { chordName, inversionLabel, toneNames } from '../theory/chords';
  import { SCALE_LABEL, keyLong } from '../theory/scales';
  import { roleClass } from './colours';

  const FUNC = { T: 'Tonic', PD: 'Predominant', D: 'Dominant', '?': 'Colour' };

  const v = $derived.by(() => {
    void ui.tick; // re-run when the engine changes
    const id = session.now,
      key = session.activeKey,
      c = id.best;
    return {
      kind: id.kind,
      name: c ? chordName(c, key) : id.notes.map((n) => session.spell(n)).join('–') || '—',
      interval: id.intervalName,
      roman: session.nowRoman,
      key: key ? keyLong(key) + (session.flavour ? ` · ${SCALE_LABEL[session.flavour]}` : '') : null,
      tones: c ? toneNames(c, key) : [],
      inversion: c ? inversionLabel(c) : '',
      alts: id.alternatives.slice(0, 3).map((a) => chordName(a, key)),
      devices: midi.devices,
    };
  });
</script>

<div class="card now">
  {#if v.kind === 'none'}
    <div class="big muted">Play a chord</div>
    <p class="muted small">
      {v.devices.length ? 'Listening to your keyboard.' : 'MIDI, computer keys or the on-screen piano.'}
    </p>
  {:else}
    <div class="now-top">
      <span class="big">{v.name}</span>
      {#if v.roman}
        <span class="numeral f-{v.roman.func}">{v.roman.numeral}</span>
      {/if}
    </div>
    <div class="badges">
      {#if v.roman}
        <span class="func f-{v.roman.func}">{FUNC[v.roman.func]}</span>
        <span class="badge">{v.roman.kind.replaceAll('-', ' ')}</span>
      {/if}
      {#if v.interval}
        <span class="badge">{v.interval}</span>
      {/if}
      {#if v.inversion}
        <span class="badge">{v.inversion}</span>
      {/if}
      {#if v.key}
        <span class="muted small">in {v.key}</span>
      {/if}
    </div>
    {#if v.roman}
      <p class="explain">{v.roman.explain}</p>
    {/if}
    <div class="tones" title={v.alts.length ? `Also readable as ${v.alts.join(' · ')}` : ''}>
      {#each v.tones as t}
        <span class="tone {roleClass(t.role)}" class:implied={t.implied}>
          <b>{t.name}</b><i>{t.role}</i>
        </span>
      {/each}
    </div>
  {/if}
</div>
