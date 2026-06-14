"use strict";
/* ============================================================================
 * package.js — DEAL Viewer atomic SysML v2 package / namespace container.
 *
 * Lifted from the standalone Package mockup. Framework-free JS producing SVG:
 * a folder silhouette with a slant-edged tab, content-driven sizing, owned /
 * alias / imported (dashed) variants, refs + navigation. When a view's subject
 * is a package, the folder IS the diagram frame.
 * ==========================================================================*/

import { el, createMeasurer, truncate, wrapName, applyFont, FONT_FAMILY, SVGNS } from './core.js';

export const NS_TOKENS = {
  fonts: {
    keyword: '400 11px ' + FONT_FAMILY,
    name:    '700 13px ' + FONT_FAMILY,
    title:   'italic 400 10.5px ' + FONT_FAMILY,
    item:    '400 12px ' + FONT_FAMILY
  },
  ascent: {keyword: 11, name: 13, title: 10, item: 12},
  lineHeight: {keyword: 15, name: 19, title: 15, item: 17},
  pad: {x: 12, headerTop: 7, headerGap: 2, headerBottom: 7, compTop: 4, compBottom: 7},
  rules: {compartment: 1},
  sepInset: 12,
  minWidth: 80, maxWidth: 240, nameMaxLines: 3, minTruncChars: 8,
  stroke: 1.5,
  // slant-edged tab (owner-drawn reference); square-cornered body
  package: {tabH: 24, tabMinW: 64, tabPadX: 10, slant: 12, bodyMinH: 44,
            nameFont: '700 14px ' + FONT_FAMILY}
};

/* --- pure layout: spec → geometry --- */
export function layoutPackage(spec, measure, opts) {
  const T = NS_TOKENS, P = T.package, o = opts || {};
  const maxWidth = o.maxWidth || T.maxWidth;
  const comps = (spec.compartments || []).filter(c => c && c.items && c.items.length);
  const placement = spec.namePlacement || (comps.length ? 'tab' : 'body');
  const itemText = (it) => typeof it === 'string' ? it : ((it.kw ? it.kw + ' ' : '') + it.text);
  const kwLine = spec.keyword ? '«' + spec.keyword + '»' : null;
  const subLine = spec.forTarget ? 'for ' + spec.forTarget : null;

  let natural = Math.max(
    measure(spec.name, P.nameFont) + (placement === 'tab' ? 2 * P.tabPadX + P.slant + 16 : 0),
    kwLine ? measure(kwLine, T.fonts.keyword) : 0,
    subLine ? measure(subLine, T.fonts.item) : 0,
    ...comps.map(c => c.title ? measure(c.title, T.fonts.title) : 0),
    ...comps.flatMap(c => c.items.map(it => measure(itemText(it), T.fonts.item)))
  );
  const width = Math.round(Math.min(Math.max(natural + 2 * T.pad.x, spec.minWidth || 0, T.minWidth), maxWidth));
  const contentW = width - 2 * T.pad.x;
  const tabW = placement === 'tab'
    ? Math.min(width - 8, Math.max(P.tabMinW, measure(spec.name, P.nameFont) + 2 * P.tabPadX + P.slant))
    : Math.max(P.tabMinW, Math.round(width * 0.3));

  let y = P.tabH;
  let header = null;
  if (placement === 'body') {
    y += T.pad.headerTop;
    header = {};
    if (kwLine) { header.kwBaseline = y + T.ascent.keyword; y += T.lineHeight.keyword + T.pad.headerGap; }
    header.nameLines = wrapName(measure, spec.name, T.fonts.name, contentW, T.nameMaxLines)
      .map(ln => { const b = {...ln, baseline: y + T.ascent.name}; y += T.lineHeight.name; return b; });
    if (subLine) { header.subBaseline = y + T.ascent.item; header.subText = subLine; y += T.lineHeight.item; }
    y += T.pad.headerBottom;
  } else y += 2;

  const compartments = [];
  comps.forEach((c, i) => {
    const comp = {ruleY: null, items: []};
    if (i > 0) { comp.ruleY = y; y += T.rules.compartment; }
    y += T.pad.compTop;
    if (c.title) {   // title optional — owned members may list directly
      comp.titleBaseline = y + T.ascent.title;
      comp.title = c.title;
      y += T.lineHeight.title;
    }
    for (const raw of c.items) {
      const t = truncate(measure, itemText(raw), T.fonts.item, contentW);
      comp.items.push({...t, kw: (typeof raw === 'object' && raw.kw) || null,
        ref: (typeof raw === 'object' && raw.ref) || null, baseline: y + T.ascent.item});
      y += T.lineHeight.item;
    }
    y += T.pad.compBottom;
    compartments.push(comp);
  });

  const height = Math.round(Math.max(y, P.tabH + P.bodyMinH, spec.minHeight || 0));
  return {width, height, tabW, placement, header, compartments, kwLine,
          dashed: !!spec.dashed, ref: spec.ref ? String(spec.ref) : null};
}

