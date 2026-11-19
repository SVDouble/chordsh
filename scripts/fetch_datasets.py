#!/usr/bin/env python3
"""Fetch and convert the evaluation corpora listed in scripts/datasets.json into ./local/data.

Every corpus is pinned to a commit and converted into one format (see datasets.json "format"),
so anyone can rebuild exactly the same benchmark:   python3 scripts/fetch_datasets.py [corpus ...]

Standard library only. Downloads are cached in local/data/.cache.
"""
import csv, io, json, os, random, re, sys, urllib.error, urllib.request, zipfile
from fractions import Fraction
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', 'local', 'data'))
CACHE = os.path.join(ROOT, '.cache')
MANIFEST = json.load(open(os.path.join(HERE, 'datasets.json')))
LETTER = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]


# ───────────────────────── download helpers ─────────────────────────
def get(url: str) -> bytes:
    path = os.path.join(CACHE, re.sub(r'[^A-Za-z0-9._-]', '_', url.split('://', 1)[1]))
    if os.path.exists(path):
        return open(path, 'rb').read()
    req = urllib.request.Request(url, headers={'User-Agent': 'musify-benchmark'})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    os.makedirs(CACHE, exist_ok=True)
    open(path, 'wb').write(data)
    return data


def raw(c, path):
    return f"https://raw.githubusercontent.com/{c['repo']}/{c['commit']}/{path}"


def listdir(c, path):
    data = json.loads(get(f"https://api.github.com/repos/{c['repo']}/contents/{path}?ref={c['commit']}"))
    return sorted(x['name'] for x in data)


def write(corpus, pid, piece):
    out = os.path.join(ROOT, corpus)
    os.makedirs(out, exist_ok=True)
    json.dump(piece, open(os.path.join(out, f'{pid}.json'), 'w'))


def num(x):
    if x is None or x == '':
        return None
    return float(Fraction(str(x)))


def key_of(letter_name: str):
    """'Bb' / 'f#' / 'A-' / 'e-' → (tonic, mode). Lower case = minor; '-' and 'b' = flat, '#' and '+' = sharp."""
    s = letter_name.strip()
    pc = LETTER[s[0].upper()]
    for ch in s[1:]:
        pc += 1 if ch in '#+' else -1 if ch in 'b-' else 0
    return pc % 12, 'minor' if s[0].islower() else 'major'


def piece(corpus, pid, title, genre, notes, chords, beats, bars, bpb, synthetic=False):
    return {'corpus': corpus, 'id': pid, 'title': title, 'genre': genre, 'synthetic': synthetic,
            'notes': notes, 'chords': chords, 'beats': beats, 'bars': bars, 'beats_per_bar': bpb}


# ───────────────────────── BPS-FH ─────────────────────────
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def xlsx_rows(data: bytes):
    z = zipfile.ZipFile(io.BytesIO(data))
    shared = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)] if 'xl/sharedStrings.xml' in z.namelist() else []
    rows = []
    for r in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).iter('{%s}row' % NS['m']):
        row = []
        for cell in r.findall('m:c', NS):
            v, t = cell.find('m:v', NS), cell.get('t')
            row.append(''.join(cell.itertext()) if t == 'inlineStr' else None if v is None else shared[int(v.text)] if t == 's' else v.text)
        rows.append(row)
    return rows


BPS_FAMILY = {'M': 'maj', 'M7': 'maj', 'D7': 'maj', 'm': 'min', 'm7': 'min', 'd': 'dim', 'd7': 'dim', 'h7': 'dim', 'a': 'aug'}


def bps_degree(deg: str, tonic: int, mode: str, quality: str) -> int:
    def one(d, leading):
        acc = -1 if d[0] == '-' else 1 if d[0] == '+' else 0
        n = int(d.lstrip('+-')) - 1
        if acc: return (MAJOR[n] + acc) % 12
        if mode == 'minor' and n == 6 and leading: return 11
        return (MAJOR if mode == 'major' else MINOR)[n]
    if '/' not in deg:
        return (tonic + one(deg, quality in ('d', 'd7', 'h7'))) % 12
    x, y = deg.split('/')
    acc = -1 if x[0] == '-' else 1 if x[0] == '+' else 0
    return (tonic + one(y, False) + MAJOR[int(x.lstrip('+-')) - 1] + acc) % 12


