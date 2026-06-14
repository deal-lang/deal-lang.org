"use strict";
/* ============================================================================
 * connector.js — DEAL Viewer atomic SysML v2 connector.
 *
 * Lifted from the standalone Connector mockup. Framework-free JS that draws SVG
 * connectors from routed points. Ten relationship kinds live in a closed registry;
 * glyph geometry is exact and shared; lines shorten so they never poke through
 * hollow glyphs. Meaning lives in glyph SHAPE, never color — connectors render
 * neutral in every theme and survive grayscale.
 *
 * The engine (render functions + geometry) is ported verbatim; demo builders at
 * the bottom compose the user-facing gallery shown on /tooling/deal-view/.
 * ==========================================================================*/

import { el, FONT_FAMILY } from './core.js';

export const CN_TOKENS = {
  stroke: 1.5,                 // = element box stroke: one line weight everywhere
  bendRadius: 6,               // rounded corners
  tri: {len: 12, halfH: 6},    // hollow triangle head (subclassification family)
  diamond: {len: 14, halfH: 5},// membership diamonds
  barb: {len: 14, halfH: 5.5, notch: 4},  // association: filled barbed head, concave rear
  circlePlus: {r: 6.5},        // variation membership: hollow circle + cross
  timeslice: {r: 6.5, mouthDeg: 70},      // «timeslice»: filled circle, mouth opens toward the line
  port: {size: 18, rx: 4},     // port boxes: rounded square straddling the boundary
  label: {font: 'italic 400 11px ' + FONT_FAMILY, nameFont: '400 11px ' + FONT_FAMILY,
          height: 12, pad: 6, edgeMargin: 8},
  dot: {r: 1.6, gap: 4.5},     // adornment dots (defined-by, references)
  bar: {len: 8, gap: 3},       // redefines single perpendicular bar
  curve: {maxHandle: 18},
  approach: {minRunout: 12, cornerClearance: 8},
  hop: {r: 4, mergeGap: 2},
  bundle: {proximity: 24}
};

/* the closed registry. end:'target' = glyph at the LAST point; end:'source' = glyph at
   the FIRST point (the owning end — membership diamonds sit on the owner). */
export const CONNECTOR_REGISTRY = {
  subclassification: {end: 'target', head: 'triangle', adorn: null,    title: 'Subclassification — points at the general definition', declaredIn: '.deal  (def X :> General)'},
  definedBy:         {end: 'target', head: 'triangle', adorn: 'dots2', title: '"Defined by" — links usage to its definition',          declaredIn: '.deal/.dealx  (usage : Definition)'},
  compositeOf:       {end: 'source', head: 'diamondFilled', adorn: null, title: '"Composite of" — composite feature membership, owner end', declaredIn: '.dealx  (nested / composed part)'},
  memberOf:          {end: 'source', head: 'diamondHollow', adorn: null, title: '"Member of" — non-composite feature membership, owner end', declaredIn: '.dealx  (membership)'},
  redefines:         {end: 'target', head: 'triangle', adorn: 'bar1', title: 'Redefines — replaces an inherited feature',              declaredIn: '.deal  (:>> redefinition)'},
  references:        {end: 'target', head: 'triangle', adorn: 'dots4', title: 'References — pointer to a related element',             declaredIn: '.deal/.dealx  (ref)'},
  association:       {end: 'target', head: 'arrowBarbed', adorn: null, title: 'Association — «keyword»-qualified (e.g. «satisfy», «import», «type») or bare action succession (then)', declaredIn: '.dealx  (association) · .deal  (then)'},
  variation:         {end: 'source', head: 'circlePlus', adorn: null, title: 'Variation membership — variation-point end («variation part» to its variants)', declaredIn: '.dealx  (variation / variant)'},
  timeslice:         {end: 'source', head: 'pacman', adorn: null, title: '«timeslice» — time slices, snapshots, Portion membership (owner end)', declaredIn: '.dealx  (timeslice / snapshot / portion)'},
  connect:           {end: 'target', head: 'none', adorn: null, title: 'Connection — port-to-port binding/flow; NO arrowhead: the port terminates the line, flow direction lives in the port glyphs', declaredIn: '.dealx  (connect via/carrying)'}
};

/* explainer content — registry-owned, deterministic, never free text. */
const CONNECTOR_EXPLAIN = {
  subclassification: {reading: 'The {s} specializes the {t}.',
    meaning: 'Subclassification: the specific definition inherits all features of the general definition and may add to or refine them.',
    dirNote: 'The hollow triangle sits at the general (inherited-from) end.'},
  definedBy: {reading: 'The {s} is defined by the {t}.',
    meaning: '"Defined by" links a usage to the definition that types it — the usage instantiates the definition’s structure.',
    dirNote: 'The dotted triangle points at the definition.'},
  compositeOf: {reading: 'The {s} is composed of the {t}.',
    meaning: 'Composite feature membership: the part is an integral piece of the whole and cannot outlive its owner.',
    dirNote: 'The filled diamond sits at the owning (whole) end.'},
  memberOf: {reading: 'The {s} contains the {t} as a non-composite member.',
    meaning: 'Non-composite membership: the member is held by the owner but exists independently of it.',
    dirNote: 'The hollow diamond sits at the owning end.'},
  redefines: {reading: 'The {s} redefines the {t}.',
    meaning: 'Redefinition replaces a feature inherited from a general definition with a more specific one.',
    dirNote: 'The barred triangle points at the redefined (inherited) feature.'},
  references: {reading: 'The {s} references the {t}.',
    meaning: 'A reference points to a related element without owning it.',
    dirNote: 'The four-dot triangle points at the referenced element.'},
  association: {reading: null,   // built from the «keyword» — see connectorExplanation()
    meaning: 'An association relates two elements; the «keyword» names the semantic (satisfy, import, type, …). Unlabeled, it denotes action succession (then).',
    dirNote: 'The filled barbed arrow points at the related (target) element.'},
  variation: {reading: 'The {s} offers the {t} as a variant.',
    meaning: 'Variation membership: a variation point offers alternative variants — one is selected per configuration.',
    dirNote: 'The circled cross sits at the variation-point end.'},
  connect: {reading: 'The {s} connects to the {t}.',
    meaning: 'A connection binds two ports for flow or interaction (declared with connect…via…carrying in the composition). The line itself is undirected — flow direction is shown by the port glyphs at each end.',
    dirNote: 'No arrowhead: the port is the termination of the line.'},
  timeslice: {reading: 'The {t} is a time slice / portion of the {s}.',
    meaning: '«timeslice» denotes time slices, snapshots, and Portion membership — a temporal or portion subset of the owner.',
    dirNote: 'The notched disc sits at the owning end.'}
};