/* --- render: layout → SVG --- */
export function renderPackage(spec, opts) {
  const measure = (opts && opts.measure) || (renderPackage._m || (renderPackage._m = createMeasurer()));
  const L = layoutPackage(spec, measure, opts);
  const T = NS_TOKENS, P = T.package, cx = Math.round(L.width / 2);
  const g = el('g', {'font-family': FONT_FAMILY, 'data-eb': spec.name,
    'data-kind': 'package', 'data-family': 'package'});
  if (L.ref) g.setAttribute('data-ref', L.ref);
  const dash = L.dashed ? {'stroke-dasharray': '5 3'} : {};

  // slant-edged tab: top edge shorter, right edge sweeping down into the body line
  const tabPath = 'M0,' + P.tabH + ' L0,0 H' + (L.tabW - P.slant) + ' L' + L.tabW + ',' + P.tabH + ' Z';

  // fills first; border strokes LAST (painter's order)
  g.appendChild(el('rect', {x: 0, y: P.tabH, width: L.width, height: L.height - P.tabH,
    fill: 'var(--eb-fill, #fff)', stroke: 'none'}));
  g.appendChild(el('path', {d: tabPath,
    fill: 'var(--eb-header-fill, var(--eb-fill, #fff))', stroke: 'none'}));

  if (L.placement === 'tab') {
    const t = el('text', {x: P.tabPadX, y: P.tabH - 7, fill: 'var(--eb-text, #1a1a18)'}, spec.name);
    applyFont(t, P.nameFont);
    if (L.ref) { t.setAttribute('data-ref', L.ref); t.setAttribute('class', 'eb-ref'); }
    g.appendChild(t);
  } else {
    if (L.kwLine) {
      const k = el('text', {x: cx, y: L.header.kwBaseline, 'text-anchor': 'middle',
        fill: 'var(--eb-kw, var(--eb-dim, #555))'}, L.kwLine);
      applyFont(k, T.fonts.keyword);
      g.appendChild(k);
    }
    for (const ln of L.header.nameLines) {
      const t = el('text', {x: cx, y: ln.baseline, 'text-anchor': 'middle',
        fill: 'var(--eb-text, #1a1a18)'}, ln.text);
      applyFont(t, T.fonts.name);
      if (L.ref) { t.setAttribute('data-ref', L.ref); t.setAttribute('class', 'eb-ref'); }
      g.appendChild(t);
    }
    if (L.header.subText) {   // alias: bold "for" + target (non-owning membership)
      const s = el('text', {x: cx, y: L.header.subBaseline, 'text-anchor': 'middle',
        fill: 'var(--eb-text, #1a1a18)'});
      applyFont(s, T.fonts.item);
      s.appendChild(el('tspan', {'font-weight': 700}, 'for '));
      s.appendChild(el('tspan', {}, L.header.subText.slice(4)));
      g.appendChild(s);
    }
  }

  for (const c of L.compartments) {
    if (c.ruleY !== null) g.appendChild(el('line', {
      x1: T.sepInset, y1: c.ruleY + 0.5, x2: L.width - T.sepInset, y2: c.ruleY + 0.5,
      stroke: 'var(--eb-sep, var(--eb-stroke, #1a1a18))', 'stroke-width': T.rules.compartment}));
    if (c.title) {
      const tt = el('text', {x: cx, y: c.titleBaseline, 'text-anchor': 'middle',
        fill: 'var(--eb-dim, #555)'}, c.title);
      applyFont(tt, T.fonts.title);
      g.appendChild(tt);
    }
    for (const it of c.items) {
      const attrs = {x: T.pad.x, y: it.baseline, fill: 'var(--eb-text, #1a1a18)'};
      if (it.ref) { attrs['data-ref'] = it.ref; attrs['class'] = 'eb-ref'; }
      const t = el('text', attrs);
      applyFont(t, T.fonts.item);
      if (it.kw && !it.full) {   // bold leading keyword: "part def" PartDef1
        t.appendChild(el('tspan', {'font-weight': 700}, it.kw + ' '));
        t.appendChild(el('tspan', {}, it.text.slice(it.kw.length + 1)));
      } else t.textContent = it.text;
      if (it.full) t.appendChild(el('title', {}, it.full));
      g.appendChild(t);
    }
  }

  // folder outline LAST — tab path then body rect
  const stroke = {fill: 'none', 'pointer-events': 'none',
    stroke: 'var(--eb-outline, var(--eb-stroke, #1a1a18))', 'stroke-width': T.stroke, ...dash};
  g.appendChild(el('path', {d: tabPath, ...stroke}));
  g.appendChild(el('rect', {x: 0, y: P.tabH, width: L.width, height: L.height - P.tabH, ...stroke}));

  if (opts && opts.onNavigate && g.addEventListener) {
    const fire = (e, mod) => {
      if (mod && !(e.metaKey || e.ctrlKey)) return;
      const t = e.target.closest && e.target.closest('[data-ref]');
      if (t) { e.preventDefault(); opts.onNavigate(t.getAttribute('data-ref')); }
    };
    g.addEventListener('click', (e) => fire(e, true));
    g.addEventListener('dblclick', (e) => fire(e, false));
  }
  return {node: g, layout: {width: L.width, height: L.height}};
}

