#!/usr/bin/env python3
"""Fetch corpora with real melodies for the harmony-rules study (scripts/rules.test.ts).

Writes ./local/assist-data/<corpus>/<id>.json in the benchmark format plus
  "melody": [[onset_ms, dur_ms, midi, fermata?]]   the tune (POP909 MELODY track; chorale soprano, fermata = phrase end)
  chords[i][7..8]: full chord kind (maj, min, 7, maj7, m7, m7b5, dim7, …) and bass pitch class, when known.
Kept apart from ./local/data so the recognition benchmark is unchanged. Pinned commits, same download cache.

    python3 scripts/fetch_assist_data.py pop909 [count]   # POP909, all 909 songs by default
    python3 scripts/fetch_assist_data.py chorales          # 371 Bach chorales: When in Rome analyses + Sapp's Humdrum scores
    python3 scripts/fetch_assist_data.py dlc               # DCML Distant Listening Corpus: ~1300 pieces, 1562–1931
    python3 scripts/fetch_assist_data.py rock              # Rolling Stone 200 (Temperley & de Clercq): rock 1950s–2000s
    python3 scripts/fetch_assist_data.py billboard         # McGill Billboard: 890 chart songs 1958–1991 (chords, phrases)
    python3 scripts/fetch_assist_data.py wjazzd            # Weimar Jazz Database: 456 transcribed solos over changes, 1925–2009
    python3 scripts/fetch_assist_data.py chordonomicon     # Chordonomicon: stratified sample by year × genre, 1950s–2020s (chords, sections)
    python3 scripts/fetch_assist_data.py lieder            # OpenScore Lieder analysed in When in Rome: 19th-century songs, voice = melody
"""
import json, os, re, sys
from urllib.parse import quote

import fetch_datasets as fd

ASSIST = os.path.normpath(os.path.join(fd.HERE, '..', 'local', 'assist-data'))
OUT = os.path.join(ASSIST, 'pop909')


def read_tracks(data: bytes):
    """SMF reader → {track name: [(ms, 'on'|'off', note, vel)]}, with tempo shared across tracks."""
    p = 0

    def u32():
        nonlocal p
        v = int.from_bytes(data[p:p + 4], 'big'); p += 4
        return v

    def vlq():
        nonlocal p
        v = 0
        while True:
            b = data[p]; p += 1; v = (v << 7) | (b & 0x7F)
            if not b & 0x80: return v

    assert data[:4] == b'MThd'
    p = 4; hl = u32(); ntr = int.from_bytes(data[p + 2:p + 4], 'big'); div = int.from_bytes(data[p + 4:p + 6], 'big'); p += hl
    tempos, tracks = [], {}
    for i in range(ntr):
        if data[p:p + 4] != b'MTrk': break
        p += 4; ln = u32(); end = p + ln; tick = 0; status = 0; name = f'track{i}'; ev = []
        while p < end:
            tick += vlq()
            s = data[p]
            if s & 0x80: p += 1
            else: s = status
            if s == 0xFF:
                t = data[p]; p += 1; n = vlq()
                if t == 0x51: tempos.append((tick, int.from_bytes(data[p:p + 3], 'big')))
                if t == 0x03: name = data[p:p + n].decode('latin-1').strip()
                p += n
            elif s in (0xF0, 0xF7): p += vlq()
            else:
                status = s; ty = s & 0xF0; a = data[p]; p += 1
                b = 0 if ty in (0xC0, 0xD0) else data[p]
                if ty not in (0xC0, 0xD0): p += 1
                if ty == 0x90 and b > 0: ev.append((tick, 'on', a, b))
                elif ty in (0x80, 0x90): ev.append((tick, 'off', a, 0))
        p = end
        tracks[name] = ev
    tempos.sort()

    def to_ms(tick):
        ms, last, us = 0.0, 0, 500000
        for t, u in tempos:
            if t >= tick: break
            ms += (t - last) * us / div / 1000; last, us = t, u
        return ms + (tick - last) * us / div / 1000

    return {name: [(to_ms(t), k, a, b) for t, k, a, b in sorted(ev)] for name, ev in tracks.items()}


def notes_of(events):
    open_, notes = {}, []
    for t, kind, n, v in events:
        if kind == 'on': open_[n] = (t, v)
        elif n in open_:
            t0, v0 = open_.pop(n); notes.append([round(t0, 1), round(t - t0, 1), n, v0])
    return sorted(notes)


def fetch_pop909(count):
    c = next(x for x in fd.MANIFEST['corpora'] if x['name'] == 'pop909')
    os.makedirs(OUT, exist_ok=True)
    for i in range(1, count + 1):
        sid = f'{i:03}'
        if os.path.exists(os.path.join(OUT, f'{sid}.json')): continue
        base = f'POP909/{sid}'
        try:
            tracks = read_tracks(fd.get(fd.raw(c, f'{base}/{sid}.mid')))
            melody = [[t, d, n] for t, d, n, _ in notes_of(tracks.get('MELODY', []))]
            notes = notes_of([e for evs in tracks.values() for e in evs])
            kt, km = fd.get(fd.raw(c, f'{base}/key_audio.txt')).decode().split('\n')[0].split()[2].split(':')
            tonic, mode = fd.harte_pc(kt), 'minor' if km.startswith('min') else 'major'
            chords = []
            for line in fd.get(fd.raw(c, f'{base}/chord_midi.txt')).decode().strip().splitlines():
                a, b, lab = line.split()
                if lab == 'N': continue
                r, q = lab.split(':')
                fam = fd.POP_FAMILY.get(q.split('/')[0])
                if fam: chords.append([round(float(a) * 1000, 1), round(float(b) * 1000, 1), fd.harte_pc(r), fam, lab, tonic, mode])
            rows = [[float(x) for x in l.split()] for l in fd.get(fd.raw(c, f'{base}/beat_midi.txt')).decode().strip().splitlines()]
            piece = fd.piece('pop909', sid, f'POP909 #{sid}', c['genre'], notes, chords,
                             [round(r[0] * 1000, 1) for r in rows], [round(r[0] * 1000, 1) for r in rows if r[2] == 1], 4)
            piece['melody'] = melody
            json.dump(piece, open(os.path.join(OUT, f'{sid}.json'), 'w'))
            print(f'  pop909 {sid}  melody {len(melody)} notes, {len(chords)} chords', flush=True)
        except Exception as e:  # keep going; a few songs have odd files
            print(f'  pop909 {sid}  skipped: {e}', flush=True)
    print('done →', OUT)


