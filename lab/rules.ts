/** Rules of harmony — local lab page. Reads local/assist/study.json (npm run study:rules) via the dev server. */

interface RuleMeta {
  id: string;
  family: string;
  statement: string;
  source: string;
  formula: string;
  kind?: 'preference' | 'constraint';
}
interface PieceRuleMeta {
  id: string;
  statement: string;
  source: string;
  formula: string;
}
interface Book {
  id: string;
  name: string;
  era: string;
  idea: string;
  rules: string[];
  pieceRules: string[];
}
interface ExampleChord {
  name: string;
  roman: string;
  root: number;
  pcs: number[];
  start: number;
  end: number;
  rules: Record<string, number | null>;
}
interface Example {
  id: string;
  title: string;
  year: number | null;
  meter: number;
  melody: [number, number, number, number][];
  chords: ExampleChord[];
  phrases: { start: number; end: number; cadence: string; by: string }[];
  features: { kind: string; label: string; from: number; to: number }[];
}
type Tradition = 'art' | 'jazz' | 'popular' | 'reference';
interface Group {
  id: string;
  source: string;
  tradition: Tradition;
  title: string;
  year: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  pieces: number;
  chords: number;
  rules: Record<string, { applies: number; auc: number | null }>;
  rulebooks: Record<string, { auc: number | null }>;
  pieceRules: Record<string, number | null>;
  cadences: Record<string, number>;
  compliance: Record<string, { real: number; realRate: number | null; altRate: number | null }>;
  examples: Example[];
}
interface Piece {
  id: string;
  group: string;
  source: string;
  tradition: Tradition;
  year: number | null;
  title: string;
  composer: string;
  chords: number;
  books: Record<string, number | null>;
  pieceRules: Record<string, number | null>;
  pc?: (number | null)[];
}
interface Study {
  generated: string;
  rules: RuleMeta[];
  pieceRules: PieceRuleMeta[];
  rulebooks: Book[];
  groups: Group[];
  pieces: Piece[];
  validation: { expert: number; matched: number; confusion: Record<string, number> };
  pca?: { features: string[]; components: { share: number; loadings: Record<string, number | null> }[] };
}

