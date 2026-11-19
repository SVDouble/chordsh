<script lang="ts">
  import { midi, session, ui } from './store.svelte';
  import { toggleDemo } from './demo';
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
      devices: midi.devices,
    };
  });
</script>

<section class="card now">
  {#if v.kind === 'none'}
    <div class="now-empty">
      <div class="big muted">Play a chord</div>
      <p>
        {#if v.devices.length}Your <b>{v.devices.join(', ')}</b> is connected — the chord name, its function and where to go next appear here.
        {:else}No MIDI device yet? Use the computer keys <kbd>A</kbd> <kbd>W</kbd> <kbd>S</kbd> … <kbd>;</kbd> (<kbd>Z</kbd>/<kbd>X</kbd> octave, <kbd>Space</kbd> pedal) or click the piano.{/if}
      </p>
      <button class="big-btn" onclick={toggleDemo}>{ui.demo ? '■ Stop demo' : '▶ Hear & watch a demo'}</button>
    </div>
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