/* helper: mount one package into its own <svg> sized to content */
export function mountPackage(spec, opts) {
  const {node, layout} = renderPackage(spec, opts);
  const m = 4;
  const svg = el('svg', {
    xmlns: SVGNS, viewBox: (-m) + ' ' + (-m) + ' ' + (layout.width + 2 * m) + ' ' + (layout.height + 2 * m),
    width: layout.width + 2 * m, height: layout.height + 2 * m
  });
  svg.appendChild(node);
  return {svg, layout};
}

/* ============================== demo specs ================================ */
export const PACKAGES = [
  {caption: 'Simple — name in the body, empty tab',
   spec: {name: 'Package1', namePlacement: 'body', ref: 'Package1'}},
  {caption: 'Simple — name in the tab (equally valid)',
   spec: {name: 'Package1', namePlacement: 'tab', ref: 'Package1'}},
  {caption: 'Owned members — bold keywords, listed directly; deleting the package deletes these',
   spec: {name: 'Package1', ref: 'Package1', compartments: [{title: null, items: [
       {kw: 'package', text: 'Package2', ref: 'Package1::Package2'},
       {kw: 'part def', text: 'Part2', ref: 'Package1::Part2'},
       {kw: 'part', text: 'part2 : Part2', ref: 'Package1::part2'}]}]}},
  {caption: 'Members compartment — italic title form',
   spec: {name: 'Package1', ref: 'Package1', compartments: [{title: 'members', items: [
       {kw: 'part def', text: 'PartDef1'}, {kw: 'part def', text: 'PartDef2'},
       {kw: 'part', text: 'part1 : PartDef1'}, {kw: 'part', text: 'part2 : PartDef2'}]}]}},
  {caption: '«alias» — a non-owning membership that introduces an alias name',
   spec: {name: 'Package2Alias', keyword: 'alias', forTarget: 'Package2',
          namePlacement: 'body', ref: 'Package1::Package2Alias'}},
  {caption: 'Imported — dashed outline marks an unowned package brought in by import; «private» hides it outside',
   spec: {name: 'Package3', keyword: 'private', dashed: true,
          namePlacement: 'body', ref: 'Package1~import[Package3::**]'}},
  {caption: 'Imports listed — star notation verbatim: * contents, ** recursive',
   spec: {name: 'Package1', ref: 'Package1', compartments: [{title: null, items: [
       {kw: 'public import', text: 'Package2::*', ref: 'Package1~import[Package2::*]'},
       {kw: 'private import', text: 'Package3::**', ref: 'Package1~import[Package3::**]'}]}]}}
];

