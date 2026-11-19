<script lang="ts">
  import { focusedChord, compositionContext } from './composition.svelte';
  import { noteContext, keyRootContext } from './noteContext';
  import { roleClass } from './colours';
  import { live, session, ui, settings } from './store.svelte';
  import { mod12 } from '../theory/pitch';
  import { keyLong } from '../theory/scales';

  const voice = $derived(focusedChord());
  const tonalKey = $derived(compositionContext().key ?? voice.key);
  const roots = $derived(Array.from({ length: 12 }, (_, pc) => keyRootContext(pc, tonalKey)));
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
  const keyWidth = $derived(
    Math.max(settings.editor.pianoKeyWidth, settings.editor.pianoRootLabels ? settings.editor.pianoLabelSize * 2 : 0),
  );
  const drawWidth = $derived(Math.max(width, keyWidth * 52));
  const noteSignature = $derived(activeNotes.join(','));
  let winH = $state(900);
  let hovered = $state<number | null>(null);
  const hoverText = $derived(
    hovered === null
      ? ''
      : [noteContext(hovered, voice.chord, tonalKey).description, roots[mod12(hovered)]?.description]
          .filter(Boolean)
          .join(' · '),
  );
  /** Scale the on-screen piano with the window so it never crowds out the panels. */
  const labelHeight = $derived(
    (settings.editor.pianoRootLabels ? settings.editor.pianoLabelSize + 16 : 0) +
      (settings.editor.pianoNoteNames ? 14 : 0) +
      (settings.editor.pianoChordRoles ? 28 : 0),
  );
  const height = $derived(Math.round(Math.max(90, (labelHeight + 8) / 0.62, Math.min(150, winH * 0.14))));

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
      const relation = noteContext(n, voice.chord, tonalKey).role;
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
          ctx.arc(k.x + k.w / 2, 8, Math.min(4, k.w / 3), 0, Math.PI * 2);
          ctx.fill();
        }
        const context = noteContext(n, voice.chord, tonalKey);
        const on = active.has(n);
        const blue = context.role && context.role.kind !== 'outside' && roleClass(context.role.label) === 'r-guide';
        const ink = on
          ? blue && settings.preferences.theme === 'light'
            ? '#fff'
            : '#0b0d12'
          : k.black
            ? '#e7eaf1'
            : '#202936';
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        if (settings.editor.pianoNoteNames) {
          ctx.font = `${Math.max(10, Math.min(12, k.w * 0.54))}px system-ui`;
          ctx.fillText(k.black ? context.pitchName : context.name, k.x + k.w / 2, h - 5, k.w - 2);
        }
        const root = roots[mod12(n)];
        if (settings.editor.pianoRootLabels && root) {
          const labelY = h - (settings.editor.pianoNoteNames ? 26 : 12);
          const size = settings.editor.pianoLabelSize;
          const [, accidental, numeral] = root.numeral.match(/^([♭♯]*)(.*)$/)!;
          ctx.font = `700 ${size}px system-ui`;
          ctx.fillText(numeral, k.x + k.w / 2, labelY, k.w - 4);
          if (accidental) {
            ctx.font = `700 ${Math.round(size * 0.7)}px system-ui`;
            ctx.fillText(accidental, k.x + k.w / 2, labelY - size - 1, k.w - 4);
          }
          ctx.fillStyle = css(`--${root.func === '?' ? 'X' : root.func}`);
          ctx.fillRect(k.x + 4, labelY + 4, k.w - 8, 3);
          ctx.fillStyle = ink;
        }
        if (settings.editor.pianoChordRoles && on && context.role) {
          const rootSpace = settings.editor.pianoRootLabels && root ? settings.editor.pianoLabelSize + 21 : 0;
          const bottomSpace = rootSpace + (settings.editor.pianoNoteNames ? 14 : 0);
          const roleY = Math.max(21, (h - bottomSpace) * 0.45);
          if (context.role.label === 'R' && context.chordName) {
            ctx.save();
            ctx.translate(k.x + k.w / 2, roleY);
            ctx.rotate(-Math.PI / 2);
            ctx.font = `bold 13px system-ui`;
            ctx.fillText(context.chordName, 0, 4, Math.max(24, h - bottomSpace - 6));
            ctx.restore();
          } else {
            ctx.font = 'bold 15px system-ui';
            ctx.fillText(context.role.label, k.x + k.w / 2, roleY, k.w - 3);
          }
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
    'Roman numerals mark chord roots in the current key. Hover for note names; keyboard labels can be changed in Panels or Settings.'}
  aria-label={`Piano keyboard${tonalKey ? ` in ${keyLong(tonalKey)}` : ''}. ${settings.editor.pianoRootLabels ? 'Roman numerals mark chord roots. ' : ''}${activeNotes.map((n) => noteContext(n, voice.chord, tonalKey).description).join('; ')}`}
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