# ───────────────────────── Bach chorales: When in Rome (RomanText) + Sapp's Humdrum scores ─────────────────────────
ROME = {'repo': 'MarkGotham/When-in-Rome', 'commit': '1c61fe41b8c2910296d7d2bcbf6476c7c1f2fe35'}  # analyses, CC BY-SA 4.0
KERN = {'repo': 'craigsapp/bach-370-chorales', 'commit': '67ef0b59bf49d0b562e8dfc9b870f6f9d5287822'}  # scores
QMS = 500  # one quarter note = 500 ms in the written files (positions are what matter)
NUMERALS = ['VII', 'VI', 'V', 'IV', 'III', 'II', 'I']
DEG = {'I': 0, 'II': 1, 'III': 2, 'IV': 3, 'V': 4, 'VI': 5, 'VII': 6}
MAJ_STEPS, MIN_STEPS = [0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10]
SEVENTH_FIGS = {'7', '65', '6/5', '43', '4/3', '42', '4/2', '2'}
BASS_OF_FIG = {'6': 1, '64': 2, '6/4': 2, '65': 1, '6/5': 1, '43': 2, '4/3': 2, '42': 3, '4/2': 3, '2': 3}


def kern_pitch(tok):
    m = re.search(r'([a-gA-G]+)([#\-n]*)', tok)
    letters, acc = m.group(1), m.group(2)
    pc = fd.LETTER[letters[0].upper()] + acc.count('#') - acc.count('-')
    octave = 4 + (len(letters) - 1) if letters[0].islower() else 3 - (len(letters) - 1)
    return 12 * (octave + 1) + pc


def kern_dur(tok):
    m = re.match(r'[^0-9]*(\d+)(\.*)', tok)
    if not m: return 0.0
    base = 4 / int(m.group(1)) if int(m.group(1)) else 8.0
    d, add = base, base
    for _ in m.group(2): add /= 2; d += add
    return d


def parse_kern(text):
    """→ voices {name: [[start_q, dur_q, midi]]}, bar starts {measure: start_q}, end_q, quarters per bar."""
    names, voices, bars, t, meter = [], {}, {}, [], 4.0
    for line in text.splitlines():
        if not line or line.startswith('!'): continue
        cols = line.split('\t')
        if line.startswith('**'):
            names = [f'v{i}' for i in range(len(cols))]; t = [0.0] * len(cols); voices = {n: [] for n in names}; continue
        if any(c in ('*^', '*v') for c in cols): raise ValueError('spine split')
        if line.startswith('*'):
            for i, c in enumerate(cols):
                if c.startswith('*I"'): names[i] = c[3:].lower()
                m = re.match(r'\*M(\d+)/(\d+)', c)
                if m: meter = int(m.group(1)) * 4 / int(m.group(2))
            voices = {names[i]: voices.get(names[i], voices.get(f'v{i}', [])) for i in range(len(cols))}
            continue
        if line.startswith('='):
            m = re.match(r'=(\d+)', cols[0])
            if m: bars[int(m.group(1))] = t[0]
            continue
        for i, tok in enumerate(cols):
            if tok == '.' or i >= len(names): continue
            tok = tok.split(' ')[0]
            if 'q' in tok: continue
            d = kern_dur(tok)
            if 'r' not in tok:
                v = voices[names[i]]
                if (']' in tok or '_' in tok) and v: v[-1][1] += d
                else: v.append([t[i], d, kern_pitch(tok), 0])
                if ';' in tok and v: v[-1][3] = 1  # fermata: the phrase ends here
            t[i] += d
    return voices, bars, max(t) if t else 0.0, meter


def parse_key(tok):
    """'G:' → (7, 'major'); 'e:' → (4, 'minor'); 'Bb:' / 'B-:' → flats."""
    k = tok[:-1]
    pc = fd.LETTER[k[0].upper()] + k[1:].count('#') - k[1:].count('b') - k[1:].count('-')
    return pc % 12, 'major' if k[0].isupper() else 'minor'


def roman(tok, tonic, mode):
    """RomanText chord → (root, kind, bass pc) or None. Handles applied chords, figures, N, It/Fr/Ger, Cad64."""
    tok = tok.replace('[', '').replace(']', '')
    if tok.startswith('Cad'): return roman('V', tonic, mode)
    if tok.startswith(('N', 'bII6')) and not tok.startswith('No'): return ((tonic + 1) % 12, 'maj', (tonic + 5) % 12)
    if tok.startswith(('It', 'Fr', 'Ger')): return ((tonic + 8) % 12, '7', (tonic + 8) % 12)
    m = re.match(r'^(.*?)/([b#]*(?:VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)[o\u00f8+]?)$', tok)
    if m:
        target = roman(m.group(2), tonic, mode)
        if not target: return None
        return roman(m.group(1), target[0], 'minor' if target[1] in ('min', 'm7', 'dim', 'm7b5', 'dim7') else 'major')
    m = re.match(r'^([b#]*)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)([o\u00f8%+]?)([0-9/]*)', tok)
    if not m: return None
    acc, num, mark, fig = m.groups()
    upper = num.isupper()
    deg = DEG[num.upper()]
    steps = MAJ_STEPS if mode == 'major' else MIN_STEPS
    off = steps[deg] + acc.count('#') - acc.count('b')
    if mode == 'minor' and not acc and deg in (5, 6) and not upper: off += 1  # raised 6̂/7̂ for vi°, vii°
    root = (tonic + off) % 12
    seventh = fig in SEVENTH_FIGS
    if mark in ('\u00f8', '%'): kind = 'm7b5' if seventh else 'dim'
    elif mark == 'o': kind = 'dim7' if seventh else 'dim'
    elif mark == '+': kind = 'aug'
    elif upper:
        if seventh:
            scale = [(tonic + x) % 12 for x in (MAJ_STEPS if mode == 'major' else MIN_STEPS)]
            dom = num.upper() == 'V' or root not in scale
            kind = '7' if dom or ((root + 11) % 12) not in scale else 'maj7'
        else: kind = 'maj'
    else: kind = 'm7' if seventh else 'min'
    third = 4 if kind in ('maj', '7', 'maj7', 'aug') else 3
    fifth = 6 if kind in ('dim', 'dim7', 'm7b5') else 8 if kind == 'aug' else 7
    sev = {'7': 10, 'maj7': 11, 'm7': 10, 'm7b5': 10, 'dim7': 9}.get(kind, 10)
    bass = (root + [0, third, fifth, sev][BASS_OF_FIG.get(fig, 0)]) % 12
    return root, kind, bass


FAMILY = {'maj': 'maj', '7': 'maj', 'maj7': 'maj', 'min': 'min', 'm7': 'min', 'dim': 'dim', 'dim7': 'dim', 'm7b5': 'dim', 'aug': 'aug', 'sus4': 'sus', 'sus2': 'sus', '7sus4': 'sus'}


