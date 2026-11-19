/**
 * Replay a session recording through the engine and print a timeline.
 *   npm run replay                      → newest file in local/recordings/
 *   REC=local/recordings/x.json npm run replay
 *   VERBOSE=1 …                         → also every harmony re-reading and key update
 */
import { it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Session, type TraceEvent } from '../src/engine/session';
import type { Recording } from '../src/io/recorder';
import { midiName } from '../src/theory/pitch';
import { keyShort } from '../src/theory/scales';

function load(): { file: string; rec: Recording } {
  let file = process.env.REC;
  if (!file) {
    const dir = path.resolve('local', 'recordings');
    const all = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.json'))
          .sort()
      : [];
    if (!all.length) throw new Error('No recordings yet — press ● Rec in the app first.');
    file = path.join('local', 'recordings', all[all.length - 1]);
  }
  return { file, rec: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

const sec = (t: number) => (t / 1000).toFixed(2).padStart(7) + 's';
const names = (ns: unknown) => (ns as number[]).map((n) => midiName(n)).join(' ');

function describe(e: TraceEvent, verbose: boolean): string | null {
  switch (e.kind) {
    case 'harmony':
      return `  ≈ harmony ${e.chord ?? `(${e.result})`}  [${names(e.notes)}]${e.strike ? ' strike' : ' added'}${e.split != null ? ` split ${midiName(e.split as number)}` : ''}${verbose && (e.alts as string[]).length ? `  alts: ${(e.alts as string[]).join(', ')}` : ''}`;
    case 'melody':
      return `  ♪ melody ${midiName(e.note as number)}`;
    case 'retract-melody':
      return `  ↩ melody retracted → harmony: ${names(e.notes)}`;
    case 'commit':
      return e.action === 'new'
        ? `★ CHORD ${e.name}  ${e.roman ?? ''}`
        : verbose
          ? `  · ${e.name} (${e.action}${e.into ? ` into ${e.into}` : ''})`
          : null;
    case 'key':
      return verbose ? `  key ${e.key ?? '?'}  [${(e.top as string[]).join(', ')}]` : null;
    case 'modulation':
      return `⇒ KEY ${e.from ?? '—'} → ${e.to}`;
    case 'pattern':
      return `  ⌒ ${e.label}`;
    default:
      return null;
  }
}

it('replay', () => {
  const { file, rec } = load();
  const verbose = !!process.env.VERBOSE;
  vi.useFakeTimers();
  const s = new Session();
  if (rec.settings.style) s.setStyle(rec.settings.style as 'jazz' | 'triads');
  if (rec.settings.split !== undefined) s.seg.splitMode = rec.settings.split as typeof s.seg.splitMode;
  const base = 1_000_000;
  const out: { t: number; text: string }[] = [];
  s.trace = (e) => {
    const d = describe(e, verbose);
    if (d) out.push({ t: e.t - base, text: d });
  };

  // inputs: note-ons struck together are printed as one line
  let now = 0,
    group: { t: number; notes: number[] } | null = null;
  const flushGroup = () => {
    if (group) out.push({ t: group.t, text: `▼ ${group.notes.map((n) => midiName(n)).join(' ')}` });
    group = null;
  };
  for (const e of rec.input) {
    vi.advanceTimersByTime(e.t - now);
    now = e.t;
    if (e.kind === 'on') {
      if (group && e.t - group.t > 40) flushGroup();
      group ??= { t: e.t, notes: [] };
      group.notes.push(e.note);
      s.noteOn(e.note, e.vel, base + e.t);
    } else {
      flushGroup();
      if (e.kind === 'off') {
        if (verbose) out.push({ t: e.t, text: `▲ ${midiName(e.note)}` });
        s.noteOff(e.note, base + e.t);
      } else {
        out.push({ t: e.t, text: `pedal ${e.vel ? 'down' : 'up'}` });
        s.pedal(e.vel > 0, base + e.t);
      }
    }
  }
  flushGroup();
  vi.advanceTimersByTime(2000);

  out.sort((a, b) => a.t - b.t);
  const live = rec.engine.filter((e) => e.kind === 'commit' && e.action === 'new').map((e) => e.name);
  const replayed = s.chords.map((c) => c.name);
  console.log(
    [
      `\n${file}`,
      `note: ${rec.note || '(none)'}`,
      `${(rec.durationMs / 1000).toFixed(1)}s · ${rec.input.filter((e) => e.kind === 'on').length} notes · settings ${JSON.stringify(rec.settings)}`,
      '',
      ...out.map((o) => `${sec(o.t)}  ${o.text}`),
      '',
      `live chords     (${live.length}): ${live.join(' ')}`,
      `replayed chords (${replayed.length}): ${replayed.join(' ')}`,
      `melody: ${s.melody.map((m) => m.name).join(' ')}`,
      `final key: ${s.key ? keyShort(s.key) : '—'}`,
    ].join('\n'),
  );
  vi.useRealTimers();
});
