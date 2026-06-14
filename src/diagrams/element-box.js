"use strict";
/* ============================================================================
 * element-box.js — DEAL Viewer atomic SysML v2 element box.
 *
 * Lifted from the standalone ElementBox mockup. Framework-free JavaScript that
 * produces SVG, sized entirely by measured text (cached canvas.measureText),
 * integer coordinates, definition/usage corner classification, arbitrary
 * compartment + item counts. Theming is paint-only via CSS custom properties
 * (see src/styles/diagrams.css) — switching themes never re-runs layout.
 * ==========================================================================*/

import { el, createMeasurer, truncate, wrapName, applyFont, FONT_FAMILY, SVGNS } from './core.js';

export const EB_TOKENS = {
  fonts: {
    keyword: '400 11px ' + FONT_FAMILY,        // stereotype/keyword
    name: '700 13px ' + FONT_FAMILY,        // element name
    title: 'italic 400 10.5px ' + FONT_FAMILY,// compartment label
    item: '400 12px ' + FONT_FAMILY         // compartment entries
  },
  ascent: {keyword: 11, name: 13, title: 10, item: 12}, // baseline offsets
  lineHeight: {keyword: 15, name: 19, title: 15, item: 17},
  pad: {x: 12, headerTop: 7, headerGap: 2, headerBottom: 7, compTop: 4, compBottom: 7},
  rules: {header: 1.5, compartment: 1},        // header rule = box stroke weight; 1px compartment rules
  sepInset: 12,                                  // compartment separators stop short of edges
  footer: {height: 16, chevron: {w: 10, h: 5}},  // fold strip + chevron glyph size
  cornerRadius: {definition: 0, usage: 8},     // defs square, usages rounded
  minWidth: 80, minHeight: 40,
  maxWidth: 240,
  nameMaxLines: 3,
  minTruncChars: 8,
  // badge slots — fixed positions in the header keyword line, right-aligned.
  badge: {font: '600 10.5px ' + FONT_FAMILY, gap: 4, pad: 6},
  badgeRegistry: {
    verification: {  // slot 3 (rightmost): exactly one verification state
      pass:       {glyph: '✓', tone: 'good', title: 'Verified'},
      fail:       {glyph: '✗', tone: 'bad',  title: 'Verification failed'},
      unverified: {glyph: '○', tone: 'dim',  title: 'Unverified'}
    },
    semantic: {      // slot 1 (innermost): model-semantic marker, always dim
      abstract:     {glyph: 'A', tone: 'dim', title: 'Abstract'},
      variation:    {glyph: 'V', tone: 'dim', title: 'Variation'},
      redefinition: {glyph: 'R', tone: 'dim', title: 'Redefinition'}
    }
    // slot 2 (diagnostics) is computed: worst severity wins — see resolveBadges()
  },
  stroke: 1.5
};

/* --- badge slot resolution — validates slot content against the registry,
       computes measured widths. Unknown slots / values are rejected, never drawn. --- */
function fmtCount(n) { return n > 9 ? '9+' : String(n); }

export function resolveBadges(badges, measure, T) {
  const out = {list: [], reserve: 0, invalid: []};
  if (badges == null) return out;
  if (typeof badges !== 'object' || Array.isArray(badges)) {
    out.invalid.push('badges must be a slot object {semantic?, diagnostics?, verification?}');
    return out;
  }
  const order = ['semantic', 'diagnostics', 'verification'];   // fixed slot order, left → right
  for (const slot of order) {
    const v = badges[slot];
    if (v == null) continue;                                 // empty slot: collapses, no reserve
    let b = null;
    if (slot === 'diagnostics') {
      const e = (v.errors | 0), w = (v.warnings | 0);
      if (e > 0)      b = {glyph: '✖' + fmtCount(e), tone: 'bad',  title: e + ' error' + (e > 1 ? 's' : '')};
      else if (w > 0) b = {glyph: '⚠' + fmtCount(w), tone: 'warn', title: w + ' warning' + (w > 1 ? 's' : '')};
      else out.invalid.push('diagnostics slot needs errors or warnings > 0');
    } else {
      const reg = T.badgeRegistry[slot][v];
      if (reg) b = {...reg};
      else out.invalid.push(slot + ': "' + v + '" not in {' + Object.keys(T.badgeRegistry[slot]).join(', ') + '}');
    }
    if (b) {
      b.slot = slot;
      b.w = measure(b.glyph, T.badge.font) + T.badge.gap;
      out.list.push(b);
    }
  }
  for (const k of Object.keys(badges))
    if (!order.includes(k)) out.invalid.push('unknown badge slot "' + k + '" — slots are: ' + order.join(', '));
  if (out.list.length) out.reserve = out.list.reduce((s, b) => s + b.w, 0) + T.badge.pad;
  return out;
}