def fetch_chorales():
    out = os.path.join(ASSIST, 'chorales')
    os.makedirs(out, exist_ok=True)
    ok = 0
    for n in range(1, 372):
        sid = f'{n:03}'
        try:
            rn = fd.get(fd.raw(ROME, f'Corpus/Early_Choral/Bach,_Johann_Sebastian/Chorales/{sid}/analysis.txt')).decode('utf-8')
            voices, bars, end, meter = parse_kern(fd.get(fd.raw(KERN, f'kern/chor{sid}.krn')).decode('latin-1'))
            soprano = voices.get('soprano') or voices[sorted(voices)[-1]]
            title = next((l.split(':', 1)[1].strip() for l in rn.splitlines() if l.startswith('Title:')), sid)
            ts = next((l.split(':', 1)[1].strip() for l in rn.splitlines() if l.startswith('Time Signature:')), '4/4')
            num_, den = (int(x) for x in re.match(r'(\d+)/(\d+)', ts).groups())
            beat_q = 4 / den * (3 if den == 8 and num_ % 3 == 0 and num_ > 3 else 1)
            bar_q = num_ * 4 / den
            first_bar = min(bars) if bars else 1
            def pos(measure, beat):
                if measure < first_bar:  # pickup bar: count back from the first full bar
                    return bars.get(first_bar, 0.0) - (bar_q - (beat - 1) * beat_q)
                return bars.get(measure, 0.0) + (beat - 1) * beat_q
            key, events = None, []
            for line in rn.splitlines():
                m = re.match(r'^m(\d+)\s+(.*)$', line)
                if not m: continue
                measure, beat = int(m.group(1)), 1.0
                for tok in m.group(2).split():
                    if re.match(r'^b\d', tok): beat = float(tok[1:]); continue
                    if tok.endswith(':') and re.match(r'^[A-Ga-g][#b\-]*:$', tok): key = parse_key(tok); continue
                    if tok in ('||', ':||', '||:', '|', 'Note:') or not key: continue
                    ch = roman(tok, *key)
                    if ch: events.append((pos(measure, beat), ch, tok, key))
            events.sort(key=lambda e: e[0])
            chords = []
            for i, (p0, (root, kind, bass), label, (tonic, mode)) in enumerate(events):
                p1 = events[i + 1][0] if i + 1 < len(events) else end
                if p1 <= p0: continue
                chords.append([p0 * QMS, p1 * QMS, root, FAMILY[kind], label, tonic, mode, kind, bass])
            notes = sorted([s * QMS, d * QMS, m_, 80] for v in voices.values() for s, d, m_, _f in v)
            beats = [i * QMS for i in range(int(end) + 1)]
            piece = fd.piece('chorales', sid, f'Bach chorale {sid}: {title}', 'chorale (1720s–40s)', notes, chords,
                             beats, [b * QMS for b in sorted(bars.values())], int(bar_q) if bar_q.is_integer() else 4)
            piece['melody'] = [[s * QMS, d * QMS, m_, f] for s, d, m_, f in soprano]  # 4th field: fermata
            json.dump(piece, open(os.path.join(out, f'{sid}.json'), 'w'))
            ok += 1
            print(f'  chorale {sid}  {len(chords)} chords, soprano {len(soprano)} notes', flush=True)
        except Exception as e:
            print(f'  chorale {sid}  skipped: {e}', flush=True)
    print(f'done → {out} ({ok} chorales)')


# ───────────────────────── DCML Distant Listening Corpus (1562–1931, one annotation standard) ─────────────────────────
DLC = {'repo': 'DCMLab/distant_listening_corpus', 'commit': '12be0d3ff7c6e0ef67c7d4e8e44541e5f288f39d'}  # CC BY-NC-SA 4.0
DLC_KIND = {'M': 'maj', 'm': 'min', 'o': 'dim', '+': 'aug', 'Mm7': '7', 'mm7': 'm7', 'MM7': 'maj7', 'mM7': 'min',
            '%7': 'm7b5', 'o7': 'dim7', '+7': 'aug', '+M7': 'aug', 'Ger': '7', 'It': '7', 'Fr': '7'}
VOCAL = re.compile(r'voice|voix|soprano|sopran|singstimme|oboe|canto|tenor|alto', re.I)


def dlc_pins():
    """Submodule commits of the meta-repository at its pinned commit (one GitHub API call, cached)."""
    data = json.loads(fd.get(f"https://api.github.com/repos/{DLC['repo']}/contents/?ref={DLC['commit']}"))
    return {x['name']: x['sha'] for x in data if x.get('type') in ('file', 'submodule') and x.get('size', 1) == 0}


def melody_staff(meta, notes):
    """The tune: a sung part if there is one, else the staff with the highest average pitch."""
    staffs = sorted({int(r['staff']) for r in notes if r['staff']})
    for s_ in staffs:
        if VOCAL.search(meta.get(f'staff_{s_}_instrument') or ''): return s_
    mean = {s_: sum(int(r['midi']) for r in notes if r['staff'] == str(s_)) / max(1, sum(1 for r in notes if r['staff'] == str(s_))) for s_ in staffs}
    return max(staffs, key=lambda s_: mean[s_]) if staffs else 1


def fetch_dlc():
    out = os.path.join(ASSIST, 'dlc')
    os.makedirs(out, exist_ok=True)
    meta = fd.tsv(fd.get(fd.raw(DLC, 'distant_listening_corpus.metadata.tsv')))
    pins = dlc_pins()
    json.dump({'meta': DLC, 'submodules': pins}, open(os.path.join(out, '_pins.json'), 'w'), indent=1)
    from concurrent.futures import ThreadPoolExecutor
    todo = [m for m in meta if m.get('label_count') not in ('', '0') and m['corpus'] in pins]
    with ThreadPoolExecutor(8) as pool:  # downloads dominate; files are independent
        done = list(pool.map(lambda m: dlc_piece(m, out, pins), todo))
    print(f'done → {out} ({sum(done)} pieces)')


