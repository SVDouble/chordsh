import { describe, expect, it } from 'vitest';
import type { Piece } from '../src/library/pieces';
import { annotatedKind, recordedChords, songFromPerformance, songFromReference } from '../src/library/toSong';

describe('library entries as songs', () => {
  it('reads the 7th from Roman, jazz and Harte labels', () => {
    expect(annotatedKind('maj', 'b.i:V7')).toBe('7');
    expect(annotatedKind('maj', 'f:V65')).toBe('7');
    expect(annotatedKind('maj', 'C.I:I')).toBe('maj');
    expect(annotatedKind('maj', 'G^7')).toBe('maj7');
    expect(annotatedKind('min', 'F#m7')).toBe('m7');
    expect(annotatedKind('dim', 'b.i:viiø7')).toBe('m7b5');
    expect(annotatedKind('min', 'B:min')).toBe('min');
    expect(annotatedKind('sus', 'Eb:sus2')).toBe('sus2');
    expect(annotatedKind('sus', 'F#:sus4')).toBe('sus4');
  });
  it('a reference piece keeps its annotated chords, beat grid and key', () => {
    const beats = Array.from({ length: 17 }, (_, i) => i * 500); // 120 BPM
    const song = songFromReference({
      title: 'Ref',
      beats,
      beats_per_bar: 4,
      notes: [
        [0, 1000, 72, 80],
        [2000, 1000, 74, 80],
        [4000, 2000, 71, 80],
        [6000, 2000, 72, 80],
      ],
      chords: [
        [0, 2000, 0, 'maj', 'C.I:I', 0, 'major'],
        [2000, 4000, 2, 'min', 'C.I:ii', 0, 'major'],
        [4000, 6000, 7, 'maj', 'C.I:V7', 0, 'major'],
        [6000, 8000, 0, 'maj', 'C.I:I', 0, 'major'],
      ],
    });
    expect(song.bpm).toBe(120);
    expect(song.key).toEqual({ tonic: 0, mode: 'major' });
    expect(song.steps.map((s) => `${s.symbol}@${s.start}+${s.beats}`)).toEqual(['C@0+4', 'Dm@4+4', 'G7@8+4', 'C@12+4']);
    expect(song.melody?.map((n) => n.pitch)).toEqual([72, 74, 71, 72]);
  });
  it('loads reference chords spelled with double accidentals and keeps their melody', () => {
    const song = songFromReference({
      title: 'Diminished passing chord',
      beats: [0, 500, 1000, 1500, 2000],
      beats_per_bar: 4,
      notes: [[0, 500, 72, 80]],
      chords: [
        [0, 1000, 9, 'dim', 'Ao7', 8, 'major'],
        [1000, 2000, 10, 'min', 'Bbm7', 8, 'major'],
      ],
    });
    expect(song.steps.map((s) => s.symbol)).toEqual(['B𝄫°7', 'B♭m7']);
    expect(song.melody?.map((n) => n.pitch)).toEqual([72]);
  });
  it('a recording keeps the chords the app recognised during the take', () => {
    const piece: Piece = {
      id: 'r',
      title: 'Take',
      source: 'recording',
      bpm: 120,
      notes: [
        [0, 900, 60, 90],
        [0, 900, 64, 90],
        [0, 900, 67, 90],
        [1000, 900, 65, 90],
        [1000, 900, 69, 90],
        [1000, 900, 72, 90],
      ],
    };
    const commits = recordedChords([
      { t: 0, kind: 'commit', name: 'C' },
      { t: 5, kind: 'harmony' },
      { t: 1000, kind: 'commit', name: 'F' },
    ]);
    const song = songFromPerformance(piece, commits);
    expect(song.steps.map((s) => `${s.symbol}@${s.start}+${s.beats}`)).toEqual(['C@0+2', 'F@2+2']);
  });
});