/* --- pure layout: spec → geometry (no DOM output; unit-testable) --- */
export function layoutElementBox(spec, measure, opts) {
  const T = EB_TOKENS, o = opts || {};
  const maxWidth = o.maxWidth || T.maxWidth;
  const comps = (spec.compartments || []).filter(c => c && c.items && c.items.length); // empty never renders
  const kwText = '«' + spec.keyword + '»';
  // definition elements (keyword ends in "def") are square-cornered; usages rounded.
  const kind = spec.kind || (/\bdef$/.test(String(spec.keyword).trim()) ? 'definition' : 'usage');
  const rx = T.cornerRadius[kind] ?? T.cornerRadius.usage;
  const family = String(spec.keyword).trim().split(/\s+/)[0];   // palette key ("part", "requirement", …)
  const badgeInfo = resolveBadges(spec.badges, measure, T);
  const badges = badgeInfo.list;
  const badgeReserve = badgeInfo.reserve;                      // measured, not guessed

  // items may be plain strings or {text, ref} — ref is the element's stable
  // qualified name, used for go-to-definition; never a file/line (those go stale).
  const itemText = (it) => typeof it === 'string' ? it : String(it.text);
  const itemRef = (it) => (it && typeof it === 'object' && it.ref) ? String(it.ref) : null;

  // natural content width
  let natural = Math.max(
    measure(kwText, T.fonts.keyword) + 2 * badgeReserve,   // keyword stays centered beside reserve
    measure(spec.name, T.fonts.name),
    ...comps.map(c => measure(c.title, T.fonts.title)),
    ...comps.flatMap(c => c.items.map(it => measure(itemText(it), T.fonts.item)))
  );
  const width = Math.round(Math.min(Math.max(natural + 2 * T.pad.x, T.minWidth), maxWidth));
  const contentW = width - 2 * T.pad.x;

  const nameLines = wrapName(measure, spec.name, T.fonts.name, contentW, T.nameMaxLines);

  // vertical layout
  let y = T.pad.headerTop;
  const header = {keywordBaseline: y + T.ascent.keyword, nameLines: []};
  y += T.lineHeight.keyword + T.pad.headerGap;
  for (const ln of nameLines) {
    header.nameLines.push({...ln, baseline: y + T.ascent.name});
    y += T.lineHeight.name;
  }
  y += T.pad.headerBottom;
  // if the header alone carries the information (zero compartments), the outer
  // box closes it — no header rule, no footer. Any compartment content gets both.
  const hasContent = comps.length > 0;
  const foldable = hasContent;
  const collapsed = foldable && !!spec.collapsed;
  header.ruleY = hasContent ? y : null;
  if (hasContent) y += T.rules.header;

  const compartments = [];
  if (!collapsed) comps.forEach((c, i) => {
    const comp = {ruleY: null, items: []};
    if (i > 0) {
      comp.ruleY = y;
      y += T.rules.compartment;
    }
    y += T.pad.compTop;
    comp.titleBaseline = y + T.ascent.title;
    comp.title = c.title;
    y += T.lineHeight.title;
    for (const it of c.items) {
      const t = truncate(measure, itemText(it), T.fonts.item, contentW);
      comp.items.push({...t, ref: itemRef(it), baseline: y + T.ascent.item});
      y += T.lineHeight.item;
    }
    y += T.pad.compBottom;
    compartments.push(comp);
  });

  // fold footer — present whenever compartment content exists, in BOTH states.
  let footer = null;
  if (foldable) {
    footer = {sepY: collapsed ? null : y};
    if (!collapsed) y += T.rules.compartment;
    footer.stripY = y;
    footer.chevronCy = y + T.footer.height / 2;
    y += T.footer.height;
  }

  const height = Math.round(Math.max(y, T.minHeight));
  return {width, height, header, compartments, footer, collapsed, kwText, badges,
          badgeInvalid: badgeInfo.invalid, contentW, kind, rx, family,
          ref: spec.ref ? String(spec.ref) : null};   // element identity
}