def dlc_piece(m, out, pins):
    if True:
        corpus, piece_id = m['corpus'], m['piece']
        target = os.path.join(out, corpus, f'{piece_id}.json')
        if os.path.exists(target): return 1
        src = {'repo': f'DCMLab/{corpus}', 'commit': pins[corpus]}
        try:
            notes_rows = fd.tsv(fd.get(fd.raw(src, f'notes/{quote(piece_id)}.notes.tsv')))
            harm = fd.tsv(fd.get(fd.raw(src, f'harmonies/{quote(piece_id)}.harmonies.tsv')))
            meas = fd.tsv(fd.get(fd.raw(src, f'measures/{quote(piece_id)}.measures.tsv')))
            notes_rows = [r for r in notes_rows if fd.num(r['quarterbeats']) is not None and r['midi']]
            staff = melody_staff(m, notes_rows)
            notes, by_onset = [], {}
            for r in notes_rows:
                if r.get('tied') in ('-1', '0'): continue  # continuation of a tied note
                qb, d = fd.num(r['quarterbeats']), fd.num(r['duration_qb']) or 0
                notes.append([round(qb * QMS, 1), round(d * QMS, 1), int(r['midi']), 80])
                if r['staff'] == str(staff):
                    top = by_onset.get(qb)
                    if not top or int(r['midi']) > top[2]: by_onset[qb] = [qb * QMS, d * QMS, int(r['midi']), 0]
            rows = [r for r in harm if r.get('chord_type') in DLC_KIND and fd.num(r['quarterbeats']) is not None]
            chords, cadences, ends = [], [], []
            for r in harm:
                qb = fd.num(r['quarterbeats'])
                if qb is None: continue
                if r.get('cadence'): cadences.append([round(qb * QMS, 1), r['cadence']])
                if '}' in (r.get('phraseend') or ''): ends.append(round(qb * QMS, 1))
            for i, r in enumerate(rows):
                t0 = fd.num(r['quarterbeats'])
                t1 = fd.num(rows[i + 1]['quarterbeats']) if i + 1 < len(rows) else t0 + (fd.num(r['duration_qb']) or 4)
                if t1 <= t0: continue
                if r.get('root') in (None, ''): continue
                try: tonic, mode = fd.dcml_local_key(r['globalkey'], r['localkey'])
                except Exception: continue
                root = (tonic + 7 * int(float(r['root']))) % 12
                bass = (tonic + 7 * int(float(r['bass_note']))) % 12 if r.get('bass_note') not in (None, '') else root
                kind = DLC_KIND[r['chord_type']]
                chords.append([round(t0 * QMS, 1), round(t1 * QMS, 1), root, fd.DCML_FAMILY.get(r['chord_type'], 'maj'),
                               f"{r['localkey']}:{r['chord']}", tonic, mode, kind, bass])
            if len(chords) < 4: return 0
            beats, bars = [], []
            for r in meas:
                qb = fd.num(r['quarterbeats'])
                if qb is None: continue
                bars.append(round(qb * QMS, 1))
                n_, d_ = (r['timesig'] or '4/4').split('/')
                for k in range(int(n_)): beats.append(round((qb + k * 4 / int(d_)) * QMS, 1))
            ys = [int(y) for y in (m.get('composed_start'), m.get('composed_end')) if (y or '').isdigit()]
            sig = (meas[0]['timesig'] if meas else '4/4').split('/')
            pc = fd.piece('dlc', piece_id, f"{m.get('composer', '').strip()}: {m.get('workTitle') or piece_id} {m.get('movementTitle') or ''}".strip(),
                          corpus, sorted(notes), chords, sorted(set(beats)), bars, int(sig[0]))
            pc.update({'melody': sorted(by_onset.values()), 'year': round(sum(ys) / len(ys)) if ys else None,
                       'composer': m.get('composer', '').strip(), 'collection': corpus, 'melody_staff': staff,
                       'cadences': cadences, 'phrase_ends': ends})
            os.makedirs(os.path.dirname(target), exist_ok=True)
            json.dump(pc, open(target, 'w'))
            print(f'  {corpus}/{piece_id}  {len(chords)} chords, melody staff {staff}, year {pc["year"]}', flush=True)
            return 1
        except Exception as e:
            print(f'  {corpus}/{piece_id}  skipped: {e}', flush=True)
            return 0


# ───────────────────────── Rolling Stone 200 rock corpus (de Clercq & Temperley), CC BY 4.0 ─────────────────────────
ROCK = 'http://rockcorpus.midside.com'
ROCK_FILES = {  # sha256 of the downloads, checked so the corpus is exactly reproducible
    'harmonic_analyses/rs200_harmony_clt.zip': '796582dcb5e2a945cb1dcf5307dc193ccb5a2e574866a4c7d6958888fa2dd30a',
    'melodic_transcriptions/rs200_melody_nlt.zip': '92d2c3cf901533e146c69466e16826e0f49e353f25c1236b40dac4149cddd415',
}


def rock_kind(numeral):
    """RS200 numeral → (kind, is_minor). Case = quality; o dim, h half-dim, a/+ aug, s4/s2 sus, d7 dominant 7th, M7 major 7th."""
    m = re.match(r'^[b#]*(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)([^/]*)', numeral)
    if not m: return None
    upper, suf = m.group(1).isupper(), m.group(2)
    if 'h' in suf: return 'm7b5'
    if suf.startswith('o') or suf.startswith('x'): return 'dim7' if '7' in suf else 'dim'
    if suf.startswith('a') or suf.startswith('+5'): return 'aug'
    if 's4' in suf: return '7sus4' if '7' in suf else 'sus4'
    if 's2' in suf: return 'sus2'
    if 'M7' in suf: return 'maj7'
    seventh = bool(re.search(r'd7|7|9|11|13|65|43|42', suf))
    if upper: return '7' if seventh else 'maj'
    return 'm7' if seventh else 'min'


