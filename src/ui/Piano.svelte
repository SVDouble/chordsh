<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Icon from './Icon.svelte';
  import { focusedChord, compositionContext } from './composition.svelte';
  import { noteContext, keyRootContext } from './noteContext';
  import { roleClass } from './colours';
  import { holdInputNotes, playInputChord, stopInputChord, persist, session, ui, settings } from './store.svelte';
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
  let winH = $state(900);
  let hovered = $state<number | null>(null);
  let draft = $state<number[]>([]);
  let shiftSelecting = false;
  let dirty = false;
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
        if (draft.includes(n)) {
          ctx.fillStyle = css('--accent');
          ctx.globalAlpha = 0.3;
          ctx.fillRect(k.x + 2, 2, k.w - 4, h - 4);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = css('--accent');
          ctx.lineWidth = 3;
          ctx.strokeRect(k.x + 2, 2, k.w - 4, h - 4);
          ctx.lineWidth = 1;
          ctx.fillRect(k.x + 5, 12, k.w - 10, 5);
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

  const pointers = new Map<number, number>();
  const releases = new Map<number, () => void>();
  const releasePointers = () => {
    for (const release of releases.values()) release();
    releases.clear();
    pointers.clear();
  };
  function clearDraft() {
    draft = [];
    dirty = false;
    shiftSelecting = false;
    stopInputChord();
  }
  function cancelInput() {
    clearDraft();
    releasePointers();
  }
  function playDraft() {
    if (!draft.length) return;
    releasePointers();
    playInputChord(draft);
    dirty = false;
  }
  function toggleEntry() {
    cancelInput();
    settings.editor.pianoChordEntry = !settings.editor.pianoChordEntry;
    persist();
  }
  $effect(() => {
    void ui.inputCancelSerial;
    untrack(cancelInput);
  });
  function hit(e: PointerEvent): number | null {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left,
      y = e.clientY - r.top;
    if (x < 0 || x >= drawWidth || y < 0 || y >= height) return null;
    let found: number | null = null;
    for (const [n, k] of keys)
      if (x >= k.x && x < k.x + k.w && (!k.black || y < height * 0.62) && (k.black || found === null)) found = n;
    return found;
  }
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const note = hit(e);
    if (note === null) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    if (settings.editor.pianoChordEntry || e.shiftKey) {
      stopInputChord();
      releasePointers();
      draft = draft.includes(note) ? draft.filter((n) => n !== note) : [...draft, note].sort((a, b) => a - b);
      dirty = true;
      shiftSelecting ||= e.shiftKey;
      return;
    }
    clearDraft();
    pointers.set(e.pointerId, note);
    if (!releases.has(note)) releases.set(note, holdInputNotes([note], 90));
    canvas.setPointerCapture(e.pointerId);
  };
  const up = (e: PointerEvent) => {
    const note = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (note !== undefined && ![...pointers.values()].includes(note)) {
      releases.get(note)?.();
      releases.delete(note);
    }
  };

  onMount(() => {
    // Start near middle C once. Notes, previews and playback never move the user's keyboard view.
    const initialView = requestAnimationFrame(() => {
      if (keyboard) keyboard.scrollLeft = Math.max(0, (keys.get(60)?.x ?? 0) - keyboard.clientWidth / 2);
    });
    const blocked = (e: KeyboardEvent) =>
      e.defaultPrevented ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      (e.target instanceof Element &&
        !!e.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), button, a, summary',
        )) ||
      !!document.querySelector('dialog[open], [popover]:popover-open');
    const keyDown = (e: KeyboardEvent) => {
      if (blocked(e) || e.repeat) return;
      if (e.key === 'Enter' && draft.length) {
        e.preventDefault();
        e.stopPropagation();
        playDraft();
      } else if (e.key === 'Escape') cancelInput();
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || !shiftSelecting) return;
      shiftSelecting = false;
      if (!blocked(e) && dirty) playDraft();
      else dirty = false;
    };
    const visibility = () => {
      if (document.hidden) cancelInput();
    };
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(initialView);
      cancelInput();
      window.removeEventListener('keydown', keyDown, true);
      window.removeEventListener('keyup', keyUp, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  });
</script>

<svelte:window bind:innerHeight={winH} onpointerup={up} onpointercancel={up} onblur={cancelInput} />
<div class="piano-shell">
  <fieldset class="piano-tools" aria-label="Piano chord entry">
    <button
      type="button"
      class="icon"
      class:active={settings.editor.pianoChordEntry}
      aria-label="Chord entry mode"
      aria-pressed={settings.editor.pianoChordEntry}
      title="Chord entry: select notes, then Enter to play. Shortcut: Shift-click notes, release Shift to play."
      onclick={toggleEntry}
    >
      <Icon name="chord" />
    </button>
    <button
      type="button"
      class="icon"
      aria-label="Play selected notes"
      disabled={!draft.length}
      title="Play selected notes (Enter)"
      onclick={playDraft}
    >
      <Icon name="ear" />
    </button>
    <button
      type="button"
      class="icon"
      aria-label="Clear selected notes"
      disabled={!draft.length}
      title="Clear selected notes (Esc)"
      onclick={clearDraft}
    >
      <Icon name="close" />
    </button>
  </fieldset>
  <section
    class="piano"
    bind:clientWidth={width}
    bind:this={keyboard}
    title={hoverText ||
      'Roman numerals mark chord roots in the current key. Hover for note names; keyboard labels can be changed in Panels or Settings.'}
    aria-label={`Piano keyboard${tonalKey ? ` in ${keyLong(tonalKey)}` : ''}. ${settings.editor.pianoRootLabels ? 'Roman numerals mark chord roots. ' : ''}${activeNotes.map((n) => noteContext(n, voice.chord, tonalKey).description).join('; ')}${draft.length ? `. Selected: ${draft.map((n) => noteContext(n, voice.chord, tonalKey).name).join(', ')}` : ''}`}
  >
    <canvas
      bind:this={canvas}
      tabindex="0"
      aria-label="Playable piano. Shift-click notes and release Shift to play a chord."
      style="width:{drawWidth}px;height:{height}px"
      onpointermove={(e) => (hovered = hit(e))}
      onpointerdown={down}
      onpointerleave={() => (hovered = null)}
      onlostpointercapture={up}
    ></canvas>
  </section>
</div>
