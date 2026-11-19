import { describe, expect, it } from 'vitest';
import { chordName, chordOf, identify, KINDS, KindName } from '../src/theory/chords';
import { parseChordSymbol } from '../src/theory/symbols';
import { EXAMPLES, parseChart } from '../src/engine/chart';
import { SongFollower, compareChord } from '../src/engine/song';
import { reharmHints } from '../src/engine/reharm';
import { parseMidiFile } from '../src/io/midifile';
import { keyShort } from '../src/theory/scales';

const name = (s: string) => { const c = parseChordSymbol(s); return c ? chordName(c) : null; };
const C = { tonic: 0, mode: 'major' as const };

describe('chord symbols', () => {
  it.each([
    ['Dm7', 'Dm7'], ['D-7', 'Dm7'], ['CΔ7', 'Cmaj7'], ['CM7', 'Cmaj7'], ['Bø', 'Bm7♭5'], ['Bø7', 'Bm7♭5'],
    ['B°7', 'B°7'], ['Bdim', 'B°'], ['G7alt', 'G7♯5(♭9,♯9)'], ['G7(b9,#11)', 'G7(♭9,♯11)'], ['C6/9', 'C6/9'],
    ['Fmaj7#11', 'Fmaj7(♯11)'], ['Asus4', 'Asus4'], ['C7sus4', 'C7sus4'], ['Cm(maj7)', 'Cm(maj7)'], ['E♭+', 'E♭+'],
    ['F/A', 'F/A'], ['G13', 'G13'], ['Am9', 'Am9'], ['Cadd9', 'Cadd9'], ['F#m7b5', 'F♯m7♭5'], ['C7(no3)', 'C7(no3)'],
  ])('%s → %s', (sym, expected) => expect(name(sym)).toBe(expected));

  it('rejects garbage', () => {
    expect(parseChordSymbol('Hello')).toBeNull();
    expect(parseChordSymbol('Cxyz')).toBeNull();
  });

  it('round-trips every recognised name', () => {
    for (const kind of Object.keys(KINDS) as KindName[])
      for (const root of [0, 3, 6, 10]) {
        const n = chordName(chordOf(root, kind));
        expect(name(n), n).toBe(n);
      }
    const n = chordName(identify([40, 48, 55, 58, 62]).best!); // a slash chord
    expect(name(n)).toBe(n);
  });
});

describe('charts', () => {
  it('parses bars, sections, repeats and finds the key', () => {
    const ch = parseChart('[A]\n| Dm7 G7 | Cmaj7 | % | A7 |\n// comment\n| Dm7 | G7 | C6 | C6 |');
    expect(ch.errors).toEqual([]);
    expect(ch.chords.map((c) => c.bar)).toEqual([1, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ch.chords[0].section).toBe('A');
    expect(ch.key && keyShort(ch.key)).toBe('C');
    expect(ch.chords[4].roman?.numeral).toBe('V7/ii');
    expect(ch.insights.some((x) => x.text.startsWith('ii–V–I in C'))).toBe(true);
  });
  it('all examples parse cleanly', () => {
    for (const e of EXAMPLES) expect(parseChart(e.text).errors, e.title).toEqual([]);
    expect(keyShort(parseChart(EXAMPLES[0].text).key!)).toBe('F');
  });
});

const v = (played: number[], written: string) => compareChord(identify(played).best!, parseChordSymbol(written)!, C);

describe('comparison', () => {
  it('is forgiving about voicing but names what is missing', () => {
    expect(v([50, 53, 57, 60], 'Dm7').verdict).toBe('exact');
    expect(v([53, 57, 60, 62], 'Dm7').verdict).toBe('exact'); // inversion
    const m = v([50, 53, 57], 'Dm7');
    expect(m.verdict).toBe('match');
    expect(m.notes[0]).toContain('C (♭7)');
  });
  it('accepts real substitutions', () => {
    expect(v([49, 53, 59], 'G7').verdict).toBe('substitute'); // D♭7 shell = tritone sub
    expect(v([47, 50, 53, 56], 'G7').verdict).toBe('substitute'); // B°7
    expect(v([52, 55, 59, 62], 'Cmaj9').verdict).toBe('match'); // rootless
  });
  it('flags wrong quality', () => {
    const r = v([50, 54, 57], 'Dm');
    expect(r.verdict).toBe('wrong');
    expect(r.notes[0]).toContain('major 3rd instead of minor 3rd');
  });
});

describe('follower', () => {
  it('advances, re-syncs after a skip and tallies habits', () => {
    const f = new SongFollower(parseChart('Dm7 G7 Cmaj7 A7'));
    const play = (n: number[]) => f.played(identify(n).best!);
    play([50, 53, 57]); // Dm triad — missing the 7th
    expect(f.pos).toBe(1);
    play([48, 52, 55]); // skipped G7, played C (missing 7th)
    expect(f.results.get(1)?.verdict).toBe('skipped');
    expect(f.pos).toBe(3);
    play([45, 49, 52, 55]); // A7 completes the pass
    expect(f.passes).toEqual([75]); // 3 of 4 played acceptably
    expect(f.habits()[0]).toContain('7th');
  });
});

describe('reharm', () => {
  it('offers tritone sub, ii–V and °7 for a resolving dominant', () => {
    const ch = parseChart('| C | G7 | C |');
    const labels = reharmHints(ch, 1).map((h) => h.label);
    expect(labels).toEqual(expect.arrayContaining(['Tritone sub', 'Make it a ii–V', '°7 instead']));
  });
  it('offers a secondary dominant before a diatonic target', () => {
    const ch = parseChart('| C | Dm | G7 | C |');
    expect(reharmHints(ch, 1).find((h) => h.label === 'Secondary dominant before it')!.chords.map((c) => chordName(c, ch.key))).toEqual(['A7', 'Dm']);
  });
});

describe('midi file', () => {
  it('reads notes with tempo', () => {
    // format 0, 1 track, 96 ticks/beat; tempo 120 bpm; C4 on at 0, off at 96 ticks (= 500 ms)
    const track = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0x90, 60, 100, 0x60, 0x80, 60, 0, 0x00, 0xff, 0x2f, 0x00];
    const bytes = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length, ...track];
    const ev = parseMidiFile(new Uint8Array(bytes).buffer);
    expect(ev).toEqual([{ t: 0, type: 'on', note: 60, vel: 100 }, { t: 500, type: 'off', note: 60, vel: 0 }]);
  });
});

describe('chart analysis details', () => {
  it('treats I7/IV7 in a blues as home, and groups repeated insights', () => {
    const ch = parseChart(EXAMPLES[0].text);
    expect(ch.chords[0].roman?.numeral).toBe('I7');
    expect(ch.chords[1].roman?.kind).toBe('blues');
    expect(ch.insights[0].where).toBe('form');
    const texts = ch.insights.map((x) => x.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
  it('spells the °7 from the dominant it replaces', () => {
    const ch = parseChart('| F | D7 | Gm7 | C7 | F |');
    expect(reharmHints(ch, 1).find((h) => h.label === '°7 instead')!.names).toEqual(['F♯°7']);
  });
});