def fetch_rock():
    import hashlib, io as io_, zipfile
    out = os.path.join(ASSIST, 'rock')
    os.makedirs(out, exist_ok=True)
    files = {}
    for path, sha in ROCK_FILES.items():
        data = fd.get(f'{ROCK}/{path}')
        assert hashlib.sha256(data).hexdigest() == sha, f'{path} changed upstream'
        z = zipfile.ZipFile(io_.BytesIO(data))
        for n in z.namelist():
            if not n.startswith('__MACOSX') and (n.endswith('.clt') or n.endswith('.nlt')): files[os.path.basename(n)] = z.read(n).decode('latin-1')
    overview = fd.get(f'{ROCK}/overview/rs200.txt').decode('latin-1')
    ok = 0
    for line in overview.strip().splitlines():
        cols = line.split('\t')
        if len(cols) < 5 or not cols[4].strip().isdigit(): continue
        sid, title, artist, year = cols[0], cols[2], cols[3], int(cols[4])
        clt = files.get(f'{sid}_tdc.clt') or files.get(f'{sid}_dt.clt')
        nlt = files.get(f'{sid}_tdc.nlt') or files.get(f'{sid}_dt.nlt')
        if not clt: continue
        rows = [l.split('\t') for l in clt.strip().splitlines()]
        events = []
        for r in rows:
            if len(r) < 7 or r[2] == 'End': events.append((float(r[1]), None)); continue
            kind = rock_kind(r[2])
            if not kind: continue
            tonic = int(r[5]) % 12
            events.append((float(r[1]), (int(r[6]) % 12, kind, tonic, r[2])))
        lower = sum(1 for _, e in events if e and re.match(r'^i(?![iv])', e[3]))
        upper = sum(1 for _, e in events if e and re.match(r'^I(?![IV])', e[3]))
        mode = 'minor' if lower > upper else 'major'
        chords = []
        for i, (bar, e) in enumerate(events):
            if not e: continue
            nxt = next((b for b, _ in events[i + 1:]), bar + 1)
            root, kind, tonic, label = e
            if nxt <= bar: continue
            chords.append([round(bar * 4 * QMS, 1), round(nxt * 4 * QMS, 1), root, FAMILY.get(kind, 'maj') if kind in FAMILY else 'sus', label, tonic, mode, kind, root])
        melody = []
        if nlt:
            ns = [l.split() for l in nlt.strip().splitlines() if len(l.split()) >= 3 and re.match(r'^-?[0-9.]+$', l.split()[1]) and l.split()[2].isdigit()]
            for i, r in enumerate(ns):
                b, pitch = float(r[1]) * 4, int(r[2])
                nb = float(ns[i + 1][1]) * 4 if i + 1 < len(ns) else b + 1
                melody.append([round(b * QMS, 1), round(min(max(0.25, nb - b), 2.0) * QMS, 1), pitch, 0])
        if len(chords) < 4: continue
        end = max(c[1] for c in chords)
        beats = [i * QMS for i in range(int(end / QMS) + 1)]
        pc = fd.piece('rock', sid, f'{artist}: {title}', 'rock', [[m_[0], m_[1], m_[2], 80] for m_ in melody], chords,
                      beats, beats[::4], 4)
        pc.update({'melody': melody, 'year': year, 'composer': artist, 'collection': 'rs200'})
        json.dump(pc, open(os.path.join(out, f'{sid}.json'), 'w'))
        ok += 1
    print(f'done → {out} ({ok} songs)')


# ───────────────────────── McGill Billboard (Burgoyne, Wild & Fujinaga 2011), CC0 ─────────────────────────
BILLBOARD = {  # the Dropbox files the mirdata loader uses; sha256-checked
    'index': ('https://www.dropbox.com/s/o0olz0uwl9z9stb/billboard-2.0-index.csv?dl=1', 'fc39435098814f1a4f1dd5c95c72aff399b648b78f33a59682924dfb9b5280fb'),
    'chords': ('https://www.dropbox.com/s/2lvny9ves8kns4o/billboard-2.0-salami_chords.tar.xz?dl=1', 'a22e32bf24c8a18859ce18427c6501a7a72520185cddd6d882ceb3c61d02ec75'),
}
HARTE_KIND = {'maj': 'maj', 'maj6': 'maj', '5': 'maj', '1': 'maj', 'min': 'min', 'min6': 'min', '7': '7', '9': '7', '11': '7', '13': '7',
              'maj7': 'maj7', 'maj9': 'maj7', 'maj13': 'maj7', 'min7': 'm7', 'min9': 'm7', 'min11': 'm7', 'min13': 'm7', 'hdim7': 'm7b5',
              'dim': 'dim', 'dim7': 'dim7', 'aug': 'aug', 'sus4': 'sus4', 'sus2': 'sus2', 'sus4(b7)': '7sus4', 'sus4(b7,9)': '7sus4'}


def fetch_billboard():
    import csv as csv_, hashlib, io as io_, tarfile
    out = os.path.join(ASSIST, 'billboard')
    os.makedirs(out, exist_ok=True)
    blobs = {}
    for k, (url, sha) in BILLBOARD.items():
        blobs[k] = fd.get(url)
        assert hashlib.sha256(blobs[k]).hexdigest() == sha, f'billboard {k} changed upstream'
    index = {r['id'].zfill(4): r for r in csv_.DictReader(io_.StringIO(blobs['index'].decode('utf-8')))}
    tar = tarfile.open(fileobj=io_.BytesIO(blobs['chords']))
    ok = 0
    for member in tar.getmembers():
        if not member.name.endswith('salami_chords.txt'): continue
        sid = member.name.split('/')[-2]
        meta = index.get(sid, {})
        text = tar.extractfile(member).read().decode('utf-8')
        tonic, meter, lines = 0, 4, []
        events, phrase_ends = [], []  # (time_s, root, kind, tonic)
        for line in text.splitlines():
            if line.startswith('# tonic:'):
                try: tonic = fd.harte_pc(line.split(':', 1)[1].strip())
                except Exception: pass
            elif line.startswith('# metre:'):
                n_, d_ = line.split(':', 1)[1].strip().split('/')
                meter = max(1, round(int(n_) * 4 / int(d_)))
            elif line and line[0].isdigit():
                t, rest = line.split('\t', 1)
                lines.append((float(t), rest, tonic))
        for li, (t, rest, key_pc) in enumerate(lines):
            t_next = lines[li + 1][0] if li + 1 < len(lines) else t + 2
            bars = re.findall(r'\|([^|]*)(?=\|)', rest)
            if not bars: continue
            bar_len = (t_next - t) / len(bars)
            last = None
            for bi, bar in enumerate(bars):
                toks = bar.split() or ['.']
                for ti, tok in enumerate(toks):
                    at = t + bar_len * (bi + ti / len(toks))
                    if tok == '.': continue
                    if tok in ('N', 'X', '&pause'): events.append((at, None, None, key_pc)); continue
                    root_s, _, qual = tok.partition(':')
                    try: root = fd.harte_pc(root_s)
                    except Exception: continue
                    kind = HARTE_KIND.get(qual.split('/')[0])
                    if not kind: continue
                    events.append((at, root, kind, key_pc))
                    last = at
            if last is not None: phrase_ends.append(round(last * 1000, 1))
            events.append((t_next, None, None, key_pc))
        tonic_minor = sum(1 for _, r, k, kp in events if r == kp and k in ('min', 'm7'))
        tonic_major = sum(1 for _, r, k, kp in events if r == kp and k in ('maj', '7', 'maj7'))
        mode = 'minor' if tonic_minor > tonic_major else 'major'
        chords = []
        for i, (at, root, kind, kp) in enumerate(events):
            if root is None: continue
            nxt = events[i + 1][0] if i + 1 < len(events) else at + 2
            if nxt <= at: continue
            chords.append([round(at * 1000, 1), round(nxt * 1000, 1), root, FAMILY.get(kind, 'sus'), f'{kind}', kp, mode, kind, root])
        if len(chords) < 4: continue
        # beat grid: each line's bars divided evenly
        beats = []
        for li, (t, rest, _k) in enumerate(lines):
            t_next = lines[li + 1][0] if li + 1 < len(lines) else t + 2
            n_bars = len(re.findall(r'\|([^|]*)(?=\|)', rest))
            for b in range(n_bars * meter): beats.append(round((t + (t_next - t) * b / max(1, n_bars * meter)) * 1000, 1))
        beats = sorted(set(beats))
        if len(beats) < 8: continue
        year = int(meta['chart_date'][:4]) if meta.get('chart_date') else None
        title = f"{meta.get('artist') or ''}: {meta.get('title') or sid}"
        pc = fd.piece('billboard', sid, title, 'chart pop', [], chords, beats, beats[::meter], meter)
        pc.update({'melody': [], 'year': year, 'composer': meta.get('artist', ''), 'collection': 'billboard', 'phrase_ends': phrase_ends})
        json.dump(pc, open(os.path.join(out, f'{sid}.json'), 'w'))
        ok += 1
    print(f'done → {out} ({ok} songs)')