def fetch_bps(c):
    beat = 60000 / c['bpm']
    for n in range(1, 33):
        base = f'BPS_FH_Dataset/{n}'
        notes = [[float(x) for x in line.split(',')] for line in get(raw(c, f'{base}/notes.csv')).decode().strip().splitlines()]
        try:
            db = get(raw(c, f'{base}/dBeats.xlsx'))
        except urllib.error.HTTPError:
            db = get(raw(c, f'{base}/dbeats.xlsx'))
        start = min(x[0] for x in notes)
        ms = lambda b: round((b - start) * beat, 1)
        chords = []
        for r in xlsx_rows(get(raw(c, f'{base}/chords.xlsx'))):
            t0, t1, k, deg, q = float(r[0]), float(r[1]), str(r[2]), str(r[3]).replace('.0', ''), str(r[4])
            if q not in BPS_FAMILY: continue
            tonic, mode = key_of(k)
            chords.append([ms(t0), ms(t1), bps_degree(deg, tonic, mode, q), BPS_FAMILY[q], f'{k}:{r[6]}', tonic, mode])
        end = max(x[0] + x[3] for x in notes)
        downbeats = [ms(float(r[0])) for r in xlsx_rows(db) if r and r[0] is not None]
        bpb = round((downbeats[2] - downbeats[1]) / beat) if len(downbeats) > 2 else 4
        write('bps-fh', str(n), piece('bps-fh', str(n), f'Beethoven piano sonata no. {n}, 1st mvt', c['genre'],
              [[ms(o), round(d * beat, 1), int(m), 80] for o, m, _, d, *_ in notes], chords,
              [round(i * beat, 1) for i in range(int(end - start) + 1)], downbeats, bpb))
        print(f'  bps-fh {n}')


# ───────────────────────── DCML (Mozart, Chopin …) ─────────────────────────
DCML_FAMILY = {'M': 'maj', 'Mm7': 'maj', 'MM7': 'maj', 'm': 'min', 'mm7': 'min', 'mM7': 'min', 'o': 'dim', 'o7': 'dim', '%7': 'dim', '+': 'aug', '+7': 'aug', '+M7': 'aug'}
NUMERAL = {'i': 0, 'ii': 1, 'iii': 2, 'iv': 3, 'v': 4, 'vi': 5, 'vii': 6}


def dcml_local_key(globalkey: str, localkey: str):
    gt, gm = key_of(globalkey)
    m = re.match(r'^([b#]*)([ivIV]+)$', localkey or 'I')
    acc = m.group(1).count('#') - m.group(1).count('b')
    deg = NUMERAL[m.group(2).lower()]
    pc = (gt + (MAJOR if gm == 'major' else MINOR)[deg] + acc) % 12
    return pc, 'major' if m.group(2).isupper() else 'minor'


def tsv(data: bytes):
    return list(csv.DictReader(io.StringIO(data.decode('utf-8')), delimiter='\t'))


def fetch_dcml(c):
    beat = 60000 / c['bpm']
    for f in [x for x in listdir(c, 'notes') if x.endswith('.notes.tsv')]:
        pid = f[: -len('.notes.tsv')]
        notes_rows = tsv(get(raw(c, f'notes/{f}')))
        try:
            harm = tsv(get(raw(c, f'harmonies/{pid}.harmonies.tsv')))
            meas = tsv(get(raw(c, f'measures/{pid}.measures.tsv')))
        except urllib.error.HTTPError:
            continue
        notes = []
        for r in notes_rows:
            qb, d = num(r['quarterbeats']), num(r['duration_qb'])
            if qb is None or d is None or not r['midi']: continue
            notes.append([round(qb * beat, 1), round(d * beat, 1), int(r['midi']), 80])
        if not notes: continue
        rows = [r for r in harm if r.get('chord_type') in DCML_FAMILY and num(r['quarterbeats']) is not None]
        chords = []
        for i, r in enumerate(rows):
            t0 = num(r['quarterbeats'])
            t1 = num(rows[i + 1]['quarterbeats']) if i + 1 < len(rows) else t0 + (num(r['duration_qb']) or 4)
            tonic, mode = dcml_local_key(r['globalkey'], r['localkey'])
            root = (tonic + 7 * int(float(r['root']))) % 12
            chords.append([round(t0 * beat, 1), round(t1 * beat, 1), root, DCML_FAMILY[r['chord_type']], f"{r['globalkey']}.{r['localkey']}:{r['chord']}", tonic, mode])
        bars, beats = [], []
        for r in meas:
            qb = num(r['quarterbeats'])
            if qb is None: continue
            bars.append(round(qb * beat, 1))
            n, d = (r['timesig'] or '4/4').split('/')
            step = 4 / int(d)
            for k in range(int(n)): beats.append(round((qb + k * step) * beat, 1))
        sig = (meas[0]['timesig'] if meas else '4/4').split('/')
        write(c['name'], pid, piece(c['name'], pid, f"{c['name'].capitalize()} {pid}", c['genre'], sorted(notes), chords, beats, bars, int(sig[0])))
        print(f"  {c['name']} {pid}")