const ASSOCIATION_VERBS = {
  satisfy: 'satisfies', verify: 'verifies', refine: 'refines', import: 'imports',
  allocate: 'is allocated to', type: 'is typed by', expose: 'exposes', trace: 'traces to'
};

/* pure: spec → explainer card content (null for unknown kinds). */
export function connectorExplanation(spec) {
  const reg = CONNECTOR_REGISTRY[spec.kind], ex = CONNECTOR_EXPLAIN[spec.kind];
  if (!reg || !ex) return null;
  const fmt = (e, fallback) => e && e.name
    ? e.name + (e.kind ? ' ' + e.kind : '')
    : fallback;
  const S = fmt(spec.source, 'source element'), Tt = fmt(spec.target, 'target element');
  let reading;
  if (spec.kind === 'association') {
    if (spec.label != null) {
      const kw = String(spec.label).replace(/[«»]/g, '').trim();
      const verb = ASSOCIATION_VERBS[kw] || ('is associated («' + kw + '») with');
      reading = 'The ' + S + ' ' + verb + ' the ' + Tt + '.';
    } else reading = 'The ' + S + ' is followed by the ' + Tt + ' (succession).';
  } else {
    reading = ex.reading.replace('{s}', S).replace('{t}', Tt);
    if (spec.kind === 'connect' && spec.label != null)
      reading = reading.slice(0, -1) + ' via ' + String(spec.label).replace(/[«»]/g, '') + '.';
  }
  return {kind: spec.kind, reading, meaning: ex.meaning, dirNote: ex.dirNote,
          ref: spec.ref || null, declaredIn: reg.declaredIn};
}

/* --- pure geometry helpers (unit-testable) --- */

function glyphLength(reg, T) {
  const head = reg.head === 'none' ? 0
             : reg.head === 'triangle' ? T.tri.len
             : reg.head === 'arrowBarbed' ? T.barb.len - T.barb.notch
             : reg.head === 'circlePlus' ? 2 * T.circlePlus.r
             : reg.head === 'pacman' ? T.timeslice.r
             : T.diamond.len;
  const adorn = reg.adorn === 'dots2' ? T.dot.gap + 2 * T.dot.r
              : reg.adorn === 'dots4' ? T.dot.gap + 4 * T.dot.r + 1.5
              : reg.adorn === 'bar1' ? T.bar.gap + T.stroke
              : 0;
  return head + adorn;
}

function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}
function pointAtDist(pts, d) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + seg >= d || i === pts.length - 1) {
      const t = seg ? Math.max(0, Math.min(1, (d - acc) / seg)) : 0;
      return {x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t};
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}
function hostSpans(pts) {
  const spans = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0 && (a.x === b.x || a.y === b.y))
      spans.push({d0: acc, d1: acc + len, orient: a.y === b.y ? 'h' : 'v'});
    acc += len;
  }
  return spans;
}
function planInlineLabel(pts, labelW, T, labelAt) {
  const total = polylineLength(pts);
  const gapFor = (s) => (s.orient === 'h' ? labelW : T.label.height) + 2 * T.label.pad;
  const usable = hostSpans(pts).filter(s => s.d1 - s.d0 >= gapFor(s) + 2 * T.label.edgeMargin);
  if (!usable.length || !total) return null;
  let chosen, center;
  if (labelAt != null) {
    const target = Math.max(0, Math.min(1, labelAt)) * total;
    let best = null;
    for (const s of usable) {
      const gap = gapFor(s);
      const lo = s.d0 + gap / 2 + T.label.edgeMargin, hi = s.d1 - gap / 2 - T.label.edgeMargin;
      const c = Math.max(lo, Math.min(hi, target)), dd = Math.abs(c - target);
      if (!best || dd < best.dd) best = {c, dd, s};
    }
    chosen = best.s; center = best.c;
  } else {
    chosen = usable.reduce((m, x) =>
      (x.d1 - x.d0) > (m.d1 - m.d0) || ((x.d1 - x.d0) === (m.d1 - m.d0) && x.orient === 'h' && m.orient === 'v') ? x : m);
    center = (chosen.d0 + chosen.d1) / 2;
  }
  const gap = gapFor(chosen);
  return {d1: center - gap / 2, d2: center + gap / 2, mid: pointAtDist(pts, center),
          t: center / total, gap, total, orient: chosen.orient, usable};
}
function cutPolyline(pts, d1, d2) {
  const before = [pts[0]], after = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    const interp = (d) => ({x: a.x + (b.x - a.x) * ((d - acc) / len), y: a.y + (b.y - a.y) * ((d - acc) / len)});
    if (acc + len <= d1) before.push(b);
    else if (acc < d1) before.push(interp(d1));
    if (acc <= d2 && acc + len > d2) { after.push(interp(d2)); after.push(b); }
    else if (acc > d2) after.push(b);
    acc += len;
  }
  return {before, after};
}

function glyphFrame(points, end) {
  const pts = end === 'source' ? [points[1], points[0]] : [points[points.length - 2], points[points.length - 1]];
  const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
  const len = Math.hypot(dx, dy) || 1;
  const d = {x: dx / len, y: dy / len};
  return {tip: pts[1], d, p: {x: -d.y, y: d.x}};
}

function shorten(points, end, len) {
  const out = points.map(p => ({x: p.x, y: p.y}));
  if (end === 'source') {
    const f = glyphFrame(points, 'source');
    out[0] = {x: f.tip.x - f.d.x * len, y: f.tip.y - f.d.y * len};
  } else {
    const f = glyphFrame(points, 'target');
    out[out.length - 1] = {x: f.tip.x - f.d.x * len, y: f.tip.y - f.d.y * len};
  }
  return out;
}

function roundedOrthPath(pts, r, hops) {
  if (pts.length < 2) return '';
  const hopsBySeg = {};
  (hops || []).forEach(h => { (hopsBySeg[h.seg] = hopsBySeg[h.seg] || []).push(h); });
  const emitHops = (segIdx, from, to) => {
    let out = '';
    const list = (hopsBySeg[segIdx] || []).filter(() => from.y === to.y);   // horizontal only
    const dir = Math.sign(to.x - from.x);
    list.sort((a, b) => dir * (a.c - b.c));
    for (const h of list) {
      if (Math.min(from.x, to.x) + h.r >= h.c || Math.max(from.x, to.x) - h.r <= h.c) continue; // inside bend inset: skip
      out += ' L' + (h.c - dir * h.r) + ',' + from.y
           + ' A' + h.r + ',' + h.r + ' 0 0 ' + (dir > 0 ? 1 : 0) + ' ' + (h.c + dir * h.r) + ',' + from.y;
    }
    return out;
  };
  let d = 'M' + pts[0].x + ',' + pts[0].y;
  let cursor = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const inLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const outLen = Math.abs(c.x - b.x) + Math.abs(c.y - b.y);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    const din = {x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y)};
    const dout = {x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y)};
    const segEnd = {x: b.x - din.x * rr, y: b.y - din.y * rr};
    d += emitHops(i - 1, cursor, segEnd);
    d += ' L' + segEnd.x + ',' + segEnd.y;
    d += ' Q' + b.x + ',' + b.y + ' ' + (b.x + dout.x * rr) + ',' + (b.y + dout.y * rr);
    cursor = {x: b.x + dout.x * rr, y: b.y + dout.y * rr};
  }
  d += emitHops(pts.length - 2, cursor, pts[pts.length - 1]);
  d += ' L' + pts[pts.length - 1].x + ',' + pts[pts.length - 1].y;
  return d;
}