# ───────────────────────── Weimar Jazz Database (Jazzomat project), ODbL ─────────────────────────
WJAZZD = ('https://jazzomat.hfm-weimar.de/download/downloads/wjazzd.db', 'af6a0d9debf042c3581565bd75baad591d32e166cd2ec7298519883de614bf12')


def jazz_kind(sym):
    """Jazzomat chord symbol → (root, kind) or None. '-' minor, j7 major 7th, m7b5 half-dim, o dim, + aug."""
    m = re.match(r'^([A-G][b#]?)(.*?)(/.*)?$', sym)
    if not m or sym in ('NC', ''): return None
    root, q = fd.harte_pc(m.group(1).replace('#', '#')), m.group(2)
    if q.startswith('m7b5'): kind = 'm7b5'
    elif q.startswith('o'): kind = 'dim7' if '7' in q else 'dim'
    elif q.startswith('+'): kind = 'aug'
    elif q.startswith('-'): kind = 'min' if q in ('-', '-6', '-69') else 'm7'
    elif q.startswith('j7') or q.startswith('6') or q in ('', '69'): kind = 'maj7' if q.startswith('j') else 'maj'
    elif 'sus' in q: kind = '7sus4' if '7' in q else 'sus4'
    else: kind = '7'
    return root, kind


def fetch_wjazzd():
    import hashlib, sqlite3, tempfile
    out = os.path.join(ASSIST, 'wjazzd')
    os.makedirs(out, exist_ok=True)
    url, sha = WJAZZD
    data = fd.get(url)
    assert hashlib.sha256(data).hexdigest() == sha, 'wjazzd.db changed upstream'
    tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    tmp.write(data); tmp.close()
    db = sqlite3.connect(tmp.name)
    solos = db.execute("""select s.melid, s.performer, s.title, s.instrument, s.style, s.key, s.signature, t.recordingdate, r.releasedate
                          from solo_info s left join track_info t on s.trackid = t.trackid left join record_info r on t.recordid = r.recordid""").fetchall()
    ok = 0
    for melid, performer, title, instrument, style, key, signature, recdate, reldate in solos:
        m = re.search(r'(19|20)\d\d', recdate or '') or re.search(r'(19|20)\d\d', reldate or '')
        year = int(m.group(0)) if m else None
        km = re.match(r'^([A-G][b#]?)-(maj|min)', key or '')
        tonic, mode = (fd.harte_pc(km.group(1)), 'major' if km.group(2) == 'maj' else 'minor') if km else (None, 'major')
        beats = db.execute('select onset, chord from beats where melid = ? order by onset', (melid,)).fetchall()
        if len(beats) < 8: continue
        if tonic is None:  # no key given: the most common chord root
            roots = [jazz_kind(c)[0] for _, c in beats if c and jazz_kind(c)]
            if not roots: continue
            tonic = max(set(roots), key=roots.count)
        chords, cur = [], None
        for i, (onset, sym) in enumerate(beats):
            if sym:
                cur = jazz_kind(sym)
                if cur: chords.append([round(onset * 1000, 1), None, cur[0], FAMILY.get(cur[1], 'maj'), sym, tonic, mode, cur[1], cur[0]])
                else: chords.append(None)
        chords = [c for c in chords if c]
        for i, c in enumerate(chords): c[1] = chords[i + 1][0] if i + 1 < len(chords) else round(beats[-1][0] * 1000 + 500, 1)
        chords = [c for c in chords if c[1] > c[0]]
        notes = db.execute('select onset, duration, pitch from melody where melid = ? order by onset', (melid,)).fetchall()
        melody = [[round(o * 1000, 1), round(d * 1000, 1), int(p), 0] for o, d, p in notes]
        phrases = db.execute("select end from sections where melid = ? and type = 'PHRASE' order by start", (melid,)).fetchall()
        phrase_ends = [melody[e][0] for (e,) in phrases if 0 <= e < len(melody)]
        if len(chords) < 4: continue
        meter = int((signature or '4/4').split('/')[0]) if (signature or '4/4').split('/')[0].isdigit() else 4
        pc = fd.piece('wjazzd', str(melid), f'{performer}: {title}', f'jazz ({style.lower() if style else "?"})', [[n[0], n[1], n[2], 80] for n in melody],
                      chords, [round(o * 1000, 1) for o, _ in beats], [], meter)
        pc.update({'melody': melody, 'year': year, 'composer': performer, 'collection': 'wjazzd', 'style': style, 'instrument': instrument,
                   'phrase_ends': phrase_ends})
        json.dump(pc, open(os.path.join(out, f'{melid}.json'), 'w'))
        ok += 1
    os.unlink(tmp.name)
    print(f'done → {out} ({ok} solos)')


# ───────────────────────── Chordonomicon (Kantarelis et al. 2024), CC BY-NC 4.0 ─────────────────────────
CHORDONOMICON = ('https://huggingface.co/datasets/ailsntua/Chordonomicon/resolve/f3a8b678bd65639c01caa342921733f1db01be23/chordonomicon_v2.csv',
                 '9d2f4ccdc876a4e816712f128e4772b2af558c2a2923cce5be3a0364fbad9a8d')
