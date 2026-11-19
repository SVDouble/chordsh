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

  // Likelihood ramp: dim slate → blue → teal → green → yellow (bright = likely).
  const RAMP_DARK = [[38, 44, 58], [52, 84, 200], [22, 160, 170], [130, 205, 80], [255, 212, 59]];
  const RAMP_LIGHT = [[221, 225, 234], [120, 150, 235], [40, 180, 180], [140, 205, 70], [250, 196, 30]];
  const RAMP = $derived(ui.theme === 'light' ? RAMP_LIGHT : RAMP_DARK);
  const rampCss = $derived(RAMP.map((c) => `rgb(${c})`).join(', '));
  /** Colour for a key, relative to the most likely destination (so the scale always uses its full range). */
  function heat(l: number): string {
    const t = Math.pow(Math.min(1, Math.max(0, l / v.maxL)), 1.3) * (RAMP.length - 1);
    const i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i;
    const c = RAMP[i].map((a, k) => Math.round(a + (RAMP[i + 1][k] - a) * f));
    return `rgb(${c})`;
  }

  let hover = $state<KeyReach | null>(null);

  const v = $derived.by(() => {
    ui.tick;
    const k = session.activeKey;
    return {
      reach: new Map(session.reach.map((r) => [keyIndex(r.key), r])),
      maxL: Math.max(0.05, ...session.reach.filter((r) => r.relation !== 'home').map((r) => r.likelihood)),
      current: k,
      target: session.target,
      label: k ? keyLong(k) : 'listening…',
      sub: k ? `${Math.round(session.keyProbs[keyIndex(k)] * 100)}% sure${session.keyLock ? ' · locked' : ''}` : 'play a few chords',
      flavour: session.flavour ? SCALE_LABEL[session.flavour] : '',
    };
  });
  const route = $derived.by(() => {
    const a = pos(v.current), b = pos(v.target);
    return a && b && a !== b ? `M${a.x},${a.y} Q0,0 ${b.x},${b.y}` : '';
  });
  function pick(k: Key) {
    const off = keyEq(k, session.target) || keyEq(k, session.activeKey);
    session.setTarget(off ? null : k);
    if (!off) ui.tab = 'route';
  }
</script>

<div class="card wheel">
  <div class="label" title="Colour = how likely you're heading there (yellow = most likely). Green ring = close key (one accidental away), amber dashes = reachable through a shared chord, dotted = remote. Click a key to plan a route.">Tonal map</div>
  <svg viewBox="-196 -196 392 392" preserveAspectRatio="xMidYMid meet">
    {#if route}<path d={route} class="route-line" />{/if}
    {#each nodes as n (keyIndex(n.key))}
      {@const r = v.reach.get(keyIndex(n.key))}
      {@const l = r?.likelihood ?? 0}
      {@const cur = keyEq(n.key, v.current)}
      {@const strong = !cur && !!v.current && l / v.maxL >= 0.55}
      {@const dark = cur || (!!v.current && l / v.maxL > 0.62)}
      <g
        class="node {r?.smooth ?? ''}"
        class:current={cur}
        class:target={keyEq(n.key, v.target)}
        role="button"
        tabindex="0"
        aria-label={keyLong(n.key)}
        onclick={() => pick(n.key)}
        onkeydown={(e) => e.key === 'Enter' && pick(n.key)}
        onmouseenter={() => (hover = r ?? null)}
        onmouseleave={() => (hover = null)}
      >
        <circle cx={n.x} cy={n.y} r={n.r} style="fill:{cur ? 'var(--current-fill)' : v.current ? heat(l) : 'var(--card-2)'}" />
        <text x={n.x} y={n.y - (strong ? 6 : 0)} class:dark>{keyShort(n.key)}</text>
        {#if strong}<text class="pct" class:dark x={n.x} y={n.y + 11}>{Math.round(l * 100)}%</text>{/if}
      </g>
    {/each}
    <text class="centre" y="-10">{v.label}</text>
    <text class="centre small" y="14">{v.sub}</text>
    {#if v.flavour}<text class="centre small" y="34">{v.flavour} colour</text>{/if}
  </svg>
  {#if hover && hover.relation !== 'home'}
    <div class="wheel-info">
      <b>{keyLong(hover.key)}</b> · {Math.round(hover.likelihood * 100)}% likely · {hover.commonTones} common tones
      <div class="muted">{hover.reasons.join(' · ')}</div>
    </div>
  {:else if v.current}
    <div class="wheel-legend">
      <span>less</span><span class="ramp" style="background:linear-gradient(90deg, {rampCss})"></span><span>more likely</span>
      <span class="ring close"></span><span>close key</span><span class="ring remote"></span><span>remote</span>
    </div>
  {/if}
</div>