export function computeCrossingHops(polylines, T) {
  const eps = 0.5;
  const segsOf = pts => pts.slice(1).map((p, i) => ({a: pts[i], b: p}));
  const all = polylines.map(segsOf);
  const hops = polylines.map(() => []);
  const diagnostics = [];
  const isH = s => s.a.y === s.b.y;
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++)
      for (let si = 0; si < all[i].length; si++)
        for (let sj = 0; sj < all[j].length; sj++) {
          const A = all[i][si], B = all[j][sj];
          if (isH(A) === isH(B)) {
            const fx = isH(A) ? 'y' : 'x', rn = isH(A) ? 'x' : 'y';
            if (A.a[fx] === B.a[fx]) {
              const o = Math.min(Math.max(A.a[rn], A.b[rn]), Math.max(B.a[rn], B.b[rn]))
                      - Math.max(Math.min(A.a[rn], A.b[rn]), Math.min(B.a[rn], B.b[rn]));
              if (o > eps) diagnostics.push('connectors ' + i + ' and ' + j +
                ' have overlapping collinear segments — Route must keep ≥12px edgeEdge spacing');
            }
            continue;
          }
          const H = isH(A) ? {s: A, line: i, seg: si} : {s: B, line: j, seg: sj};
          const V = isH(A) ? {s: B, line: j, seg: sj} : {s: A, line: i, seg: si};
          const cx = V.s.a.x, cy = H.s.a.y;
          if (cx > Math.min(H.s.a.x, H.s.b.x) + eps && cx < Math.max(H.s.a.x, H.s.b.x) - eps &&
              cy > Math.min(V.s.a.y, V.s.b.y) + eps && cy < Math.max(V.s.a.y, V.s.b.y) - eps)
            hops[H.line].push({seg: H.seg, c: cx, r: T.hop.r});
        }
  return {
    hops: hops.map(list => {
      list.sort((a, b) => a.seg - b.seg || a.c - b.c);
      const out = [];
      for (const h of list) {
        const last = out[out.length - 1];
        if (last && last.seg === h.seg && (h.c - h.r) - (last.c + last.r) <= T.hop.mergeGap) {
          const left = last.c - last.r, right = h.c + h.r;
          last.c = (left + right) / 2;
          last.r = (right - left) / 2;
        } else out.push({...h});
      }
      return out;
    }),
    diagnostics
  };
}

function mergeBundlePoints(pointArrays, proximity) {
  if (pointArrays.length < 2) return null;
  const n = Math.min(...pointArrays.map(p => p.length));
  let k = 0;
  while (k < n) {
    const ref = pointArrays[0][k];
    if (!pointArrays.every(pts =>
      Math.max(Math.abs(pts[k].x - ref.x), Math.abs(pts[k].y - ref.y)) <= proximity)) break;
    k++;
  }
  if (k < 2) return null;   // no shared corridor beyond the anchor
  const trunk = [];
  for (let i = 0; i < k; i++) trunk.push({
    x: Math.round(pointArrays.reduce((s, p) => s + p[i].x, 0) / pointArrays.length),
    y: Math.round(pointArrays.reduce((s, p) => s + p[i].y, 0) / pointArrays.length)
  });
  const split = trunk[k - 1];
  return {trunk, split, branches: pointArrays.map(pts => [{x: split.x, y: split.y}, ...pts.slice(k)])};
}

function curvedPath(pts, maxHandle) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return 'M' + pts[0].x + ',' + pts[0].y + ' L' + pts[1].x + ',' + pts[1].y;
  const clampV = (vx, vy) => {
    const m = Math.hypot(vx, vy);
    if (m <= maxHandle || m === 0) return {x: vx, y: vy};
    return {x: vx * maxHandle / m, y: vy * maxHandle / m};
  };
  let d = 'M' + pts[0].x + ',' + pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const h1 = clampV((p2.x - p0.x) / 6, (p2.y - p0.y) / 6);
    const h2 = clampV((p3.x - p1.x) / 6, (p3.y - p1.y) / 6);
    d += ' C' + (p1.x + h1.x) + ',' + (p1.y + h1.y)
       + ' ' + (p2.x - h2.x) + ',' + (p2.y - h2.y)
       + ' ' + p2.x + ',' + p2.y;
  }
  return d;
}

function validateApproach(points, reg, T, faces) {
  const probs = [];
  if (!points || points.length < 2) return probs;
  const ends = [
    ['source', points[0], points[1]],
    ['target', points[points.length - 1], points[points.length - 2]]
  ];
  for (const [endName, tip, prev] of ends) {
    const dx = tip.x - prev.x, dy = tip.y - prev.y;
    const segLen = Math.hypot(dx, dy);
    if (dx !== 0 && dy !== 0)
      probs.push(endName + ' approach is oblique — must be perpendicular to the element face');
    const isGlyphEnd = reg && reg.end === endName;
    const need = (isGlyphEnd ? glyphLength(reg, T) : 0) + T.approach.minRunout;
    if (segLen < need)
      probs.push(endName + ' run-out too short: ' + Math.round(segLen) + 'px < ' + Math.round(need) +
        'px — the line must stay straight past the ' + (isGlyphEnd ? 'glyph' : 'anchor') + ' before bending');
    if (faces && faces[endName]) {
      const f = faces[endName];
      const ok = (f === 'E' && dx < 0) || (f === 'W' && dx > 0) || (f === 'S' && dy < 0) || (f === 'N' && dy > 0);
      if (!ok) probs.push(endName + ' approach does not enter perpendicular through declared face ' + f);
    }
  }
  return probs;
}