PER_YEAR_GENRE = 12  # songs per (release year, main genre): enough for yearly trends, no decade swamps the rest
CN_KIND = {'': 'maj', 'min': 'min', '7': '7', 'min7': 'm7', 'maj7': 'maj7', 'no3d': 'maj', 'sus4': 'sus4', 'sus2': 'sus2', 'add9': 'maj',
           'add11': 'maj', 'add13': 'maj', 'dim': 'dim', 'dim7': 'dim7', 'aug': 'aug', '7sus4': '7sus4', '7sus2': '7sus4', '9': '7', '11': '7',
           '13': '7', '7b9': '7', 'min9': 'm7', 'min11': 'm7', 'min13': 'm7', 'minadd9': 'min', 'minadd11': 'min', 'minadd13': 'min',
           'minmaj7': 'min', 'maj9': 'maj7', 'maj13': 'maj7', 'maj911s': 'maj7', 'majs9': 'maj7', 'maj7sus2': 'maj7', 'maj7sus4': 'maj7',
           'maj11': 'maj7', 'augmaj7': 'aug', 'min7b5': 'm7b5', 'hdim7': 'm7b5', '6': 'maj', 'min6': 'min'}
KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
CN_INTERVALS = {'maj': (0, 4, 7), 'min': (0, 3, 7), '7': (0, 4, 7, 10), 'm7': (0, 3, 7, 10), 'maj7': (0, 4, 7, 11), 'sus4': (0, 5, 7),
                'sus2': (0, 2, 7), 'dim': (0, 3, 6), 'dim7': (0, 3, 6, 9), 'aug': (0, 4, 8), '7sus4': (0, 5, 7, 10), 'm7b5': (0, 3, 6, 10)}


def cn_chord(tok):
    """'Csmin7/Gs' → (1, 'm7'); sharps are written 's', so 'Csus4' is C + sus4, not C♯."""
    m = re.match(r'^([A-G])(s(?!us)|b)?([^/]*)', tok)
    if not m: return None
    root = (fd.LETTER[m.group(1)] + (1 if m.group(2) == 's' else -1 if m.group(2) == 'b' else 0)) % 12
    kind = CN_KIND.get(m.group(3))
    return (root, kind) if kind else None


def estimate_key(chords):
    """Krumhansl–Kessler profile over chord tones (root counted twice), plus a bonus for the first and last chord's root."""
    hist = [0.0] * 12
    for r, k in chords:
        for iv in CN_INTERVALS[k]: hist[(r + iv) % 12] += 2 if iv == 0 else 1
    best = None
    for t in range(12):
        for mode, prof in (('major', KK_MAJOR), ('minor', KK_MINOR)):
            score = sum(hist[(t + i) % 12] * prof[i] for i in range(12))
            for r, k in (chords[0], chords[-1]):
                if r == t and (k in ('min', 'm7')) == (mode == 'minor'): score += 0.15 * sum(hist)
            if not best or score > best[0]: best = (score, t, mode)
    return best[1], best[2]


def fetch_chordonomicon():
    import csv as csv_, hashlib, io as io_
    out = os.path.join(ASSIST, 'chordonomicon')
    os.makedirs(out, exist_ok=True)
    url, sha = CHORDONOMICON
    data = fd.get(url)
    assert hashlib.sha256(data).hexdigest() == sha, 'chordonomicon changed upstream'
    csv_.field_size_limit(10 ** 8)
    picked = {}
    for r in csv_.DictReader(io_.StringIO(data.decode('utf-8'))):
        y = r['release_date'][:4]
        if not y.isdigit() or not (1950 <= int(y) <= 2025): continue
        rank = hashlib.sha256(r['id'].encode()).hexdigest()  # fixed pseudo-random order
        bucket = picked.setdefault((int(y), r['main_genre'] or 'unlabelled'), [])
        bucket.append((rank, r))
        if len(bucket) > PER_YEAR_GENRE * 4:  # keep memory small: retain the lowest hashes
            bucket.sort(key=lambda x: x[0]); del bucket[PER_YEAR_GENRE:]
    ok = 0
    for (year, genre), rows in sorted(picked.items()):
        for rank, r in sorted(rows, key=lambda x: x[0])[:PER_YEAR_GENRE]:
            seq, ends = [], []
            for tok in r['chords'].split():
                if tok.startswith('<'):
                    if seq: ends.append(len(seq) - 1)
                    continue
                c = cn_chord(tok)
                if c: seq.append(c)
            if len(seq) < 8: continue
            tonic, mode = estimate_key(seq)
            BEAT = 4 * QMS  # no durations in the source: one chord = one 4-beat slot
            chords = [[i * BEAT, (i + 1) * BEAT, root, FAMILY.get(kind, 'sus'), kind, tonic, mode, kind, root] for i, (root, kind) in enumerate(seq)]
            beats = [i * QMS for i in range(len(seq) * 4 + 1)]
            sid = r['id']
            pc = fd.piece('chordonomicon', sid, f'Chordonomicon #{sid} ({genre}, {year})', genre, [], chords, beats, beats[::4], 4)
            pc.update({'melody': [], 'year': year, 'composer': r.get('artist_id', ''), 'collection': f'chordonomicon: {genre}',
                       'phrase_ends': sorted({i * BEAT for i in ends + [len(seq) - 1]}), 'durations': False})
            json.dump(pc, open(os.path.join(out, f'{sid}.json'), 'w'))
            ok += 1
    print(f'done → {out} ({ok} songs)')


# ───────────────────────── OpenScore Lieder (scores CC0) + When in Rome analyses (CC BY-SA 4.0) ─────────────────────────
LIEDER_META = {'repo': 'OpenScore/Lieder', 'commit': '38c5db510224d9facdc4b08d741fc788cfb58ea8'}
STEP = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def parse_musicxml(data):
    """Compressed MusicXML → parts {name: [[start_q, dur_q, midi]]}, measure starts (quarters) of the first part, bar length."""
    import io as io_, zipfile, xml.etree.ElementTree as ET_
    z = zipfile.ZipFile(io_.BytesIO(data))
    name = next(n for n in z.namelist() if n.endswith('.xml') and not n.startswith('META-INF'))
    root = ET_.fromstring(z.read(name))
    names = {sp.get('id'): (sp.findtext('part-name') or '') for sp in root.iter('score-part')}
    parts, starts, bar_q = {}, None, 4.0
    for part in root.findall('part'):
        notes, div, t, measure_starts = [], 1, 0.0, []
        for m in part.findall('measure'):
            measure_starts.append(t)
            pos, longest = 0.0, 0.0
            for el in m:
                if el.tag == 'attributes':
                    if el.findtext('divisions'): div = int(el.findtext('divisions'))
                    tm = el.find('time')
                    if tm is not None and tm.findtext('beats', '').isdigit():
                        bar_q = int(tm.findtext('beats')) * 4 / int(tm.findtext('beat-type'))
                elif el.tag == 'backup': pos -= int(el.findtext('duration') or 0) / div
                elif el.tag == 'forward': pos += int(el.findtext('duration') or 0) / div
                elif el.tag == 'note':
                    if el.find('grace') is not None: continue
                    d = int(el.findtext('duration') or 0) / div
                    chord = el.find('chord') is not None
                    onset = pos - d if chord else pos
                    if not chord: pos += d
                    longest = max(longest, pos)
                    pitch = el.find('pitch')
                    if pitch is None: continue
                    midi = 12 * (int(pitch.findtext('octave')) + 1) + STEP[pitch.findtext('step')] + int(float(pitch.findtext('alter') or 0))
                    if any(tie.get('type') == 'stop' for tie in el.findall('tie')):
                        prev = next((n for n in reversed(notes) if n[2] == midi and abs(n[0] + n[1] - (t + onset)) < 1e-3), None)
                        if prev: prev[1] += d; continue
                    notes.append([t + onset, d, midi])
            t += max(longest, pos)
        parts[names.get(part.get('id'), part.get('id'))] = notes
        if starts is None: starts = measure_starts + [t]
    return parts, starts or [0.0], bar_q