function fig(captionText, child) {
  const f = document.createElement('figure');
  f.className = 'dd-fig';
  f.appendChild(child);
  if (captionText) {
    const c = document.createElement('figcaption');
    c.textContent = captionText;
    f.appendChild(c);
  }
  return f;
}

/* Build the user-facing package gallery + the "package as a view frame" demo. */
export function buildPackageDemos(host, opts) {
  const o = opts || {};
  const onNavigate = o.onNavigate;

  const gallery = document.createElement('div');
  gallery.className = 'dd-gallery';
  for (const d of PACKAGES) {
    const {svg} = mountPackage(d.spec, {onNavigate});
    gallery.appendChild(fig(d.caption, svg));
  }
  host.appendChild(gallery);

  // outermost containment: the package as the diagram frame
  const pkg = renderPackage({name: 'VehiclePkg', namePlacement: 'tab',
    minWidth: 430, minHeight: 280, ref: 'VehiclePkg'}, {maxWidth: 450, onNavigate});
  const svg = el('svg', {xmlns: SVGNS, viewBox: '-4 -4 458 296', width: 458, height: 296, class: 'dd-svg'});
  svg.appendChild(pkg.node);
  const member = el('g', {transform: 'translate(40, 60)', 'data-family': 'part', 'data-eb': 'Vehicle'});
  member.appendChild(el('rect', {x: 0, y: 0, width: 170, height: 96,
    fill: 'var(--eb-fill, #fff)', stroke: 'var(--eb-stroke, #1a1a18)', 'stroke-width': 1.5}));
  member.appendChild(el('text', {x: 85, y: 18, 'text-anchor': 'middle', 'font-size': 10.5,
    'font-family': FONT_FAMILY, fill: 'var(--eb-dim, #555)'}, '«part def»'));
  member.appendChild(el('text', {x: 85, y: 36, 'text-anchor': 'middle', 'font-size': 13,
    'font-weight': 700, 'font-family': FONT_FAMILY, fill: 'var(--eb-text, #1a1a18)'}, 'Vehicle'));
  member.appendChild(el('line', {x1: 0, y1: 44, x2: 170, y2: 44,
    stroke: 'var(--eb-stroke, #1a1a18)', 'stroke-width': 1.5}));
  member.appendChild(el('text', {x: 85, y: 58, 'text-anchor': 'middle', 'font-size': 10.5,
    'font-style': 'italic', 'font-family': FONT_FAMILY, fill: 'var(--eb-dim, #555)'}, 'attributes'));
  member.appendChild(el('text', {x: 12, y: 74, 'font-size': 12, 'font-family': FONT_FAMILY,
    fill: 'var(--eb-text, #1a1a18)'}, 'mass :> ISQ::mass'));
  member.appendChild(el('text', {x: 12, y: 90, 'font-size': 12, 'font-family': FONT_FAMILY,
    fill: 'var(--eb-text, #1a1a18)'}, 'dryMass'));
  svg.appendChild(member);
  host.appendChild(fig('When a view’s subject is a package, the folder is the diagram frame — every member lives inside it.', svg));
}