const SVG = 'http://www.w3.org/2000/svg';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const $svg = (id: string) => document.getElementById(id) as unknown as SVGSVGElement;
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, String(v));
  }
  parent?.appendChild(e);
  return e;
}
function html<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
  parent?: Element,
) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(100 * x)}%`);
const bookColour = (id: string) => `var(--rb-${id})`;
const verdictColour = (v: number | null) =>
  v === null
    ? 'transparent'
    : v >= 0
      ? `color-mix(in srgb, var(--good) ${Math.round(100 * v)}%, var(--neutral))`
      : `color-mix(in srgb, var(--bad) ${Math.round(-100 * v)}%, var(--neutral))`;
const aucColour = (a: number | null) =>
  a === null
    ? 'transparent'
    : a >= 0.5
      ? `color-mix(in srgb, var(--good) ${Math.round(Math.min(1, (a - 0.5) * 2.2) * 60)}%, transparent)`
      : `color-mix(in srgb, var(--bad) ${Math.round(Math.min(1, (0.5 - a) * 2.2) * 60)}%, transparent)`;
const ROLE_COLOUR = {
  rest: 'var(--role-rest)',
  colour: 'var(--role-colour)',
  lean: 'var(--role-lean)',
  pull: 'var(--role-pull)',
};
function role(pitch: number, pcs: number[]): keyof typeof ROLE_COLOUR {
  const has = (x: number) => pcs.includes(((x % 12) + 12) % 12);
  return has(pitch) ? 'rest' : has(pitch - 1) ? 'pull' : has(pitch + 1) ? 'lean' : 'colour';
}
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};

/** Periods used to pool groups (art music by composition year; the rest by source). */
const PERIODS: { id: string; label: string; test: (g: Group) => boolean }[] = [
  {
    id: 'early',
    label: 'Renaissance & early Baroque (–1680)',
    test: (g) => g.tradition === 'art' && (g.year ?? 0) < 1680,
  },
  {
    id: 'baroque',
    label: 'Baroque (1680–1750)',
    test: (g) => g.tradition === 'art' && (g.year ?? 0) >= 1680 && (g.year ?? 0) < 1750,
  },
  {
    id: 'classical',
    label: 'Classical (1750–1815)',
    test: (g) => g.tradition === 'art' && (g.year ?? 0) >= 1750 && (g.year ?? 0) < 1815,
  },
  {
    id: 'romantic',
    label: 'Romantic (1815–1890)',
    test: (g) => g.tradition === 'art' && (g.year ?? 0) >= 1815 && (g.year ?? 0) < 1890,
  },
  {
    id: 'modern',
    label: 'Late Romantic & modern (1890–)',
    test: (g) => g.tradition === 'art' && (g.year ?? 0) >= 1890,
  },
  { id: 'rock', label: 'Rock (RS200)', test: (g) => g.source === 'rock' },
  { id: 'billboard', label: 'Chart pop (Billboard)', test: (g) => g.source === 'billboard' },
  { id: 'pop909', label: 'Chinese pop', test: (g) => g.source === 'pop909' },
  { id: 'jazz', label: 'Jazz (changes)', test: (g) => g.source === 'jazz' },

  { id: 'wjazzd', label: 'Jazz solos (WJazzD)', test: (g) => g.source === 'wjazzd' },
  { id: 'modern', label: 'Modern popular (Chordonomicon)', test: (g) => g.source === 'chordonomicon' },
];

// ───────────────────────────── header ─────────────────────────────

function stats(study: Study) {
  const box = $('stats');
  const sum = (t: Tradition) => {
    const ps = study.pieces.filter((p) => p.tradition === t);
    const ys = ps.map((p) => p.year).filter((y): y is number => y !== null);
    return {
      n: ps.length,
      chords: ps.reduce((s, p) => s + p.chords, 0),
      from: ys.length ? Math.min(...ys) : null,
      to: ys.length ? Math.max(...ys) : null,
    };
  };
  const cards: [string, Tradition, string][] = [
    [
      'Art music',
      'art',
      'Bach chorales and Lieder (When in Rome) + 40 DCML collections; melody = sung part or top line; Lieder years ≈ composer aged 35',
    ],
    ['Jazz', 'jazz', 'Weimar Jazz Database: transcribed solos over the changes'],
    [
      'Popular music',
      'popular',
      'Rolling Stone 200 rock (transcribed melody), McGill Billboard and Chordonomicon (13 genres, to the 2020s; chords only)',
    ],
    ['Undated references', 'reference', 'POP909 (real melody) and jazz standards (changes only)'],
  ];
  for (const [name, t, note] of cards) {
    const s = sum(t);
    const d = html('div', { class: 'sheet stat' }, undefined, box);
    html('h3', {}, s.from ? `${s.from}–${s.to}` : 'no dates', d);
    html('b', {}, name, d);
    html(
      'span',
      { class: 'num', style: 'font-size: 12px; color: var(--muted)' },
      `${s.n.toLocaleString()} pieces · ${s.chords.toLocaleString()} chords`,
      d,
    );
    html('span', { style: 'font-size: 12px; color: var(--muted)' }, note, d);
  }
}

// ───────────────────────────── over time ─────────────────────────────

interface Metric {
  id: string;
  label: string;
  note: string;
  colour: string;
  value: (p: Piece) => number | null;
}
function metrics(study: Study): Metric[] {
  return [
    ...study.rulebooks.map((b) => ({
      id: `book:${b.id}`,
      label: `Rulebook: ${b.name} (AUC)`,
      note: `${b.idea} How often the rulebook prefers the composer’s chord over another chord in the same spot.`,
      colour: bookColour(b.id),
      value: (p: Piece) => p.books[b.id] ?? null,
    })),
    ...study.pieceRules.map((r) => ({
      id: `piece:${r.id}`,
      label: `Piece rule: ${r.statement}`,
      note: `${r.formula} (shown as 0–100%). Source: ${r.source}.`,
      colour: 'var(--accent)',
      value: (p: Piece) => p.pieceRules[r.id] ?? null,
    })),
  ];
}

const SERIES: Record<string, { label: string; colour: string }> = {
  rock: { label: 'Rolling Stone 200 rock (melody)', colour: 'var(--accent)' },
  billboard: { label: 'Billboard chart songs', colour: 'var(--rb-colour)' },
  chordonomicon: { label: 'Chordonomicon, all genres (modern)', colour: 'var(--rb-counterpoint)' },
};

function timeline(study: Study, m: Metric) {
  const draw = (id: string, tradition: Tradition, window: number, bySource: boolean) => {
    const root = $svg(id);
    root.replaceChildren();
    const W = 560;
    const H = 300;
    const pad = { l: 40, r: 10, t: 10, b: 28 };
    root.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const ps = study.pieces
      .filter((p) => p.tradition === tradition && p.year !== null)
      .map((p) => ({ p, y: p.year as number, v: m.value(p) }))
      .filter((d): d is { p: Piece; y: number; v: number } => d.v !== null);
    if (!ps.length) {
      svg(
        'text',
        {
          x: W / 2,
          y: H / 2,
          'text-anchor': 'middle',
          class: 'muted',
          'font-size': 12,
          text: 'no data for this measure',
        },
        root,
      );
      return;
    }
    const y0 = Math.floor(Math.min(...ps.map((d) => d.y)) / 10) * 10;
    const y1 = Math.ceil(Math.max(...ps.map((d) => d.y)) / 10) * 10;
    const x = (year: number) => pad.l + ((W - pad.l - pad.r) * (year - y0)) / Math.max(1, y1 - y0);
    const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      svg(
        'line',
        {
          x1: pad.l,
          x2: W - pad.r,
          y1: y(v),
          y2: y(v),
          style: `stroke: var(--rule); stroke-dasharray: ${v === 0.5 ? '4 4' : 'none'}`,
        },
        root,
      );
      svg(
        'text',
        { x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'muted', 'font-size': 10, text: `${v * 100}%` },
        root,
      );
    }
    const step = y1 - y0 > 150 ? 50 : 10;
    for (let t = Math.ceil(y0 / step) * step; t <= y1; t += step)
      svg(
        'text',
        { x: x(t), y: H - 8, 'text-anchor': 'middle', class: 'muted', 'font-size': 10, text: String(t) },
        root,
      );
    const groups = bySource ? [...new Set(ps.map((d) => d.p.source))] : ['all'];
    const colourOf = (src: string) => (bySource ? (SERIES[src]?.colour ?? m.colour) : m.colour);
    // dots: at most ~2500 per panel, a fixed subset when there are more
    const every = Math.max(1, Math.ceil(ps.length / 2500));
    ps.forEach((d, i) => {
      if (i % every) return;
      const jitter = (((d.p.id.length * 7 + d.p.chords) % 9) - 4) * 0.25;
      const c = svg(
        'circle',
        { cx: x(d.y + jitter), cy: y(d.v), r: 2, style: `fill: ${colourOf(d.p.source)}; opacity: 0.28` },
        root,
      );
      svg('title', { text: `${d.p.title} (${d.y}): ${pct(d.v)}` }, c);
    });
    for (const g of groups) {
      const sub = bySource ? ps.filter((d) => d.p.source === g) : ps;
      const band: { t: number; lo: number; mid: number; hi: number; n: number }[] = [];
      for (let t = y0; t <= y1; t += Math.max(1, Math.round(window / 4))) {
        const vs = sub.filter((d) => Math.abs(d.y - t) <= window).map((d) => d.v);
        if (vs.length >= 6)
          band.push({ t, lo: quantile(vs, 0.25), mid: quantile(vs, 0.5), hi: quantile(vs, 0.75), n: vs.length });
      }
      if (band.length < 2) continue;
      const col = colourOf(g);
      const area = `${band.map((b) => `${x(b.t)},${y(b.hi)}`).join(' ')} ${[...band]
        .reverse()
        .map((b) => `${x(b.t)},${y(b.lo)}`)
        .join(' ')}`;
      svg('polygon', { points: area, style: `fill: ${col}; opacity: ${bySource ? 0.1 : 0.15}` }, root);
      const line = svg(
        'polyline',
        {
          points: band.map((b) => `${x(b.t)},${y(b.mid)}`).join(' '),
          style: `fill: none; stroke: ${col}; stroke-width: 2.5`,
        },
        root,
      );
      svg('title', { text: band.map((b) => `${b.t}: ${pct(b.mid)} (n=${b.n})`).join('\n') }, line);
    }
    svg(
      'text',
      {
        x: W - pad.r,
        y: pad.t + 10,
        'text-anchor': 'end',
        class: 'muted',
        'font-size': 10,
        text: `${ps.length.toLocaleString()} pieces · window ±${window} years`,
      },
      root,
    );
  };
  draw('t-art', 'art', 20, false);
  draw('t-jazz', 'jazz', 6, false);
  draw('t-popular', 'popular', 4, true);
  const legend = $('popular-legend');
  legend.replaceChildren();
  for (const [, s] of Object.entries(SERIES)) {
    const e = html('span', {}, undefined, legend);
    html('span', { class: 'swatch', style: `background: ${s.colour}` }, undefined, e);
    e.append(s.label);
  }
  // undated references: median and middle half per source
  const root = $svg('t-reference');
  root.replaceChildren();
  const W = 560;
  const H = 300;
  root.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const y = (v: number) => 10 + (H - 38) * (1 - v);
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    svg(
      'line',
      {
        x1: 40,
        x2: W,
        y1: y(v),
        y2: y(v),
        style: `stroke: var(--rule); stroke-dasharray: ${v === 0.5 ? '4 4' : 'none'}`,
      },
      root,
    );
    svg(
      'text',
      { x: 34, y: y(v) + 4, 'text-anchor': 'end', class: 'muted', 'font-size': 10, text: `${v * 100}%` },
      root,
    );
  }
  [
    ['pop909', 'Chinese pop (POP909)'],
    ['jazz', 'Jazz standards (changes)'],
  ].forEach(([src, label], i) => {
    const vs = study.pieces
      .filter((p) => p.source === src)
      .map(m.value)
      .filter((v): v is number => v !== null);
    const cx = 170 + i * 220;
    svg('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'muted', 'font-size': 11, text: label }, root);
    if (vs.length < 6) return;
    svg(
      'rect',
      {
        x: cx - 30,
        y: y(quantile(vs, 0.75)),
        width: 60,
        height: Math.max(1, y(quantile(vs, 0.25)) - y(quantile(vs, 0.75))),
        style: `fill: ${m.colour}; opacity: 0.2`,
      },
      root,
    );
    const mid = svg(
      'line',
      {
        x1: cx - 30,
        x2: cx + 30,
        y1: y(quantile(vs, 0.5)),
        y2: y(quantile(vs, 0.5)),
        style: `stroke: ${m.colour}; stroke-width: 3`,
      },
      root,
    );
    svg('title', { text: `median ${pct(quantile(vs, 0.5))}, n=${vs.length}` }, mid);
  });
}

// ───────────────────────────── dimensions of style (PCA) ─────────────────────────────

const TRADITION_COLOUR: Record<Tradition, string> = {
  art: 'var(--rb-functional)',
  jazz: 'var(--rb-counterpoint)',
  popular: 'var(--rb-colour)',
  reference: 'var(--neutral)',
};

function styleMap(study: Study) {
  if (!study.pca) return;
  const pick = $('pc-pick');
  let axes: [number, number] = [0, 1];
  const label = (i: number) => `PC${i + 1} (${Math.round(100 * study.pca!.components[i].share)}%)`;
  const featureLabel = (f: string) =>
    f.startsWith('piece:')
      ? `${study.pieceRules.find((r) => `piece:${r.id}` === f)?.statement ?? f}`
      : (study.rules.find((r) => r.id === f)?.statement ?? f);
  const draw = () => {
    const root = $svg('pca-map');
    root.replaceChildren();
    const W = 560;
    const H = 420;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const pts = study.pieces.filter((p) => p.pc && p.pc[axes[0]] !== null && p.pc[axes[1]] !== null);
    const xs = pts.map((p) => p.pc![axes[0]] as number);
    const ys = pts.map((p) => p.pc![axes[1]] as number);
    const lo = (a: number[]) => quantile(a, 0.01);
    const hi = (a: number[]) => quantile(a, 0.99);
    const [x0, x1, y0, y1] = [lo(xs), hi(xs), lo(ys), hi(ys)];
    const x = (v: number) => 20 + ((W - 40) * (Math.max(x0, Math.min(x1, v)) - x0)) / (x1 - x0 || 1);
    const y = (v: number) => H - 20 - ((H - 40) * (Math.max(y0, Math.min(y1, v)) - y0)) / (y1 - y0 || 1);
    svg('line', { x1: x(0), x2: x(0), y1: 10, y2: H - 10, style: 'stroke: var(--rule)' }, root);
    svg('line', { x1: 10, x2: W - 10, y1: y(0), y2: y(0), style: 'stroke: var(--rule)' }, root);
    svg(
      'text',
      { x: W - 12, y: y(0) - 6, 'text-anchor': 'end', class: 'muted', 'font-size': 11, text: `${label(axes[0])} →` },
      root,
    );
    svg('text', { x: x(0) + 6, y: 20, class: 'muted', 'font-size': 11, text: `↑ ${label(axes[1])}` }, root);
    const every = Math.max(1, Math.ceil(pts.length / 3000));
    pts.forEach((p, i) => {
      if (i % every) return;
      svg(
        'circle',
        {
          cx: x(p.pc![axes[0]] as number),
          cy: y(p.pc![axes[1]] as number),
          r: 1.8,
          style: `fill: ${TRADITION_COLOUR[p.tradition]}; opacity: 0.22`,
        },
        root,
      );
    });
    // collection centres
    const byGroup = new Map<string, Piece[]>();
    for (const p of pts) byGroup.set(p.group, [...(byGroup.get(p.group) ?? []), p]);
    for (const [g, ps] of byGroup) {
      if (ps.length < 20) continue;
      const cx = ps.reduce((s, p) => s + (p.pc![axes[0]] as number), 0) / ps.length;
      const cy = ps.reduce((s, p) => s + (p.pc![axes[1]] as number), 0) / ps.length;
      const dot = svg(
        'circle',
        {
          cx: x(cx),
          cy: y(cy),
          r: 4,
          style: `fill: ${TRADITION_COLOUR[ps[0].tradition]}; stroke: var(--sheet); stroke-width: 1.5`,
        },
        root,
      );
      const name = study.groups.find((x) => x.id === g)?.title ?? g;
      svg('title', { text: `${name}: ${ps.length} pieces` }, dot);
      svg(
        'text',
        { x: x(cx) + 6, y: y(cy) + 3, 'font-size': 9.5, text: name.replace('chordonomicon: ', '').slice(0, 26) },
        root,
      );
    }
    const box = $('pca-loadings');
    box.replaceChildren();
    for (const ax of axes) {
      const c = study.pca!.components[ax];
      html('h3', { style: 'margin: 6px 0' }, label(ax), box);
      const top = Object.entries(c.loadings)
        .filter((e): e is [string, number] => e[1] !== null)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 8);
      for (const [f, l] of top) {
        const row = html(
          'div',
          {
            style:
              'display: grid; grid-template-columns: 1fr 120px; gap: 8px; align-items: center; font-size: 12px; margin: 2px 0',
          },
          undefined,
          box,
        );
        html('span', {}, featureLabel(f), row);
        const bar = html(
          'div',
          { style: 'position: relative; height: 10px; background: var(--rule); border-radius: 2px' },
          undefined,
          row,
        );
        const w = Math.round(Math.abs(l) * 100);
        html(
          'div',
          {
            style: `position: absolute; top: 0; height: 10px; width: ${w / 2}%; ${l >= 0 ? 'left: 50%' : `right: 50%`}; background: ${l >= 0 ? 'var(--good)' : 'var(--bad)'}; border-radius: 2px`,
            title: l.toFixed(2),
          },
          undefined,
          bar,
        );
      }
    }
    const legend = $('pca-legend');
    legend.replaceChildren();
    for (const [t, col] of Object.entries(TRADITION_COLOUR)) {
      const e = html('span', {}, undefined, legend);
      html('span', { class: 'swatch', style: `background: ${col}` }, undefined, e);
      e.append({ art: 'art music', jazz: 'jazz solos', popular: 'popular', reference: 'undated' }[t as Tradition]);
    }
  };
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 3],
  ];
  const buttons = pairs.map(([a, b]) => {
    const btn = html(
      'button',
      { type: 'button', 'aria-pressed': String(a === 0 && b === 1) },
      `PC${a + 1} × PC${b + 1}`,
      pick,
    );
    btn.addEventListener('click', () => {
      axes = [a, b];
      for (const x of buttons) x.setAttribute('aria-pressed', String(x === btn));
      draw();
    });
    return btn;
  });
  draw();
}

function timeSection(study: Study) {
  const pick = $<HTMLSelectElement>('metric');
  const ms = metrics(study);
  for (const m of ms) html('option', { value: m.id }, m.label, pick);
  pick.value = 'piece:phrases-cadence';
  const show = () => {
    const m = ms.find((x) => x.id === pick.value) ?? ms[0];
    $('metric-note').textContent = m.note;
    timeline(study, m);
  };
  pick.addEventListener('change', show);
  show();
}

// ───────────────────────────── tables ─────────────────────────────

function groupsTable(study: Study) {
  const t = $<HTMLTableElement>('groups');
  const head = html('tr', {}, undefined, t);
  for (const h of [
    'collection',
    'years',
    'pieces',
    ...study.rulebooks.map((b) => b.name),
    'phrases end in a cadence',
    'piece ends V → I',
    'how phrases end',
  ])
    html('th', {}, h, head);
  const kinds: [string, string][] = [
    ['authentic', 'var(--rb-functional)'],
    ['plagal', 'var(--rb-colour)'],
    ['half', 'var(--accent)'],
    ['deceptive', 'var(--rb-counterpoint)'],
    ['none', 'var(--neutral)'],
  ];
  let last: Tradition | null = null;
  for (const g of study.groups) {
    if (g.tradition !== last) {
      last = g.tradition;
      const tr = html('tr', {}, undefined, t);
      html(
        'td',
        {
          colspan: '20',
          style:
            'padding-top: 14px; font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em',
        },
        { art: 'art music', jazz: 'jazz', popular: 'popular music', reference: 'undated references' }[g.tradition],
        tr,
      );
    }
    const tr = html('tr', {}, undefined, t);
    html('td', {}, g.title, tr);
    html(
      'td',
      { class: 'num' },
      g.yearFrom ? (g.yearFrom === g.yearTo ? `${g.yearFrom}` : `${g.yearFrom}–${g.yearTo}`) : '–',
      tr,
    );
    html('td', { class: 'num' }, `${g.pieces}`, tr);
    for (const b of study.rulebooks)
      html(
        'td',
        { class: 'num', style: `background: ${aucColour(g.rulebooks[b.id]?.auc ?? null)}` },
        pct(g.rulebooks[b.id]?.auc),
        tr,
      );
    html('td', { class: 'num' }, pct(g.pieceRules['phrases-cadence']), tr);
    html('td', { class: 'num' }, pct(g.pieceRules['final-authentic']), tr);
    const td = html('td', { style: 'min-width: 140px' }, undefined, tr);
    const total = Object.values(g.cadences).reduce((a, b) => a + b, 0) || 1;
    const bars = html('div', { class: 'bars' }, undefined, td);
    for (const [k, col] of kinds) {
      const s = (g.cadences[k] ?? 0) / total;
      if (s > 0)
        html('span', { style: `width: ${100 * s}%; background: ${col}`, title: `${k}: ${pct(s)}` }, undefined, bars);
    }
  }
}

function pooled(groups: Group[], pick: (g: Group) => { value: number | null; weight: number }) {
  let num = 0;
  let den = 0;
  for (const g of groups) {
    const { value, weight } = pick(g);
    if (value === null || !weight) continue;
    num += value * weight;
    den += weight;
  }
  return den ? num / den : null;
}

function complianceTable(study: Study) {
  const t = $<HTMLTableElement>('compliance');
  const head = html('tr', {}, undefined, t);
  html('th', {}, 'constraint', head);
  for (const p of PERIODS) html('th', { style: 'text-align: center' }, p.label, head);
  const ids = Object.keys(study.groups[0]?.compliance ?? {});
  for (const id of ids) {
    const r = study.rules.find((x) => x.id === id);
    const tr = html('tr', {}, undefined, t);
    html('td', {}, r?.statement ?? id, tr);
    for (const p of PERIODS) {
      const gs = study.groups.filter(p.test);
      const real = pooled(gs, (g) => ({
        value: g.compliance[id]?.realRate ?? null,
        weight: g.compliance[id]?.real ?? 0,
      }));
      const alt = pooled(gs, (g) => ({
        value: g.compliance[id]?.altRate ?? null,
        weight: g.compliance[id]?.real ?? 0,
      }));
      const n = gs.reduce((s, g) => s + (g.compliance[id]?.real ?? 0), 0);
      const td = html(
        'td',
        { class: 'cell num', style: 'text-align: center', title: `${n} real chords concerned` },
        undefined,
        tr,
      );
      html('b', {}, pct(real), td);
      html('div', { style: 'font-size: 10px; color: var(--muted)' }, `chance ${pct(alt)}`, td);
    }
  }
}

function matrix(study: Study) {
  const t = $<HTMLTableElement>('matrix');
  const head = html('tr', {}, undefined, t);
  for (const h of ['rule', 'kind', 'rulebooks']) html('th', {}, h, head);
  for (const p of PERIODS) html('th', { style: 'text-align: center' }, p.label, head);
  for (const fam of [...new Set(study.rules.map((r) => r.family))]) {
    const fr = html('tr', {}, undefined, t);
    html(
      'td',
      {
        colspan: String(3 + PERIODS.length),
        style:
          'padding-top: 14px; font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em',
      },
      fam,
      fr,
    );
    for (const r of study.rules.filter((x) => x.family === fam)) {
      const tr = html('tr', { class: 'rule-row', tabindex: '0' }, undefined, t);
      html('td', {}, r.statement, tr);
      html('td', {}, undefined, tr).append(html('span', { class: 'chip' }, r.kind ?? 'preference'));
      const books = html('td', {}, undefined, tr);
      for (const b of study.rulebooks.filter((x) => x.rules.includes(r.id)))
        html('span', { class: 'swatch', title: b.name, style: `background: ${bookColour(b.id)}` }, undefined, books);
      for (const p of PERIODS) {
        const gs = study.groups.filter(p.test);
        const a = pooled(gs, (g) => ({ value: g.rules[r.id]?.auc ?? null, weight: g.chords }));
        const applies = pooled(gs, (g) => ({ value: g.rules[r.id]?.applies ?? null, weight: g.chords }));
        const td = html('td', { class: 'cell', style: `background: ${aucColour(a)}` }, pct(a), tr);
        html('div', { style: 'font-size: 10px; color: var(--muted)' }, pct(applies), td);
      }
      const pick = () => {
        for (const x of t.querySelectorAll('tr.selected')) x.classList.remove('selected');
        tr.classList.add('selected');
        detail(study, r);
      };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') pick();
      });
    }
  }
  const v = study.validation;
  const top = Object.entries(v.confusion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ');
  $('validation').textContent = v.expert
    ? `Cadence finder checked against ${v.expert.toLocaleString()} expert cadence labels (DCML): ${pct(v.matched / v.expert)} agree. Most common pairs (expert → ours): ${top}.`
    : '';
}

function detail(study: Study, r: RuleMeta) {
  const box = $('rule-detail');
  box.replaceChildren();
  html('h3', { style: 'margin-bottom: 8px' }, `${r.id} · ${r.family}`, box);
  const dl = html('dl', { class: 'detail' }, undefined, box);
  const row = (k: string, v: string) => {
    html('dt', {}, k, dl);
    html('dd', {}, v, dl);
  };
  row('rule', r.statement);
  row(
    'kind',
    r.kind === 'constraint'
      ? 'constraint: can only object (0 = satisfied or not concerned)'
      : 'preference: scores every chord',
  );
  row('source', r.source);
  row('formula', r.formula);
  row(
    'rulebooks',
    study.rulebooks
      .filter((b) => b.rules.includes(r.id))
      .map((b) => b.name)
      .join(', ') || '–',
  );
}

// ───────────────────────────── tricks to review ─────────────────────────────

interface TrickExample {
  title: string;
  year: number | null;
  key: string;
  chords: { name: string; roman: string; pcs: number[]; root: number; focus: boolean }[];
}
interface Trick {
  tradition: Tradition;
  label: string;
  count: number;
  share: number;
  functional: number;
  name: string | null;
  why: { id: string; statement: string; v: number }[];
  against: { id: string; statement: string; v: number }[];
  examples: TrickExample[];
}

const MARKS_KEY = 'chordsh-lab-trick-marks';
function loadMarks(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MARKS_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function saveMarks(m: Record<string, string>) {
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable: marks last until reload */
  }
}

function playChords(chords: { pcs: number[]; root: number }[]) {
  const ctx = new AudioContext();
  const t0 = ctx.currentTime + 0.1;
  chords.forEach((c, i) => {
    const at = t0 + i * 0.9;
    for (const m of [36 + c.root, ...c.pcs.map((pc) => 52 + ((pc - 52 + 120) % 12))]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = m < 48 ? 'sine' : 'triangle';
      o.frequency.value = 440 * 2 ** ((m - 69) / 12);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(m < 48 ? 0.09 : 0.05, at + 0.02);
      g.gain.setValueAtTime(m < 48 ? 0.09 : 0.05, at + 0.75);
      g.gain.linearRampToValueAtTime(0, at + 0.88);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.9);
    }
  });
  setTimeout(() => void ctx.close(), (chords.length * 0.9 + 0.5) * 1000);
}

function tricksSection(study: Study) {
  const all = (study as unknown as { tricks?: Record<string, Trick[]> }).tricks;
  if (!all) return;
  const pick = $('trick-pick');
  const table = $<HTMLTableElement>('tricks');
  const marks = loadMarks();
  const names: Record<string, string> = {
    art: 'art music',
    jazz: 'jazz solos',
    popular: 'popular',
    reference: 'undated',
  };
  let current = Object.keys(all)[0];
  const draw = () => {
    table.replaceChildren();
    const head = html('tr', {}, undefined, table);
    for (const h of [
      'move (in the key)',
      'what it is',
      'how often',
      'functional verdict',
      'why it might work',
      'what it breaks',
      'examples',
      'your mark',
    ])
      html('th', {}, h, head);
    for (const t of all[current] ?? []) {
      const id = `${t.tradition}|${t.label}`;
      const tr = html('tr', {}, undefined, table);
      html('td', { class: 'num', style: 'white-space: nowrap; font-weight: 600' }, t.label, tr);
      html('td', { style: t.name ? '' : 'color: var(--bad)' }, t.name ?? 'unnamed: why does it work?', tr);
      html('td', { class: 'num' }, `${t.count.toLocaleString()} (${(100 * t.share).toFixed(2)}%)`, tr);
      html('td', { class: 'num', style: `background: ${verdictColour(t.functional)}` }, t.functional.toFixed(2), tr);
      const why = html('td', { style: 'font-size: 12px' }, undefined, tr);
      for (const w of t.why) html('div', { title: w.statement }, `+ ${w.id.replace(/-/g, ' ')}`, why);
      const against = html('td', { style: 'font-size: 12px; color: var(--muted)' }, undefined, tr);
      for (const w of t.against) html('div', { title: w.statement }, `− ${w.id.replace(/-/g, ' ')}`, against);
      const ex = html('td', { style: 'font-size: 12px; min-width: 220px' }, undefined, tr);
      for (const e of t.examples.slice(0, 3)) {
        const row = html(
          'div',
          { style: 'display: flex; gap: 6px; align-items: baseline; margin: 2px 0' },
          undefined,
          ex,
        );
        const btn = html('button', { type: 'button', title: 'play these chords', style: 'padding: 1px 7px' }, '▶', row);
        btn.addEventListener('click', () => playChords(e.chords));
        const txt = html('span', {}, undefined, row);
        txt.append(`${e.chords.map((c) => (c.focus ? `[${c.name}]` : c.name)).join(' ')} · ${e.key} · `);
        html('span', { style: 'color: var(--muted)' }, `${e.title}${e.year ? ` (${e.year})` : ''}`, txt);
      }
      const markCell = html('td', {}, undefined, tr);
      const sel = html('select', { 'aria-label': `mark ${t.label}` }, undefined, markCell);
      for (const [v, l] of [
        ['', '—'],
        ['interesting', 'interesting'],
        ['understood', 'understood'],
        ['wrong', 'looks like a data error'],
      ])
        html('option', { value: v }, l, sel);
      sel.value = marks[id] ?? '';
      sel.addEventListener('change', () => {
        if (sel.value) marks[id] = sel.value;
        else delete marks[id];
        saveMarks(marks);
      });
    }
  };
  const buttons = Object.keys(all).map((k) => {
    const b = html(
      'button',
      { type: 'button', 'aria-pressed': String(k === current) },
      `${names[k] ?? k} (${all[k].length})`,
      pick,
    );
    b.addEventListener('click', () => {
      current = k;
      for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
      draw();
    });
    return b;
  });
  draw();
}

// ───────────────────────────── keys and modes ─────────────────────────────

interface ModeStats {
  pieces: number;
  minor: number;
  tonics: number[];
  modes: Record<string, number>;
  sizes: Record<string, number>;
  unusual: {
    title: string;
    year: number | null;
    group: string;
    mode: string;
    used: number[];
    coverage: number;
    outside: number[];
    tonic: number;
  }[];
  splits: {
    title: string;
    year: number | null;
    group: string;
    tonic: number;
    splits: { low: number; high: number; gap: number }[];
  }[];
}
const PC_NAME = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const DEGREE = ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'];
const MODE_NAMES: Record<string, string> = {
  ionian: 'major',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  aeolian: 'natural minor',
  locrian: 'Locrian',
  'harmonic-minor': 'harmonic minor',
  'melodic-minor': 'melodic minor',
  'major-pentatonic': 'major pentatonic',
  'minor-pentatonic': 'minor pentatonic',
  blues: 'blues',
  'major-blues': 'major blues',
  'whole-tone': 'whole-tone',
  'octatonic-hw': 'octatonic (h–w)',
  'octatonic-wh': 'octatonic (w–h)',
};
const SOURCE_NAMES: Record<string, string> = {
  chorales: 'Bach chorales',
  dlc: 'DCML art music',
  lieder: 'Lieder (years approx.)',
  rock: 'RS200 rock',
  billboard: 'Billboard',
  chordonomicon: 'Chordonomicon (modern)',
  wjazzd: 'Jazz solos',
  pop909: 'Chinese pop',
  jazz: 'Jazz standards',
};

function modesSection(study: Study) {
  const modes = (study as unknown as { modes?: Record<string, ModeStats> }).modes;
  if (!modes) return;
  const t = $<HTMLTableElement>('modes');
  const head = html('tr', {}, undefined, t);
  for (const h of [
    'source',
    'pieces',
    'minor keys',
    'most common tonics',
    'collections used',
    'notes used (5 · 6 · 7 · 8 · 9+)',
  ])
    html('th', {}, h, head);
  for (const [src, m] of Object.entries(modes)) {
    const tr = html('tr', {}, undefined, t);
    html('td', {}, SOURCE_NAMES[src] ?? src, tr);
    html('td', { class: 'num' }, m.pieces.toLocaleString(), tr);
    html('td', { class: 'num' }, pct(m.minor / Math.max(1, m.pieces)), tr);
    const tonics = m.tonics
      .map((n, pc) => [n, pc] as const)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 5)
      .map(([n, pc]) => `${PC_NAME[pc]} ${pct(n / Math.max(1, m.pieces))}`)
      .join(' · ');
    html('td', { class: 'num', style: 'font-size: 12px' }, tonics, tr);
    const mt = html('td', { style: 'font-size: 12px; min-width: 260px' }, undefined, tr);
    for (const [id, n] of Object.entries(m.modes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)) {
      const row = html(
        'div',
        { style: 'display: grid; grid-template-columns: 120px 1fr 40px; gap: 6px; align-items: center' },
        undefined,
        mt,
      );
      html('span', {}, MODE_NAMES[id] ?? id, row);
      const bar = html('div', { style: 'height: 8px; background: var(--rule); border-radius: 2px' }, undefined, row);
      html(
        'div',
        { style: `height: 8px; width: ${(100 * n) / m.pieces}%; background: var(--accent); border-radius: 2px` },
        undefined,
        bar,
      );
      html('span', { class: 'num' }, pct(n / m.pieces), row);
    }
    const sz = (k: number) =>
      Object.entries(m.sizes).reduce(
        (s, [size, n]) => s + ((k === 9 ? Number(size) >= 9 : Number(size) === k) ? n : 0),
        0,
      );
    html(
      'td',
      { class: 'num', style: 'font-size: 12px' },
      [5, 6, 7, 8, 9].map((k) => pct(sz(k) / Math.max(1, m.pieces))).join(' · '),
      tr,
    );
  }
  // pieces per unusual collection
  const pick = $<HTMLSelectElement>('mode-pick');
  const ids = [...new Set(Object.values(modes).flatMap((m) => m.unusual.map((u) => u.mode)))].sort();
  for (const id of ids) html('option', { value: id }, MODE_NAMES[id] ?? id, pick);
  const showPieces = () => {
    const pt = $<HTMLTableElement>('mode-pieces');
    pt.replaceChildren();
    const h = html('tr', {}, undefined, pt);
    for (const x of ['piece', 'source', 'degrees used', 'outside the collection', 'coverage']) html('th', {}, x, h);
    for (const [src, m] of Object.entries(modes))
      for (const u of m.unusual.filter((x) => x.mode === pick.value).slice(0, 25)) {
        const tr = html('tr', {}, undefined, pt);
        html('td', {}, `${u.title}${u.year ? ` (${u.year})` : ''} · tonic ${PC_NAME[u.tonic]}`, tr);
        html('td', {}, SOURCE_NAMES[src] ?? src, tr);
        html('td', { class: 'num' }, u.used.map((d) => DEGREE[d]).join(' '), tr);
        html('td', { class: 'num' }, u.outside.map((d) => DEGREE[d]).join(' ') || '–', tr);
        html('td', { class: 'num' }, pct(u.coverage), tr);
      }
  };
  pick.addEventListener('change', showPieces);
  pick.value = ids.includes('mixolydian') ? 'mixolydian' : (ids[0] ?? '');
  showPieces();
  const st = $<HTMLTableElement>('splits');
  const h = html('tr', {}, undefined, st);
  for (const x of ['piece', 'source', 'low form', 'high form', 'octaves apart']) html('th', {}, x, h);
  for (const [src, m] of Object.entries(modes))
    for (const sp of m.splits.slice(0, 15))
      for (const x of sp.splits) {
        const tr = html('tr', {}, undefined, st);
        html('td', {}, `${sp.title}${sp.year ? ` (${sp.year})` : ''} · tonic ${PC_NAME[sp.tonic]}`, tr);
        html('td', {}, SOURCE_NAMES[src] ?? src, tr);
        html('td', { class: 'num' }, DEGREE[x.low], tr);
        html('td', { class: 'num' }, DEGREE[x.high], tr);
        html('td', { class: 'num' }, x.gap.toFixed(1), tr);
      }
}

// ───────────────────────────── piece viewer ─────────────────────────────

let audio: AudioContext | null = null;
let stopAt = 0;
let raf = 0;

function viewer(study: Study) {
  const groupPick = $<HTMLSelectElement>('group-pick');
  const piecePick = $<HTMLSelectElement>('piece-pick');
  const bookBox = $('book-pick');
  let book = study.rulebooks.find((b) => b.id === 'functional')?.id ?? study.rulebooks[0].id;
  const withExamples = study.groups.filter((g) => g.examples.length);
  for (const [i, g] of withExamples.entries())
    html('option', { value: String(i) }, `${g.title}${g.year ? ` (${g.year})` : ''}`, groupPick);
  const fill = () => {
    piecePick.replaceChildren();
    for (const [i, e] of withExamples[+groupPick.value].examples.entries())
      html('option', { value: String(i) }, e.title, piecePick);
  };
  const buttons = study.rulebooks.map((b) => {
    const btn = html('button', { type: 'button', 'aria-pressed': String(b.id === book) }, b.name, bookBox);
    btn.addEventListener('click', () => {
      book = b.id;
      for (const [k, x] of buttons.entries()) x.setAttribute('aria-pressed', String(study.rulebooks[k].id === book));
      draw();
    });
    return btn;
  });
  const current = () => withExamples[+groupPick.value]?.examples[+piecePick.value];
  let playhead: SVGLineElement | null = null;
  let px = 30;
  const X0 = 70;
  const draw = () => {
    const ex = current();
    if (!ex) return;
    const root = $svg('piece');
    root.replaceChildren();
    const end = Math.max(...ex.chords.map((c) => c.end), ...ex.melody.map((n) => n[0] + n[1]));
    px = Math.max(30, Math.min(44, 1100 / Math.max(1, end)));
    const W = X0 + end * px + 20;
    const H = 360;
    root.setAttribute('viewBox', `0 0 ${W} ${H}`);
    root.setAttribute('width', String(W));
    const x = (t: number) => X0 + t * px;
    for (const [yy, label] of [
      [22, 'phrases'],
      [52, 'patterns'],
      [88, 'chords'],
      [200, 'melody'],
      [336, 'verdict'],
    ] as const)
      svg('text', { x: 6, y: yy, class: 'muted', 'font-size': 11, text: label }, root);
    for (let b = 0; b <= end; b += ex.meter)
      svg('line', { x1: x(b), x2: x(b), y1: 64, y2: 318, style: 'stroke: var(--rule)' }, root);
    for (const p of ex.phrases) {
      svg(
        'path',
        {
          d: `M${x(p.start) + 2} 26 v-8 H${x(p.end) - 2} v8`,
          style: 'fill: none; stroke: var(--muted); stroke-width: 1.2',
        },
        root,
      );
      if (p.cadence !== 'none')
        svg(
          'text',
          {
            x: x(p.end) - 4,
            y: 14,
            'text-anchor': 'end',
            'font-size': 11,
            style: 'font-weight: 600; fill: var(--rb-functional)',
            text: `${p.cadence} cadence`,
          },
          root,
        );
    }
    const seen = new Set<number>();
    for (const f of [...ex.features].sort((a, b) => b.to - b.from - (a.to - a.from))) {
      if (seen.has(f.to) || !ex.chords[f.from] || !ex.chords[f.to]) continue;
      seen.add(f.to);
      const a = x(ex.chords[f.from].start) + 2;
      const b = x(ex.chords[f.to].end) - 2;
      svg('path', { d: `M${a} 56 v-6 H${b} v6`, style: 'fill: none; stroke: var(--accent); stroke-width: 1.2' }, root);
      if (b - a > f.label.length * 5.5)
        svg('text', { x: a + 2, y: 46, 'font-size': 10, style: 'fill: var(--accent)', text: f.label }, root);
      else
        svg(
          'title',
          { text: f.label },
          svg('rect', { x: a, y: 40, width: Math.max(4, b - a), height: 16, style: 'fill: transparent' }, root),
        );
    }
    const pcsAt = (t: number) =>
      (ex.chords.find((c) => c.start <= t + 1e-6 && t < c.end - 1e-6) ?? ex.chords[ex.chords.length - 1]).pcs;
    for (const c of ex.chords) {
      const g = svg('g', {}, root);
      const w = Math.max(2, (c.end - c.start) * px - 2);
      svg(
        'rect',
        { x: x(c.start) + 1, y: 68, width: w, height: 36, rx: 4, style: 'fill: var(--paper); stroke: var(--rule)' },
        g,
      );
      if (w > 20) {
        svg('text', { x: x(c.start) + 4, y: 84, 'font-size': 11, style: 'font-weight: 600', text: c.name }, g);
        svg('text', { x: x(c.start) + 4, y: 98, 'font-size': 10, class: 'muted', text: c.roman }, g);
      }
      svg(
        'rect',
        {
          x: x(c.start) + 1,
          y: 324,
          width: w,
          height: 18,
          rx: 3,
          style: `fill: ${verdictColour(verdictOf(study, book, c))}`,
        },
        g,
      );
      g.addEventListener('mouseenter', () => tip(study, c, book));
    }
    const pitches = ex.melody.map((n) => n[2]);
    const lo = Math.min(...pitches, 60) - 1;
    const hi = Math.max(...pitches, 72) + 1;
    const yP = (p: number) => 116 + (196 * (hi - p)) / Math.max(1, hi - lo);
    for (const [s, d, p] of ex.melody)
      svg(
        'rect',
        {
          x: x(s) + 0.5,
          y: yP(p) - 3,
          width: Math.max(2, d * px - 1),
          height: 6,
          rx: 2,
          style: `fill: ${ROLE_COLOUR[role(p, pcsAt(s))]}`,
        },
        root,
      );
    if (!ex.melody.length)
      svg(
        'text',
        { x: X0, y: 200, class: 'muted', 'font-size': 12, text: 'no melody in this corpus (chord changes only)' },
        root,
      );
    playhead = svg(
      'line',
      { x1: X0, x2: X0, y1: 0, y2: H, style: 'stroke: var(--accent); stroke-width: 2; display: none' },
      root,
    );
  };
  groupPick.addEventListener('change', () => {
    fill();
    draw();
  });
  piecePick.addEventListener('change', draw);
  $('play').addEventListener('click', () => {
    if (audio && performance.now() < stopAt) {
      void audio.close();
      audio = null;
      stopAt = 0;
      $('play').textContent = '▶ Play';
      return;
    }
    const ex = current();
    if (!ex) return;
    audio = new AudioContext();
    const ctx = audio;
    const spb = 60 / 88;
    const t0 = ctx.currentTime + 0.15;
    const tone = (m: number, at: number, dur: number, gain: number, type: OscillatorType) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = 440 * 2 ** ((m - 69) / 12);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.02);
      g.gain.setValueAtTime(gain, Math.max(at + 0.03, at + dur - 0.08));
      g.gain.linearRampToValueAtTime(0, at + dur);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + dur + 0.05);
    };
    for (const [s, d, p] of ex.melody) tone(p, t0 + s * spb, Math.max(0.08, d * spb * 0.95), 0.12, 'triangle');
    for (const c of ex.chords) {
      const dur = (c.end - c.start) * spb;
      for (const pc of c.pcs) tone(52 + ((pc - 52 + 120) % 12), t0 + c.start * spb, dur, 0.035, 'sine');
      tone(36 + c.root, t0 + c.start * spb, dur, 0.06, 'sine');
    }
    const end = Math.max(...ex.chords.map((c) => c.end));
    stopAt = performance.now() + (end * spb + 0.3) * 1000;
    $('play').textContent = '■ Stop';
    const start = performance.now() + 150;
    cancelAnimationFrame(raf);
    const tick = () => {
      if (!audio || performance.now() > stopAt) {
        if (playhead) playhead.style.display = 'none';
        $('play').textContent = '▶ Play';
        return;
      }
      const beat = Math.max(0, (performance.now() - start) / 1000 / spb);
      if (playhead) {
        playhead.style.display = '';
        playhead.setAttribute('x1', String(X0 + beat * px));
        playhead.setAttribute('x2', String(X0 + beat * px));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  fill();
  draw();
}

function verdictOf(study: Study, bookId: string, c: ExampleChord): number | null {
  const b = study.rulebooks.find((x) => x.id === bookId);
  const vs = (b?.rules ?? []).map((id) => c.rules[id]).filter((v): v is number => v !== null && v !== undefined);
  return vs.length ? vs.reduce((a, x) => a + x, 0) / vs.length : null;
}

function tip(study: Study, c: ExampleChord, bookId: string) {
  const box = $('tip');
  box.replaceChildren();
  const b = study.rulebooks.find((x) => x.id === bookId);
  html('b', { style: 'color: var(--ink)' }, `${c.name} (${c.roman}) `, box);
  box.append(`· ${b?.name}: ${verdictOf(study, bookId, c)?.toFixed(2) ?? '–'}   `);
  for (const id of b?.rules ?? []) {
    const v = c.rules[id];
    if (v === null || v === undefined) continue;
    const s = html(
      'span',
      { style: `margin-right: 10px; color: ${v > 0.05 ? 'var(--good)' : v < -0.05 ? 'var(--bad)' : 'var(--muted)'}` },
      `${id} ${v > 0 ? '+' : ''}${v.toFixed(2)}`,
      box,
    );
    s.title = study.rules.find((r) => r.id === id)?.statement ?? '';
  }
}

async function main() {
  const res = await fetch('/__library/assist/study.json');
  if (!res.ok) {
    document
      .querySelector('main')
      ?.append(
        html(
          'p',
          { class: 'sheet' },
          'No study yet: run npm run fetch-assist-data, then npm run study:rules, and reload.',
        ),
      );
    return;
  }
  const study = (await res.json()) as Study;
  if (!study.groups) {
    document
      .querySelector('main')
      ?.append(html('p', { class: 'sheet' }, 'This study file is from an older version: rerun npm run study:rules.'));
    return;
  }
  stats(study);
  timeSection(study);
  styleMap(study);
  tricksSection(study);
  modesSection(study);
  groupsTable(study);
  complianceTable(study);
  matrix(study);
  viewer(study);
}
void main();