def fetch_lieder():
    out = os.path.join(ASSIST, 'lieder')
    os.makedirs(out, exist_ok=True)
    rows = fd.tsv(fd.get(fd.raw(ROME, 'Corpus/OpenScore-LiederCorpus_contents.tsv')))
    composers, cur = {}, {}
    for line in fd.get(fd.raw(LIEDER_META, 'data/composers.yaml')).decode('utf-8').splitlines():
        if re.match(r'^\S', line): cur = {}
        m = re.match(r'^  (path|born|died): (.+)$', line)
        if m:
            cur[m.group(1)] = m.group(2).strip()
            if 'path' in cur: composers[cur['path']] = cur
    ok = 0
    for r in rows:
        if r.get('SCORE') != 'YES': continue
        folder = '/'.join(x.replace(' ', '_') for x in (r['COMPOSER'], r['COLLECTION'], r['MOVEMENT']))
        sid = re.sub(r'[^A-Za-z0-9]+', '_', folder).strip('_')[:120]
        try:
            base = f'Corpus/OpenScore-LiederCorpus/{quote(folder)}'
            rn = fd.get(fd.raw(ROME, f'{base}/analysis.txt')).decode('utf-8')
            parts, starts, bar_q = parse_musicxml(fd.get(fd.raw(ROME, f'{base}/score.mxl')))
            voice = next((n for n in parts if VOCAL.search(n) or re.search(r'stimme|gesang|song', n, re.I)), next(iter(parts)))
            melody_notes = sorted(parts[voice])
            ts = next((l.split(':', 1)[1].strip() for l in rn.splitlines() if l.lower().startswith('time signature:')), '4/4')
            num_, den = (int(x) for x in re.match(r'(\d+)/(\d+)', ts).groups())
            beat_q = 4 / den * (3 if den == 8 and num_ % 3 == 0 and num_ > 3 else 1)
            has_m0 = re.search(r'^m0\b', rn, re.M) is not None
            first_short = len(starts) > 1 and (starts[1] - starts[0]) < bar_q - 1e-6
            offset = 0 if (has_m0 and first_short) else 1  # rntxt measure number → index into starts
            def pos(measure, beat):
                idx = measure - offset
                if idx < 0 or idx >= len(starts) - 1: return None
                if measure == 0 and offset == 0:  # pickup: count back from the first full bar
                    return starts[1] - (bar_q - (beat - 1) * beat_q)
                return starts[idx] + (beat - 1) * beat_q
            key, events = None, []
            for line in rn.splitlines():
                m = re.match(r'^m(\d+)\s+(.*)$', line)
                if not m: continue
                measure, beat = int(m.group(1)), 1.0
                for tok in m.group(2).split():
                    if re.match(r'^b\d', tok): beat = float(tok[1:]); continue
                    if tok.endswith(':') and re.match(r'^[A-Ga-g][#b\-]*:$', tok): key = parse_key(tok); continue
                    if tok in ('||', ':||', '||:', '|') or not key: continue
                    ch = roman(tok, *key)
                    p0 = pos(measure, beat)
                    if ch and p0 is not None: events.append((p0, ch, tok, key))
            events.sort(key=lambda e: e[0])
            end = starts[-1]
            chords = []
            for i, (p0, (root, kind, bass), label, (tonic, mode)) in enumerate(events):
                p1 = events[i + 1][0] if i + 1 < len(events) else end
                if p1 <= p0: continue
                chords.append([p0 * QMS, p1 * QMS, root, FAMILY[kind], label, tonic, mode, kind, bass])
            if len(chords) < 4: continue
            c = composers.get(r['COMPOSER'].replace(' ', '_'), {})
            born = int(c['born']) if str(c.get('born', '')).isdigit() else None
            died = int(c['died']) if str(c.get('died', '')).isdigit() else None
            year = min(born + 35, died) if born and died else (born + 35 if born else None)
            notes = sorted([s_ * QMS, d * QMS, m_, 80] for ns in parts.values() for s_, d, m_ in ns)
            beats = [i * QMS for i in range(int(end) + 1)]
            pc = fd.piece('lieder', sid, f"{r['COMPOSER']}: {r['COLLECTION']} – {r['MOVEMENT']}", 'art song (Lied)', notes, chords, beats,
                          [s_ * QMS for s_ in starts[:-1]], int(bar_q) if float(bar_q).is_integer() else 4)
            pc.update({'melody': [[s_ * QMS, d * QMS, m_, 0] for s_, d, m_ in melody_notes], 'year': year, 'year_approx': True,
                       'composer': r['COMPOSER'], 'collection': 'lieder', 'melody_part': voice})
            json.dump(pc, open(os.path.join(out, f'{sid}.json'), 'w'))
            ok += 1
            print(f'  lied {sid[:60]}  {len(chords)} chords, voice “{voice}”, year ≈{year}', flush=True)
        except Exception as e:
            print(f'  lied {folder[:60]}  skipped: {e}', flush=True)
    print(f'done → {out} ({ok} songs)')


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'pop909'
    if what == 'chorales': fetch_chorales()
    elif what == 'dlc': fetch_dlc()
    elif what == 'rock': fetch_rock()
    elif what == 'billboard': fetch_billboard()
    elif what == 'wjazzd': fetch_wjazzd()
    elif what == 'chordonomicon': fetch_chordonomicon()
    elif what == 'lieder': fetch_lieder()
    else: fetch_pop909(int(sys.argv[2]) if len(sys.argv) > 2 else 909)