# ───────────────────────── POP909 ─────────────────────────
def read_midi(data: bytes):
    """Minimal SMF reader → [(ms, 'on'|'off', note, vel)]."""
    p = 0
    def u32():
        nonlocal p; v = int.from_bytes(data[p:p + 4], 'big'); p += 4; return v
    def vlq():
        nonlocal p
        v = 0
        while True:
            b = data[p]; p += 1; v = (v << 7) | (b & 0x7F)
            if not b & 0x80: return v
    assert data[:4] == b'MThd'
    p = 4; hl = u32(); ntr = int.from_bytes(data[p + 2:p + 4], 'big'); div = int.from_bytes(data[p + 4:p + 6], 'big'); p += hl
    raw_ev = []
    for _ in range(ntr):
        if data[p:p + 4] != b'MTrk': break
        p += 4; ln = u32(); end = p + ln; tick = 0; status = 0
        while p < end:
            tick += vlq()
            s = data[p]
            if s & 0x80: p += 1
            else: s = status
            if s == 0xFF:
                t = data[p]; p += 1; n = vlq()
                if t == 0x51: raw_ev.append((tick, 'tempo', int.from_bytes(data[p:p + 3], 'big'), 0))
                p += n
            elif s in (0xF0, 0xF7): p += vlq()
            else:
                status = s; ty = s & 0xF0; a = data[p]; p += 1
                b = 0 if ty in (0xC0, 0xD0) else data[p]
                if ty not in (0xC0, 0xD0): p += 1
                if ty == 0x90 and b > 0: raw_ev.append((tick, 'on', a, b))
                elif ty in (0x80, 0x90): raw_ev.append((tick, 'off', a, 0))
        p = end
    raw_ev.sort(key=lambda e: e[0])
    us, last, ms, out = 500000, 0, 0.0, []
    for tick, kind, a, b in raw_ev:
        ms += (tick - last) * us / div / 1000; last = tick
        if kind == 'tempo': us = a
        else: out.append((ms, kind, a, b))
    return out


POP_FAMILY = {'maj': 'maj', 'maj7': 'maj', 'maj6': 'maj', '7': 'maj', 'min': 'min', 'min7': 'min', 'min6': 'min',
              'dim': 'dim', 'hdim7': 'dim', 'dim7': 'dim', 'aug': 'aug', 'sus2': 'sus', 'sus4': 'sus', 'sus4(b7)': 'sus'}


def harte_pc(s):
    pc = LETTER[s[0]]
    for ch in s[1:]: pc += -1 if ch == 'b' else 1 if ch == '#' else 0
    return pc % 12


def fetch_pop(c):
    for i in range(1, c.get('limit', 60) + 1):
        sid = f'{i:03}'
        base = f'POP909/{sid}'
        ev = read_midi(get(raw(c, f'{base}/{sid}.mid')))
        open_ = {}
        notes = []
        for t, kind, n, v in ev:
            if kind == 'on': open_[n] = (t, v)
            elif n in open_:
                t0, v0 = open_.pop(n); notes.append([round(t0, 1), round(t - t0, 1), n, v0])
        kline = get(raw(c, f'{base}/key_audio.txt')).decode().split('\n')[0].split()
        kt, km = kline[2].split(':')
        tonic, mode = harte_pc(kt), 'minor' if km.startswith('min') else 'major'
        chords = []
        for line in get(raw(c, f'{base}/chord_midi.txt')).decode().strip().splitlines():
            a, b, lab = line.split()
            if lab == 'N': continue
            r, q = lab.split(':')
            fam = POP_FAMILY.get(q.split('/')[0])
            if fam: chords.append([round(float(a) * 1000, 1), round(float(b) * 1000, 1), harte_pc(r), fam, lab, tonic, mode])
        rows = [[float(x) for x in l.split()] for l in get(raw(c, f'{base}/beat_midi.txt')).decode().strip().splitlines()]
        write('pop909', sid, piece('pop909', sid, f'POP909 #{sid}', c['genre'], sorted(notes), chords,
              [round(r[0] * 1000, 1) for r in rows], [round(r[0] * 1000, 1) for r in rows if r[2] == 1], 4))
        print(f'  pop909 {sid}')


