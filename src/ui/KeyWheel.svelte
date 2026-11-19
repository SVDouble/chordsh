<script lang="ts">
  import { session, ui } from './store.svelte';
  import { type Key, SCALE_LABEL, keyEq, keyIndex, keyLong, keyShort } from '../theory/scales';
  import type { KeyReach } from '../engine/coach';

  // Circle of fifths: majors outside, relative minors inside.
  const nodes = Array.from({ length: 12 }, (_, i) => {
    const a = ((i * 30 - 90) * Math.PI) / 180;
    return [
      { key: { tonic: (i * 7) % 12, mode: 'major' } as Key, x: 162 * Math.cos(a), y: 162 * Math.sin(a), r: 31 },
      { key: { tonic: (i * 7 + 9) % 12, mode: 'minor' } as Key, x: 104 * Math.cos(a), y: 104 * Math.sin(a), r: 24 },
    ];
  }).flat();
  const pos = (k: Key | null) => nodes.find((n) => keyEq(n.key, k));

  let hover = $state<KeyReach | null>(null);

  const v = $derived.by(() => {
    ui.tick;
    const k = session.activeKey;
    return {
      reach: new Map(session.reach.map((r) => [keyIndex(r.key), r])),
      current: k,
      target: session.target,
      label: k ? keyLong(k) : 'listening…',
      sub: k ? `${Math.round(session.keyProbs[keyIndex(k)] * 100)}% sure${session.keyLock ? ' · locked' : ''}` : '',
      flavour: session.flavour ? SCALE_LABEL[session.flavour] : '',
    };
  });
  const route = $derived.by(() => {
    const a = pos(v.current), b = pos(v.target);
    return a && b && a !== b ? `M${a.x},${a.y} Q0,0 ${b.x},${b.y}` : '';
  });
  const pick = (k: Key) => session.setTarget(keyEq(k, session.target) || keyEq(k, session.activeKey) ? null : k);
</script>

<section class="card wheel">
  <h2>Tonal map <span class="muted small">glow = where you're heading · click a key to plan a route</span></h2>
  <svg viewBox="-196 -196 392 392">
    {#if route}<path d={route} class="route-line" />{/if}
    {#each nodes as n (keyIndex(n.key))}
      {@const r = v.reach.get(keyIndex(n.key))}
      {@const l = r?.likelihood ?? 0}
      <g
        class="node {r?.smooth ?? ''}"
        class:current={keyEq(n.key, v.current)}
        class:target={keyEq(n.key, v.target)}
        role="button"
        tabindex="0"
        aria-label={keyLong(n.key)}
        onclick={() => pick(n.key)}
        onkeydown={(e) => e.key === 'Enter' && pick(n.key)}
        onmouseenter={() => (hover = r ?? null)}
        onmouseleave={() => (hover = null)}
      >
        <circle cx={n.x} cy={n.y} r={n.r} style="fill-opacity:{0.06 + 0.88 * l}" />
        <text x={n.x} y={n.y} class:dark={l > 0.55}>{keyShort(n.key)}</text>
      </g>
    {/each}
    <text class="centre" y="-10">{v.label}</text>
    <text class="centre small" y="14">{v.sub}</text>
    {#if v.flavour}<text class="centre small" y="34">{v.flavour} colour</text>{/if}
  </svg>
  <div class="wheel-info">
    {#if hover && hover.relation !== 'home'}
      <b>{keyLong(hover.key)}</b> — {Math.round(hover.likelihood * 100)}% likely · {hover.commonTones} common tones
      <ul>{#each hover.reasons as why}<li>{why}</li>{/each}</ul>
    {:else}
      <span class="legend"><i class="lg close"></i>close (1 accidental away)</span>
      <span class="legend"><i class="lg pivot"></i>reachable via a pivot chord</span>
      <span class="legend"><i class="lg remote"></i>remote — needs a dominant, °7 or sub</span>
    {/if}
  </div>
</section>
