#!/usr/bin/env python3
"""Download the evaluation datasets into ./data (git-ignored).

- BPS-FH: Beethoven piano sonatas, 1st movements, with expert functional-harmony labels
  (github.com/Tsung-Ping/functional-harmony, annotations GPL-3, music public domain)
- POP909: pop-song piano arrangements with chord, beat and key labels
  (github.com/music-x-lab/POP909-Dataset, MIT; underlying songs are copyrighted — local testing only)

Usage: python3 scripts/fetch_datasets.py [--pop N]   (default: 40 POP909 songs)
"""
import json, os, sys, urllib.error, urllib.request, zipfile, io
import xml.etree.ElementTree as ET

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
BPS = 'https://raw.githubusercontent.com/Tsung-Ping/functional-harmony/master/BPS_FH_Dataset'
POP = 'https://raw.githubusercontent.com/music-x-lab/POP909-Dataset/master/POP909'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def xlsx_rows(data: bytes) -> list[list[str | None]]:
    """Read the first sheet of an .xlsx with the standard library only."""
    z = zipfile.ZipFile(io.BytesIO(data))
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        shared = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
    rows = []
    for r in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter('{%s}row' % NS['m']):
        row = []
        for c in r.findall('m:c', NS):
            v, t = c.find('m:v', NS), c.get('t')
            row.append(''.join(c.itertext()) if t == 'inlineStr' else None if v is None else shared[int(v.text)] if t == 's' else v.text)
        rows.append(row)
    return rows


def num(x):
    try:
        f = float(x)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return x


def fetch_bps():
    for n in range(1, 33):
        out = os.path.join(ROOT, 'bps-fh', str(n))
        if os.path.exists(os.path.join(out, 'piece.json')):
            continue
        os.makedirs(out, exist_ok=True)
        notes = [[num(x) for x in line.split(',')] for line in get(f'{BPS}/{n}/notes.csv').decode().strip().splitlines()]
        chords = [[num(x) for x in r] for r in xlsx_rows(get(f'{BPS}/{n}/chords.xlsx'))]
        try:
            db = get(f'{BPS}/{n}/dBeats.xlsx')
        except urllib.error.HTTPError:
            db = get(f'{BPS}/{n}/dbeats.xlsx')  # some pieces use lower case
        downbeats = [num(r[0]) for r in xlsx_rows(db) if r]
        piece = {
            'source': 'BPS-FH', 'id': n, 'title': f'Beethoven piano sonata no. {n}, 1st mvt',
            # onset (crotchets), midi, morphetic pitch, duration (crotchets), staff, measure
            'notes': notes,
            # onset, offset, key, degree, quality, inversion, roman
            'chords': chords,
            'downbeats': downbeats,
        }
        json.dump(piece, open(os.path.join(out, 'piece.json'), 'w'))
        print(f'BPS-FH {n:2}: {len(notes)} notes, {len(chords)} chords')


def fetch_pop(count: int):
    for i in range(1, count + 1):
        sid = f'{i:03}'
        out = os.path.join(ROOT, 'pop909', sid)
        if os.path.exists(os.path.join(out, 'key_audio.txt')):
            continue
        os.makedirs(out, exist_ok=True)
        for f in (f'{sid}.mid', 'chord_midi.txt', 'beat_midi.txt', 'key_audio.txt'):
            open(os.path.join(out, f), 'wb').write(get(f'{POP}/{sid}/{f}'))
        print(f'POP909 {sid}')


if __name__ == '__main__':
    pop = int(sys.argv[sys.argv.index('--pop') + 1]) if '--pop' in sys.argv else 40
    fetch_bps()
    fetch_pop(pop)
    print('done →', os.path.normpath(ROOT))