function withRunoutPoints(pts, runout) {
  const out = pts.map(p => ({x: p.x, y: p.y}));
  const lerp = (a, b, t) => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t});
  const segLen = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  if (segLen(out[0], out[1]) > runout * 1.5)
    out.splice(1, 0, lerp(out[0], out[1], runout / segLen(out[0], out[1])));
  const n = out.length;
  if (segLen(out[n - 1], out[n - 2]) > runout * 1.5)
    out.splice(n - 1, 0, lerp(out[n - 1], out[n - 2], runout / segLen(out[n - 1], out[n - 2])));
  return out;
}

function buildGlyph(reg, frame, T) {
  const {tip, d, p} = frame;
  const parts = [];
  const back = (k) => ({x: tip.x - d.x * k, y: tip.y - d.y * k});
  const off = (pt, k) => ({x: pt.x + p.x * k, y: pt.y + p.y * k});
  const P = (pt) => pt.x + ',' + pt.y;

  let headLen;
  if (reg.head === 'none') { return parts; }   // connect: no glyph at all
  if (reg.head === 'triangle') {
    headLen = T.tri.len;
    const b = back(T.tri.len);
    parts.push(el('path', {
      d: 'M' + P(tip) + ' L' + P(off(b, T.tri.halfH)) + ' L' + P(off(b, -T.tri.halfH)) + ' Z',
      fill: 'var(--cn-fill, #fff)', stroke: 'var(--cn-stroke, #1a1a18)',
      'stroke-width': T.stroke, 'stroke-linejoin': 'round'
    }));
  } else if (reg.head === 'arrowBarbed') {
    headLen = T.barb.len;
    const b = back(T.barb.len), notch = back(T.barb.len - T.barb.notch);
    parts.push(el('path', {
      d: 'M' + P(tip) + ' L' + P(off(b, T.barb.halfH)) + ' L' + P(notch) + ' L' + P(off(b, -T.barb.halfH)) + ' Z',
      fill: 'var(--cn-solid, #1a1a18)', stroke: 'var(--cn-solid, #1a1a18)',
      'stroke-width': 1, 'stroke-linejoin': 'round'
    }));
  } else if (reg.head === 'circlePlus') {
    const r = T.circlePlus.r;
    headLen = 2 * r;
    const c = back(r);
    parts.push(el('circle', {cx: c.x, cy: c.y, r: r,
      fill: 'var(--cn-fill, #fff)', stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': T.stroke}));
    parts.push(el('line', {x1: c.x - d.x * r, y1: c.y - d.y * r, x2: c.x + d.x * r, y2: c.y + d.y * r,
      stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': T.stroke}));
    parts.push(el('line', {x1: c.x - p.x * r, y1: c.y - p.y * r, x2: c.x + p.x * r, y2: c.y + p.y * r,
      stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': T.stroke}));
  } else if (reg.head === 'pacman') {
    const r = T.timeslice.r;
    headLen = r;
    const c = back(r);
    const ha = T.timeslice.mouthDeg * Math.PI / 360;       // half-angle, radians
    const ang = Math.atan2(-d.y, -d.x);                    // mouth faces away from the element
    const a1 = ang + ha, a2 = ang - ha;
    const rd = (v) => Math.round(v * 100) / 100;
    parts.push(el('path', {
      d: 'M' + P(c)
       + ' L' + rd(c.x + r * Math.cos(a1)) + ',' + rd(c.y + r * Math.sin(a1))
       + ' A' + r + ',' + r + ' 0 1 1 ' + rd(c.x + r * Math.cos(a2)) + ',' + rd(c.y + r * Math.sin(a2))
       + ' Z',
      fill: 'var(--cn-solid, #1a1a18)'
    }));
  } else {
    headLen = T.diamond.len;
    const mid = back(T.diamond.len / 2), b = back(T.diamond.len);
    parts.push(el('path', {
      d: 'M' + P(tip) + ' L' + P(off(mid, T.diamond.halfH)) + ' L' + P(b) + ' L' + P(off(mid, -T.diamond.halfH)) + ' Z',
      fill: reg.head === 'diamondFilled' ? 'var(--cn-solid, #1a1a18)' : 'var(--cn-fill, #fff)',
      stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': T.stroke, 'stroke-linejoin': 'round'
    }));
  }

  if (reg.adorn === 'dots2') {
    const c = back(headLen + T.dot.gap);
    for (const k of [-2.2, 2.2])
      parts.push(el('circle', {cx: off(c, k).x, cy: off(c, k).y, r: T.dot.r, fill: 'var(--cn-stroke, #1a1a18)'}));
  } else if (reg.adorn === 'dots4') {
    for (const row of [0, 1]) {
      const c = back(headLen + T.dot.gap + row * (2 * T.dot.r + 1.5));
      for (const k of [-2.2, 2.2])
        parts.push(el('circle', {cx: off(c, k).x, cy: off(c, k).y, r: T.dot.r, fill: 'var(--cn-stroke, #1a1a18)'}));
    }
  } else if (reg.adorn === 'bar1') {
    const c = back(headLen + T.bar.gap);
    parts.push(el('line', {
      x1: off(c, T.bar.len / 2).x, y1: off(c, T.bar.len / 2).y,
      x2: off(c, -T.bar.len / 2).x, y2: off(c, -T.bar.len / 2).y,
      stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': T.stroke, 'stroke-linecap': 'round'
    }));
  }
  return parts;
}

/* --- the component --- */
export function renderConnector(spec, opts) {
  const T = CN_TOKENS;
  const invalid = [];
  const reg = CONNECTOR_REGISTRY[spec.kind];
  if (!reg) invalid.push('unknown connector kind "' + spec.kind + '" — registry: ' + Object.keys(CONNECTOR_REGISTRY).join(', '));
  if (!spec.points || spec.points.length < 2) invalid.push('connector needs ≥2 routed points');

  const routing = spec.routing || 'orthogonal';
  if (routing !== 'orthogonal' && routing !== 'curved')
    invalid.push('unknown routing "' + routing + '" — orthogonal | curved; rendered orthogonal');
  const buildPath = (pts) => routing === 'curved'
    ? curvedPath(withRunoutPoints(pts, T.approach.minRunout), T.curve.maxHandle)
    : roundedOrthPath(pts, T.bendRadius, spec.hops);

  if (spec.points && spec.points.length >= 2)
    invalid.push(...validateApproach(spec.points, reg, T, spec.faces));

  const g = el('g', {'data-kind': spec.kind || 'invalid', 'data-routing': routing,
    'class': spec.ref ? 'cn-ref' : ''});
  if (spec.ref) g.setAttribute('data-ref', String(spec.ref));

  if (spec.points && spec.points.length >= 2) {
    const linePts = reg ? shorten(spec.points, reg.end, glyphLength(reg, T)) : spec.points;

    let plan = null, labelW = 0;
    var lblIsKw, lblFont;
    if (spec.label != null) {
      const measure = (opts && opts.measure) ||
        (renderConnector._m || (renderConnector._m = (() => {
          const ctx = document.createElement('canvas').getContext('2d');
          const cache = new Map();
          return (text, font) => {
            const k = font + '|' + text;
            if (!cache.has(k)) { ctx.font = font; cache.set(k, Math.ceil(ctx.measureText(text).width)); }
            return cache.get(k);
          };
        })()));
      lblIsKw = /^«/.test(String(spec.label));
      lblFont = lblIsKw ? T.label.font : T.label.nameFont;
      labelW = measure(String(spec.label), lblFont);
      if (routing === 'orthogonal') plan = planInlineLabel(linePts, labelW, T, spec.labelAt);
    }

    const minLen = (reg ? glyphLength(reg, T) : 0) + 2 * T.approach.minRunout
                 + (spec.label != null ? labelW + 2 * T.label.pad + 2 * T.label.edgeMargin : 0);
    const totalLen = polylineLength(spec.points);
    if (totalLen < minLen)
      invalid.push('connector too short: ' + Math.round(totalLen) + 'px < ' + Math.round(minLen) +
        'px minimum (glyph + run-outs' + (spec.label != null ? ' + inline label' : '') + ') — Route must keep endpoints apart');

    let dAttr;
    if (plan) {
      const cut = cutPolyline(linePts, plan.d1, plan.d2);
      dAttr = roundedOrthPath(cut.before, T.bendRadius, spec.hops) + ' ' + roundedOrthPath(cut.after, T.bendRadius, spec.hops);
    } else dAttr = buildPath(linePts);

    const path = el('path', {
      d: dAttr, 'class': 'cn-line',
      fill: 'none', stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': T.stroke,
      'stroke-linecap': 'round'
    });
    const t = el('title', {}, (reg ? reg.title : 'INVALID: ' + spec.kind) + (spec.ref ? ' — ' + spec.ref : ''));
    path.appendChild(t);
    g.appendChild(path);
    if (reg) for (const part of buildGlyph(reg, glyphFrame(spec.points, reg.end), T)) g.appendChild(part);

    if (spec.label != null) {
      const at = plan ? plan.mid : pointAtDist(linePts,
        (spec.labelAt != null ? Math.max(0, Math.min(1, spec.labelAt)) : 0.5) * polylineLength(linePts));
      const lg = el('g', {'class': 'cn-labelg', 'data-label-at': plan ? plan.t.toFixed(4) : ''});
      const lbl = el('text', {
        x: Math.round(at.x), y: Math.round(plan ? at.y : at.y - 8),
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'class': 'cn-label', 'pointer-events': 'none',
        fill: 'var(--cn-stroke, #1a1a18)'
      }, String(spec.label));
      if (lblIsKw) lbl.setAttribute('font-style', 'italic');
      lbl.setAttribute('font-size', '11');
      lbl.setAttribute('font-family', FONT_FAMILY);
      if (!plan) {   // halo fallback (curved mode / no hosting segment)
        lbl.setAttribute('stroke', 'var(--cn-fill, #fff)');
        lbl.setAttribute('stroke-width', '4');
        lbl.setAttribute('paint-order', 'stroke');
      }
      lg.appendChild(lbl);
      const hitW = labelW + 2 * T.label.pad, hitH = T.label.height + 2 * T.label.pad;
      const lblHit = el('rect', {
        x: Math.round(at.x - hitW / 2), y: Math.round((plan ? at.y : at.y - 8) - hitH / 2),
        width: hitW, height: hitH, rx: 3,
        fill: 'transparent', 'class': 'cn-label-hit', 'pointer-events': 'all'
      });
      lblHit.appendChild(el('title', {}, 'drag to slide along the line'));
      lg.appendChild(lblHit);
      g.appendChild(lg);

      if (opts && opts.onLabelSlide && lblHit.addEventListener) {
        const total = plan ? plan.total : polylineLength(linePts);
        const currentT = plan ? plan.t
          : (spec.labelAt != null ? Math.max(0, Math.min(1, spec.labelAt)) : 0.5);
        lblHit.style.cursor = 'grab';
        lblHit.addEventListener('pointerdown', (e0) => {
          const svg = lblHit.ownerSVGElement;
          if (!svg) return;
          e0.preventDefault();
          const toLocal = (ev) => {
            const pt = svg.createSVGPoint();
            pt.x = ev.clientX; pt.y = ev.clientY;
            return pt.matrixTransform(svg.getScreenCTM().inverse());
          };
          const nearestT = (p) => {
            let best = null, acc = 0;
            for (let i = 1; i < linePts.length; i++) {
              const a = linePts[i - 1], b = linePts[i];
              const vx = b.x - a.x, vy = b.y - a.y, len2 = vx * vx + vy * vy;
              const len = Math.sqrt(len2);
              if (len2 > 0) {
                const tt = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
                const cx = a.x + vx * tt, cy = a.y + vy * tt;
                const dd = Math.hypot(p.x - cx, p.y - cy);
                if (!best || dd < best.dd) best = {dd, t: (acc + len * tt) / total};
              }
              acc += len;
            }
            return best ? best.t : currentT;
          };
          const move = (ev) => opts.onLabelSlide(nearestT(toLocal(ev)), 'drag');
          const up = (ev) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            opts.onLabelSlide(nearestT(toLocal(ev)), 'commit');
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        });
      }
    }
    // invisible fat hit path so hover/click doesn't demand pixel accuracy.
    let hitD;
    if (plan) {
      const off = reg && reg.end === 'source' ? glyphLength(reg, T) : 0;
      const hc = cutPolyline(spec.points, plan.d1 + off, plan.d2 + off);
      hitD = roundedOrthPath(hc.before, T.bendRadius) + ' ' + roundedOrthPath(hc.after, T.bendRadius);
    } else hitD = buildPath(spec.points);
    g.appendChild(el('path', {
      d: hitD, fill: 'none', 'class': 'cn-line-hit',
      stroke: 'transparent', 'stroke-width': 12
    }));
  }

  if (opts && opts.onNavigate && g.addEventListener) {
    const fire = (e, mod) => {
      if (mod && !(e.metaKey || e.ctrlKey)) return;
      const t = e.target.closest && e.target.closest('[data-ref]');
      if (t) { e.preventDefault(); opts.onNavigate(t.getAttribute('data-ref')); }
    };
    g.addEventListener('click', (e) => fire(e, true));
    g.addEventListener('dblclick', (e) => fire(e, false));
  }
  return {node: g, layout: {kind: spec.kind, glyphEnd: reg ? reg.end : null, invalid}};
}

export function renderConnectorBundle(specs, opts) {
  const T = CN_TOKENS, invalid = [];
  const kinds = [...new Set(specs.map(s => s.kind))];
  if (kinds.length !== 1) invalid.push('bundle members must share one connector kind');
  const reg = CONNECTOR_REGISTRY[kinds[0]];
  if (!reg) invalid.push('unknown connector kind "' + kinds[0] + '"');
  const merged = (reg && kinds.length === 1) ? mergeBundlePoints(specs.map(s => s.points), T.bundle.proximity) : null;

  const g = el('g', {'data-kind': kinds[0] || 'invalid', 'data-bundle': specs.length});
  if (!merged) {   // no shared corridor: render individually, no merging forced
    for (const s of specs) {
      const r = renderConnector(s, opts);
      invalid.push(...r.layout.invalid);
      g.appendChild(r.node);
    }
    return {node: g, layout: {merged: false, invalid}};
  }

  const line = (pts, hops) => el('path', {
    d: roundedOrthPath(pts, T.bendRadius, hops), 'class': 'cn-line', fill: 'none',
    stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': T.stroke, 'stroke-linecap': 'round'
  });
  const sharedGlyph = reg.end === 'source';
  const trunkPts = sharedGlyph ? shorten(merged.trunk, 'source', glyphLength(reg, T)) : merged.trunk;
  const trunk = line(trunkPts);
  trunk.appendChild(el('title', {}, reg.title + ' — bundle of ' + specs.length));
  g.appendChild(trunk);
  if (sharedGlyph) for (const p of buildGlyph(reg, glyphFrame(merged.trunk, 'source'), T)) g.appendChild(p);

  specs.forEach((s, i) => {
    const bg = el('g', {'class': s.ref ? 'cn-ref' : ''});
    if (s.ref) bg.setAttribute('data-ref', String(s.ref));
    const bpts = merged.branches[i];
    bg.appendChild(line(reg.end === 'target' ? shorten(bpts, 'target', glyphLength(reg, T)) : bpts));
    if (reg.end === 'target') for (const p of buildGlyph(reg, glyphFrame(bpts, 'target'), T)) bg.appendChild(p);
    bg.appendChild(el('path', {d: roundedOrthPath(bpts, T.bendRadius), fill: 'none',
      'class': 'cn-line-hit', stroke: 'transparent', 'stroke-width': 12}));
    g.appendChild(bg);
  });

  if (opts && opts.onNavigate && g.addEventListener) {
    const fire = (e, mod) => {
      if (mod && !(e.metaKey || e.ctrlKey)) return;
      const t = e.target.closest && e.target.closest('[data-ref]');
      if (t) { e.preventDefault(); opts.onNavigate(t.getAttribute('data-ref')); }
    };
    g.addEventListener('click', (e) => fire(e, true));
    g.addEventListener('dblclick', (e) => fire(e, false));
  }
  return {node: g, layout: {merged: true, split: merged.split, invalid}};
}

export function renderPort(spec, opts) {
  const T = CN_TOKENS, s = T.port;
  const w = spec.w || s.size, h = spec.h || s.size;
  const cx = spec.cx, cy = spec.cy;
  const g = el('g', {'data-port': spec.name || '', 'class': spec.ref ? 'cn-ref' : ''});
  if (spec.ref) g.setAttribute('data-ref', String(spec.ref));
  g.appendChild(el('rect', {
    x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: s.rx,
    fill: 'var(--cn-fill, #fff)', stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': T.stroke
  }));
  if (spec.direction) {   // flow glyph: axis follows the port's side (E/W horizontal, N/S vertical)
    const side = spec.side || 'E';
    const horiz = side === 'E' || side === 'W';
    const dcx = cx, dcy = spec.dirCy != null ? spec.dirCy : cy;
    const L = Math.min(w, h) / 2 - 4;
    const ux = horiz ? 1 : 0, uy = horiz ? 0 : 1;
    const A = {x: dcx - ux * L, y: dcy - uy * L}, B = {x: dcx + ux * L, y: dcy + uy * L};
    g.appendChild(el('line', {x1: A.x, y1: A.y, x2: B.x, y2: B.y,
      stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': 1.2}));
    const outward = {E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1]}[side];
    const head = (at, dir) => el('path', {
      d: 'M' + (at.x - dir[0] * 3.5 + dir[1] * 2.5) + ',' + (at.y - dir[1] * 3.5 + dir[0] * 2.5)
       + ' L' + at.x + ',' + at.y
       + ' L' + (at.x - dir[0] * 3.5 - dir[1] * 2.5) + ',' + (at.y - dir[1] * 3.5 - dir[0] * 2.5),
      fill: 'none', stroke: 'var(--cn-stroke, #1a1a18)', 'stroke-width': 1.2,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    const outEnd = outward[0] > 0 || outward[1] > 0 ? B : A;
    const inEnd = outEnd === B ? A : B;
    const inward = [-outward[0], -outward[1]];
    if (spec.direction === 'out' || spec.direction === 'inout') g.appendChild(head(outEnd, outward));
    if (spec.direction === 'in' || spec.direction === 'inout') g.appendChild(head(inEnd, inward));
  }
  if (spec.name) {
    const text = spec.name + (spec.def ? ': ' + spec.def : '');
    const mctx = renderPort._m || (renderPort._m = document.createElement('canvas').getContext('2d'));
    mctx.font = '400 11px ' + FONT_FAMILY;
    const tw = Math.ceil(mctx.measureText(text).width);
    const side = spec.side || 'E';
    if (spec.labelRotate || (tw + 10 > w && tw + 10 <= h && w >= 14)) {
      const t = el('text', {x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        transform: 'rotate(-90 ' + cx + ' ' + cy + ')', 'font-size': 12, 'font-family': FONT_FAMILY,
        fill: 'var(--cn-stroke, #1a1a18)'}, text);
      g.appendChild(t);
    } else if (tw + 10 <= w) {   // large enough: label lives inside the port box
      const t = el('text', {x: cx, y: spec.direction ? cy - h / 2 + 12 : cy,
        'text-anchor': 'middle', 'dominant-baseline': spec.direction ? 'auto' : 'middle',
        'font-size': 11, 'font-family': FONT_FAMILY, fill: 'var(--cn-stroke, #1a1a18)'}, text);
      g.appendChild(t);
    } else {                     // floating, above + near the connector, side-aware
      const pos = side === 'W' ? {x: cx - w / 2 - 6, y: cy - h / 2 - 4, a: 'end'}
                : side === 'S' ? {x: cx + w / 2 + 6, y: cy + h / 2 + 12, a: 'start'}
                :                {x: cx + w / 2 + 6, y: cy - h / 2 - 4, a: 'start'};   // E and N
      const t = el('text', {x: pos.x, y: pos.y, 'text-anchor': pos.a,
        'font-size': 11, 'font-family': FONT_FAMILY, fill: 'var(--cn-stroke, #1a1a18)'}, text);
      g.appendChild(t);
    }
  }
  if (spec.ref) {
    const titleHost = g.firstChild;
    if (titleHost && titleHost.appendChild) titleHost.appendChild(el('title', {}, '«port» ' + (spec.name || '') + ' — ' + spec.ref));
  }
  if (opts && opts.onNavigate && g.addEventListener) {
    const fire = (e, mod) => {
      if (mod && !(e.metaKey || e.ctrlKey)) return;
      const t = e.target.closest && e.target.closest('[data-ref]');
      if (t) { e.preventDefault(); opts.onNavigate(t.getAttribute('data-ref')); }
    };
    g.addEventListener('click', (e) => fire(e, true));
    g.addEventListener('dblclick', (e) => fire(e, false));
  }
  return {node: g, layout: {cx, cy, w, h}};
}

/* ============================== demo gallery ================================
   Builds the user-facing connector showcase into `host` (a container element).
   opts: { onNavigate?(ref), attach?(node, spec) } — attach wires the per-root
   hover explainer card (see explainer.js). */
const LEGEND_ENDPOINTS = {
  subclassification: {source: {name: 'SportsCar', kind: 'part def'}, target: {name: 'Vehicle', kind: 'part def'}},
  definedBy:         {source: {name: 'engine', kind: 'part'}, target: {name: 'Engine', kind: 'part def'}},
  compositeOf:       {source: {name: 'vehicle', kind: 'part'}, target: {name: 'engine', kind: 'part'}},
  memberOf:          {source: {name: 'garage', kind: 'part'}, target: {name: 'vehicle', kind: 'part'}},
  redefines:         {source: {name: 'sportTune', kind: 'attribute'}, target: {name: 'tune', kind: 'attribute'}},
  references:        {source: {name: 'dashboard', kind: 'part'}, target: {name: 'speedSensor', kind: 'part'}},
  association:       {source: {name: 'SteeringWheel', kind: 'part'}, target: {name: 'SteeringMechanism', kind: 'requirement'}},
  variation:         {source: {name: 'chassis', kind: 'variation part'}, target: {name: 'cityTrim', kind: 'part'}},
  timeslice:         {source: {name: 'vehicle', kind: 'part'}, target: {name: 'launchConfig', kind: 'snapshot'}},
  connect:           {source: {name: 'battery.hvOut', kind: 'port'}, target: {name: 'inverter.dcIn', kind: 'port'}}
};

/* plain-language one-liners (user-facing — no rule citations) */
const CONNECTOR_BLURB = {
  subclassification: 'A specific definition inherits from a general one.',
  definedBy: 'A usage is typed by its definition.',
  compositeOf: 'A part is an integral piece of a whole (filled diamond at the owner).',
  memberOf: 'A non-composite member, held but independent (hollow diamond at the owner).',
  redefines: 'A feature replaces one inherited from a more general definition.',
  references: 'A pointer to a related element, without owning it.',
  association: 'A «keyword»-qualified relationship (satisfy, verify, allocate, …) or bare succession.',
  variation: 'A variation point offering alternative variants.',
  timeslice: 'A time slice, snapshot, or portion of an owner.',
  connect: 'A port-to-port connection — no arrowhead; the ports terminate the line.'
};

function fig(captionText, ...svgs) {
  const f = document.createElement('figure');
  f.className = 'dd-fig';
  for (const s of svgs) f.appendChild(s);
  if (captionText) {
    const c = document.createElement('figcaption');
    c.textContent = captionText;
    f.appendChild(c);
  }
  return f;
}
function box(svg, x, y, w, h, rx, label) {
  svg.appendChild(el('rect', {x, y, width: w, height: h, rx, fill: 'var(--card)', stroke: 'var(--cn-stroke)', 'stroke-width': 1.5}));
  if (label) svg.appendChild(el('text', {x: x + w / 2, y: y + h / 2 + 4, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--fg)'}, label));
}

export function buildConnectorDemos(host, opts) {
  const o = opts || {};
  const onNavigate = o.onNavigate;
  const attach = o.attach || (() => {});

  /* 1 — the relationship reference (legend) */
  const legend = document.createElement('div');
  legend.className = 'dd-legend';
  for (const kind of Object.keys(CONNECTOR_REGISTRY)) {
    const reg = CONNECTOR_REGISTRY[kind];
    const row = document.createElement('div');
    row.className = 'dd-legend-row';
    const svg = el('svg', {width: 150, height: 28, viewBox: '0 0 150 28'});
    const legendSpec = {
      kind, points: [{x: 8, y: 14}, {x: 142, y: 14}],
      label: kind === 'association' ? '«satisfy»' : undefined,
      ref: 'VehiclePkg::Vehicle::~' + kind,
      ...(LEGEND_ENDPOINTS[kind] || {})
    };
    const {node} = renderConnector(legendSpec, {onNavigate});
    attach(node, legendSpec);
    svg.appendChild(node);
    row.appendChild(svg);
    const what = document.createElement('span'); what.className = 'dd-legend-what'; what.textContent = kind;
    const how = document.createElement('span'); how.className = 'dd-legend-how'; how.textContent = CONNECTOR_BLURB[kind] || reg.title;
    row.append(what, how);
    legend.appendChild(row);
  }
  host.appendChild(fig('The ten relationship types. Hover any line for a plain-language reading; meaning lives in the glyph shape, never colour.', legend));

  /* 2 — routing: orthogonal vs curved */
  const routed = (routing, label) => {
    const svg = el('svg', {width: 560, height: 170, viewBox: '0 0 560 170', class: 'dd-svg'});
    box(svg, 10, 20, 120, 56, 0, 'vehicle');
    box(svg, 420, 100, 120, 56, 8, 'engine');
    const ex = renderConnector({
      kind: 'compositeOf', routing,
      points: [{x: 130, y: 48}, {x: 280, y: 48}, {x: 280, y: 128}, {x: 420, y: 128}],
      ref: 'VehiclePkg::vehicle::engine~composite'
    }, {onNavigate});
    svg.appendChild(ex.node);
    svg.appendChild(el('text', {x: 10, y: 14, 'font-size': 11, fill: 'var(--muted)'}, label));
    return svg;
  };
  host.appendChild(fig('Routing is a per-view choice: orthogonal (rounded bends) or curved through the same waypoints. The glyph sits identically either way.',
    routed('orthogonal', 'orthogonal — rounded bends'), routed('curved', 'curved — same waypoints')));

  /* 3 — crossings hop, never blur */
  {
    const svg = el('svg', {width: 420, height: 170, viewBox: '0 0 420 170', class: 'dd-svg'});
    const ptsH = [{x: 20, y: 85}, {x: 390, y: 85}];
    const ptsV = [{x: 200, y: 160}, {x: 200, y: 20}];
    const ptsV2 = [{x: 230, y: 160}, {x: 230, y: 20}];
    const cr = computeCrossingHops([ptsH, ptsV, ptsV2], CN_TOKENS);
    svg.appendChild(renderConnector({kind: 'references', points: ptsH, hops: cr.hops[0], ref: 'X::a~ref'}, {onNavigate}).node);
    svg.appendChild(renderConnector({kind: 'subclassification', points: ptsV, ref: 'X::b~subcl'}, {onNavigate}).node);
    svg.appendChild(renderConnector({kind: 'subclassification', points: ptsV2, ref: 'X::c~subcl'}, {onNavigate}).node);
    host.appendChild(fig('Where lines cross, the horizontal one hops over — so a crossing never reads as a join. Close hops merge into one.', svg));
  }

  /* 4 — bundling */
  {
    const bundleSvg = (kind, refs) => {
      const svg = el('svg', {width: 460, height: 150, viewBox: '0 0 460 150', class: 'dd-svg'});
      box(svg, 6, 38, 104, 44, 0, 'vehicle');
      box(svg, 360, 8, 94, 40, 8, 'engine');
      box(svg, 360, 96, 94, 40, 8, 'transmission');
      const r = renderConnectorBundle([
        {kind, points: [{x: 110, y: 60}, {x: 250, y: 60}, {x: 250, y: 28}, {x: 360, y: 28}], ref: refs[0]},
        {kind, points: [{x: 110, y: 60}, {x: 250, y: 60}, {x: 250, y: 116}, {x: 360, y: 116}], ref: refs[1]}
      ], {onNavigate});
      svg.appendChild(r.node);
      return svg;
    };
    host.appendChild(fig('Connectors of the same kind from one source share a trunk, then branch — every branch keeps its own identity.',
      bundleSvg('compositeOf', ['VehiclePkg::vehicle::engine~composite', 'VehiclePkg::vehicle::transmission~composite']),
      bundleSvg('references', ['VehiclePkg::vehicle~ref[engine]', 'VehiclePkg::vehicle~ref[transmission]'])));
  }

  /* 5 — association label you can drag */
  {
    const svg = el('svg', {width: 560, height: 170, viewBox: '0 0 560 170', class: 'dd-svg'});
    const spec = {
      kind: 'association', label: '«satisfy»', labelAt: null,
      source: {name: 'SteeringWheel', kind: 'part'}, target: {name: 'SteeringMechanism', kind: 'requirement'},
      points: [{x: 530, y: 130}, {x: 300, y: 130}, {x: 300, y: 40}, {x: 40, y: 40}],
      ref: 'ReqPkg::R-014~satisfy'
    };
    const draw = () => {
      svg.replaceChildren();
      svg.appendChild(el('rect', {x: 6, y: 18, width: 34, height: 44, fill: 'var(--card)', stroke: 'var(--cn-stroke)', 'stroke-width': 1.5}));
      svg.appendChild(el('rect', {x: 530, y: 108, width: 26, height: 44, fill: 'var(--card)', stroke: 'var(--cn-stroke)', 'stroke-width': 1.5}));
      const r = renderConnector(spec, {
        onNavigate,
        onLabelSlide: (t) => { spec.labelAt = t; draw(); }
      });
      attach(r.node, spec);
      svg.appendChild(r.node);
    };
    draw();
    host.appendChild(fig('The keyword label stays horizontal and sets into a break in the line. Drag it — it slides along the route.', svg));
  }

  /* 6 — ports */
  {
    const svg = el('svg', {width: 620, height: 280, viewBox: '0 0 620 280', class: 'dd-svg'});
    svg.appendChild(el('line', {x1: 90, y1: 0, x2: 90, y2: 280, stroke: 'var(--cn-stroke)', 'stroke-width': 2.5}));
    svg.appendChild(renderPort({cx: 90, cy: 140, w: 40, h: 200, name: 'p0', def: 'PortDef0',
      labelRotate: true, direction: 'inout', dirCy: 55, side: 'E',
      ref: 'VehiclePkg::vehicle::p0'}, {onNavigate}).node);
    const nested = [
      {n: 'p1', def: 'PortDef1', dir: null,    y: 80},
      {n: 'p2', def: 'PortDef2', dir: 'in',    y: 125},
      {n: 'p3', def: 'PortDef3', dir: 'out',   y: 170},
      {n: 'p4', def: 'PortDef4', dir: 'inout', y: 215}
    ];
    for (const q of nested) {
      svg.appendChild(el('line', {x1: 119, y1: q.y, x2: 420, y2: q.y,
        stroke: 'var(--cn-stroke)', 'stroke-width': CN_TOKENS.stroke, 'stroke-linecap': 'round'}));
      svg.appendChild(renderPort({cx: 110, cy: q.y, direction: q.dir, side: 'E',
        name: q.n, def: q.def, ref: 'VehiclePkg::vehicle::p0::' + q.n}, {onNavigate}).node);
    }
    svg.appendChild(el('line', {x1: 460, y1: 150, x2: 614, y2: 150, stroke: 'var(--cn-stroke)', 'stroke-width': 2.5}));
    svg.appendChild(el('text', {x: 460, y: 172, 'font-size': 10, 'font-family': FONT_FAMILY,
      fill: 'var(--muted, #888)'}, 'top edge — N-side ports, vertical flow'));
    svg.appendChild(el('line', {x1: 495, y1: 80, x2: 495, y2: 141, stroke: 'var(--cn-stroke)', 'stroke-width': CN_TOKENS.stroke, 'stroke-linecap': 'round'}));
    svg.appendChild(renderPort({cx: 495, cy: 150, direction: 'out', side: 'N',
      name: 'tx', def: 'PortDef5', ref: 'VehiclePkg::vehicle::tx'}, {onNavigate}).node);
    svg.appendChild(el('line', {x1: 575, y1: 80, x2: 575, y2: 141, stroke: 'var(--cn-stroke)', 'stroke-width': CN_TOKENS.stroke, 'stroke-linecap': 'round'}));
    svg.appendChild(renderPort({cx: 575, cy: 150, direction: 'in', side: 'N',
      name: 'rx', def: 'PortDef6', ref: 'VehiclePkg::vehicle::rx'}, {onNavigate}).node);
    host.appendChild(fig('Ports straddle their owner’s boundary and carry flow arrows (in / out / inout). They nest, and the arrows rotate with the edge.', svg));
  }
}
