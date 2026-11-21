<script lang="ts">
  import Icon from './Icon.svelte';
  import DevicePicker from './DevicePicker.svelte';
  import { settings } from './store.svelte';
  import { onMount } from 'svelte';
  import {
    live,
    setBars,
    setMetronome,
    stopAudition,
    stopTransport,
    midi,
    persist,
    synth,
    ui,
    dismissNotice,
  } from './store.svelte';
  import {
    clearChordFocus,
    editSequence,
    confirmPlayedChord,
    composition,
    currentSequence,
    saveSong,
  } from './composition.svelte';
  import { attachQwerty } from '../io/qwerty';
  import Piano from './Piano.svelte';
  import Workspace from './Workspace.svelte';
  import Panels from './Panels.svelte';
  import Settings from './Settings.svelte';
  import SourcePicker from './SourcePicker.svelte';
  import Help from './Help.svelte';
  import SongActions from './SongActions.svelte';
  import Transport from './Transport.svelte';

  let topbarHeight = $state(0);
  let navbar = $state<HTMLDivElement>();
  let projectSlot = $state<HTMLDivElement>();
  let libraryOpen = $state(false);
  const project = $derived.by(() => {
    void composition.revision;
    return currentSequence();
  });
  $effect(() => {
    document.documentElement.dataset.theme = settings.preferences.theme;
  });
  $effect(() => {
    if (!ui.projectSavePending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
  $effect(() => {
    if (!navbar || !projectSlot) return;
    const viewport = navbar;
    const slot = projectSlot;
    const observer = new ResizeObserver(() => {
      const view = viewport.getBoundingClientRect();
      const project = slot.getBoundingClientRect();
      viewport.scrollLeft += project.left + project.width / 2 - (view.left + view.width / 2);
    });
    observer.observe(viewport);
    observer.observe(slot);
    if (slot.parentElement) observer.observe(slot.parentElement);
    return () => observer.disconnect();
  });
  let unlockRequested = false;
  function toggleSound() {
    settings.preferences.monitor = unlockRequested || ui.audioBlocked ? true : !settings.preferences.monitor;
    synth.setMuted(!settings.preferences.monitor);
    unlockRequested = false;
    persist();
    synth.unlock();
  }

  onMount(() => {
    midi.inputId = settings.preferences.input;
    midi.outputId = settings.preferences.output;
    void midi.init();
    if (settings.preferences.bars === 'metronome') {
      setBars('metronome');
      setMetronome(settings.preferences.click);
    }
    return attachQwerty(live);
  });
</script>

<div class="app" style:--topbar-height={`${topbarHeight}px`}>
  <header class="topbar" bind:clientHeight={topbarHeight}>
    <div class="topbar-scroll" bind:this={navbar}>
      <div class="topbar-row">
        <div class="navbar-side">
          <div class="app-tools">
            <div class="brand">chord.sh</div>
            <DevicePicker />
          </div>
          <Transport />
        </div>
        <div bind:this={projectSlot}>
          <SourcePicker song={project} bind:open={libraryOpen} {notice} />
        </div>
        <div class="navbar-side">
          <div class="app-tools"><SongActions song={project} /></div>
          <div class="app-tools">
            <button
              type="button"
              class="icon sound-toggle"
              class:dim={!settings.preferences.monitor}
              class:locked={ui.audioBlocked && settings.preferences.monitor}
              aria-label={ui.audioBlocked && settings.preferences.monitor
                ? 'Enable sound'
                : settings.preferences.monitor
                  ? 'Mute sound'
                  : 'Unmute sound'}
              onpointerdown={() => (unlockRequested = ui.audioBlocked)}
              onkeydown={() => (unlockRequested = ui.audioBlocked)}
              onclick={toggleSound}
              title={ui.audioBlocked && settings.preferences.monitor
                ? 'Enable sound — click to unlock browser audio'
                : settings.preferences.monitor
                  ? 'Sound on — you hear what you play (click to mute)'
                  : 'Sound off (click to hear what you play)'}
            >
              <Icon
                name={ui.audioBlocked && settings.preferences.monitor
                  ? 'unlock'
                  : settings.preferences.monitor
                    ? 'volume'
                    : 'mute'}
              />
            </button>
            <Panels />
            <button
              type="button"
              class="icon"
              onclick={() => {
                settings.preferences.theme = settings.preferences.theme === 'dark' ? 'light' : 'dark';
                persist();
              }}
              title="Switch light / dark"
            >
              <Icon name={settings.preferences.theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <Settings />
            <Help />
          </div>
        </div>
      </div>
    </div>
  </header>

  <main class="stage"><Workspace /></main>
  {#if !libraryOpen}
    {@render notice(false)}
  {/if}

  {#if settings.panels.piano}
    <footer><Piano /></footer>
  {/if}
</div>

{#snippet notice(inLibrary: boolean)}
  {#if ui.notice}
    <div class="workspace-notice" class:in-library={inLibrary} role="status" aria-live="polite">
      <span>{ui.notice.message}</span>
      {#if ui.notice.action}
        <button
          type="button"
          onclick={() => {
            const action = ui.notice?.action;
            dismissNotice();
            action?.();
          }}
        >
          {ui.notice.actionLabel}
        </button>
      {/if}
      <button type="button" class="icon" aria-label="Dismiss notification" title="Dismiss" onclick={dismissNotice}>
        ×
      </button>
    </div>
  {/if}
{/snippet}

<!-- any click or key press unlocks browser audio (MIDI notes don't count as a gesture) -->
<svelte:window
  onpointerdown={() => synth.unlock()}
  onkeydown={(e) => {
    synth.unlock();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveSong();
      return;
    }
    if (document.querySelector('dialog[open], [popover]:popover-open')) return;
    if (e.key === 'Escape') {
      if (ui.preview || ui.previewScore) {
        stopAudition();
        return;
      }
      stopTransport();
      clearChordFocus();
    }
    const typing =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement;
    if (
      !typing &&
      !e.defaultPrevented &&
      !e.repeat &&
      e.key === 'Enter' &&
      composition.input &&
      !(
        e.target instanceof Element &&
        e.target.closest(
          'button:not(.timeline-slot, .clip-body, .part-mode), a, summary, [contenteditable], [role="button"]',
        )
      )
    ) {
      e.preventDefault();
      confirmPlayedChord();
    }
    if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      editSequence((s) => (e.shiftKey ? s.redo() : s.undo()));
    }
  }}
/>
