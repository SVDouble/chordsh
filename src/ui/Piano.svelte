<script lang="ts">
  import { focusedChord } from './composition.svelte';
  import { noteContext } from './noteContext';
  import { roleClass } from './colours';
  import { live, session, ui, settings } from './store.svelte';
  import { mod12 } from '../theory/pitch';

  const voice = $derived(focusedChord());
  const activeNotes = $derived.by(() => {
    void ui.tick;
    return [...new Set([...voice.notes, ...session.seg.held.keys(), ...session.seg.sustained, ...(ui.playing ?? [])])];
  });
  const ROLE_COLOURS: Record<string, string> = {
    'r-root': '--guide',
    'r-guide': '--harmony',
    'r-fifth': '--muted',
    'r-ext': '--melody',
    'r-alt': '--D',
  };
  const roleColour = (role: string) => css(ROLE_COLOURS[roleClass(role)]);
  const LO = 21,
    HI = 108; // full 88 keys
  const BLACK = new Set([1, 3, 6, 8, 10]);
  let canvas: HTMLCanvasElement;
  let width = $state(800);
  let keyboard = $state<HTMLElement>();
  const drawWidth = $derived(Math.max(width, settings.editor.pianoKeyWidth * 52));
  const noteSignature = $derived(activeNotes.join(','));
  let winH = $state(900);
  let hovered = $state<number | null>(null);
  const hoverText = $derived(hovered === null ? '' : noteContext(hovered, voice.chord, voice.key).description);
  /** Scale the on-screen piano with the window so it never crowds out the panels. */
  const height = $derived(Math.round(Math.max(70, Math.min(130, winH * 0.13))));

  const keys = $derived.by(() => {
    const whites = [];
    for (let n = LO; n <= HI; n++) if (!BLACK.has(mod12(n))) whites.push(n);
    const ww = drawWidth / whites.length;
    const geo = new Map<number, { x: number; w: number; black: boolean }>();
    whites.forEach((n, i) => geo.set(n, { x: i * ww, w: ww, black: false }));
    for (let n = LO; n <= HI; n++)
      if (BLACK.has(mod12(n))) geo.set(n, { x: geo.get(n - 1)!.x + ww * 0.68, w: ww * 0.64, black: true });
    return geo;
  });

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  $effect(() => {
    void ui.tick; // re-run when the engine changes ui.playing; // redraw on engine ticks and audition
    const ctx = canvas.getContext('2d')!;
    const dpr = devicePixelRatio || 1;
    canvas.width = drawWidth * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const seg = session.seg;
    const guide = new Set(session.guideNotes);
    const active = new Set(activeNotes);
    const colour = (n: number) => {
      if (!active.has(n)) return null;
      const relation = noteContext(n, voice.chord, voice.key).role;
      if (!relation) return css('--accent');
      if (relation.kind === 'outside') return css('--D');
      return roleColour(relation.label);
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
        if (!k.black) {
          ctx.strokeStyle = css('--line');
          ctx.strokeRect(k.x + 0.5, 0.5, k.w - 1, h - 1);
        }
        if (guide.has(n)) {
          ctx.fillStyle = css('--guide');
          ctx.beginPath();
          ctx.arc(k.x + k.w / 2, h - 10, Math.min(6, k.w / 3), 0, Math.PI * 2);
          ctx.fill();
        }
        const context = noteContext(n, voice.chord, voice.key);
        const on = active.has(n);
        const blue = context.role && context.role.kind !== 'outside' && roleClass(context.role.label) === 'r-guide';
        const ink = on
          ? blue && settings.preferences.theme === 'light'
            ? '#fff'
            : '#0b0d12'
          : k.black
            ? '#e7eaf1'
            : '#47516a';
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.font = `${Math.max(8, Math.min(11, k.w * 0.54))}px system-ui`;
        ctx.fillText(k.black ? context.pitchName : context.name, k.x + k.w / 2, h - 5, k.w - 2);
        if (on && context.role) {
          if (context.role.label === 'R' && context.chordName) {
            ctx.save();
            ctx.translate(k.x + k.w / 2, Math.max(19, h * 0.34));
            ctx.rotate(-Math.PI / 2);
            ctx.font = `bold ${Math.min(11, k.w * 0.58)}px system-ui`;
            ctx.fillText(context.chordName, 0, 3, Math.max(24, h * 0.52));
            ctx.restore();
          } else {
            ctx.font = `bold ${Math.min(12, Math.max(8, k.w * 0.7))}px system-ui`;
            ctx.fillText(context.role.label, k.x + k.w / 2, Math.max(20, h * 0.32), k.w - 2);
          }
        }
        if (on && context.degree) {
          ctx.font = `${Math.max(8, Math.min(11, k.w * 0.55))}px system-ui`;
          ctx.fillText(`ˆ${context.degree}`, k.x + k.w / 2, h - 22, k.w - 2);
        }
      }
  });

  $effect(() => {
    const notes = noteSignature ? noteSignature.split(',').map(Number) : [60];
    const positions = notes.map((n) => keys.get(n)?.x).filter((n): n is number => n !== undefined);
    if (!keyboard || !positions.length || drawWidth <= width) return;
    const middle = (Math.min(...positions) + Math.max(...positions)) / 2;
    keyboard.scrollLeft = Math.max(0, middle - width / 2);
  });

  let mouseNote: number | null = null;
  function hit(e: PointerEvent): number | null {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    let found: number | null = null;
    for (const [n, k] of keys)
      if (x >= k.x && x < k.x + k.w && (!k.black || y < height * 0.62) && (k.black || found === null)) found = n;
    return found;
  }
  const down = (e: PointerEvent) => {
    mouseNote = hit(e);
    if (mouseNote !== null) live.noteOn(mouseNote, 90);
  };
  const up = () => {
    if (mouseNote !== null) live.noteOff(mouseNote);
    mouseNote = null;
  };
</script>

<svelte:window bind:innerHeight={winH} />
<section
  class="piano"
  bind:clientWidth={width}
  bind:this={keyboard}
  title={hoverText ||
    'Note names below; chord intervals above; ˆ marks degrees in the current key. Hover a key for both references.'}
  aria-label={voice.name
    ? `Piano relative to ${voice.name}. Note names below, chord intervals above, scale degrees marked with a caret. ${activeNotes.map((n) => noteContext(n, voice.chord, voice.key).description).join('; ')}`
    : 'Piano keyboard with note names. Select or play a chord to inspect chord intervals and scale degrees.'}
>
  <canvas
    bind:this={canvas}
    style="width:{drawWidth}px;height:{height}px"
    onpointermove={(e) => (hovered = hit(e))}
    onpointerdown={down}
    onpointerup={up}
    onpointerleave={() => {
      hovered = null;
      up();
    }}
    onpointercancel={up}
  ></canvas>
</section>