/* --- render: layout → SVG <g> --- */
export function renderElementBox(spec, opts) {
  const measure = (opts && opts.measure) || (renderElementBox._m || (renderElementBox._m = createMeasurer()));
  const L = layoutElementBox(spec, measure, opts);
  const T = EB_TOKENS, cx = Math.round(L.width / 2);
  const g = el('g', {
    'font-family': FONT_FAMILY, 'data-eb': spec.name,
    'data-kind': L.kind, 'data-family': L.family, 'data-collapsed': L.collapsed
  });   // theme + state hooks, paint only
  if (L.ref) g.setAttribute('data-ref', L.ref);   // element identity for go-to-definition

  // Painter's order: background fill first, header band, content — border stroke LAST.
  g.appendChild(el('rect', {
    x: 0, y: 0, width: L.width, height: L.height,
    rx: L.rx,
    fill: 'var(--eb-fill, #fff)', stroke: 'none'
  }));

  // header tint band (transparent unless themed), clipped to the box shape
  const hh = L.header.ruleY !== null ? L.header.ruleY : L.height;
  const clipId = 'eb-clip-' + (renderElementBox._id = (renderElementBox._id || 0) + 1);
  const defs = el('defs', {});
  const clip = el('clipPath', {id: clipId});
  clip.appendChild(el('rect', {x: 0, y: 0, width: L.width, height: L.height, rx: L.rx}));
  defs.appendChild(clip);
  g.appendChild(defs);
  g.appendChild(el('rect', {
    x: 0, y: 0, width: L.width, height: hh,
    fill: 'var(--eb-header-fill, transparent)', 'clip-path': 'url(#' + clipId + ')'
  }));

  const kw = el('text', {
    x: cx, y: L.header.keywordBaseline, 'text-anchor': 'middle',
    fill: 'var(--eb-kw, var(--eb-dim, #555))'
  }, L.kwText);
  applyFont(kw, T.fonts.keyword);
  g.appendChild(kw);

  // badge slots — placed right→left from the padding edge
  const toneFill = {
    good: 'var(--good, #1a7a3c)', warn: 'var(--warn, #a05a00)',
    bad: 'var(--bad, #a32020)', dim: 'var(--eb-dim, #555)'
  };
  let bx = L.width - T.pad.x;
  for (let i = L.badges.length - 1; i >= 0; i--) {
    const b = L.badges[i];
    bx -= b.w;
    const bt = el('text', {
      x: Math.round(bx + (b.w - T.badge.gap) / 2), y: L.header.keywordBaseline,
      'text-anchor': 'middle', 'data-slot': b.slot, fill: toneFill[b.tone] || toneFill.dim
    }, b.glyph);
    applyFont(bt, T.badge.font);
    bt.appendChild(el('title', {}, b.title));
    g.appendChild(bt);
  }

  for (const ln of L.header.nameLines) {
    const nameAttrs = {
      x: cx,
      y: ln.baseline,
      'text-anchor': 'middle',
      fill: 'var(--eb-text, #1a1a18)'
    };
    if (L.ref) { nameAttrs['data-ref'] = L.ref; nameAttrs['class'] = 'eb-ref'; }
    const t = el('text', nameAttrs, ln.text);
    applyFont(t, T.fonts.name);
    if (ln.full) t.appendChild(el('title', {}, ln.full));                  // full text on hover
    g.appendChild(t);
  }
  // header rule = box stroke weight, rendered only when compartment content follows.
  if (L.header.ruleY !== null) g.appendChild(el('line', {
    x1: 0, y1: L.header.ruleY, x2: L.width, y2: L.header.ruleY,
    stroke: 'var(--eb-rule, var(--eb-stroke, #1a1a18))', 'stroke-width': T.rules.header
  }));

  for (const c of L.compartments) {
    if (c.ruleY !== null) g.appendChild(el('line', {   // separators inset from edges
      x1: T.sepInset, y1: c.ruleY + 0.5, x2: L.width - T.sepInset, y2: c.ruleY + 0.5,
      stroke: 'var(--eb-sep, var(--eb-stroke, #1a1a18))', 'stroke-width': T.rules.compartment
    }));
    const tt = el('text', {
      x: cx,
      y: c.titleBaseline,
      'text-anchor': 'middle',
      fill: 'var(--eb-dim, #555)'
    }, c.title);
    applyFont(tt, T.fonts.title);
    g.appendChild(tt);
    for (const it of c.items) {
      const attrs = {x: T.pad.x, y: it.baseline, fill: 'var(--eb-text, #1a1a18)'};
      if (it.ref) { attrs['data-ref'] = it.ref; attrs['class'] = 'eb-ref'; }
      const t = el('text', attrs, it.text);
      applyFont(t, T.fonts.item);
      if (it.full) t.appendChild(el('title', {}, it.full));                // tooltip
      g.appendChild(t);
    }
  }
  // fold footer — separator (expanded only), tinted strip, chevron, full-width hit target.
  if (L.footer) {
    g.appendChild(el('rect', {
      x: 0, y: L.footer.stripY, width: L.width, height: L.height - L.footer.stripY,
      fill: 'var(--eb-footer-fill, var(--eb-header-fill, transparent))', 'clip-path': 'url(#' + clipId + ')'
    }));
    if (L.footer.sepY !== null) g.appendChild(el('line', {
      x1: 0, y1: L.footer.sepY + 0.5, x2: L.width, y2: L.footer.sepY + 0.5,
      stroke: 'var(--eb-sep, var(--eb-stroke, #1a1a18))', 'stroke-width': T.rules.compartment
    }));
    const ch = T.footer.chevron, cy = L.footer.chevronCy;
    const pts = L.collapsed
      ? (cx - ch.w / 2) + ',' + (cy - ch.h / 2) + ' ' + cx + ',' + (cy + ch.h / 2) + ' ' + (cx + ch.w / 2) + ',' + (cy - ch.h / 2)
      : (cx - ch.w / 2) + ',' + (cy + ch.h / 2) + ' ' + cx + ',' + (cy - ch.h / 2) + ' ' + (cx + ch.w / 2) + ',' + (cy + ch.h / 2);
    g.appendChild(el('polyline', {
      points: pts, fill: 'none', stroke: 'var(--eb-dim, #555)',
      'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
    const hitY = L.footer.sepY !== null ? L.footer.sepY : L.footer.stripY;
    const hit = el('rect', {
      x: 0, y: hitY, width: L.width, height: L.height - hitY,
      fill: 'transparent', 'class': 'eb-fold-hit', role: 'button',
      'aria-label': L.collapsed ? 'Expand compartments' : 'Collapse compartments'
    });
    hit.appendChild(el('title', {}, L.collapsed ? 'Expand' : 'Collapse'));
    if (opts && opts.onToggle && hit.addEventListener) hit.addEventListener('click', () => opts.onToggle(!L.collapsed));
    g.appendChild(hit);
  }

  // Border stroke drawn last — always on top of the band and any fill.
  g.appendChild(el('rect', {
    x: 0, y: 0, width: L.width, height: L.height, rx: L.rx,
    fill: 'none', 'pointer-events': 'none',
    stroke: 'var(--eb-outline, var(--eb-stroke, #1a1a18))', 'stroke-width': T.stroke
  }));

  // go-to-definition — Cmd/Ctrl+click or double-click on anything carrying a
  // data-ref emits onNavigate(ref). The component emits identity only.
  if (opts && opts.onNavigate && g.addEventListener) {
    const fire = (e, requireModifier) => {
      if (requireModifier && !(e.metaKey || e.ctrlKey)) return;
      const t = e.target.closest && e.target.closest('[data-ref]');
      if (t) { e.preventDefault(); opts.onNavigate(t.getAttribute('data-ref')); }
    };
    g.addEventListener('click', (e) => fire(e, true));
    g.addEventListener('dblclick', (e) => fire(e, false));
  }
  return {node: g, layout: {width: L.width, height: L.height, badgeInvalid: L.badgeInvalid, ref: L.ref}};
}

/* helper: mount one box into its own <svg> sized to content */
export function mountBox(spec, opts) {
  const {node, layout} = renderElementBox(spec, opts);
  const m = 4;
  const svg = el('svg', {
    xmlns: SVGNS, viewBox: (-m) + ' ' + (-m) + ' ' + (layout.width + 2 * m) + ' ' + (layout.height + 2 * m),
    width: layout.width + 2 * m, height: layout.height + 2 * m
  });
  svg.appendChild(node);
  return {svg, layout};
}

/* ============================== demo specs ================================ */
export const VEHICLE = {
  keyword: 'part def',
  name: 'Vehicle',
  ref: 'VehiclePkg::Vehicle',   // stable qualified name — never file/line
  compartments: [
    {title: 'attributes', items: [
      {text: 'mass :> ISQ::mass', ref: 'VehiclePkg::Vehicle::mass'},
      {text: 'dryMass', ref: 'VehiclePkg::Vehicle::dryMass'},
      {text: 'cargoMass', ref: 'VehiclePkg::Vehicle::cargoMass'}]},
    {title: 'ports', items: [
      {text: 'pwrCmdPort', ref: 'VehiclePkg::Vehicle::pwrCmdPort'},
      {text: 'vehicleToRoadPort', ref: 'VehiclePkg::Vehicle::vehicleToRoadPort'},
      'additionalPort']},
    {title: 'perform actions', items: [
      {text: 'providePower', ref: 'VehiclePkg::Vehicle::providePower'},
      {text: 'provideBraking', ref: 'VehiclePkg::Vehicle::provideBraking'},
      'controlDirection']},
    {title: 'exhibit states', items: [{text: 'vehicleStates', ref: 'VehiclePkg::Vehicle::vehicleStates'}]}
  ]
};

export const GALLERY = [
  {
    caption: 'Header-only — the header carries everything: no header rule, no footer, just the box',
    spec: {keyword: 'part', name: 'cylinders[6]'}
  },
  {
    caption: 'Usage with compartments — rounded corners, same anatomy otherwise',
    spec: {
      keyword: 'part', name: 'engine : Engine', compartments: [
        {title: 'attributes', items: ['mass']},
        {title: 'perform actions', items: ['generateTorque']}]
    }
  },
  {
    caption: 'Part + one attribute — any compartment content gets the header rule and fold footer',
    spec: {
      keyword: 'part', name: 'wheel : Wheel', compartments: [
        {title: 'attributes', items: ['diameter']}]
    }
  },
  {
    caption: 'One compartment, visibility + multiplicity shown verbatim',
    spec: {
      keyword: 'part def', name: 'Battery', compartments: [
        {
          title: 'attributes',
          items: ['+ capacity : Ah [1]', '− internalR : mOhm [0..1]', '# cellCount [6..8]']
        }]
    }
  },
  {
    caption: 'Five compartments — section count is open',
    spec: {
      keyword: 'part def',
      name: 'FlightComputer',
      badges: {diagnostics: {warnings: 2}, verification: 'pass'},
      compartments: [
        {title: 'attributes', items: ['+ mips [1]', '+ mass']},
        {title: 'ports', items: ['busA : 1553', 'busB : 1553', 'discretes [28]']},
        {title: 'perform actions', items: ['scheduleFrames', 'monitorHealth']},
        {title: 'exhibit states', items: ['bootStates', 'opStates']},
        {title: 'constraints', items: ['thermalLimit', 'powerBudget']}]
    }
  },
  {
    caption: 'Collapsed — same Battery folded to header + footer; the chevron flips',
    spec: {
      keyword: 'part def', name: 'Battery', collapsed: true, compartments: [
        {
          title: 'attributes',
          items: ['+ capacity : Ah [1]', '− internalR : mOhm [0..1]', '# cellCount [6..8]']
        }]
    }
  },
  {
    caption: 'All three status slots: semantic A (abstract) · diagnostics ✖9+ (errors win, count capped) · verification ✗ — hover each',
    spec: {
      keyword: 'part def', name: 'Actuator',
      badges: {semantic: 'abstract', diagnostics: {errors: 12, warnings: 3}, verification: 'fail'},
      compartments: [
        {title: 'attributes', items: ['+ stroke : mm [1]', '+ force : kN']}]
    }
  },
  {
    caption: 'Family palette: «requirement def» — green, square (a definition)',
    spec: {
      keyword: 'requirement def', name: 'SafeBraking', compartments: [
        {title: 'doc', items: ['stoppingDistance < 60 m']},
        {title: 'verified by', items: ['brakeDynoTest']}]
    }
  },
  {
    caption: 'Family palette: «action» usage — violet, rounded',
    spec: {
      keyword: 'action', name: 'provideBraking', compartments: [
        {title: 'parameters', items: ['in brakeCmd [1]', 'out torque']}]
    }
  },
  {
    caption: 'Family palette: «state» usage — teal',
    spec: {
      keyword: 'state', name: 'vehicleStates', compartments: [
        {title: 'states', items: ['off', 'starting', 'on']}]
    }
  },
  {
    caption: 'Stress test: 3-line name wrap, item truncation with hover tooltip, 12 items',
    spec: {
      keyword: 'part def',
      name: 'vehicle powertrain transmission GearboxAssembly RevB LongTitleDemo',
      compartments: [
        {
          title: 'attributes', items: [
            'gearRatioFirstStagePlanetary :> ISQ::ratio [1]',
            '+ efficiencyAtNominalOperatingTemperature [0..1]',
            'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10']
        }]
    }
  }
];
