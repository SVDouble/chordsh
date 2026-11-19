<script lang="ts">
  import { session, ui } from './store.svelte';
  import { mod12 } from '../theory/pitch';

  const LO = 21, HI = 108; // full 88 keys
  const BLACK = new Set([1, 3, 6, 8, 10]);
  let canvas: HTMLCanvasElement;
  let width = $state(800);
  let winH = $state(900);
  /** Scale the on-screen piano with the window so it never crowds out the panels. */
  const height = $derived(Math.round(Math.max(70, Math.min(130, winH * 0.13))));

  const keys = $derived.by(() => {
    const whites = [];
    for (let n = LO; n <= HI; n++) if (!BLACK.has(mod12(n))) whites.push(n);
    const ww = width / whites.length;
    const geo = new Map<number, { x: number; w: number; black: boolean }>();
    whites.forEach((n, i) => geo.set(n, { x: i * ww, w: ww, black: false }));
    for (let n = LO; n <= HI; n++)
      if (BLACK.has(mod12(n))) geo.set(n, { x: geo.get(n - 1)!.x + ww * 0.68, w: ww * 0.64, black: true });
    return geo;
  });

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  $effect(() => {
    ui.tick; ui.playing; // redraw on engine ticks and audition
    const ctx = canvas.getContext('2d')!;
    const dpr = devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const seg = session.seg;
    const guide = new Set(session.guideNotes);
    const playing = new Set(ui.playing ?? []);
    const colour = (n: number) => {
      const sounding = seg.held.has(n) || seg.sustained.has(n);
      if (sounding) return seg.melodyNotes.has(n) ? css('--melody') : seg.harmony.has(n) ? css('--harmony') : css('--accent');
      if (playing.has(n)) return css('--audition');
      return null;
    };
    for (const pass of [false, true])
      for (const [n, k] of keys) {
        if (k.black !== pass) continue;
        const h = k.black ? height * 0.62 : height;
        const c = colour(n);
        ctx.globalAlpha = c && seg.sustained.has(n) ? 0.55 : 1;
        ctx.fillStyle = c ?? (k.black ? css('--key-black') : css('--key-white'));
        ctx.fillRect(k.x + 0.5, 0, k.w - 1, h);
        ctx.globalAlpha = 1;
        if (guide.has(n)) {
          ctx.fillStyle = css('--guide');
          ctx.beginPath();
          ctx.arc(k.x + k.w / 2, h - 10, Math.min(6, k.w / 3), 0, Math.PI * 2);
          ctx.fill();
        }
        if (mod12(n) === 0 && !k.black) {
          ctx.fillStyle = css('--muted');
          ctx.font = '11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(`C${n / 12 - 1}`, k.x + k.w / 2, height - 4);
        }
      }
    const split = seg.split;
    if (split !== null && keys.get(split)) {
      ctx.strokeStyle = css('--muted');
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(keys.get(split)!.x, 0);
      ctx.lineTo(keys.get(split)!.x, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  let mouseNote: number | null = null;
  function hit(e: PointerEvent): number | null {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let found: number | null = null;
    for (const [n, k] of keys) if (x >= k.x && x < k.x + k.w && (!k.black || y < height * 0.62) && (k.black || found === null)) found = n;
    return found;
  }
  const down = (e: PointerEvent) => { mouseNote = hit(e); if (mouseNote !== null) session.noteOn(mouseNote, 90); };
  const up = () => { if (mouseNote !== null) session.noteOff(mouseNote); mouseNote = null; };
</script>

<svelte:window bind:innerHeight={winH} />
<div class="piano" bind:clientWidth={width}>
  <canvas bind:this={canvas} style="width:{width}px;height:{height}px" onpointerdown={down} onpointerup={up} onpointerleave={up}></canvas>
</div>