# ───────────────────────── Jazz Harmony Treebank (rendered) ─────────────────────────
def jazz_chord(sym: str):
    """iRealPro-style symbol → (root, family, intervals)."""
    m = re.match(r'^([A-G][#b]?)(.*)$', sym)
    root = harte_pc(m.group(1)); q = m.group(2)
    if q.startswith('^'): third, fam, sev = 4, 'maj', 11
    elif q.startswith(('m', '-')) and not q.startswith('maj'): third, fam, sev = 3, 'min', 10
    elif q.startswith(('o', 'dim')): third, fam, sev = 3, 'dim', 9
    elif q.startswith(('h', 'ø', '%')): third, fam, sev = 3, 'dim', 10
    elif q.startswith('+'): third, fam, sev = 4, 'aug', 10
    elif 'sus' in q: third, fam, sev = 5, 'sus', 10
    else: third, fam, sev = 4, 'maj', 10
    fifth = 6 if fam == 'dim' else 8 if fam == 'aug' else 7
    has7 = bool(re.search(r'7|9|11|13', q)) or fam == 'dim' and q.startswith(('o7', 'h'))
    iv = [0, third, fifth] + ([sev] if has7 else ([9] if '6' in q else []))
    if re.search(r'(?<![b#])9|13|11', q) and has7: iv.append(14)
    if 'b9' in q or 'alt' in q: iv.append(13)
    return root, fam, iv


def fetch_treebank(c):
    tunes = json.loads(get(raw(c, 'treebank.json')))
    for idx, tune in enumerate(tunes):
        rng = random.Random(idx)  # deterministic rendering per tune
        num_, den = tune['meter']['numerator'], tune['meter']['denominator']
        beat = 60000 / c['bpm'] * (4 / den)
        pos = [(m - 1) * num_ + (b - 1) for m, b in zip(tune['measures'], tune['beats'])]
        total = (max(tune['measures'])) * num_
        tonic, mode = key_of(tune['key'])
        notes, chords = [], []
        for i, sym in enumerate(tune['chords']):
            b0, b1 = pos[i], pos[i + 1] if i + 1 < len(pos) else total
            if b1 <= b0: continue
            try: root, fam, iv = jazz_chord(sym)
            except Exception: continue
            t0, t1 = b0 * beat, b1 * beat
            chords.append([round(t0, 1), round(t1, 1), root, fam, sym, tonic, mode])
            bass = 36 + (root - 36) % 12
            notes.append([round(t0, 1), round((b1 - b0) * beat * 0.95, 1), bass, 85])
            shell = sorted({55 + (root + x - 55) % 12 for x in iv[1:]})  # 3rd, 5th, 7th, tensions near G3–F#4
            for k in range(b0, b1):  # comp on the chord change and on strong beats
                if k == b0 or (k % num_) in (0, 2 if num_ == 4 else -1):
                    for n in shell: notes.append([round(k * beat, 1), round(beat * 0.9, 1), n, 70])
                if rng.random() < 0.7:  # melody: chord tones and tensions, one per beat
                    pc = (root + rng.choice(iv)) % 12
                    notes.append([round(k * beat, 1), round(beat * 0.8, 1), 72 + (pc - 72) % 12, 90])
        beats = [round(k * beat, 1) for k in range(total)]
        write('jazz', str(idx), piece('jazz', str(idx), tune['title'], c['genre'], sorted(notes), chords, beats, beats[::num_], num_, synthetic=True))
    print(f'  jazz: {len(tunes)} tunes')


KINDS = {'notes+functional-harmony': fetch_bps, 'dcml': fetch_dcml, 'pop909': fetch_pop, 'treebank': fetch_treebank}

if __name__ == '__main__':
    want = set(sys.argv[1:])
    for corpus in MANIFEST['corpora']:
        if want and corpus['name'] not in want: continue
        print(f"{corpus['name']}  ({corpus['repo']}@{corpus['commit'][:8]}, {corpus['license']})")
        KINDS[corpus['kind']](corpus)
    print('done →', ROOT)
